/**
 * RotationPanel.jsx — Grazing Rotation Plans
 */
import { useState, useEffect, useCallback } from 'react';
import api from '../api/client';
import { useLang } from '../context/LanguageContext';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const STATUS_CFG = {
  PLANNED:   { bg: '#e3f2fd', text: '#0277bd', border: '#90caf9' },
  GRAZING:   { bg: '#e8f5e9', text: '#2e7d32', border: '#81c784' },
  RESTING:   { bg: '#fff8e1', text: '#e65100', border: '#ffe082' },
  COMPLETED: { bg: '#f3e5f5', text: '#6a1b9a', border: '#ce93d8' },
  SKIPPED:   { bg: '#fafafa', text: '#9e9e9e', border: '#e0e0e0' },
};

const STAGE_COLOR = {
  dormant: '#bdbdbd',
  early:   '#aed581',
  active:  '#66bb6a',
  peak:    '#2e7d32',
  over:    '#827717',
};

const VALID_NEXT = {
  PLANNED:   ['GRAZING', 'SKIPPED'],
  GRAZING:   ['RESTING', 'COMPLETED', 'SKIPPED'],
  RESTING:   ['COMPLETED', 'GRAZING', 'SKIPPED'],
  COMPLETED: [],
  SKIPPED:   ['PLANNED'],
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const fmtDate  = d => d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const fmtShort = d => d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '—';
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86_400_000);
const todayISO    = () => new Date().toISOString().slice(0, 10);

// ─────────────────────────────────────────────────────────────
// StatusBadge
// ─────────────────────────────────────────────────────────────

const StatusBadge = ({ status }) => {
  const { t } = useLang();
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.PLANNED;
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 9px', borderRadius: 20,
      background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}`,
      textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap',
    }}>
      {t(`rot_status_${status}`) || status}
    </span>
  );
};

// ─────────────────────────────────────────────────────────────
// RotationTimeline
// ─────────────────────────────────────────────────────────────

const RotationTimeline = ({ entries }) => {
  if (!entries || entries.length === 0) return null;

  const starts = entries.map(e => new Date(e.graze_start).getTime());
  const ends   = entries.map(e => new Date(e.rest_end).getTime());
  const minT   = Math.min(...starts);
  const maxT   = Math.max(...ends);
  const span   = maxT - minT || 1;

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: 360 }}>
        {entries.map(e => {
          const gs      = new Date(e.graze_start).getTime();
          const ge      = new Date(e.graze_end).getTime();
          const re      = new Date(e.rest_end).getTime();
          const gLeft   = ((gs - minT) / span) * 100;
          const gWidth  = ((ge - gs) / span) * 100;
          const rWidth  = ((re - ge) / span) * 100;
          const col     = STAGE_COLOR[e.growth_stage?.code] ?? '#bdbdbd';
          const skipped = e.status === 'SKIPPED';
          return (
            <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <div title={e.field_label} style={{
                width: 90, flexShrink: 0, fontSize: 11, fontWeight: 600,
                color: '#444', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {e.field_label ?? `#${e.field_id}`}
              </div>
              <div style={{ flex: 1, position: 'relative', height: 18, background: '#f0ebe3', borderRadius: 4, overflow: 'hidden' }}>
                <div title={`${fmtShort(e.graze_start)} – ${fmtShort(e.graze_end)}`} style={{
                  position: 'absolute', left: `${gLeft}%`, width: `${Math.max(gWidth, 0.5)}%`,
                  height: '100%', background: col, opacity: skipped ? 0.25 : 0.85, borderRadius: '3px 0 0 3px',
                }} />
                <div title={`Rest → ${fmtShort(e.rest_end)}`} style={{
                  position: 'absolute', left: `${gLeft + gWidth}%`, width: `${Math.max(rWidth, 0.5)}%`,
                  height: '100%', background: '#bdbdbd', opacity: skipped ? 0.15 : 0.4, borderRadius: '0 3px 3px 0',
                }} />
              </div>
              <div style={{ width: 76, flexShrink: 0 }}>
                <StatusBadge status={e.status} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// EntryRow
// ─────────────────────────────────────────────────────────────

const EntryRow = ({ entry, onUpdated }) => {
  const { t }  = useLang();
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState(null);
  const next = VALID_NEXT[entry.status] ?? [];
  const col  = STAGE_COLOR[entry.growth_stage?.code] ?? '#bdbdbd';

  const advance = async (newStatus) => {
    setBusy(true); setErr(null);
    try {
      await api.patch(`/api/v1/fields/rotation/entry/${entry.id}`, { status: newStatus });
      onUpdated();
    } catch (e) {
      setErr(e?.response?.data?.detail ?? t('rot_err_update'));
    } finally {
      setBusy(false);
    }
  };

  const gDays = daysBetween(entry.graze_start, entry.graze_end);
  const rDays = daysBetween(entry.graze_end, entry.rest_end);

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0', borderBottom: '1px solid #f5f0ea', flexWrap: 'wrap' }}>
      <div style={{ width: 9, height: 9, borderRadius: '50%', background: col, flexShrink: 0, marginTop: 5 }} />

      <div style={{ flex: 1, minWidth: 160 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#222', marginBottom: 2 }}>
          {entry.field_label ?? `Field #${entry.field_id}`}
        </div>
        <div style={{ fontSize: 11, color: '#777', lineHeight: 1.6 }}>
          🌿 <span style={{ fontWeight: 600 }}>{t('rot_graze')}:</span>{' '}
          {fmtShort(entry.graze_start)} – {fmtShort(entry.graze_end)}{' '}
          <span style={{ color: '#bbb' }}>({gDays}{t('rot_days_abbr')})</span>
          {' · '}
          💤 <span style={{ fontWeight: 600 }}>{t('rot_rest')}:</span>{' '}
          {fmtShort(entry.graze_end)} – {fmtShort(entry.rest_end)}{' '}
          <span style={{ color: '#bbb' }}>({rDays}{t('rot_days_abbr')})</span>
        </div>
        {entry.planned_aum != null && (
          <div style={{ fontSize: 11, color: '#f57c00', marginTop: 2 }}>
            {entry.planned_aum.toFixed(1)} AUM/mo {t('rot_planned')}
            {entry.actual_aum != null && ` · ${entry.actual_aum.toFixed(1)} ${t('rot_actual')}`}
          </div>
        )}
        {entry.biomass_at_start != null && (
          <div style={{ fontSize: 11, color: '#888', marginTop: 1 }}>
            {t('rot_bio_start')}: {entry.biomass_at_start.toFixed(2)} t/ha
            {entry.biomass_at_end != null && ` → ${entry.biomass_at_end.toFixed(2)} t/ha`}
          </div>
        )}
        {entry.notes && <div style={{ fontSize: 11, color: '#aaa', fontStyle: 'italic', marginTop: 2 }}>{entry.notes}</div>}
        {err && <div style={{ fontSize: 11, color: '#e53935', marginTop: 3 }}>⚠ {err}</div>}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', flexShrink: 0, paddingTop: 2 }}>
        <StatusBadge status={entry.status} />
        {next.map(ns => {
          const cfg = STATUS_CFG[ns] ?? STATUS_CFG.PLANNED;
          return (
            <button key={ns} disabled={busy} onClick={() => advance(ns)} style={{
              fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 20,
              background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}`,
              cursor: busy ? 'wait' : 'pointer', textTransform: 'uppercase',
              letterSpacing: '0.04em', fontFamily: 'inherit',
            }}>
              → {t(`rot_status_${ns}`) || ns}
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// ProgressBar
// ─────────────────────────────────────────────────────────────

const ProgressBar = ({ done, total }) => {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 68, height: 6, background: '#e8e2da', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{
          width: `${pct}%`, height: '100%', borderRadius: 4,
          background: pct === 100 ? '#6a1b9a' : '#2e7d32', transition: 'width 0.4s ease',
        }} />
      </div>
      <span style={{ fontSize: 11, color: '#888', minWidth: 28 }}>{pct}%</span>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// RotationCard
// ─────────────────────────────────────────────────────────────

const RotationCard = ({ rotation, userId, onDeleted, onRefresh }) => {
  const { t } = useLang();
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const entries     = rotation.entries ?? [];
  const completed   = entries.filter(e => e.status === 'COMPLETED').length;
  const activeEntry = entries.find(e => e.status === 'GRAZING');

  const handleDelete = async () => {
    if (!window.confirm(`${t('rot_delete_confirm')} "${rotation.name}"?`)) return;
    setDeleting(true);
    try {
      await api.delete(`/api/v1/fields/rotation/${rotation.id}`, { params: { user_id: userId } });
      onDeleted();
    } catch { setDeleting(false); }
  };

  return (
    <div style={{
      border: '1.5px solid #e0dcd4', borderRadius: 12, background: '#fafaf8', marginBottom: 10,
      overflow: 'hidden', boxShadow: expanded ? '0 4px 20px rgba(0,0,0,0.09)' : '0 1px 4px rgba(0,0,0,0.04)', transition: 'box-shadow 0.2s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setExpanded(v => !v)}>
        <span style={{ fontSize: 20, flexShrink: 0 }}>🔄</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#222' }}>{rotation.name}</span>
            {activeEntry && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#e8f5e9', color: '#2e7d32', border: '1px solid #81c784' }}>
                🌿 {t('rot_currently_grazing')}: {activeEntry.field_label}
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: '#888' }}>
            {fmtDate(rotation.plan_start)}{rotation.plan_end ? ` → ${fmtDate(rotation.plan_end)}` : ''}
            {' · '}{entries.length} {t('rot_paddocks')}
            {rotation.total_aum_target != null && ` · ${rotation.total_aum_target.toFixed(1)} AUM ${t('rot_target')}`}
          </div>
        </div>
        <ProgressBar done={completed} total={entries.length} />
        <span style={{ color: '#bbb', fontSize: 13, flexShrink: 0, marginLeft: 4 }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div style={{ borderTop: '1px solid #f0ebe3', background: '#fff', padding: '14px 16px 18px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
            {t('rot_timeline')}
          </div>
          <RotationTimeline entries={entries} />

          <div style={{ height: 1, background: '#f0ebe3', margin: '14px 0' }} />

          <div style={{ fontSize: 10, fontWeight: 700, color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>
            {t('rot_schedule')}
          </div>
          {entries.length === 0
            ? <div style={{ color: '#bbb', fontSize: 12, padding: '8px 0' }}>{t('rot_no_entries')}</div>
            : entries.map(e => <EntryRow key={e.id} entry={e} onUpdated={onRefresh} />)
          }

          {rotation.notes && (
            <div style={{ fontSize: 11, color: '#aaa', fontStyle: 'italic', marginTop: 10 }}>{rotation.notes}</div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
            <button onClick={handleDelete} disabled={deleting} style={{
              fontSize: 11, fontWeight: 700, padding: '5px 14px', borderRadius: 8,
              background: '#fff5f5', color: '#c62828', border: '1px solid #ef9a9a',
              cursor: deleting ? 'wait' : 'pointer', fontFamily: 'inherit',
            }}>
              {deleting ? `${t('rot_deleting')}…` : `🗑 ${t('rot_delete')}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// NewPlanForm
// ─────────────────────────────────────────────────────────────

const NewPlanForm = ({ locationId, userId, onCreated, onCancel }) => {
  const { t } = useLang();
  const [name,      setName]      = useState('');
  const [startDate, setStartDate] = useState(todayISO());
  const [aumTarget, setAumTarget] = useState('');
  const [notes,     setNotes]     = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);

  useEffect(() => {
    const d = new Date();
    setName(`${t('rot_default_name_prefix')} ${d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}`);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    if (!name.trim()) { setError(t('rot_err_name_required')); return; }
    if (!startDate)   { setError(t('rot_err_date_required')); return; }
    setLoading(true); setError(null);
    try {
      await api.post('/api/v1/fields/rotation/plan', {
        user_id:          userId,
        location_id:      locationId,
        name:             name.trim(),
        plan_start:       new Date(startDate).toISOString(),
        total_aum_target: aumTarget ? parseFloat(aumTarget) : null,
        notes:            notes.trim() || null,
      });
      onCreated();
    } catch (e) {
      setError(e?.response?.data?.detail ?? t('rot_err_generate'));
      setLoading(false);
    }
  };

  const inp = { width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid #e0dcd4', fontSize: 12, fontFamily: 'inherit', background: '#fafaf8', color: '#333', boxSizing: 'border-box', outline: 'none' };
  const lbl = { fontSize: 10, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 4 };

  return (
    <div style={{ background: '#f8f5f0', border: '1.5px solid #e0dcd4', borderRadius: 12, padding: '16px 18px', marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#2e7d32', marginBottom: 12 }}>🔄 {t('rot_new_plan_title')}</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={lbl}>{t('rot_form_name')} *</label>
          <input value={name} onChange={e => setName(e.target.value)} style={inp} placeholder={t('rot_form_name_ph')} />
        </div>
        <div>
          <label style={lbl}>{t('rot_form_start')} *</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={inp} />
        </div>
        <div>
          <label style={lbl}>{t('rot_form_aum')}</label>
          <input type="number" value={aumTarget} onChange={e => setAumTarget(e.target.value)} style={inp} placeholder={t('rot_form_optional')} min={0} step={0.5} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={lbl}>{t('rot_form_notes')}</label>
          <input value={notes} onChange={e => setNotes(e.target.value)} style={inp} placeholder={t('rot_form_optional')} />
        </div>
      </div>

      {error && <div style={{ fontSize: 11, color: '#c62828', marginBottom: 8, background: '#fff5f5', borderRadius: 6, padding: '5px 10px' }}>⚠ {error}</div>}

      <div style={{ fontSize: 11, color: '#aaa', marginBottom: 10, lineHeight: 1.55 }}>💡 {t('rot_form_hint')}</div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={{ fontSize: 12, padding: '6px 14px', borderRadius: 8, border: '1px solid #e0dcd4', background: '#fff', cursor: 'pointer', color: '#888', fontFamily: 'inherit' }}>
          {t('rot_cancel')}
        </button>
        <button onClick={submit} disabled={loading} style={{
          fontSize: 12, fontWeight: 700, padding: '6px 18px', borderRadius: 8,
          background: loading ? '#bdbdbd' : 'linear-gradient(135deg, #2e7d32, #1b5e20)',
          color: '#fff', border: 'none', cursor: loading ? 'wait' : 'pointer', fontFamily: 'inherit',
        }}>
          {loading ? `⏳ ${t('rot_generating')}…` : `⚡ ${t('rot_generate_btn')}`}
        </button>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// RotationSection — main export
// ─────────────────────────────────────────────────────────────

export const RotationSection = ({ locationId, userId }) => {
  const { t } = useLang();
  const [rotations, setRotations] = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [showForm,  setShowForm]  = useState(false);
  const [open,      setOpen]      = useState(true);

  const load = useCallback(() => {
    if (!locationId) return;
    setLoading(true);
    api.get(`/api/v1/fields/rotation/${locationId}`)
      .then(r  => setRotations(r.data))
      .catch(() => setRotations([]))
      .finally(() => setLoading(false));
  }, [locationId]);

  useEffect(() => { load(); }, [load]);

  const planCount = rotations?.length ?? 0;

  return (
    <div style={{ marginTop: 20, borderTop: '1px solid #f0ebe3', paddingTop: 2 }}>
      <div onClick={() => setOpen(v => !v)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0 8px', cursor: 'pointer', userSelect: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>🔄</span>
          <span style={{ fontFamily: 'var(--font-heading)', fontSize: 13, fontWeight: 700, color: 'var(--color-accent-chernozem)' }}>
            {t('rot_section_title')}
          </span>
          {planCount > 0 && (
            <span style={{ fontSize: 11, background: '#e8f5e9', color: '#2e7d32', borderRadius: 10, padding: '2px 8px', fontWeight: 700 }}>
              {planCount}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {open && !showForm && (
            <button onClick={e => { e.stopPropagation(); setShowForm(true); }} style={{
              fontSize: 11, fontWeight: 700, padding: '4px 14px', borderRadius: 20,
              background: 'linear-gradient(135deg, #2e7d32, #1b5e20)',
              color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            }}>
              + {t('rot_new_btn')}
            </button>
          )}
          <span style={{ color: '#bbb', fontSize: 13 }}>{open ? '▲' : '▼'}</span>
        </div>
      </div>

      {open && (
        <div>
          {showForm && (
            <NewPlanForm
              locationId={locationId}
              userId={userId}
              onCreated={() => { setShowForm(false); load(); }}
              onCancel={() => setShowForm(false)}
            />
          )}

          {loading && <div style={{ color: '#bbb', fontSize: 12, padding: '10px 0' }}>{t('rot_loading')}</div>}

          {!loading && planCount === 0 && !showForm && (
            <div style={{ background: '#fafaf8', border: '1px dashed #e0dcd4', borderRadius: 10, padding: '18px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 22, marginBottom: 6 }}>🔄</div>
              <div style={{ fontWeight: 600, color: '#999', fontSize: 12, marginBottom: 4 }}>{t('rot_empty')}</div>
              <div style={{ fontSize: 11, color: '#bbb' }}>{t('rot_empty_hint')}</div>
            </div>
          )}

          {!loading && (rotations ?? []).map(rot => (
            <RotationCard key={rot.id} rotation={rot} userId={userId} onDeleted={load} onRefresh={load} />
          ))}
        </div>
      )}
    </div>
  );
};

export default RotationSection;