import { useState, useEffect } from 'react';
import api from '../api/client';

// ── Score color mapper based on quality ──────────────────────────────────────
const getScoreColor = (score) => {
  if (score >= 0.8) return { bg: '#e8f5e8', border: '#317f43', text: '#1a5c1a' }; // Excellent
  if (score >= 0.6) return { bg: '#fff8e1', border: '#d8975a', text: '#8b5a00' }; // Good
  if (score >= 0.4) return { bg: '#ffeaa7', border: '#fdcb6e', text: '#b8860b' }; // Fair
  return { bg: '#ffe0e0', border: '#d63031', text: '#8b0000' };                    // Poor
};

// ── Add-to-fieldwork button ──────────────────────────────────────────────────
const AddToFieldWorkButton = ({ window, userId, index, fields }) => {
  const [state, setState] = useState('idle'); // idle | picking | loading | done | error
  const [fieldId, setFieldId] = useState('');

  useEffect(() => {
    if (fields.length > 0 && !fieldId) setFieldId(String(fields[0].id));
  }, [fields]); // eslint-disable-line react-hooks/exhaustive-deps

  const openPicker = (e) => { e.stopPropagation(); if (state !== 'idle') return; setState('picking'); };
  const cancel = (e) => { e.stopPropagation(); setState('idle'); };

  const confirm = async (e) => {
    e.stopPropagation();
    if (!fieldId) return;
    setState('loading');
    try {
      await api.post('/api/v1/fieldwork/create', {
        user_id: userId,
        field_id: Number(fieldId),
        work_type: 'SPRAYING',
        work_status: 'PLANNED',
        work_date: window.start,
        extra_metadata: {
          note: `Spraying window #${index + 1} — score ${(window.score * 100).toFixed(0)}%, ends ${new Date(window.end).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}`,
          spraying_window_end: window.end,
          spraying_score: window.score,
        },
      });
      setState('done');
      setTimeout(() => setState('idle'), 3000);
    } catch {
      setState('error');
      setTimeout(() => setState('idle'), 2500);
    }
  };

  if (state === 'picking') {
    return (
      <div onClick={e => e.stopPropagation()} style={{
        marginTop: 10, background: '#fff', border: '1px solid #c8e6c9',
        borderRadius: 8, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          💧 Log Spraying — select field
        </div>
        {fields.length > 0 ? (
          <select value={fieldId} onChange={e => setFieldId(e.target.value)}
            style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #ddd', fontSize: 12, fontFamily: 'inherit' }}>
            {fields.map(f => <option key={f.id} value={f.id}>{f.label || `Field #${f.id}`}</option>)}
          </select>
        ) : (
          <div style={{ fontSize: 11, color: '#aaa' }}>No fields available</div>
        )}
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={confirm} disabled={!fieldId || fields.length === 0} style={{
            flex: 1, padding: '5px 0', background: '#054e05', color: '#fff',
            border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700,
            cursor: fieldId ? 'pointer' : 'not-allowed', fontFamily: 'inherit', opacity: fieldId ? 1 : 0.5,
          }}>✓ Add to Field Work</button>
          <button onClick={cancel} style={{
            padding: '5px 10px', background: 'none', color: '#999',
            border: '1px solid #ddd', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
          }}>Cancel</button>
        </div>
      </div>
    );
  }

  const cfg = {
    idle:    { label: '🚜 Add to Field Work',  bg: '#054e05', cursor: 'pointer' },
    loading: { label: 'Saving…',               bg: '#3a7d3a', cursor: 'wait'    },
    done:    { label: '✓ Added to Field Work', bg: '#27ae60', cursor: 'default' },
    error:   { label: '✕ Failed — retry',      bg: '#d63031', cursor: 'pointer' },
  }[state];

  return (
    <button onClick={state === 'idle' || state === 'error' ? openPicker : undefined} style={{
      marginTop: 10, width: '100%', padding: '7px 0',
      background: cfg.bg, color: '#fff', border: 'none', borderRadius: 8,
      fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
      cursor: cfg.cursor, letterSpacing: '0.03em', transition: 'background 0.2s',
    }}>
      {cfg.label}
    </button>
  );
};

// ── Individual window card ───────────────────────────────────────────────────
const WindowCard = ({ window, index, userId, fields }) => {
  const start = new Date(window.start);
  const end = new Date(window.end);
  const duration = (end - start) / (1000 * 60 * 60); // hours
  const colors = getScoreColor(window.score);

  const formatDateTime = (date) => {
    return date.toLocaleDateString('en-GB', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div
      style={{
        background: colors.bg,
        border: `2px solid ${colors.border}`,
        borderRadius: 16,
        padding: '14px 18px',
        marginBottom: 12,
        position: 'relative',
        overflow: 'hidden',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        cursor: 'default',
        transform: 'translateY(0)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = '0 8px 25px rgba(0,0,0,0.15)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)';
      }}
    >
      {/* Score badge */}
      <div style={{
        position: 'absolute',
        top: -8,
        right: 12,
        background: colors.border,
        color: '#fff',
        fontSize: 11,
        fontWeight: 700,
        padding: '4px 10px',
        borderRadius: 12,
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
      }}>
        {(window.score * 100).toFixed(0)}%
      </div>

      {/* Window info */}
      <div style={{ marginTop: 8 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 6
        }}>
          <span style={{ fontSize: 24, filter: 'grayscale(0.2)' }}>🌾</span>
          <h4 style={{
            margin: 0,
            color: colors.text,
            fontFamily: 'var(--font-heading)',
            fontSize: 15,
            fontWeight: 700,
          }}>
            Window #{index + 1}
          </h4>
        </div>

        <div style={{
          fontSize: 13,
          color: colors.text,
          lineHeight: 1.4,
          marginBottom: 8
        }}>
          <div style={{ marginBottom: 4 }}>
            <strong>🗓️ Start:</strong> {formatDateTime(start)}
          </div>
          <div style={{ marginBottom: 4 }}>
            <strong>⏰ End:</strong> {formatDateTime(end)}
          </div>
          <div>
            <strong>⌛ Duration:</strong> {duration.toFixed(1)}h
          </div>
        </div>

        {/* Progress bar visualization */}
        <div style={{
          background: 'rgba(0,0,0,0.1)',
          borderRadius: 8,
          height: 6,
          overflow: 'hidden',
          marginTop: 10,
        }}>
          <div style={{
            background: colors.border,
            height: '100%',
            width: `${window.score * 100}%`,
            borderRadius: 8,
            transition: 'width 0.6s ease-out',
          }} />
        </div>

        {userId && (
          <AddToFieldWorkButton window={window} userId={userId} index={index} fields={fields || []} />
        )}
      </div>
    </div>
  );
};

// ── Timeline visualization ───────────────────────────────────────────────────
const TimelineView = ({ windows }) => {
  if (!windows.length) return null;

  const now = new Date();
  const endTime = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const timelineWidth = 800;
  const timelineHeight = 120;

  return (
    <div style={{ marginTop: 20 }}>
      <h4 style={{
        fontFamily: 'var(--font-heading)',
        color: 'var(--color-accent-chernozem)',
        marginBottom: 12,
        fontSize: 14
      }}>
        7-Day Timeline
      </h4>

      <div style={{
        position: 'relative',
        width: timelineWidth,
        height: timelineHeight,
        background: '#f8f9fa',
        borderRadius: 12,
        border: '1px solid var(--color-accent-soil)',
        overflow: 'hidden',
        margin: '0 auto',
      }}>
        {[...Array(8)].map((_, i) => {
          const dayX = (i / 7) * timelineWidth;
          return (
            <div key={i} style={{
              position: 'absolute',
              left: dayX,
              top: 0,
              bottom: 0,
              width: 1,
              background: i === 0 ? 'var(--color-green-primary)' : '#e1e8ed',
              opacity: i === 0 ? 1 : 0.5,
            }} />
          );
        })}

        {[...Array(7)].map((_, i) => {
          const day = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
          const dayX = (i / 7) * timelineWidth + (timelineWidth / 7) / 2;
          return (
            <div key={i} style={{
              position: 'absolute',
              left: dayX - 30,
              bottom: 8,
              width: 60,
              textAlign: 'center',
              fontSize: 10,
              fontWeight: 600,
              color: '#6c757d',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}>
              {day.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })}
            </div>
          );
        })}

        {windows.map((window, index) => {
          const start = new Date(window.start);
          const end = new Date(window.end);

          const startRatio = Math.max(0, (start - now) / (endTime - now));
          const endRatio = Math.min(1, (end - now) / (endTime - now));
          if (startRatio >= 1 || endRatio <= 0) return null;

          const left = startRatio * timelineWidth;
          const width = (endRatio - startRatio) * timelineWidth;
          const colors = getScoreColor(window.score);

          return (
            <div key={index} style={{
              position: 'absolute',
              left: left,
              top: 20 + (index % 3) * 25,
              width: Math.max(width, 8),
              height: 20,
              background: `linear-gradient(135deg, ${colors.bg}, ${colors.border}20)`,
              border: `2px solid ${colors.border}`,
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 9,
              fontWeight: 700,
              color: colors.text,
              cursor: 'default',
              transition: 'all 0.2s ease',
              zIndex: 10,
            }}
              title={`Window #${index + 1} (${(window.score * 100).toFixed(0)}%) — ${start.toLocaleString()} to ${end.toLocaleString()}`}
            >
              #{index + 1}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const SprayingWindowsPanel = ({ locationId, userId }) => {
  const [open, setOpen] = useState(true);
  const [windows, setWindows] = useState([]);
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!userId) return;
    api.get('/api/v1/user_fields', { params: { user_id: userId, ...(locationId ? { location_id: locationId } : {}) } })
      .then(r => {
        const data = r.data;
        setFields(Array.isArray(data) ? data : (data?.fields ?? data?.items ?? []));
      })
      .catch(() => setFields([]));
  }, [userId, locationId]);

  useEffect(() => {
    if (!locationId) return;

    setLoading(true);
    setError(null);

    api.get(`/api/v1/weather/${locationId}/spraying-windows`)
      .then(response => {
        setWindows(response.data || []);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch spraying windows:', err);
        setError('Failed to load spraying windows');
        setLoading(false);
      });
  }, [locationId]);

  const totalWindows = windows.length;
  const excellentWindows = windows.filter(w => w.score >= 0.8).length;
  const avgScore = windows.length > 0
    ? (windows.reduce((sum, w) => sum + w.score, 0) / windows.length)
    : 0;

  return (
    <div style={styles.wrap}>
      <div style={styles.header} onClick={() => setOpen(v => !v)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>🌾</span>
          <span style={styles.titleStyle}>Spraying Windows</span>
          {totalWindows > 0 && (
            <span style={styles.metaBadge}>
              {excellentWindows}/{totalWindows} excellent • avg {(avgScore * 100).toFixed(0)}%
            </span>
          )}
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
              <div>Analyzing weather conditions...</div>
            </div>
          ) : error ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#d63031' }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>⚠️</div>
              <div>{error}</div>
            </div>
          ) : windows.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>🌧️</div>
              <div>No suitable spraying windows found in the next 7 days</div>
              <div style={{ fontSize: 12, marginTop: 8, opacity: 0.7 }}>
                Weather conditions may not meet spraying criteria
              </div>
            </div>
          ) : (
            <>
              <TimelineView windows={windows} />

              <div style={{ marginTop: 24 }}>
                <h4 style={{
                  fontFamily: 'var(--font-heading)',
                  color: 'var(--color-accent-chernozem)',
                  marginBottom: 16,
                  fontSize: 14
                }}>
                  Recommended Windows ({windows.length})
                </h4>

                <div style={{ display: 'grid', gap: 0 }}>
                  {windows
                    .sort((a, b) => b.score - a.score)
                    .map((window, index) => (
                      <WindowCard
                        key={index}
                        window={window}
                        index={windows.indexOf(window)}
                        userId={userId}
                        fields={fields}
                      />
                    ))}
                </div>
              </div>

              {/* Legend */}
              <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #e9ecef' }}>
                <div style={{ fontSize: 11, color: '#6c757d', marginBottom: 8, fontWeight: 600 }}>
                  QUALITY SCORING
                </div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {[
                    { range: '80-100%', label: 'Excellent', color: '#317f43' },
                    { range: '60-79%', label: 'Good',      color: '#d8975a' },
                    { range: '40-59%', label: 'Fair',      color: '#fdcb6e' },
                    { range: '0-39%',  label: 'Poor',      color: '#d63031' },
                  ].map(({ range, label, color }) => (
                    <div key={range} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 12, height: 12, background: color, borderRadius: 3 }} />
                      <span style={{ fontSize: 11, color: '#6c757d' }}>
                        <strong>{label}</strong> ({range})
                      </span>
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
  wrap: {
    background: '#fff',
    borderRadius: 14,
    border: '1px solid var(--color-accent-soil)',
    boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
    overflow: 'hidden',
    marginBottom: 20
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '13px 20px',
    cursor: 'pointer',
    background: 'var(--color-bg-champagne)',
    borderBottom: '1px solid var(--color-accent-soil)',
    userSelect: 'none'
  },
  titleStyle: {
    fontFamily: 'var(--font-heading)',
    fontWeight: 700,
    fontSize: 15,
    color: 'var(--color-accent-chernozem)'
  },
  metaBadge: {
    fontSize: 11,
    color: '#aaa',
    background: '#f0ebe3',
    borderRadius: 10,
    padding: '2px 8px'
  },
  body: {
    padding: '16px 20px 20px',
    background: 'var(--color-bg-champagne)'
  },
  spinner: {
    fontSize: 14,
    color: '#317f43',
    animation: 'spin 1s linear infinite',
  }
};

const spinnerCSS = `
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
`;

if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = spinnerCSS;
  document.head.appendChild(style);
}