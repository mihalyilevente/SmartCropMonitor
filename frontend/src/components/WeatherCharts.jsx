/**
 * WeatherCharts.jsx
 * Consumes GET /api/v1/weather/location/{id}/weather-charts
 * Shape: Array<{ timestamp, weather_data:{temp,humidity,precipitation,
 *   soil_moisture,soil_temperature,wind_speed},
 *   metrics_data:{gdd,rain_cum_30d,et0,water_deficit,spi_1m,rs_mj_m2_day} }>
 *
 * Collapsible panel, tab-based chart switching, pure SVG — no charting deps.
 * Features:
 *   - Red dashed "NOW" vertical line on the chart
 *   - Past region subtly shaded
 *   - Range slider to scrub through time + tooltip with exact value
 *   - Click on chart to set cursor position
 */
import { useState, useMemo, useCallback } from 'react';

const C = {
  green:    '#317f43',
  soil:     '#8b6340',
  mulberry: '#470736',
  sky:      '#1a6fa3',
  amber:    '#b87300',
  teal:     '#1a7a6e',
  rose:     '#b53060',
  slate:    '#4a5568',
};

// ── SVG line chart ─────────────────────────────────────────────────────────────
const LineChart = ({ points = [], color = C.green, label = '', unit = '', cursorIdx, onCursorChange }) => {
  const valid = points.filter(p => p.y != null && !isNaN(p.y));

  if (!valid.length) return (
    <div style={{ height: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bbb', fontSize: 12 }}>
      No data available
    </div>
  );

  const W = 600, H = 150, padX = 44, padY = 14;
  const innerW = W - padX * 2;
  const innerH = H - padY * 2 - 18;

  const ys = valid.map(p => p.y);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const rangeY = maxY - minY || 1;
  const now = Date.now();

  const sx = (i) => padX + (i / (valid.length - 1 || 1)) * innerW;
  const sy = (v) => padY + (1 - (v - minY) / rangeY) * innerH;

  const linePts = valid.map((p, i) => `${sx(i)},${sy(p.y)}`).join(' ');
  const area    = `M${sx(0)},${padY + innerH} ` +
                  valid.map((p, i) => `L${sx(i)},${sy(p.y)}`).join(' ') +
                  ` L${sx(valid.length - 1)},${padY + innerH} Z`;

  const step   = Math.max(1, Math.floor(valid.length / 6));
  const xTicks = valid.map((p, i) => ({ i, p })).filter(({ i }) => i % step === 0 || i === valid.length - 1);
  const yVals  = [minY, minY + rangeY * 0.5, maxY];
  const gId    = `grad${label.replace(/\W/g, '')}`;

  // Index closest to NOW
  let nowIdx = 0, bestDiff = Infinity;
  valid.forEach((p, i) => {
    const diff = Math.abs(new Date(p.x).getTime() - now);
    if (diff < bestDiff) { bestDiff = diff; nowIdx = i; }
  });
  const nowX = sx(nowIdx);

  // Cursor
  const curIdx   = cursorIdx != null ? Math.min(Math.max(0, cursorIdx), valid.length - 1) : null;
  const curX     = curIdx != null ? sx(curIdx) : null;
  const curPoint = curIdx != null ? valid[curIdx] : null;

  const handleClick = (e) => {
    if (!onCursorChange) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width * W;
    const frac = Math.max(0, Math.min(1, (relX - padX) / innerW));
    onCursorChange(Math.round(frac * (valid.length - 1)));
  };

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: 'auto', display: 'block', cursor: 'crosshair' }}
      onClick={handleClick}
    >
      <defs>
        <linearGradient id={gId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Grid */}
      {yVals.map((v, i) => (
        <g key={i}>
          <line x1={padX} y1={sy(v)} x2={W - padX} y2={sy(v)}
            stroke="#ece6dd" strokeWidth="1" strokeDasharray="4 3" />
          <text x={padX - 5} y={sy(v) + 3.5} textAnchor="end"
            fontSize="9" fill="#bbb" fontFamily="inherit">{v.toFixed(1)}</text>
        </g>
      ))}

      {/* Past shading (left of NOW) */}
      <rect
        x={padX} y={padY}
        width={Math.max(0, nowX - padX)}
        height={innerH}
        fill="rgba(0,0,0,0.03)"
      />

      {/* Area + line */}
      <path d={area} fill={`url(#${gId})`} />
      <polyline points={linePts} fill="none" stroke={color} strokeWidth="2"
        strokeLinejoin="round" strokeLinecap="round" />

      {/* NOW line */}
      <line x1={nowX} y1={padY} x2={nowX} y2={padY + innerH}
        stroke="#e74c3c" strokeWidth="1.5" strokeDasharray="5 3" opacity="0.85" />
      <rect x={nowX - 15} y={padY - 1} width={30} height={13} rx={4} fill="#e74c3c" />
      <text x={nowX} y={padY + 9} textAnchor="middle"
        fontSize="8" fill="#fff" fontWeight="800" fontFamily="inherit">NOW</text>

      {/* Cursor */}
      {curX != null && curPoint && (() => {
        const tipW = 82, tipH = 30;
        const tipX = Math.min(curX + 8, W - padX - tipW);
        const tipY = Math.max(sy(curPoint.y) - tipH - 6, padY + 2);
        const dateStr = new Date(curPoint.x).toLocaleString('en-GB', {
          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
        });
        return (
          <g>
            <line x1={curX} y1={padY} x2={curX} y2={padY + innerH}
              stroke={color} strokeWidth="1.5" strokeDasharray="3 2" opacity="0.55" />
            <circle cx={curX} cy={sy(curPoint.y)} r={5} fill={color} stroke="#fff" strokeWidth="2" />
            <rect x={tipX} y={tipY} width={tipW} height={tipH} rx={6} fill={color} opacity="0.93" />
            <text x={tipX + tipW / 2} y={tipY + 11} textAnchor="middle"
              fontSize="8.5" fill="rgba(255,255,255,0.85)" fontFamily="inherit">{dateStr}</text>
            <text x={tipX + tipW / 2} y={tipY + 24} textAnchor="middle"
              fontSize="11" fill="#fff" fontWeight="800" fontFamily="inherit">
              {Number(curPoint.y).toFixed(2)} {unit}
            </text>
          </g>
        );
      })()}

      {/* Last-point dot */}
      <circle cx={sx(valid.length - 1)} cy={sy(valid[valid.length - 1].y)}
        r={4} fill={color} stroke="#fff" strokeWidth="2" />

      {/* X-axis ticks */}
      {xTicks.map(({ i, p }) => (
        <text key={i} x={sx(i)} y={H - 2} textAnchor="middle"
          fontSize="9" fill="#bbb" fontFamily="inherit">
          {new Date(p.x).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })}
        </text>
      ))}
    </svg>
  );
};

// ── Range slider ───────────────────────────────────────────────────────────────
const RangeSlider = ({ value, max, color, onChange, labelLeft, labelRight }) => {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
      <span style={{ fontSize: 10, color: '#bbb', whiteSpace: 'nowrap', minWidth: 72 }}>{labelLeft}</span>
      <div style={{ flex: 1, position: 'relative', height: 20, display: 'flex', alignItems: 'center' }}>
        <div style={{
          position: 'absolute', left: 0, right: 0, height: 4, borderRadius: 4,
          background: `linear-gradient(to right, ${color} ${pct}%, #e4ddd5 ${pct}%)`,
          pointerEvents: 'none',
        }} />
        <input
          type="range" min={0} max={max} value={value}
          onChange={e => onChange(Number(e.target.value))}
          style={{
            width: '100%', appearance: 'none', WebkitAppearance: 'none',
            background: 'transparent', cursor: 'pointer', height: 20,
            outline: 'none', position: 'relative',
          }}
        />
      </div>
      <span style={{ fontSize: 10, color: '#bbb', whiteSpace: 'nowrap', minWidth: 72, textAlign: 'right' }}>{labelRight}</span>
    </div>
  );
};

// ── Tab pill ───────────────────────────────────────────────────────────────────
const Tab = ({ label, active, color, onClick }) => (
  <button onClick={onClick} style={{
    padding: '3px 11px', borderRadius: 20,
    border: `1.5px solid ${active ? color : '#ddd5c8'}`,
    background: active ? color : 'transparent',
    color: active ? '#fff' : '#777',
    fontSize: 11, fontWeight: 700, cursor: 'pointer',
    letterSpacing: '0.02em', fontFamily: 'inherit',
    transition: 'all 0.12s',
  }}>{label}</button>
);

const WEATHER_TABS = [
  { key: 'temp',             label: 'Temp',          unit: '°C',    color: C.rose,    src: 'weather' },
  { key: 'humidity',         label: 'Humidity',      unit: '%',     color: C.sky,     src: 'weather' },
  { key: 'precipitation',    label: 'Precip.',       unit: 'mm',    color: C.teal,    src: 'weather' },
  { key: 'soil_moisture',    label: 'Soil moisture', unit: 'm³/m³', color: C.green,   src: 'weather' },
  { key: 'soil_temperature', label: 'Soil temp',     unit: '°C',    color: C.soil,    src: 'weather' },
  { key: 'wind_speed',       label: 'Wind',          unit: 'm/s',   color: C.slate,   src: 'weather' },
];
const METRIC_TABS = [
  { key: 'gdd',           label: 'GDD',           unit: '°C·d',  color: C.amber,    src: 'metrics' },
  { key: 'rain_cum_30d',  label: 'Rain 30d',      unit: 'mm',    color: C.sky,      src: 'metrics' },
  { key: 'et0',           label: 'ET₀',           unit: 'mm',    color: C.teal,     src: 'metrics' },
  { key: 'water_deficit', label: 'Water deficit', unit: 'mm',    color: C.mulberry, src: 'metrics' },
  { key: 'rs_mj_m2_day',  label: 'Solar rad.',    unit: 'MJ/m²', color: C.amber,    src: 'metrics' },
];
const ALL_TABS = [...WEATHER_TABS, ...METRIC_TABS];

// ── Main export ────────────────────────────────────────────────────────────────
const WeatherCharts = ({ data = [] }) => {
  const [open, setOpen]           = useState(true);
  const [active, setActive]       = useState('temp');
  const [cursorIdx, setCursorIdx] = useState(null);

  const cfg = ALL_TABS.find(t => t.key === active) || ALL_TABS[0];

  const points = useMemo(() => data.map(row => ({
    x: row.timestamp,
    y: cfg.src === 'weather' ? row.weather_data?.[cfg.key] : row.metrics_data?.[cfg.key],
  })), [data, active]);

  const validPoints = useMemo(
    () => points.filter(p => p.y != null && !isNaN(p.y)),
    [points]
  );

  const vals = validPoints.map(p => p.y);
  const stats = vals.length ? {
    min:  Math.min(...vals).toFixed(2),
    max:  Math.max(...vals).toFixed(2),
    avg:  (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2),
    last: vals[vals.length - 1].toFixed(2),
  } : null;

  const sliderMax   = Math.max(0, validPoints.length - 1);
  const fmtLabel    = (p) => p
    ? new Date(p.x).toLocaleString('en-GB', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';

  const cursorPoint = cursorIdx != null ? validPoints[Math.min(cursorIdx, sliderMax)] : null;

  const handleTabChange = (key) => { setActive(key); setCursorIdx(null); };

  return (
    <div style={wrap}>
      <div style={header} onClick={() => setOpen(v => !v)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>📈</span>
          <span style={titleStyle}>Weather Charts</span>
          {data.length > 0 && <span style={metaBadge}>{data.length} records</span>}
        </div>
        <span style={{ color: '#bbb', fontSize: 13 }}>{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div style={body}>
          {/* Tabs */}
          <div style={tabSection}>
            <span style={groupLabel}>Weather</span>
            <div style={tabRow}>
              {WEATHER_TABS.map(t => (
                <Tab key={t.key} label={t.label} active={active === t.key} color={t.color} onClick={() => handleTabChange(t.key)} />
              ))}
            </div>
          </div>
          <div style={{ ...tabSection, marginTop: 8 }}>
            <span style={groupLabel}>Agronomic metrics</span>
            <div style={tabRow}>
              {METRIC_TABS.map(t => (
                <Tab key={t.key} label={t.label} active={active === t.key} color={t.color} onClick={() => handleTabChange(t.key)} />
              ))}
            </div>
          </div>

          {/* Chart */}
          <div style={chartBox}>
            <div style={chartTop}>
              <span style={{ fontWeight: 700, fontSize: 14, color: cfg.color }}>{cfg.label}</span>
              <span style={{ fontSize: 11, color: '#bbb', marginLeft: 4 }}>{cfg.unit}</span>

              {/* Legend */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 12 }}>
                <span style={{ fontSize: 10, color: '#aaa', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <svg width="18" height="8" style={{ flexShrink: 0 }}>
                    <line x1="0" y1="4" x2="18" y2="4" stroke="#e74c3c" strokeWidth="1.5" strokeDasharray="5 3"/>
                  </svg>
                  Now
                </span>
                <span style={{ fontSize: 10, color: '#aaa', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <svg width="14" height="8" style={{ flexShrink: 0 }}>
                    <rect x="0" y="0" width="14" height="8" fill="rgba(0,0,0,0.07)" rx="2"/>
                  </svg>
                  Past
                </span>
              </div>

              {stats && (
                <div style={statsRow}>
                  {[['Min', stats.min], ['Max', stats.max], ['Avg', stats.avg], ['Latest', stats.last]].map(([k, v]) => (
                    <div key={k} style={statCol}>
                      <span style={statLbl}>{k}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: cfg.color }}>
                        {v} <span style={{ fontSize: 10, fontWeight: 400, color: '#aaa' }}>{cfg.unit}</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <LineChart
              points={points}
              color={cfg.color}
              unit={cfg.unit}
              label={cfg.key}
              cursorIdx={cursorIdx}
              onCursorChange={setCursorIdx}
            />

            {/* Slider + readout */}
            {validPoints.length > 1 && (
              <>
                <RangeSlider
                  value={cursorIdx ?? sliderMax}
                  max={sliderMax}
                  color={cfg.color}
                  onChange={setCursorIdx}
                  labelLeft={fmtLabel(validPoints[0])}
                  labelRight={fmtLabel(validPoints[sliderMax])}
                />
                <div style={{
                  marginTop: 6, minHeight: 24,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>
                  {cursorPoint ? (
                    <>
                      <span style={{ fontSize: 11, color: '#aaa' }}>{fmtLabel(cursorPoint)}</span>
                      <span style={{
                        fontSize: 14, fontWeight: 800, color: cfg.color,
                        background: `${cfg.color}18`, borderRadius: 6, padding: '1px 10px',
                      }}>
                        {Number(cursorPoint.y).toFixed(2)}
                        <span style={{ fontSize: 10, fontWeight: 400, color: '#aaa', marginLeft: 3 }}>{cfg.unit}</span>
                      </span>
                    </>
                  ) : (
                    <span style={{ fontSize: 11, color: '#ccc' }}>← drag slider or click chart to inspect a point</span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default WeatherCharts;

// ── Styles ─────────────────────────────────────────────────────────────────────
const wrap       = { background: '#fff', borderRadius: 14, border: '1px solid var(--color-accent-soil)', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', overflow: 'hidden', marginBottom: 20 };
const header     = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 20px', cursor: 'pointer', background: 'var(--color-bg-champagne)', borderBottom: '1px solid var(--color-accent-soil)', userSelect: 'none' };
const titleStyle = { fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, color: 'var(--color-accent-chernozem)' };
const metaBadge  = { fontSize: 11, color: '#aaa', background: '#f0ebe3', borderRadius: 10, padding: '2px 8px' };
const body       = { padding: '16px 20px 20px' };
const tabSection = {};
const groupLabel = { display: 'block', fontSize: 10, fontWeight: 700, color: '#ccc', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 };
const tabRow     = { display: 'flex', gap: 6, flexWrap: 'wrap' };
const chartBox   = { marginTop: 14, background: 'var(--color-bg-champagne)', borderRadius: 10, padding: '13px 15px', border: '1px solid #ece6dc' };
const chartTop   = { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' };
const statsRow   = { display: 'flex', gap: 16, marginLeft: 'auto', flexWrap: 'wrap' };
const statCol    = { display: 'flex', flexDirection: 'column', alignItems: 'flex-end' };
const statLbl    = { fontSize: 9, color: '#ccc', textTransform: 'uppercase', letterSpacing: '0.05em' };