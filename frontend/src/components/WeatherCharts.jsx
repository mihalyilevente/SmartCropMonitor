/**
 * WeatherCharts.jsx
 * Consumes GET /api/v1/weather/location/{id}/weather-charts
 * Shape: Array<{ timestamp, weather_data:{temp,humidity,precipitation,
 *   soil_moisture,soil_temperature,wind_speed},
 *   metrics_data:{gdd,rain_cum_30d,et0,water_deficit,spi_1m,rs_mj_m2_day} }>
 *
 * Collapsible panel, tab-based chart switching, pure SVG — no charting deps.
 */
import { useState, useMemo } from 'react';

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
const LineChart = ({ points = [], color = C.green, label = '' }) => {
  const valid = points.filter(p => p.y != null && !isNaN(p.y));
  if (!valid.length) return (
    <div style={{ height: 130, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bbb', fontSize: 12 }}>
      No data available
    </div>
  );

  const W = 600, H = 130, padX = 38, padY = 10;
  const ys = valid.map(p => p.y);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const rangeY = maxY - minY || 1;

  const sx = (i) => padX + (i / (valid.length - 1 || 1)) * (W - padX * 2);
  const sy = (v) => padY + (1 - (v - minY) / rangeY) * (H - padY * 2 - 14);

  const linePts = valid.map((p, i) => `${sx(i)},${sy(p.y)}`).join(' ');
  const area = `M${sx(0)},${H - 14} ` +
    valid.map((p, i) => `L${sx(i)},${sy(p.y)}`).join(' ') +
    ` L${sx(valid.length - 1)},${H - 14} Z`;

  const step = Math.max(1, Math.floor(valid.length / 6));
  const xTicks = valid
    .map((p, i) => ({ i, p }))
    .filter(({ i }) => i % step === 0 || i === valid.length - 1);

  const yVals = [minY, minY + rangeY * 0.5, maxY];
  const gId = `grad${label.replace(/\W/g, '')}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      <defs>
        <linearGradient id={gId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.15" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {yVals.map((v, i) => (
        <g key={i}>
          <line x1={padX} y1={sy(v)} x2={W - padX} y2={sy(v)}
            stroke="#ece6dd" strokeWidth="1" strokeDasharray="4 3" />
          <text x={padX - 4} y={sy(v) + 3.5} textAnchor="end"
            fontSize="9" fill="#bbb" fontFamily="inherit">{v.toFixed(1)}</text>
        </g>
      ))}
      <path d={area} fill={`url(#${gId})`} />
      <polyline points={linePts} fill="none" stroke={color} strokeWidth="2"
        strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={sx(valid.length - 1)} cy={sy(valid[valid.length - 1].y)}
        r={4} fill={color} stroke="#fff" strokeWidth="2" />
      {xTicks.map(({ i, p }) => (
        <text key={i} x={sx(i)} y={H - 1} textAnchor="middle"
          fontSize="9" fill="#bbb" fontFamily="inherit">
          {new Date(p.x).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })}
        </text>
      ))}
    </svg>
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
  { key: 'temp',             label: 'Temp',         unit: '°C',    color: C.rose,    src: 'weather' },
  { key: 'humidity',         label: 'Humidity',     unit: '%',     color: C.sky,     src: 'weather' },
  { key: 'precipitation',    label: 'Precip.',      unit: 'mm',    color: C.teal,    src: 'weather' },
  { key: 'soil_moisture',    label: 'Soil moisture',unit: 'm³/m³', color: C.green,   src: 'weather' },
  { key: 'soil_temperature', label: 'Soil temp',    unit: '°C',    color: C.soil,    src: 'weather' },
  { key: 'wind_speed',       label: 'Wind',         unit: 'm/s',   color: C.slate,   src: 'weather' },
];
const METRIC_TABS = [
  { key: 'gdd',          label: 'GDD',           unit: '°C·d',  color: C.amber,   src: 'metrics' },
  { key: 'rain_cum_30d', label: 'Rain 30d',      unit: 'mm',    color: C.sky,     src: 'metrics' },
  { key: 'et0',          label: 'ET₀',           unit: 'mm',    color: C.teal,    src: 'metrics' },
  { key: 'water_deficit',label: 'Water deficit', unit: 'mm',    color: C.mulberry,src: 'metrics' },
  { key: 'rs_mj_m2_day', label: 'Solar rad.',    unit: 'MJ/m²', color: C.amber,   src: 'metrics' },
];
const ALL_TABS = [...WEATHER_TABS, ...METRIC_TABS];

// ── Main export ────────────────────────────────────────────────────────────────
const WeatherCharts = ({ data = [] }) => {
  const [open, setOpen] = useState(true);
  const [active, setActive] = useState('temp');

  const cfg = ALL_TABS.find(t => t.key === active) || ALL_TABS[0];

  const points = useMemo(() => data.map(row => ({
    x: row.timestamp,
    y: cfg.src === 'weather' ? row.weather_data?.[cfg.key] : row.metrics_data?.[cfg.key],
  })), [data, active]);

  const vals = points.map(p => p.y).filter(v => v != null && !isNaN(v));
  const stats = vals.length ? {
    min:  Math.min(...vals).toFixed(2),
    max:  Math.max(...vals).toFixed(2),
    avg:  (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2),
    last: vals[vals.length - 1].toFixed(2),
  } : null;

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
          {/* Weather tabs */}
          <div style={tabSection}>
            <span style={groupLabel}>Weather</span>
            <div style={tabRow}>
              {WEATHER_TABS.map(t => <Tab key={t.key} label={t.label} active={active === t.key} color={t.color} onClick={() => setActive(t.key)} />)}
            </div>
          </div>
          {/* Metrics tabs */}
          <div style={{ ...tabSection, marginTop: 8 }}>
            <span style={groupLabel}>Agronomic metrics</span>
            <div style={tabRow}>
              {METRIC_TABS.map(t => <Tab key={t.key} label={t.label} active={active === t.key} color={t.color} onClick={() => setActive(t.key)} />)}
            </div>
          </div>

          {/* Chart area */}
          <div style={chartBox}>
            <div style={chartTop}>
              <span style={{ fontWeight: 700, fontSize: 14, color: cfg.color }}>{cfg.label}</span>
              <span style={{ fontSize: 11, color: '#bbb', marginLeft: 4 }}>{cfg.unit}</span>
              {stats && (
                <div style={statsRow}>
                  {[['Min', stats.min], ['Max', stats.max], ['Avg', stats.avg], ['Latest', stats.last]].map(([k, v]) => (
                    <div key={k} style={statCol}>
                      <span style={statLbl}>{k}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: cfg.color }}>{v} <span style={{ fontSize: 10, fontWeight: 400, color: '#aaa' }}>{cfg.unit}</span></span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <LineChart points={points} color={cfg.color} unit={cfg.unit} label={cfg.key} />
          </div>
        </div>
      )}
    </div>
  );
};

export default WeatherCharts;

const wrap = { background: '#fff', borderRadius: 14, border: '1px solid var(--color-accent-soil)', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', overflow: 'hidden', marginBottom: 20 };
const header = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 20px', cursor: 'pointer', background: 'var(--color-bg-champagne)', borderBottom: '1px solid var(--color-accent-soil)', userSelect: 'none' };
const titleStyle = { fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, color: 'var(--color-accent-chernozem)' };
const metaBadge = { fontSize: 11, color: '#aaa', background: '#f0ebe3', borderRadius: 10, padding: '2px 8px' };
const body = { padding: '16px 20px 20px' };
const tabSection = {};
const groupLabel = { display: 'block', fontSize: 10, fontWeight: 700, color: '#ccc', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 };
const tabRow = { display: 'flex', gap: 6, flexWrap: 'wrap' };
const chartBox = { marginTop: 14, background: 'var(--color-bg-champagne)', borderRadius: 10, padding: '13px 15px', border: '1px solid #ece6dc' };
const chartTop = { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' };
const statsRow = { display: 'flex', gap: 16, marginLeft: 'auto', flexWrap: 'wrap' };
const statCol = { display: 'flex', flexDirection: 'column', alignItems: 'flex-end' };
const statLbl = { fontSize: 9, color: '#ccc', textTransform: 'uppercase', letterSpacing: '0.05em' };
