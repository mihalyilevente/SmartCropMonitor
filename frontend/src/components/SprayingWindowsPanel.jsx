import { useState, useEffect } from 'react';
import api from '../api/client';
import { useLang } from '../context/LanguageContext';

const getScoreColor = (score) => {
  if (score >= 0.8) return { bg: '#e8f5e8', border: '#317f43', text: '#1a5c1a' };
  if (score >= 0.6) return { bg: '#fff8e1', border: '#d8975a', text: '#8b5a00' };
  if (score >= 0.4) return { bg: '#ffeaa7', border: '#fdcb6e', text: '#b8860b' };
  return { bg: '#ffe0e0', border: '#d63031', text: '#8b0000' };
};

const AddToFieldWorkButton = ({ window, userId, index, fields }) => {
  const { t } = useLang();
  const [state, setState] = useState('idle');
  const [fieldId, setFieldId] = useState('');

  useEffect(() => { if (fields.length > 0 && !fieldId) setFieldId(String(fields[0].id)); }, [fields]); // eslint-disable-line

  const openPicker = (e) => { e.stopPropagation(); if (state !== 'idle') return; setState('picking'); };
  const cancel     = (e) => { e.stopPropagation(); setState('idle'); };

  const confirm = async (e) => {
    e.stopPropagation();
    if (!fieldId) return;
    setState('loading');
    try {
      await api.post('/api/v1/fieldwork/create', {
        user_id: userId, field_id: Number(fieldId), work_type: 'SPRAYING', work_status: 'PLANNED',
        work_date: window.start,
        extra_metadata: { note: `Spraying window #${index + 1} — score ${(window.score * 100).toFixed(0)}%, ends ${new Date(window.end).toLocaleString('hu-HU', { dateStyle: 'short', timeStyle: 'short' })}`, spraying_window_end: window.end, spraying_score: window.score },
      });
      setState('done');
      setTimeout(() => setState('idle'), 3000);
    } catch { setState('error'); setTimeout(() => setState('idle'), 2500); }
  };

  if (state === 'picking') {
    return (
      <div onClick={e => e.stopPropagation()} style={{ marginTop: 10, background: '#fff', border: '1px solid #c8e6c9', borderRadius: 8, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t('spray_log_title')}</div>
        {fields.length > 0 ? (
          <select value={fieldId} onChange={e => setFieldId(e.target.value)} style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #ddd', fontSize: 12, fontFamily: 'inherit' }}>
            {fields.map(f => <option key={f.id} value={f.id}>{f.label || `Field #${f.id}`}</option>)}
          </select>
        ) : (
          <div style={{ fontSize: 11, color: '#aaa' }}>{t('spray_no_fields')}</div>
        )}
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={confirm} disabled={!fieldId || fields.length === 0} style={{ flex: 1, padding: '5px 0', background: '#054e05', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: fieldId ? 'pointer' : 'not-allowed', fontFamily: 'inherit', opacity: fieldId ? 1 : 0.5 }}>{t('spray_confirm_add')}</button>
          <button onClick={cancel} style={{ padding: '5px 10px', background: 'none', color: '#999', border: '1px solid #ddd', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>{t('spray_cancel')}</button>
        </div>
      </div>
    );
  }

  const cfg = {
    idle:    { label: t('spray_add_fw'),    bg: '#054e05', cursor: 'pointer' },
    loading: { label: t('spray_saving'),    bg: '#3a7d3a', cursor: 'wait'    },
    done:    { label: t('spray_added_ok'),  bg: '#27ae60', cursor: 'default' },
    error:   { label: t('spray_add_failed'),bg: '#d63031', cursor: 'pointer' },
  }[state];

  return (
    <button onClick={state === 'idle' || state === 'error' ? openPicker : undefined} style={{ marginTop: 10, width: '100%', padding: '7px 0', background: cfg.bg, color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: cfg.cursor, letterSpacing: '0.03em', transition: 'background 0.2s' }}>
      {cfg.label}
    </button>
  );
};

const WindowCard = ({ window, index, userId, fields }) => {
  const { t } = useLang();
  const start = new Date(window.start), end = new Date(window.end);
  const duration = (end - start) / (1000 * 60 * 60);
  const colors = getScoreColor(window.score);
  const fmt = (d) => d.toLocaleDateString('hu-HU', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div style={{ background: colors.bg, border: `2px solid ${colors.border}`, borderRadius: 16, padding: '14px 18px', marginBottom: 12, position: 'relative', overflow: 'hidden', transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)', cursor: 'default', transform: 'translateY(0)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 25px rgba(0,0,0,0.15)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'; }}>
      <div style={{ position: 'absolute', top: -8, right: 12, background: colors.border, color: '#fff', fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
        {(window.score * 100).toFixed(0)}%
      </div>
      <div style={{ marginTop: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 24, filter: 'grayscale(0.2)' }}>🌾</span>
          <h4 style={{ margin: 0, color: colors.text, fontFamily: 'var(--font-heading)', fontSize: 15, fontWeight: 700 }}>{t('spray_window_title', index + 1)}</h4>
        </div>
        <div style={{ fontSize: 13, color: colors.text, lineHeight: 1.4, marginBottom: 8 }}>
          <div style={{ marginBottom: 4 }}><strong>{t('spray_start')}</strong> {fmt(start)}</div>
          <div style={{ marginBottom: 4 }}><strong>{t('spray_end')}</strong> {fmt(end)}</div>
          <div><strong>{t('spray_duration')}</strong> {duration.toFixed(1)}{t('spray_hours')}</div>
        </div>
        <div style={{ background: 'rgba(0,0,0,0.1)', borderRadius: 8, height: 6, overflow: 'hidden', marginTop: 10 }}>
          <div style={{ background: colors.border, height: '100%', width: `${window.score * 100}%`, borderRadius: 8, transition: 'width 0.6s ease-out' }} />
        </div>
        {userId && <AddToFieldWorkButton window={window} userId={userId} index={index} fields={fields || []} />}
      </div>
    </div>
  );
};

const TimelineView = ({ windows }) => {
  if (!windows.length) return null;
  const now = new Date(), endTime = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), totalMs = endTime - now;
  const days = Array.from({ length: 7 }, (_, i) => new Date(now.getTime() + i * 86400000));
  return (
    <div style={{ marginBottom: 24, background: '#f8fcee', borderRadius: 12, padding: '14px 16px', border: '1px solid #d4e6c3' }}>
      <div style={{ position: 'relative', height: 80 }}>
        {days.map((d, i) => (
          <div key={i} style={{ position: 'absolute', left: `${(i / 7) * 100}%`, top: 0, bottom: 0, borderLeft: '1px dashed #c8e0b4' }}>
            <span style={{ position: 'absolute', top: -16, fontSize: 9, color: '#aaa', whiteSpace: 'nowrap', transform: 'translateX(-50%)' }}>
              {d.toLocaleDateString('hu-HU', { weekday: 'short', day: 'numeric' })}
            </span>
          </div>
        ))}
        {windows.map((win, index) => {
          const startMs = new Date(win.start) - now, endMs = new Date(win.end) - now;
          if (endMs < 0 || startMs > totalMs) return null;
          const left  = `${Math.max(0, (startMs / totalMs) * 100)}%`;
          const width = `${Math.max(0.5, ((Math.min(endMs, totalMs) - Math.max(startMs, 0)) / totalMs) * 100)}%`;
          const colors = getScoreColor(win.score);
          return (
            <div key={index} style={{ position: 'absolute', left, top: 20 + (index % 3) * 25, width: Math.max(parseFloat(width), 8), height: 20, background: `linear-gradient(135deg, ${colors.bg}, ${colors.border}20)`, border: `2px solid ${colors.border}`, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: colors.text, cursor: 'default', transition: 'all 0.2s ease', zIndex: 10 }}
              title={`#${index + 1} (${(win.score * 100).toFixed(0)}%)`}>
              #{index + 1}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const SprayingWindowsPanel = ({ locationId, userId }) => {
  const { t } = useLang();
  const [open, setOpen]       = useState(true);
  const [windows, setWindows] = useState([]);
  const [fields, setFields]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  useEffect(() => {
    if (!userId) return;
    api.get('/api/v1/user_fields', { params: { user_id: userId, ...(locationId ? { location_id: locationId } : {}) } })
      .then(r => { const d = r.data; setFields(Array.isArray(d) ? d : (d?.fields ?? d?.items ?? [])); })
      .catch(() => setFields([]));
  }, [userId, locationId]);

  useEffect(() => {
    if (!locationId) return;
    setLoading(true); setError(null);
    api.get(`/api/v1/weather/${locationId}/spraying-windows`)
      .then(r => { setWindows(r.data || []); setLoading(false); })
      .catch(() => { setError(t('spray_err')); setLoading(false); });
  }, [locationId]); // eslint-disable-line

  const totalWindows    = windows.length;
  const excellentWindows = windows.filter(w => w.score >= 0.8).length;
  const avgScore        = windows.length > 0 ? (windows.reduce((s, w) => s + w.score, 0) / windows.length) : 0;

  return (
    <div style={styles.wrap}>
      <div style={styles.header} onClick={() => setOpen(v => !v)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>🌾</span>
          <span style={styles.titleStyle}>{t('spray_title')}</span>
          {totalWindows > 0 && <span style={styles.metaBadge}>{t('spray_excellent', excellentWindows, totalWindows, (avgScore * 100).toFixed(0))}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {loading && <div style={styles.spinner}>⟳</div>}
          <span style={{ color: '#bbb', fontSize: 13 }}>{open ? '▲' : '▼'}</span>
        </div>
      </div>

      {open && (
        <div style={styles.body}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>🔄</div>
              <div>{t('spray_loading')}</div>
            </div>
          ) : error ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#d63031' }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>⚠️</div>
              <div>{error}</div>
            </div>
          ) : windows.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>🌧️</div>
              <div>{t('spray_empty')}</div>
              <div style={{ fontSize: 12, marginTop: 8, opacity: 0.7 }}>{t('spray_empty_hint')}</div>
            </div>
          ) : (
            <>
              <TimelineView windows={windows} />
              <div style={{ marginTop: 24 }}>
                <h4 style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-accent-chernozem)', marginBottom: 16, fontSize: 14 }}>
                  {t('spray_recommended', windows.length)}
                </h4>
                <div style={{ display: 'grid', gap: 0 }}>
                  {windows.sort((a, b) => b.score - a.score).map((win, index) => (
                    <WindowCard key={index} window={win} index={windows.indexOf(win)} userId={userId} fields={fields} />
                  ))}
                </div>
              </div>

              <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #e9ecef' }}>
                <div style={{ fontSize: 11, color: '#6c757d', marginBottom: 8, fontWeight: 600 }}>{t('spray_quality')}</div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {[
                    { range: '80-100%', labelKey: 'spray_excellent_lbl', color: '#317f43' },
                    { range: '60-79%', labelKey: 'spray_good_lbl',      color: '#d8975a' },
                    { range: '40-59%', labelKey: 'spray_fair_lbl',      color: '#fdcb6e' },
                    { range: '0-39%',  labelKey: 'spray_poor_lbl',      color: '#d63031' },
                  ].map(({ range, labelKey, color }) => (
                    <div key={range} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 12, height: 12, background: color, borderRadius: 3 }} />
                      <span style={{ fontSize: 11, color: '#6c757d' }}><strong>{t(labelKey)}</strong> ({range})</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default SprayingWindowsPanel;

const styles = {
  wrap:      { background: '#fff', borderRadius: 14, border: '1px solid var(--color-accent-soil)', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', overflow: 'hidden', marginBottom: 20 },
  header:    { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 20px', cursor: 'pointer', background: 'var(--color-bg-champagne)', borderBottom: '1px solid var(--color-accent-soil)', userSelect: 'none' },
  titleStyle:{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, color: 'var(--color-accent-chernozem)' },
  metaBadge: { fontSize: 11, color: '#aaa', background: '#f0ebe3', borderRadius: 10, padding: '2px 8px' },
  body:      { padding: '16px 20px 20px', background: 'var(--color-bg-champagne)' },
  spinner:   { fontSize: 14, color: '#317f43' },
};