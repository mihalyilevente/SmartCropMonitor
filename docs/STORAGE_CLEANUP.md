# Storage Cleanup and Retention

The satellite lifecycle is managed by `app.services.storage_cleanup.cleanup_failed_datasets`.

Current policy:

- Keep the latest `CLEANUP_RETAIN_LATEST_DATASETS` records per location.
- Keep records still needed by active validation, NDVI, or per-field metric processing.
- Delete only records that failed quality validation below the segmentation threshold and are outside retention.
- Delete related raw, technical mask, visual preview, NDVI metric, grid cache, segmentation, temp, and cache files.
- Remove database references before unlinking files so deleted paths are not left in metadata.
- Skip files newer than `CLEANUP_MIN_FILE_AGE_HOURS` to avoid colliding with active writes.

Operational entry points:

- Automatic schedule: `daily_storage_cleanup` runs at 01:30 UTC.
- Manual dry run: `POST /api/v1/utils/cleanup/storage?dry_run=true`.
- Manual cleanup: `POST /api/v1/utils/cleanup/storage?dry_run=false`.

Storage reorganization target:

- Keep the existing directories as compatibility aliases for now: `data`, `masks`, `visual`, `ndvi`, `grid`, `segmentation`, `weather`, and `topo`.
- New transient layers should use `cache` and `temp`.
- A future migration can split `data` into `raw`, `validated`, and `rejected` directories, but writers and readers should be updated behind helper functions first so existing pipelines are not broken by path changes.
