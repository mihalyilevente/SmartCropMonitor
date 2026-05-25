import datetime
import logging
import os
from dataclasses import asdict, dataclass, field
from pathlib import Path

from sqlalchemy import and_, desc, or_
from sqlalchemy.orm import Session

from app.core.config import (
    CACHE_DIR,
    CLEANUP_MIN_FILE_AGE_HOURS,
    CLEANUP_RETAIN_LATEST_DATASETS,
    DATA_DIR,
    GRID_DIR,
    MASK_DIR,
    NDVI_DIR,
    QUALITY_THRESHOLD_NDVI,
    QUALITY_THRESHOLD_SEGM,
    SEGM_DIR,
    STORAGE_PATH,
    TEMP_DIR,
    VIS_DIR,
)
from app.core.database import (
    Biomass,
    FieldAnalysis,
    FieldAnalysisResult,
    FieldData,
    FieldStatAnomalyAnalysis,
    FalsePositiveFeedback,
    UserLocation,
)


logger = logging.getLogger(__name__)


@dataclass
class CleanupFile:
    path: str
    exists: bool
    bytes: int = 0
    reason: str = "dataset_artifact"


@dataclass
class CleanupDataset:
    analysis_id: int
    location_id: int | None
    nc_filename: str | None
    requested_at: str | None
    is_valid: float | None
    files: list[CleanupFile] = field(default_factory=list)


@dataclass
class CleanupReport:
    dry_run: bool
    retention_limit: int
    protected_analysis_ids: list[int]
    candidate_count: int
    deleted_dataset_count: int
    deleted_file_count: int
    deleted_bytes: int
    skipped: list[dict] = field(default_factory=list)
    datasets: list[CleanupDataset] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


def cleanup_failed_datasets(
    db: Session,
    dry_run: bool = True,
    retention_limit: int = CLEANUP_RETAIN_LATEST_DATASETS,
    min_file_age_hours: float = CLEANUP_MIN_FILE_AGE_HOURS,
) -> CleanupReport:
    """
    Remove validation-failed satellite datasets and their derived artifacts.

    Retention is applied per location to keep each location's recent processing
    window intact. Only failed/low-quality datasets outside that window and not
    needed by pending pipelines are eligible for deletion.
    """
    retention_limit = max(0, int(retention_limit))
    protected_ids = _protected_analysis_ids(db, retention_limit)
    candidates = _cleanup_candidates(db, protected_ids)
    report = CleanupReport(
        dry_run=dry_run,
        retention_limit=retention_limit,
        protected_analysis_ids=sorted(protected_ids),
        candidate_count=len(candidates),
        deleted_dataset_count=0,
        deleted_file_count=0,
        deleted_bytes=0,
    )

    for analysis in candidates:
        files = _collect_dataset_files(analysis)
        dataset = CleanupDataset(
            analysis_id=analysis.id,
            location_id=analysis.location_id,
            nc_filename=analysis.nc_filename,
            requested_at=analysis.last_data_request_date.isoformat()
            if analysis.last_data_request_date
            else None,
            is_valid=float(analysis.is_valid) if analysis.is_valid is not None else None,
            files=files,
        )
        report.datasets.append(dataset)

        blocking_files = [
            f.path
            for f in files
            if f.exists and _file_is_too_new(f.path, min_file_age_hours)
        ]
        if blocking_files:
            report.skipped.append(
                {
                    "analysis_id": analysis.id,
                    "reason": "recent_or_active_files",
                    "files": blocking_files,
                }
            )
            logger.info(
                "[cleanup] Skipping analysis_id=%s because files are newer than %.2f hours",
                analysis.id,
                min_file_age_hours,
            )
            continue

        if dry_run:
            logger.info(
                "[cleanup][dry-run] Would delete analysis_id=%s nc=%s files=%s",
                analysis.id,
                analysis.nc_filename,
                [f.path for f in files if f.exists],
            )
            continue

        try:
            _delete_metadata(db, analysis, files)
            db.commit()
        except Exception:
            db.rollback()
            logger.exception("[cleanup] Metadata deletion failed for analysis_id=%s", analysis.id)
            report.skipped.append(
                {
                    "analysis_id": analysis.id,
                    "reason": "metadata_delete_failed",
                }
            )
            continue

        deleted_files, deleted_bytes = _delete_files(files)
        report.deleted_dataset_count += 1
        report.deleted_file_count += deleted_files
        report.deleted_bytes += deleted_bytes
        logger.info(
            "[cleanup] Deleted analysis_id=%s nc=%s files=%s bytes=%s",
            analysis.id,
            analysis.nc_filename,
            deleted_files,
            deleted_bytes,
        )

    logger.info(
        "[cleanup] Finished dry_run=%s candidates=%s deleted_datasets=%s deleted_files=%s bytes=%s skipped=%s",
        dry_run,
        report.candidate_count,
        report.deleted_dataset_count,
        report.deleted_file_count,
        report.deleted_bytes,
        len(report.skipped),
    )
    return report


def _protected_analysis_ids(db: Session, retention_limit: int) -> set[int]:
    protected: set[int] = set()

    if retention_limit > 0:
        location_ids = [row[0] for row in db.query(FieldAnalysis.location_id).distinct().all()]
        for location_id in location_ids:
            latest = (
                db.query(FieldAnalysis.id)
                .filter(FieldAnalysis.location_id == location_id)
                .order_by(desc(FieldAnalysis.last_data_request_date), desc(FieldAnalysis.id))
                .limit(retention_limit)
                .all()
            )
            protected.update(row[0] for row in latest)

    active = (
        db.query(FieldAnalysis.id)
        .filter(
            or_(
                FieldAnalysis.is_valid.is_(None),
                and_(
                    FieldAnalysis.is_valid >= QUALITY_THRESHOLD_NDVI,
                    FieldAnalysis.metrics_status.is_(None),
                ),
                and_(
                    FieldAnalysis.metrics_status.is_(True),
                    or_(
                        FieldAnalysis.per_metrics_status.is_(None),
                        FieldAnalysis.per_metrics_status.is_(False),
                    ),
                ),
            )
        )
        .all()
    )
    protected.update(row[0] for row in active)

    return protected


def _cleanup_candidates(db: Session, protected_ids: set[int]) -> list[FieldAnalysis]:
    query = db.query(FieldAnalysis).filter(
        FieldAnalysis.is_valid.isnot(None),
        FieldAnalysis.is_valid < QUALITY_THRESHOLD_SEGM,
    )
    if protected_ids:
        query = query.filter(~FieldAnalysis.id.in_(protected_ids))

    return (
        query.order_by(FieldAnalysis.last_data_request_date.asc(), FieldAnalysis.id.asc())
        .all()
    )


def _collect_dataset_files(analysis: FieldAnalysis) -> list[CleanupFile]:
    files: dict[str, CleanupFile] = {}
    nc_filename = os.path.basename(analysis.nc_filename) if analysis.nc_filename else None
    base_name = Path(nc_filename).stem if nc_filename else None

    def add(path: str | Path | None, reason: str = "dataset_artifact") -> None:
        if not path:
            return
        resolved = _safe_storage_path(path)
        if resolved is None:
            logger.warning("[cleanup] Ignoring path outside storage root: %s", path)
            return
        exists = resolved.exists()
        files[str(resolved)] = CleanupFile(
            path=str(resolved),
            exists=exists,
            bytes=resolved.stat().st_size if exists and resolved.is_file() else 0,
            reason=reason,
        )

    if nc_filename:
        add(Path(DATA_DIR) / nc_filename, "raw_nc")

    if analysis.mask_filename:
        add(Path(MASK_DIR) / os.path.basename(analysis.mask_filename), "technical_mask")

    if analysis.metrics_filename:
        add(Path(NDVI_DIR) / os.path.basename(analysis.metrics_filename), "metrics")

    if base_name:
        for mask_path in Path(MASK_DIR).glob(f"*_{base_name}.nc"):
            add(mask_path, "technical_mask")
        for visual_path in Path(VIS_DIR).glob(f"*_{base_name}.*"):
            add(visual_path, "visual_preview")
        for ndvi_path in Path(NDVI_DIR).glob(f"*{base_name}*"):
            add(ndvi_path, "metrics")
        for segm_path in Path(SEGM_DIR).glob(f"*{base_name}*"):
            add(segm_path, "segmentation")
        for temp_path in Path(TEMP_DIR).glob(f"*{base_name}*"):
            add(temp_path, "temporary")
        for cache_path in Path(CACHE_DIR).glob(f"*{base_name}*"):
            add(cache_path, "cache")

    if analysis.location_id is not None:
        grid_name = f"location_{analysis.location_id}_timeseries.nc"
        add(Path(GRID_DIR) / grid_name, "location_grid_cache")

    return sorted(files.values(), key=lambda item: item.path)


def _safe_storage_path(path: str | Path) -> Path | None:
    candidate = Path(path)
    if not candidate.is_absolute():
        candidate = Path.cwd() / candidate

    try:
        resolved = candidate.resolve()
        storage_root = Path(STORAGE_PATH).resolve()
        resolved.relative_to(storage_root)
    except ValueError:
        return None

    return resolved


def _file_is_too_new(path: str, min_file_age_hours: float) -> bool:
    if min_file_age_hours <= 0:
        return False
    try:
        mtime = datetime.datetime.fromtimestamp(Path(path).stat().st_mtime, datetime.UTC)
    except FileNotFoundError:
        return False

    age = datetime.datetime.now(datetime.UTC) - mtime
    return age < datetime.timedelta(hours=min_file_age_hours)


def _delete_metadata(db: Session, analysis: FieldAnalysis, files: list[CleanupFile]) -> None:
    metrics_filename = analysis.metrics_filename
    file_names = {Path(f.path).name for f in files}
    file_paths = {f.path for f in files}

    if metrics_filename:
        field_data_to_delete = []
        for field_data in db.query(FieldData).filter(FieldData.extra.isnot(None)).all():
            if isinstance(field_data.extra, dict) and field_data.extra.get("source_file") == metrics_filename:
                field_data_to_delete.append(field_data)

        field_data_ids = [row.id for row in field_data_to_delete]
        if field_data_ids:
            anomaly_ids = [
                row[0]
                for row in db.query(FieldStatAnomalyAnalysis.id)
                .filter(FieldStatAnomalyAnalysis.field_data_id.in_(field_data_ids))
                .all()
            ]
            if anomaly_ids:
                db.query(FalsePositiveFeedback).filter(
                    FalsePositiveFeedback.anomaly_id.in_(anomaly_ids)
                ).delete(synchronize_session=False)
                db.query(FieldStatAnomalyAnalysis).filter(
                    FieldStatAnomalyAnalysis.id.in_(anomaly_ids)
                ).delete(synchronize_session=False)

        for field_data in field_data_to_delete:
            db.delete(field_data)

    db.query(Biomass).filter(Biomass.analysis_id == analysis.id).delete(
        synchronize_session=False
    )
    db.query(FieldAnalysisResult).filter(
        FieldAnalysisResult.analysis_id == analysis.id
    ).delete(synchronize_session=False)

    location = None
    if analysis.location_id is not None:
        location = db.query(UserLocation).filter(UserLocation.id == analysis.location_id).first()

    if location:
        if location.last_grid_mask_url and (
            Path(location.last_grid_mask_url).name in file_names
            or location.last_grid_mask_url in file_paths
        ):
            location.last_grid_mask_url = None
        if location.last_segm_mask_url and (
            Path(location.last_segm_mask_url).name in file_names
            or location.last_segm_mask_url in file_paths
        ):
            location.last_segm_mask_url = None

    db.delete(analysis)
    db.flush()


def _delete_files(files: list[CleanupFile]) -> tuple[int, int]:
    deleted_files = 0
    deleted_bytes = 0

    for cleanup_file in files:
        path = Path(cleanup_file.path)
        if not path.exists():
            continue
        try:
            size = path.stat().st_size if path.is_file() else 0
            path.unlink()
            deleted_files += 1
            deleted_bytes += size
            logger.info("[cleanup] Deleted file %s", path)
        except Exception:
            logger.exception("[cleanup] Failed to delete file %s", path)

    return deleted_files, deleted_bytes
