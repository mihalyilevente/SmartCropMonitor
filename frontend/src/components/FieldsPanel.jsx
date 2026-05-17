/**
 * FieldsPanel.jsx
 *
 * Panel for managing field units — list, full info, inline editing.
 *
 * Endpoints used:
 *   GET   /api/v1/fields/user_fields?user_id=1&location_id=2   → list fields
 *   PATCH /api/v1/fields/{field_id}?user_id=1                  → update field
 */
import { useState, useEffect, useCallback } from 'react';
import api from '../api/client';

// ── Enums (mirror schemas.py) ─────────────────────────────────────────────────
const FIELD_TYPES = [
  'pasture','crop','hayfield','orchard','vineyard','berry_patch',
  'nursery','greenhouse','fallow','fallow_land','forest_belt',
  'storage','water_body','other',
];

const FIELD_CROPS = [
  'WHEAT_WINTER','WHEAT_SPRING','BARLEY','CORN','OATS','RYE','RICE',
  'PEAS','SOYBEANS','CHICKPEAS','LENTILS',
  'SUNFLOWER','RAPESEED_WINTER','RAPESEED_SPRING','FLAX',
  'SUGAR_BEET','POTATOES','COTTON',
  'ALFALFA','SILAGE_CORN','CLOVER','GRASS_MIX',
  'APPLE','PEAR','CHERRY','GRAPES_WINE','GRAPES_TABLE','STRAWBERRY','BLUEBERRY',
  'TOMATO','ONION','CARROT','CABBAGE',
  'FALLOW','COVER_CROP','OTHER',
];

const FIELD_STATUSES = ['active', 'inactive', 'archived'];

// ── Visual config ─────────────────────────────────────────────────────────────
const TYPE_CFG = {
  crop:        { icon: '🌾', color: '#2e7d32' },
  pasture:     { icon: '🐄', color: '#558b2f' },
  hayfield:    { icon: '🌿', color: '#827717' },
  orchard:     { icon: '🍎', color: '#bf360c' },
  vineyard:    { icon: '🍇', color: '#6a1b9a' },
  berry_patch: { icon: '🍓', color: '#c62828' },
  nursery:     { icon: '🌱', color: '#1b5e20' },
  greenhouse:  { icon: '🏡', color: '#006064' },
  fallow:      { icon: '🟤', color: '#795548' },
  fallow_land: { icon: '🟤', color: '#795548' },
  forest_belt: { icon: '🌲', color: '#1b5e20' },
  storage:     { icon: '🏚️', color: '#37474f' },
  water_body:  { icon: '💧', color: '#0277bd' },
  other:       { icon: '📍', color: '#757575' },
};

const STATUS_CFG = {
  active:   { bg: '#e8f5e9', text: '#1b5e20', border: '#a5d6a7', label: 'Active'   },
  inactive: { bg: '#fff8e1', text: '#f57f17', border: '#ffe082', label: 'Inactive' },
  archived: { bg: '#f5f5f5', text: '#9e9e9e', border: '#e0e0e0', label: 'Archived' },
};

// ── Inline edit form ──────────────────────────────────────────────────────────
const EditForm = ({ field, userId, onSaved, onCancel }) => {
  const [form, setForm] = useState({
    label:       field.label       || '',
    field_type:  field.field_type  || 'crop',
    crop_type:   field.crop_type   || '',
    season_year: field.season_year ? String(field.season_year) : '',
    status:      field.status      || 'active',
  });
  const [busy, setBusy] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.label.trim()) { alert('Label is required.'); return; }
    setBusy(true);
    try {
      await api.patch(`/api/v1/fields/${field.id}`, {
        label:       form.label.trim(),
        field_type:  form.field_type,
        crop_type:   form.crop_type  || null,
        season_year: form.season_year ? Number(form.season_year) : null,
        status:      form.status,
      }, { params: { user_id: userId } });
      onSaved();
    } catch { alert('Failed to save changes.'); }
    finally { setBusy(false); }
  };

  return (
    <div style={editBox} onClick={e => e.stopPropagation()}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
        <label style={lbl}>
          Name
          <input value={form.label} onChange={e => set('label', e.target.value)}
            style={{ ...inp, minWidth: 160 }} />
        </label>
        <label style={lbl}>
          Field type
          <select value={form.field_type} onChange={e => set('field_type', e.target.value)} style={inp}>
            {FIELD_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g,' ')}</option>)}
          </select>
        </label>
        <label style={lbl}>
          Crop
          <select value={form.crop_type} onChange={e => set('crop_type', e.target.value)} style={inp}>
            <option value="">— none —</option>
            {FIELD_CROPS.map(c => <option key={c} value={c}>{c.replace(/_/g,' ')}</option>)}
          </select>
        </label>
        <label style={lbl}>
          Season year
          <input type="number" min="2000" max="2100" placeholder="e.g. 2025"
            value={form.season_year} onChange={e => set('season_year', e.target.value)}
            style={{ ...inp, width: 110 }} />
        </label>
        <label style={lbl}>
          Status
          <select value={form.status} onChange={e => set('status', e.target.value)} style={inp}>
            {FIELD_STATUSES.map(s => <option key={s} value={s}>{STATUS_CFG[s]?.label ?? s}</option>)}
          </select>
        </label>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={submit} disabled={busy} style={btnSave}>
          {busy ? 'Saving…' : '✓ Save changes'}
        </button>
        <button onClick={onCancel} style={btnCancel}>Cancel</button>
      </div>
    </div>
  );
};

// ── Field card ────────────────────────────────────────────────────────────────
const FieldCard = ({ field, userId, onUpdate }) => {
  const [expanded, setExpanded] = useState(false);
  const [editing,  setEditing]  = useState(false);

  const typeCfg   = TYPE_CFG[field.field_type]   || TYPE_CFG.other;
  const statusCfg = STATUS_CFG[field.status]      || STATUS_CFG.active;
  const addedDate = field.created_at
    ? new Date(field.created_at).toLocaleDateString('en-GB', { dateStyle: 'medium' })
    : '—';

  const handleSaved = () => { setEditing(false); onUpdate(); };

  return (
    <div style={{
      border: `1.5px solid ${typeCfg.color}30`,
      borderLeft: `4px solid ${typeCfg.color}`,
      borderRadius: 12,
      overflow: 'hidden',
      marginBottom: 8,
      background: '#fafaf8',
      transition: 'box-shadow 0.2s',
      boxShadow: expanded ? '0 4px 16px rgba(0,0,0,0.10)' : '0 1px 4px rgba(0,0,0,0.05)',
    }}>
      {/* ── Header row ── */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', cursor: 'pointer', userSelect: 'none' }}
        onClick={() => { setExpanded(v => !v); setEditing(false); }}
      >
        <span style={{ fontSize: 22, flexShrink: 0 }}>{typeCfg.icon}</span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#222' }}>{field.label}</span>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
              background: statusCfg.bg, color: statusCfg.text, border: `1px solid ${statusCfg.border}`,
              textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>{statusCfg.label}</span>
            {field.manual_added && (
              <span style={{ fontSize: 10, color: '#0277bd', background: '#e1f5fe', border: '1px solid #81d4fa', borderRadius: 20, padding: '2px 8px', fontWeight: 700 }}>
                ✏️ Manual
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: '#aaa', marginTop: 2, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <span>📐 {field.area_ha ? `${Number(field.area_ha).toFixed(2)} ha` : '—'}</span>
            <span>🌿 {field.field_type?.replace(/_/g,' ')}</span>
            {field.crop_type && <span>🌱 {field.crop_type.replace(/_/g,' ')}</span>}
            {field.season_year && <span>📅 {field.season_year}</span>}
          </div>
        </div>

        <span style={{ color: '#ccc', fontSize: 12, flexShrink: 0 }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {/* ── Expanded detail ── */}
      {expanded && (
        <div style={{ borderTop: `1px solid ${typeCfg.color}20`, background: '#fff', padding: '12px 16px 14px' }}>
          {!editing ? (
            <>
              {/* Info grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8, marginBottom: 14 }}>
                {[
                  { label: 'Field ID',    value: `#${field.id}` },
                  { label: 'Type',        value: field.field_type?.replace(/_/g,' ') || '—' },
                  { label: 'Crop',        value: field.crop_type?.replace(/_/g,' ') || '—' },
                  { label: 'Season year', value: field.season_year || '—' },
                  { label: 'Area',        value: field.area_ha ? `${Number(field.area_ha).toFixed(2)} ha` : '—' },
                  { label: 'Source',      value: field.source || '—' },
                  { label: 'Status',      value: statusCfg.label },
                  { label: 'Added',       value: addedDate },
                ].map(({ label, value }) => (
                  <div key={label} style={{ background: '#f8f4f0', borderRadius: 8, padding: '8px 12px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{label}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#444' }}>{value}</div>
                  </div>
                ))}
              </div>

              <button onClick={e => { e.stopPropagation(); setEditing(true); }} style={btnEdit}>
                ✏️ Edit field info
              </button>
            </>
          ) : (
            <EditForm field={field} userId={userId} onSaved={handleSaved} onCancel={() => setEditing(false)} />
          )}
        </div>
      )}
    </div>
  );
};

// ── Main panel ────────────────────────────────────────────────────────────────
const FieldsPanel = ({ userId, locationId }) => {
  const [open,    setOpen]    = useState(true);
  const [fields,  setFields]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType,   setFilterType]   = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('active');

  const load = useCallback(() => {
    if (!userId) return;
    setLoading(true);
    api.get('/api/v1/fields/user_fields', {
      params: { user_id: userId, ...(locationId ? { location_id: locationId } : {}) },
    })
      .then(r => {
        const data = r.data;
        setFields(Array.isArray(data) ? data : (data?.fields ?? data?.items ?? []));
      })
      .catch(() => setFields([]))
      .finally(() => setLoading(false));
  }, [userId, locationId]);

  useEffect(() => { load(); }, [load]);

  // unique types present in data
  const presentTypes = ['ALL', ...new Set(fields.map(f => f.field_type).filter(Boolean))];

  const filtered = fields.filter(f => {
    if (filterType   !== 'ALL'    && f.field_type !== filterType)   return false;
    if (filterStatus !== 'ALL'    && f.status     !== filterStatus) return false;
    return true;
  });

  const activeCount = fields.filter(f => f.status === 'active').length;
  const totalHa     = fields.filter(f => f.status === 'active')
    .reduce((s, f) => s + (parseFloat(f.area_ha) || 0), 0);

  return (
    <div style={panelWrap}>
      {/* ── Panel header ── */}
      <div style={panelHead} onClick={() => setOpen(v => !v)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 18 }}>🗺️</span>
          <span style={titleStyle}>My Fields</span>
          <span style={badge}>{fields.length} total</span>
          {activeCount > 0 && (
            <span style={{ ...badge, background: '#e8f5e9', color: '#2e7d32' }}>
              {activeCount} active
            </span>
          )}
          {totalHa > 0 && (
            <span style={{ ...badge, background: '#e3f2fd', color: '#0d47a1' }}>
              {totalHa.toFixed(1)} ha
            </span>
          )}
        </div>
        <span style={{ color: '#bbb', fontSize: 13 }}>{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div style={panelBody}>
          {/* ── Filters ── */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
            {/* Status filter */}
            <div style={filterRow}>
              {(['ALL', 'active', 'inactive', 'archived']).map(s => (
                <button key={s} onClick={() => setFilterStatus(s)} style={{
                  ...filterBtn,
                  background: filterStatus === s ? 'var(--color-accent-soil,#6b4c2a)' : '#f5f0ea',
                  color: filterStatus === s ? '#fff' : '#888',
                }}>
                  {s === 'ALL' ? 'All statuses' : STATUS_CFG[s]?.label ?? s}
                </button>
              ))}
            </div>

            {/* Type filter — only present types */}
            {presentTypes.length > 2 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {presentTypes.map(t => (
                  <button key={t} onClick={() => setFilterType(t)} style={{
                    padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                    border: 'none', cursor: 'pointer',
                    background: filterType === t ? 'var(--color-green-primary,#054e05)' : '#ede7df',
                    color: filterType === t ? '#fff' : '#777',
                  }}>
                    {t === 'ALL' ? 'All types' : `${TYPE_CFG[t]?.icon || ''} ${t.replace(/_/g,' ')}`}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── Content ── */}
          {loading ? (
            <div style={{ color: '#bbb', padding: 20, textAlign: 'center', fontSize: 13 }}>Loading fields…</div>
          ) : filtered.length === 0 ? (
            <div style={{ color: '#bbb', padding: 20, textAlign: 'center', fontSize: 13 }}>
              {fields.length === 0
                ? 'No fields yet. Use "Draw Field" or "Segment Fields" to add them.'
                : 'No fields match the current filter.'}
            </div>
          ) : (
            filtered.map(f => (
              <FieldCard key={f.id} field={f} userId={userId} onUpdate={load} />
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default FieldsPanel;

// ── Styles ────────────────────────────────────────────────────────────────────
const panelWrap  = { background: '#fff', borderRadius: 14, border: '1px solid var(--color-accent-soil)', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', overflow: 'hidden', marginBottom: 20 };
const panelHead  = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 20px', cursor: 'pointer', background: 'var(--color-bg-champagne)', borderBottom: '1px solid var(--color-accent-soil)', userSelect: 'none' };
const panelBody  = { padding: '16px 20px 20px' };
const titleStyle = { fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, color: 'var(--color-accent-chernozem)' };
const badge      = { fontSize: 11, color: '#aaa', background: '#f0ebe3', borderRadius: 10, padding: '2px 8px' };
const filterRow  = { display: 'flex', gap: 0, border: '1px solid #e0d8cf', borderRadius: 8, overflow: 'hidden' };
const filterBtn  = { padding: '5px 11px', fontSize: 11, fontWeight: 700, border: 'none', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.03em' };
const editBox    = { background: '#f8f4f0', borderRadius: 10, border: '1px solid #e0d8cf', padding: 14 };
const inp        = { padding: '6px 10px', borderRadius: 6, border: '1px solid #ddd', fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fff' };
const lbl        = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 10, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.04em' };
const btnSave    = { background: 'var(--color-green-primary,#054e05)', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' };
const btnCancel  = { background: 'none', border: '1px solid #ddd', color: '#888', borderRadius: 6, padding: '7px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' };
const btnEdit    = { background: 'var(--color-accent-soil,#6b4c2a)', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' };