/**
 * FieldWorkPanel.jsx
 *
 * Endpoints:
 *   GET   /api/v1/fieldwork/user/{user_id}              → list all field work records
 *   GET   /api/v1/fieldwork/field/{field_id}            → records for one field
 *   POST  /api/v1/fieldwork/create                      → create record
 *   PATCH /api/v1/fieldwork/{work_id}                   → update status / cost / harvest
 *   DELETE /api/v1/fieldwork/{work_id}?user_id=1        → delete record
 *
 * FieldWorkType  — see schemas.py
 * FieldWorkStatus: DRAFT | PLANNED | SCHEDULED | ON_HOLD | IN_PROGRESS | COMPLETED | VERIFIED | CANCELLED | FAILED
 */
import { useState, useEffect, useCallback } from 'react';
import api from '../api/client';

const BASE = '/api/v1/fieldwork';

const WORK_TYPES = [
  'PLOWING','SUBSOILING','DISCING','HARROWING','CULTIVATION','ROLLING',
  'SOWING','PLANTING',
  'FERTILIZATION','SPRAYING','IRRIGATION','WEEDING',
  'PRUNING','GRAFTING','MULCHING','THINNING','TRELLIS_REPAIR',
  'MOWING','RAKING','BALING','GRAZING',
  'HARVESTING','DESICCATION',
  'SOIL_SAMPLING','MAINTENANCE',
];

const STATUS_CFG = {
  DRAFT:       { bg: '#f5f5f5', text: '#757575', border: '#e0e0e0' },
  PLANNED:     { bg: '#e3f2fd', text: '#0d47a1', border: '#90caf9' },
  SCHEDULED:   { bg: '#e8eaf6', text: '#283593', border: '#9fa8da' },
  ON_HOLD:     { bg: '#fff9c4', text: '#f57f17', border: '#fff176' },
  IN_PROGRESS: { bg: '#e1f5fe', text: '#01579b', border: '#81d4fa' },
  COMPLETED:   { bg: '#e8f5e9', text: '#1b5e20', border: '#a5d6a7' },
  VERIFIED:    { bg: '#f3e5f5', text: '#4a148c', border: '#ce93d8' },
  CANCELLED:   { bg: '#f5f5f5', text: '#9e9e9e', border: '#e0e0e0' },
  FAILED:      { bg: '#fce4ec', text: '#b71c1c', border: '#ef9a9a' },
};

const WORK_ICONS = {
  PLOWING:'🚜', SUBSOILING:'⛏️', DISCING:'⚙️', HARROWING:'🔧', CULTIVATION:'🌱',
  ROLLING:'🛞', SOWING:'🌾', PLANTING:'🪴', FERTILIZATION:'🧪', SPRAYING:'💧',
  IRRIGATION:'🚿', WEEDING:'🌿', PRUNING:'✂️', GRAFTING:'🔗', MULCHING:'🍂',
  THINNING:'🔪', TRELLIS_REPAIR:'🪝', MOWING:'🌿', RAKING:'🪣', BALING:'📦',
  GRAZING:'🐄', HARVESTING:'🌾', DESICCATION:'☀️', SOIL_SAMPLING:'🧫',
  MAINTENANCE:'🔨',
};

const StatusPill = ({ status }) => {
  const c = STATUS_CFG[status] || STATUS_CFG.PLANNED;
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
      background: c.bg, color: c.text, border: `1px solid ${c.border}`,
      textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap',
    }}>{status}</span>
  );
};

// ── Create form ───────────────────────────────────────────────────────────────
const CreateWorkForm = ({ userId, fields: fieldsProp, onCreated }) => {
  const fields = Array.isArray(fieldsProp) ? fieldsProp : [];
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    field_id: fields[0]?.id ?? '',
    work_type: 'PLOWING',
    work_status: 'PLANNED',
    work_date: new Date().toISOString().slice(0, 16),
    work_cost: '',
    harvest_ton: '',
    note: '',
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // refresh default field_id when fields load
  useEffect(() => {
    if (fields.length > 0 && !form.field_id) set('field_id', fields[0].id);
  }, [fields]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    if (!form.field_id) { alert('Select a field.'); return; }
    setBusy(true);
    try {
      await api.post(`${BASE}/create`, {
        user_id: userId,
        field_id: Number(form.field_id),
        work_type: form.work_type,
        work_status: form.work_status,
        work_date: new Date(form.work_date).toISOString(),
        work_cost: form.work_cost ? Number(form.work_cost) : null,
        harvest_ton: form.harvest_ton ? Number(form.harvest_ton) : null,
        extra_metadata: form.note ? { note: form.note } : null,
      });
      setOpen(false);
      onCreated();
    } catch { alert('Failed to create field work record.'); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ marginBottom: 14 }}>
      <button onClick={() => setOpen(v => !v)} style={btnAdd}>
        {open ? '✕ Cancel' : '＋ Log Field Work'}
      </button>

      {open && (
        <div style={formBox}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
            {fields.length > 0 ? (
              <label style={lbl}>
                Field *
                <select value={form.field_id} onChange={e => set('field_id', e.target.value)} style={inp}>
                  {fields.map(f => <option key={f.id} value={f.id}>{f.label || `Field #${f.id}`}</option>)}
                </select>
              </label>
            ) : (
              <label style={lbl}>
                Field ID *
                <input type="number" placeholder="Enter field ID" value={form.field_id}
                  onChange={e => set('field_id', e.target.value)}
                  style={{ ...inp, width: 120 }} />
              </label>
            )}
            <label style={lbl}>
              Work type *
              <select value={form.work_type} onChange={e => set('work_type', e.target.value)} style={inp}>
                {WORK_TYPES.map(t => (
                  <option key={t} value={t}>{WORK_ICONS[t] || '🌾'} {t.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </label>
            <label style={lbl}>
              Status
              <select value={form.work_status} onChange={e => set('work_status', e.target.value)} style={inp}>
                {Object.keys(STATUS_CFG).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label style={lbl}>
              Date *
              <input type="datetime-local" value={form.work_date}
                onChange={e => set('work_date', e.target.value)} style={inp} />
            </label>
            <label style={lbl}>
              Cost (€)
              <input type="number" placeholder="Optional" value={form.work_cost}
                onChange={e => set('work_cost', e.target.value)} style={{ ...inp, width: 100 }} />
            </label>
            <label style={lbl}>
              Harvest (ton)
              <input type="number" placeholder="If harvest" value={form.harvest_ton}
                onChange={e => set('harvest_ton', e.target.value)} style={{ ...inp, width: 110 }} />
            </label>
            <label style={{ ...lbl, flex: 1, minWidth: 200 }}>
              Note
              <input placeholder="Optional note…" value={form.note}
                onChange={e => set('note', e.target.value)}
                style={{ ...inp, width: '100%' }} />
            </label>
          </div>
          <button onClick={submit} disabled={busy} style={{ ...btnPrimary, marginTop: 12 }}>
            {busy ? 'Saving…' : 'Save Record'}
          </button>
        </div>
      )}
    </div>
  );
};

// ── Work record row ───────────────────────────────────────────────────────────
const WorkRow = ({ record, onUpdate }) => {
  const [open, setOpen] = useState(false);
  const [updating, setUpdating] = useState(false);

  const icon = WORK_ICONS[record.work_type] || '🌾';
  const ts = record.work_date
    ? new Date(record.work_date).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })
    : '—';

  const changeStatus = async (work_status) => {
    setUpdating(true);
    try {
      await api.patch(`${BASE}/${record.id}`, { work_status });
      onUpdate();
    } catch { alert('Update failed.'); }
    finally { setUpdating(false); }
  };

  const del = async () => {
    if (!window.confirm('Delete this record?')) return;
    try {
      await api.delete(`${BASE}/${record.id}`, { params: { user_id: record.user_id } });
      onUpdate();
    } catch { alert('Delete failed.'); }
  };

  return (
    <div style={{ border: '1px solid #e8e0d6', borderRadius: 10, overflow: 'hidden', marginBottom: 6, background: '#fafaf8' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setOpen(v => !v)}>
        <span style={{ fontSize: 20, flexShrink: 0 }}>{icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#333' }}>
              {record.work_type?.replace(/_/g, ' ')}
            </span>
            <StatusPill status={record.work_status} />
            {record.field_label && (
              <span style={{ fontSize: 11, color: '#aaa', background: '#f0ebe3', borderRadius: 8, padding: '1px 7px' }}>
                {record.field_label}
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: '#aaa', marginTop: 2, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <span>📅 {ts}</span>
            {record.work_cost != null && <span>💶 {Number(record.work_cost).toFixed(2)} €</span>}
            {record.harvest_ton != null && <span>🌾 {Number(record.harvest_ton).toFixed(3)} t</span>}
            {record.extra_metadata?.note && <span>📝 {record.extra_metadata.note}</span>}
          </div>
        </div>
        <span style={{ color: '#ccc', fontSize: 12 }}>{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div style={{ padding: '10px 14px 14px', borderTop: '1px solid #ede7df', background: '#fff' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
            Change Status
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {Object.entries(STATUS_CFG).map(([s, c]) => (
              <button key={s} disabled={updating || s === record.work_status} onClick={() => changeStatus(s)}
                style={{
                  padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                  cursor: s === record.work_status ? 'default' : 'pointer',
                  background: s === record.work_status ? c.bg : '#f5f5f5',
                  color: s === record.work_status ? c.text : '#999',
                  border: s === record.work_status ? `1px solid ${c.border}` : '1px solid #e0e0e0',
                  opacity: updating ? 0.5 : 1, transition: 'all 0.15s',
                  textTransform: 'uppercase', letterSpacing: '0.04em',
                }}>{s}</button>
            ))}
          </div>
          <button onClick={del} style={{
            background: 'none', border: '1px solid #ffcdd2', color: '#e53935',
            borderRadius: 6, padding: '4px 12px', fontSize: 12, cursor: 'pointer',
          }}>🗑 Delete record</button>
        </div>
      )}
    </div>
  );
};

// ── Main export ───────────────────────────────────────────────────────────────
const FieldWorkPanel = ({ userId, locationId }) => {
  const [open, setOpen] = useState(true);
  const [records, setRecords] = useState([]);
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');

  const loadFields = useCallback(() => {
    if (!userId) return;
    // Загружаем поля — защита от не-массива на случай разных форматов ответа
    api.get('/api/v1/fields/user_fields', { params: { user_id: userId, ...(locationId ? { location_id: locationId } : {}) } })
      .then(r => {
        const data = r.data;
        setFields(Array.isArray(data) ? data : (data?.fields ?? data?.items ?? []));
      })
      .catch(() => setFields([]));
  }, [userId, locationId]);

  const loadRecords = useCallback(() => {
    if (!userId) return;
    setLoading(true);
    api.get(`${BASE}/user/${userId}`)
      .then(r => {
        const data = r.data;
        setRecords(Array.isArray(data) ? data : (data?.items ?? []));
      })
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  }, [userId]);

  useEffect(() => {
    loadFields();
    loadRecords();
  }, [loadFields, loadRecords]);

  const refresh = () => { loadRecords(); };

  // Unique work types in current records for filter
  const typeOptions = ['ALL', ...new Set(records.map(r => r.work_type))];

  const filtered = records.filter(r => {
    if (filterType !== 'ALL' && r.work_type !== filterType) return false;
    if (filterStatus !== 'ALL' && r.work_status !== filterStatus) return false;
    return true;
  });

  const inProgressCount = records.filter(r => r.work_status === 'IN_PROGRESS').length;

  return (
    <div style={panelWrap}>
      <div style={panelHead} onClick={() => setOpen(v => !v)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>🚜</span>
          <span style={titleStyle}>Field Work</span>
          <span style={badge}>{records.length} records</span>
          {inProgressCount > 0 && (
            <span style={{ ...badge, background: '#e1f5fe', color: '#01579b' }}>
              {inProgressCount} in progress
            </span>
          )}
        </div>
        <span style={{ color: '#bbb', fontSize: 13 }}>{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div style={panelBody}>
          <CreateWorkForm userId={userId} fields={fields} onCreated={refresh} />

          {/* Filters */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
            {/* Status filter */}
            <div style={{ display: 'flex', gap: 0, border: '1px solid #e0d8cf', borderRadius: 8, overflow: 'hidden' }}>
              {['ALL', ...Object.keys(STATUS_CFG)].map(s => (
                <button key={s} onClick={() => setFilterStatus(s)} style={{
                  padding: '5px 10px', fontSize: 10, fontWeight: 700, border: 'none', cursor: 'pointer',
                  background: filterStatus === s ? 'var(--color-accent-soil,#6b4c2a)' : '#f5f0ea',
                  color: filterStatus === s ? '#fff' : '#888',
                  textTransform: 'uppercase', letterSpacing: '0.03em',
                }}>{s === 'ALL' ? 'All' : s}</button>
              ))}
            </div>
          </div>

          {/* Work type filter — only types present */}
          {typeOptions.length > 2 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
              {typeOptions.map(t => (
                <button key={t} onClick={() => setFilterType(t)} style={{
                  padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                  border: 'none', cursor: 'pointer',
                  background: filterType === t ? 'var(--color-green-primary,#054e05)' : '#ede7df',
                  color: filterType === t ? '#fff' : '#777',
                }}>
                  {t === 'ALL' ? 'All types' : `${WORK_ICONS[t] || ''} ${t.replace(/_/g, ' ')}`}
                </button>
              ))}
            </div>
          )}

          {loading ? (
            <div style={{ color: '#bbb', padding: 16, textAlign: 'center', fontSize: 13 }}>Loading records…</div>
          ) : filtered.length === 0 ? (
            <div style={{ color: '#bbb', padding: 16, textAlign: 'center', fontSize: 13 }}>
              {records.length === 0 ? 'No field work logged yet.' : 'No records match filters.'}
            </div>
          ) : (
            filtered.map(r => <WorkRow key={r.id} record={r} onUpdate={refresh} />)
          )}
        </div>
      )}
    </div>
  );
};

export default FieldWorkPanel;

// ── Styles ────────────────────────────────────────────────────────────────────
const panelWrap  = { background: '#fff', borderRadius: 14, border: '1px solid var(--color-accent-soil)', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', overflow: 'hidden', marginBottom: 20 };
const panelHead  = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 20px', cursor: 'pointer', background: 'var(--color-bg-champagne)', borderBottom: '1px solid var(--color-accent-soil)', userSelect: 'none' };
const panelBody  = { padding: '16px 20px 20px' };
const titleStyle = { fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, color: 'var(--color-accent-chernozem)' };
const badge      = { fontSize: 11, color: '#aaa', background: '#f0ebe3', borderRadius: 10, padding: '2px 8px' };
const formBox    = { background: '#f8f4f0', borderRadius: 10, border: '1px solid #e0d8cf', padding: 14, marginTop: 10 };
const inp        = { padding: '6px 10px', borderRadius: 6, border: '1px solid #ddd', fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fff' };
const lbl        = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 10, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.04em' };
const btnPrimary = { background: 'var(--color-green-primary,#054e05)', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' };
const btnAdd     = { background: 'var(--color-accent-soil,#6b4c2a)', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' };