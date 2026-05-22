/**
 * PasturePanel.jsx — Pasture Management + Grazing Rotation
 * Accepts userId prop (passed from Dashboard) to forward to RotationSection
 */
import { useState, useEffect, useCallback } from 'react';
import api from '../api/client';
import { useLang } from '../context/LanguageContext';
import { RotationSection } from './RotationPanel';

// ─────────────────────────────────────────────────────────────
// Stage display config
// ─────────────────────────────────────────────────────────────

const STAGE_CFG = {
  dormant: { bg: '#f5f5f5', text: '#757575', border: '#e0e0e0' },
  early:   { bg: '#f1f8e9', text: '#558b2f', border: '#aed581' },
  active:  { bg: '#e8f5e9', text: '#2e7d32', border: '#81c784' },
  peak:    { bg: '#e8f5e9', text: '#1b5e20', border: '#43a047' },
  over:    { bg: '#fff8e1', text: '#827717', border: '#ffd54f' },
};

// ─────────────────────────────────────────────────────────────
// Shared sub-components
// ─────────────────────────────────────────────────────────────

const AumBar = ({ value, max }) => {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const color = pct > 75 ? '#2e7d32' : pct > 40 ? '#66bb6a' : pct > 15 ? '#ffa726' : '#bdbdbd';
  return (
    <div style={{ background: '#f0ebe3', borderRadius: 6, height: 8, overflow: 'hidden', marginTop: 4 }}>
      <div style={{ width: `${pct}%`, height: '100%', borderRadius: 6, background: color, transition: 'width 0.6s cubic-bezier(.4,0,.2,1)' }} />
    </div>
  );
};

const Chip = ({ label, value, unit = '', color = '#555' }) => (
  <div style={{ background: '#fafaf8', border: '1px solid #e8e2da', borderRadius: 8, padding: '6px 10px', minWidth: 80 }}>
    <div style={{ fontSize: 9, fontWeight: 700, color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{label}</div>
    <div style={{ fontSize: 14, fontWeight: 700, color }}>
      {value !== null && value !== undefined ? value : '—'}
      {value !== null && value !== undefined && unit && <span style={{ fontSize: 11, fontWeight: 500, color: '#aaa', marginLeft: 2 }}>{unit}</span>}
    </div>
  </div>
);

const Sparkline = ({ data, field = 'biomass_tha', color = '#43a047' }) => {
  if (!data || data.length < 2) return null;
  const vals = [...data].reverse().map(d => d[field] ?? 0);
  const mn = Math.min(...vals), mx = Math.max(...vals), range = mx - mn || 1;
  const W = 120, H = 32, pad = 3;
  const pts = vals.map((v, i) => {
    const x = pad + (i / (vals.length - 1)) * (W - pad * 2);
    const y = H - pad - ((v - mn) / range) * (H - pad * 2);
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={W} height={H} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
      {vals.map((v, i) => {
        const x = pad + (i / (vals.length - 1)) * (W - pad * 2);
        const y = H - pad - ((v - mn) / range) * (H - pad * 2);
        return i === vals.length - 1 ? <circle key={i} cx={x} cy={y} r={3} fill={color} /> : null;
      })}
    </svg>
  );
};

// ─────────────────────────────────────────────────────────────
// Stage translator hook
// ─────────────────────────────────────────────────────────────

const useStageTranslator = () => {
  const { t } = useLang();
  return (stage) => {
    if (!stage) return t('stage_no_data');
    const key = `stage_${stage.toLowerCase().replace(/[\s/]+/g, '_').replace(/[^a-z_]/g, '')}`;
    const translated = t(key);
    return translated === key ? stage : translated;
  };
};

// ─────────────────────────────────────────────────────────────
// HistoryModal
// ─────────────────────────────────────────────────────────────

const HistoryModal = ({ fieldId, label, onClose }) => {
  const { t } = useLang();
  const translateStage = useStageTranslator();
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/api/v1/fields/${fieldId}/pasture-history`, { params: { limit: 30 } })
      .then(r => setHistory(r.data))
      .catch(() => setHistory(null))
      .finally(() => setLoading(false));
  }, [fieldId]);

  const cols = [
    t('history_col_date'), t('history_col_biomass'), t('history_col_evi'),
    t('history_col_msi'), t('history_col_ci'), t('history_col_aum'),
    t('history_col_stage'), t('history_col_conf'),
  ];

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(30,20,10,0.45)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 18, boxShadow: '0 8px 48px rgba(0,0,0,0.22)', width: 'min(680px, 96vw)', maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #f0ebe3', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(90deg, #f8f4f0, #fff)' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#2e7d32' }}>🐄 {label}</div>
            <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{t('history_title')}</div>
          </div>
          <button onClick={onClose} style={{ background: '#f5f0ea', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontWeight: 700, fontSize: 13, color: '#888' }}>
            {t('history_close')}
          </button>
        </div>

        <div style={{ overflowY: 'auto', padding: '16px 24px 24px' }}>
          {loading && <div style={{ color: '#bbb', textAlign: 'center', padding: 30 }}>{t('history_loading')}</div>}
          {!loading && !history && <div style={{ color: '#e57373', textAlign: 'center', padding: 30 }}>{t('history_error')}</div>}
          {history && (
            <>
              {history.history?.length >= 2 && (
                <div style={{ display: 'flex', gap: 24, marginBottom: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  {[
                    { label: t('history_col_biomass'), field: 'biomass_tha', color: '#43a047' },
                    { label: 'EVI',                    field: 'evi',         color: '#0288d1' },
                    { label: t('history_col_aum'),     field: 'aum_capacity',color: '#f57c00' },
                  ].map(({ label: lbl, field, color }) => (
                    <div key={field}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', marginBottom: 4 }}>{lbl}</div>
                      <Sparkline data={history.history} field={field} color={color} />
                    </div>
                  ))}
                </div>
              )}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f8f4f0' }}>
                    {cols.map(h => (
                      <th key={h} style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 700, color: '#aaa', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '2px solid #f0ebe3' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(history.history ?? []).map((row, i) => {
                    const sc = STAGE_CFG[row.growth_stage?.code] ?? STAGE_CFG.dormant;
                    return (
                      <tr key={row.id ?? i} style={{ borderBottom: '1px solid #f5f0ea' }}>
                        <td style={{ padding: '7px 10px', color: '#555', whiteSpace: 'nowrap' }}>{row.analysis_date ? new Date(row.analysis_date).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—'}</td>
                        <td style={{ padding: '7px 10px', fontWeight: 700, color: '#2e7d32' }}>{row.biomass_tha?.toFixed(2) ?? '—'}</td>
                        <td style={{ padding: '7px 10px', color: '#0288d1' }}>{row.evi?.toFixed(3) ?? '—'}</td>
                        <td style={{ padding: '7px 10px', color: '#555' }}>{row.msi?.toFixed(3) ?? '—'}</td>
                        <td style={{ padding: '7px 10px', color: '#555' }}>{row.ci?.toFixed(3) ?? '—'}</td>
                        <td style={{ padding: '7px 10px', fontWeight: 600, color: '#f57c00' }}>{row.aum_capacity?.toFixed(1) ?? '—'}</td>
                        <td style={{ padding: '7px 10px' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: sc.bg, color: sc.text, border: `1px solid ${sc.border}` }}>
                            {row.growth_stage?.icon} {translateStage(row.growth_stage?.stage)}
                          </span>
                        </td>
                        <td style={{ padding: '7px 10px', color: '#bbb' }}>{row.confidence != null ? `${(row.confidence * 100).toFixed(0)}%` : '—'}</td>
                      </tr>
                    );
                  })}
                  {(history.history ?? []).length === 0 && (
                    <tr><td colSpan={8} style={{ padding: 20, color: '#bbb', textAlign: 'center' }}>{t('history_no_records')}</td></tr>
                  )}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// PastureCard
// ─────────────────────────────────────────────────────────────

const PastureCard = ({ field, maxAum }) => {
  const { t } = useLang();
  const translateStage  = useStageTranslator();
  const [expanded,     setExpanded]     = useState(false);
  const [showHistory,  setShowHistory]  = useState(false);

  const s  = field.growth_stage  ?? {};
  const r  = field.recommendation ?? {};
  const sc = STAGE_CFG[s.code]   ?? STAGE_CFG.dormant;
  const stageColor = s.color ?? '#bdbdbd';

  const lastAnalysis = field.analysis_date
    ? t('pasture_last_analysis', new Date(field.analysis_date).toLocaleDateString(undefined, { dateStyle: 'medium' }))
    : t('pasture_no_analysis');

  const translateAction = (action) => {
    if (!action) return '—';
    const key = `rec_${action.toLowerCase().replace(/\s+/g, '_')}`;
    const translated = t(key);
    return translated === key ? action : translated;
  };

  return (
    <>
      <div style={{ border: `1.5px solid ${stageColor}40`, borderLeft: `4px solid ${stageColor}`, borderRadius: 12, background: '#fafaf8', marginBottom: 10, overflow: 'hidden', boxShadow: expanded ? '0 4px 18px rgba(0,0,0,0.10)' : '0 1px 4px rgba(0,0,0,0.05)', transition: 'box-shadow 0.2s' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer', userSelect: 'none' }} onClick={() => setExpanded(v => !v)}>
          <span style={{ fontSize: 24, flexShrink: 0 }}>🐄</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#222' }}>{field.label}</span>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: sc.bg, color: sc.text, border: `1px solid ${sc.border}`, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {s.icon} {translateStage(s.stage)}
              </span>
              {!field.has_biomass_data && <span style={{ fontSize: 10, color: '#e57373', fontWeight: 600 }}>{t('pasture_no_biomass')}</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <div style={{ flex: 1, maxWidth: 200 }}><AumBar value={field.aum_capacity} max={maxAum} /></div>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#f57c00', whiteSpace: 'nowrap' }}>{field.aum_capacity?.toFixed(1)} AUM/mo</span>
              <span style={{ fontSize: 11, color: '#bbb', whiteSpace: 'nowrap' }}>· {field.area_ha?.toFixed(1)} ha</span>
            </div>
          </div>
          <span style={{ color: '#bbb', fontSize: 13, flexShrink: 0 }}>{expanded ? '▲' : '▼'}</span>
        </div>

        {expanded && (
          <div style={{ borderTop: `1px solid ${stageColor}20`, background: '#fff', padding: '14px 16px 16px' }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
              <Chip label="Biomass"    value={field.biomass_tha?.toFixed(2)} unit="t/ha" color="#2e7d32" />
              <Chip label="EVI"        value={field.evi?.toFixed(3)}          color="#0288d1" />
              <Chip label="MSI"        value={field.msi?.toFixed(3)}          color="#6a1b9a" />
              <Chip label="CI"         value={field.ci?.toFixed(3)}           color="#00695c" />
              <Chip label="DM avail"   value={field.dm_available_kg != null ? Math.round(field.dm_available_kg).toLocaleString() : null} unit="kg" color="#e65100" />
              <Chip label="AUM/mo"     value={field.aum_capacity?.toFixed(2)} color="#f57c00" />
              <Chip label="Confidence" value={field.confidence != null ? `${(field.confidence * 100).toFixed(0)}%` : null} color="#888" />
            </div>

            <div style={{ background: `${stageColor}10`, border: `1px solid ${stageColor}40`, borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: stageColor, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                {t('pasture_rotation')}
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#333', marginBottom: 6 }}>{translateAction(r.action)}</div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 8 }}>
                <div style={{ fontSize: 12, color: '#555' }}><span style={{ fontWeight: 600 }}>{t('pasture_graze')}</span> {r.graze_days ?? 0} {t('pasture_days')}</div>
                <div style={{ fontSize: 12, color: '#555' }}><span style={{ fontWeight: 600 }}>{t('pasture_rest')}</span>  {r.rest_days  ?? 0} {t('pasture_days')}</div>
              </div>
              {r.note && <div style={{ fontSize: 11, color: '#888', fontStyle: 'italic', lineHeight: 1.5 }}>{r.note}</div>}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontSize: 11, color: '#bbb' }}>{lastAnalysis}</span>
              <button onClick={e => { e.stopPropagation(); setShowHistory(true); }} style={{ background: 'linear-gradient(135deg, #2e7d32, #1b5e20)', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontWeight: 700, fontSize: 12, fontFamily: 'inherit' }}>
                {t('pasture_view_history')}
              </button>
            </div>
          </div>
        )}
      </div>

      {showHistory && <HistoryModal fieldId={field.field_id} label={field.label} onClose={() => setShowHistory(false)} />}
    </>
  );
};

// ─────────────────────────────────────────────────────────────
// PastureSummary
// ─────────────────────────────────────────────────────────────

const PastureSummary = ({ data }) => {
  const { t } = useLang();
  const stageCount = {};
  (data.fields ?? []).forEach(f => { const c = f.growth_stage?.code ?? 'dormant'; stageCount[c] = (stageCount[c] ?? 0) + 1; });

  const items = [
    { label: t('pasture_summary_fields'),  value: data.field_count,                         icon: '🐄', color: '#2e7d32' },
    { label: t('pasture_summary_area'),    value: `${data.total_pasture_ha?.toFixed(1)} ha`, icon: '🗺️', color: '#0277bd' },
    { label: t('pasture_summary_aum'),     value: data.total_aum_capacity?.toFixed(1),       icon: '🐮', color: '#f57c00' },
    { label: t('pasture_summary_peak'),    value: stageCount.peak  ?? 0,                     icon: '🌾', color: '#1b5e20' },
    { label: t('pasture_summary_active'),  value: stageCount.active ?? 0,                    icon: '🌿', color: '#388e3c' },
    { label: t('pasture_summary_resting'), value: stageCount.dormant ?? 0,                   icon: '💤', color: '#9e9e9e' },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10, marginBottom: 16 }}>
      {items.map(({ label: lbl, value, icon, color }) => (
        <div key={lbl} style={{ background: '#fafaf8', border: '1px solid #e8e2da', borderRadius: 10, padding: '10px 14px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{icon} {lbl}</div>
          <div style={{ fontSize: 18, fontWeight: 800, color }}>{value ?? '—'}</div>
        </div>
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// PasturePanel — main component
// Props: locationId (required), userId (required for rotation)
// ─────────────────────────────────────────────────────────────

const PasturePanel = ({ locationId, userId }) => {
  const { t } = useLang();
  const [open,    setOpen]    = useState(true);
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const load = useCallback(() => {
    if (!locationId) return;
    setLoading(true); setError(null);
    api.get(`/api/v1/locations/${locationId}/pasture`)
      .then(r => setData(r.data))
      .catch(err => {
        const status = err?.response?.status;
        const detail = err?.response?.data?.detail;
        setError(t('pasture_err_load', status ?? 'network error', detail));
      })
      .finally(() => setLoading(false));
  }, [locationId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  const fields    = data?.fields ?? [];
  const maxAum    = fields.reduce((m, f) => Math.max(m, f.aum_capacity ?? 0), 0) || 1;
  const hasFields = fields.length > 0;

  return (
    <div style={panelWrap}>
      {/* ── Panel header ── */}
      <div style={panelHead} onClick={() => setOpen(v => !v)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 18 }}>🐄</span>
          <span style={titleStyle}>{t('pasture_title')}</span>
          {data && (
            <>
              <span style={badge}>{t('pasture_fields', data.field_count)}</span>
              {data.total_pasture_ha > 0 && <span style={{ ...badge, background: '#e8f5e9', color: '#2e7d32' }}>{data.total_pasture_ha?.toFixed(1)} ha</span>}
              {data.total_aum_capacity > 0 && <span style={{ ...badge, background: '#fff3e0', color: '#e65100' }}>{data.total_aum_capacity?.toFixed(1)} AUM/mo</span>}
            </>
          )}
        </div>
        <span style={{ color: '#bbb', fontSize: 13 }}>{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div style={panelBody}>
          {loading && <div style={{ color: '#bbb', textAlign: 'center', padding: 28, fontSize: 13 }}>{t('pasture_loading')}</div>}
          {error   && <div style={{ color: '#e57373', textAlign: 'center', padding: 20, fontSize: 13 }}>{error}</div>}

          {!loading && !error && !hasFields && (
            <div style={{ color: '#bbb', textAlign: 'center', padding: 28, fontSize: 13 }}>
              {t('pasture_empty')}<br />
              <span style={{ fontSize: 12, marginTop: 4, display: 'block' }}>{t('pasture_empty_hint')}</span>
            </div>
          )}

          {!loading && !error && hasFields && (
            <>
              <PastureSummary data={data} />
              <div style={{ fontSize: 11, color: '#aaa', background: '#faf8f4', border: '1px solid #f0ebe3', borderRadius: 8, padding: '7px 12px', marginBottom: 14, lineHeight: 1.6 }}>
                {t('pasture_aum_note')}
              </div>
              {fields.map(f => <PastureCard key={f.field_id} field={f} maxAum={maxAum} />)}

              {/* ── Rotation section ── */}
              <RotationSection locationId={locationId} userId={userId} />
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default PasturePanel;

// ─────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────

const panelWrap  = { background: '#fff', borderRadius: 14, border: '1px solid var(--color-accent-soil)', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', overflow: 'hidden', marginBottom: 20 };
const panelHead  = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 20px', cursor: 'pointer', background: 'var(--color-bg-champagne)', borderBottom: '1px solid var(--color-accent-soil)', userSelect: 'none' };
const panelBody  = { padding: '16px 20px 20px' };
const titleStyle = { fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, color: 'var(--color-accent-chernozem)' };
const badge      = { fontSize: 11, color: '#aaa', background: '#f0ebe3', borderRadius: 10, padding: '2px 8px' };