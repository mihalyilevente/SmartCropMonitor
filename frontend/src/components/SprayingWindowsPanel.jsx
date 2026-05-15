import { useState, useEffect } from 'react';
import api from '../api/client';

// ── Score color mapper based on quality ──────────────────────────────────────
const getScoreColor = (score) => {
  if (score >= 0.8) return { bg: '#e8f5e8', border: '#317f43', text: '#1a5c1a' }; // Excellent
  if (score >= 0.6) return { bg: '#fff8e1', border: '#d8975a', text: '#8b5a00' }; // Good
  if (score >= 0.4) return { bg: '#ffeaa7', border: '#fdcb6e', text: '#b8860b' }; // Fair
  return { bg: '#ffe0e0', border: '#d63031', text: '#8b0000' }; // Poor
};

// ── Individual window card ───────────────────────────────────────────────────
const WindowCard = ({ window, index }) => {
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
        cursor: 'pointer',
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
          <span style={{
            fontSize: 24,
            filter: 'grayscale(0.2)',
          }}>🌾</span>
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
      </div>
    </div>
  );
};

// ── Timeline visualization ───────────────────────────────────────────────────
const TimelineView = ({ windows }) => {
  if (!windows.length) return null;

  // Calculate timeline bounds
  const now = new Date();
  const endTime = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days ahead

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
        {/* Timeline grid (days) */}
        {[...Array(8)].map((_, i) => {
          const dayX = (i / 7) * timelineWidth;
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: dayX,
                top: 0,
                bottom: 0,
                width: 1,
                background: i === 0 ? 'var(--color-green-primary)' : '#e1e8ed',
                opacity: i === 0 ? 1 : 0.5,
              }}
            />
          );
        })}

        {/* Day labels */}
        {[...Array(7)].map((_, i) => {
          const day = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
          const dayX = (i / 7) * timelineWidth + (timelineWidth / 7) / 2;

          return (
            <div
              key={i}
              style={{
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
              }}
            >
              {day.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })}
            </div>
          );
        })}

        {/* Spraying windows */}
        {windows.map((window, index) => {
          const start = new Date(window.start);
          const end = new Date(window.end);

          // Calculate position and width
          const startRatio = Math.max(0, (start - now) / (endTime - now));
          const endRatio = Math.min(1, (end - now) / (endTime - now));

          if (startRatio >= 1 || endRatio <= 0) return null; // Outside timeline

          const left = startRatio * timelineWidth;
          const width = (endRatio - startRatio) * timelineWidth;
          const colors = getScoreColor(window.score);

          return (
            <div
              key={index}
              style={{
                position: 'absolute',
                left: left,
                top: 20 + (index % 3) * 25, // Stack overlapping windows
                width: Math.max(width, 8), // Minimum width for visibility
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
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                zIndex: 10,
              }}
              title={`Window #${index + 1} (${(window.score * 100).toFixed(0)}%) - ${start.toLocaleString()} to ${end.toLocaleString()}`}
            >
              #{index + 1}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── Main panel component ─────────────────────────────────────────────────────
const SprayingWindowsPanel = ({ locationId, userId }) => {
  const [open, setOpen] = useState(true);
  const [windows, setWindows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Fetch spraying windows when location changes
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

  // Stats calculation
  const totalWindows = windows.length;
  const excellentWindows = windows.filter(w => w.score >= 0.8).length;
  const avgScore = windows.length > 0 ? (windows.reduce((sum, w) => sum + w.score, 0) / windows.length) : 0;

  return (
    <div style={styles.wrap}>
      {/* Header */}
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
                    .sort((a, b) => b.score - a.score) // Sort by best score first
                    .map((window, index) => (
                      <WindowCard
                        key={index}
                        window={window}
                        index={windows.indexOf(window)}
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
                    { range: '60-79%', label: 'Good', color: '#d8975a' },
                    { range: '40-59%', label: 'Fair', color: '#fdcb6e' },
                    { range: '0-39%', label: 'Poor', color: '#d63031' },
                  ].map(({ range, label, color }) => (
                    <div key={range} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{
                        width: 12,
                        height: 12,
                        background: color,
                        borderRadius: 3,
                      }} />
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