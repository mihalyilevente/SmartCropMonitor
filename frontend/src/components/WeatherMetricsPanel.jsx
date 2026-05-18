/**
 * WeatherMetricsPanel.jsx
 *
 * Consumes:
 *   GET /api/v1/weather/location/{id}/latest-weather
 *       → { history: {...}, metrics: {...} }
 *   GET /api/v1/weather/location/{id}/weather-stats   ← NEW
 *       → { history: { temp: {avg,min,max,std}, ... }, metrics: {...}, record_count }
 *
 */
import { useState, useEffect } from 'react';
import api from '../api/client';

const BASE_WEATHER = '/api/v1/weather';
const BASE_EVENTS  = '/api/v1/events';

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (v, d = 1) => (v != null && !isNaN(v)) ? Number(v).toFixed(d) : null;
const r3  = (v) => v != null ? Number(v).toFixed(3) : '—';
const r1  = (v) => v != null ? Number(v).toFixed(1) : '—';
const r0  = (v) => v != null ? Number(v).toFixed(0) : '—';

// ── Position bar ──────────────────────────────────────────────────────────────
// Shows where `current` sits between historical min and max.
const PositionBar = ({ current, min, max, color }) => {
  if (current == null || min == null || max == null || min === max) return null;
  const pct = Math.max(0, Math.min(100, ((current - min) / (max - min)) * 100));
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ position: 'relative', height: 6, background: '#f0ebe3', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: color, borderRadius: 3, transition: 'width 0.4s ease' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#bbb', marginTop: 2 }}>
        <span>{r1(min)}</span>
        <span>{r1(max)}</span>
      </div>
    </div>
  );
};

// ── Stat detail drawer (shown when card is expanded) ──────────────────────────
const StatDrawer = ({ statEntry, unit, current, color }) => {
  if (!statEntry) {
    return <div style={{ fontSize: 11, color: '#bbb', paddingTop: 8 }}>No historical data yet</div>;
  }
  const { avg, min, max, std } = statEntry;
  const rows = [
    { label: 'Historical avg',  val: avg, suffix: unit },
    { label: 'Historical min',  val: min, suffix: unit },
    { label: 'Historical max',  val: max, suffix: unit },
    { label: 'Std deviation',   val: std, suffix: unit },
  ];
  return (
    <div style={{ paddingTop: 10, borderTop: '1px solid #f0ebe3', marginTop: 8 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: '#ccc', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
        Historical benchmarks
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {rows.map(({ label, val, suffix }) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
            <span style={{ color: '#aaa' }}>{label}</span>
            <span style={{ fontWeight: 600, color: '#555' }}>
              {val != null ? `${r1(val)} ${suffix}` : '—'}
            </span>
          </div>
        ))}
      </div>
      <PositionBar current={current} min={min} max={max} color={color} />
    </div>
  );
};

// ── Quick-alert modal ─────────────────────────────────────────────────────────
const QuickAlertModal = ({ metric, currentValue, userId, locationId, onClose }) => {
  const [operator, setOperator] = useState(currentValue >= 0 ? '>' : '<');
  const [threshold, setThreshold] = useState(String(currentValue ?? ''));
  const [severity, setSeverity]   = useState('WARNING');
  const [name, setName]           = useState(`Alert: ${metric.replace(/_/g, ' ')}`);
  const [busy, setBusy]           = useState(false);
  const [done, setDone]           = useState(false);

  const EVENT_TYPE_MAP = {
    temp: 'HEAT_STRESS', temp_min_night_7d: 'FROST_HAZARD', temp_max_day_7d: 'HEAT_STRESS',
    temp_min_day_7d: 'FROST_HAZARD', temp_max_night_7d: 'HEAT_STRESS',
    rain_cum_7d: 'HEAVY_RAIN', rain_cum_30d: 'HEAVY_RAIN', rain: 'HEAVY_RAIN',
    water_deficit_7d: 'DROUGHT_WARNING', water_deficit_30d: 'DROUGHT_WARNING',
    wind_speed: 'HIGH_WIND', frost_days_count_7d: 'FROST_HAZARD',
    frost_days_count_30d: 'FROST_HAZARD', heat_days_count_7d: 'HEAT_STRESS',
    heat_days_count_30d: 'HEAT_STRESS', spi_1m: 'DROUGHT_WARNING',
    humidity: 'OTHER', cloud_coverage: 'OTHER', pressure: 'OTHER',
    dew_point: 'OTHER', vapour_pressure_deficit: 'OTHER',
    soil_temperature_0cm: 'SOIL_TEMP_LOW', soil_moisture_0_to_1cm: 'LOW_SOIL_MOISTURE',
    gdd_base_10: 'OTHER', et0: 'OTHER', humidity_mean_7d: 'OTHER',
    humidity_mean_30d: 'OTHER', rs_mj_m2_day: 'OTHER', ra_mj_m2_day: 'OTHER',
    snowfall: 'OTHER', showers: 'OTHER',
  };

  const submit = async () => {
    if (!threshold) return;
    setBusy(true);
    try {
      await api.post(`${BASE_EVENTS}/rules/create`, {
        user_id: userId, location_id: locationId, name,
        event_type: EVENT_TYPE_MAP[metric] || 'MANUAL_ALERT',
        condition: { metric, operator, value: Number(threshold) },
        action: { notify: true, severity },
        is_active: true,
      });
      setDone(true);
      setTimeout(onClose, 1500);
    } catch { alert('Failed to create alert.'); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 14, padding: '24px 28px', maxWidth: 420, width: '90%', boxShadow: '0 8px 40px rgba(0,0,0,0.18)', border: '1px solid #e0d8cf' }} onClick={e => e.stopPropagation()}>
        {done ? (
          <div style={{ textAlign: 'center', padding: '20px 0', color: '#1b5e20', fontSize: 16, fontWeight: 700 }}>✅ Alert rule created!</div>
        ) : (
          <>
            <div style={{ fontWeight: 800, fontSize: 17, color: '#333', marginBottom: 4 }}>🔔 Quick Alert</div>
            <div style={{ fontSize: 12, color: '#aaa', marginBottom: 18 }}>
              Metric: <strong style={{ color: '#555' }}>{metric.replace(/_/g, ' ')}</strong>
              {currentValue != null && <> · Current: <strong style={{ color: '#555' }}>{Number(currentValue).toFixed(2)}</strong></>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={lbl}>Rule name<input value={name} onChange={e => setName(e.target.value)} style={inp} /></label>
              <div style={{ display: 'flex', gap: 10 }}>
                <label style={lbl}>Trigger when
                  <select value={operator} onChange={e => setOperator(e.target.value)} style={inp}>
                    {['>', '<', '>=', '<=', '=='].map(o => <option key={o}>{o}</option>)}
                  </select>
                </label>
                <label style={lbl}>Threshold
                  <input type="number" value={threshold} onChange={e => setThreshold(e.target.value)} style={{ ...inp, width: 100 }} />
                </label>
                <label style={lbl}>Severity
                  <select value={severity} onChange={e => setSeverity(e.target.value)} style={inp}>
                    {['INFO','WARNING','ERROR','CRITICAL'].map(s => <option key={s}>{s}</option>)}
                  </select>
                </label>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={submit} disabled={busy} style={btnPrimary}>{busy ? 'Creating…' : '＋ Create Alert Rule'}</button>
              <button onClick={onClose} style={btnSecondary}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ── Metric card ───────────────────────────────────────────────────────────────
// Click anywhere on the card body to expand/collapse the historical stats drawer.
// Hover reveals the 🔔 quick-alert button (top-right corner).
const Stat = ({
  label, value, unit, icon, color = '#317f43', sub,
  metricKey, userId, locationId,
  statEntry,          // { avg, min, max, std } from /weather-stats
}) => {
  const [expanded,  setExpanded]  = useState(false);
  const [showAlert, setShowAlert] = useState(false);
  const hasStats = statEntry && (statEntry.avg != null || statEntry.min != null);

  return (
    <>
      <div
        style={{
          background: '#fff', border: expanded ? `1px solid ${color}` : '1px solid #ece6dc',
          borderRadius: 10, padding: '10px 14px',
          display: 'flex', flexDirection: 'column', gap: 2,
          minWidth: 130, position: 'relative',
          cursor: hasStats ? 'pointer' : 'default',
          transition: 'border-color 0.15s, box-shadow 0.15s',
          boxShadow: expanded ? `0 0 0 3px ${color}18` : 'none',
        }}
        onClick={() => { if (hasStats) setExpanded(v => !v); }}
        onMouseEnter={e => {
          if (metricKey && userId) {
            const btn = e.currentTarget.querySelector('.alert-btn');
            if (btn) btn.style.opacity = '1';
          }
        }}
        onMouseLeave={e => {
          if (metricKey && userId) {
            const btn = e.currentTarget.querySelector('.alert-btn');
            if (btn) btn.style.opacity = '0';
          }
        }}
      >
        {/* Top row: icon + expand chevron */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <span style={{ fontSize: 18 }}>{icon}</span>
          {hasStats && (
            <span style={{ fontSize: 10, color: '#ccc', marginTop: 2, userSelect: 'none' }}>
              {expanded ? '▲' : '▼'}
            </span>
          )}
        </div>

        <span style={{ fontSize: 10, color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>{label}</span>

        {/* Main value */}
        <span style={{ fontSize: 20, fontWeight: 800, color, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
          {value ?? '—'}
          {value != null && <span style={{ fontSize: 11, fontWeight: 400, color: '#aaa', marginLeft: 3 }}>{unit}</span>}
        </span>

        {/* Avg hint — always visible when we have data */}
        {statEntry?.avg != null && !expanded && (
          <span style={{ fontSize: 10, color: '#bbb', marginTop: 1 }}>
            avg {r1(statEntry.avg)} {unit}
          </span>
        )}

        {sub && !expanded && <span style={{ fontSize: 10, color: '#aaa' }}>{sub}</span>}

        {/* Quick-alert button */}
        {metricKey && userId && (
          <button
            className="alert-btn"
            onClick={e => { e.stopPropagation(); setShowAlert(true); }}
            title="Create alert for this metric"
            style={{
              position: 'absolute', top: 6, right: 6,
              background: 'none', border: '1px solid #e0d8cf', borderRadius: 6,
              fontSize: 11, cursor: 'pointer', color: '#bbb', padding: '2px 6px',
              opacity: 0, transition: 'opacity 0.15s',
            }}>🔔</button>
        )}

        {/* Expanded drawer */}
        {expanded && (
          <StatDrawer
            statEntry={statEntry}
            unit={unit}
            current={value != null ? Number(value) : null}
            color={color}
          />
        )}
      </div>

      {showAlert && (
        <QuickAlertModal
          metric={metricKey}
          currentValue={value != null ? Number(value) : null}
          userId={userId}
          locationId={locationId}
          onClose={() => setShowAlert(false)}
        />
      )}
    </>
  );
};

// ── Section divider ───────────────────────────────────────────────────────────
const Section = ({ title, children }) => (
  <div style={{ marginBottom: 16 }}>
    <div style={{ fontSize: 10, fontWeight: 700, color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8, borderBottom: '1px solid #f0ebe3', paddingBottom: 4 }}>
      {title}
    </div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {children}
    </div>
  </div>
);

// ── Sunrise/sunset strip ──────────────────────────────────────────────────────
const SunStrip = ({ sunrise, sunset }) => {
  const fmtTime = (iso) => iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20, background: '#fff8ee', borderRadius: 10, padding: '8px 16px', border: '1px solid #f5e6c8', fontSize: 13, marginBottom: 14 }}>
      <span>🌅 Sunrise <strong>{fmtTime(sunrise)}</strong></span>
      <span style={{ color: '#ddd' }}>│</span>
      <span>🌇 Sunset <strong>{fmtTime(sunset)}</strong></span>
    </div>
  );
};

// ── Record count badge ────────────────────────────────────────────────────────
const RecordBadge = ({ count }) => {
  if (!count) return null;
  const label = count >= 8760 ? `${(count / 8760).toFixed(1)} yrs` : count >= 720 ? `${(count / 720).toFixed(1)} mo` : `${count} records`;
  return (
    <span style={{ fontSize: 10, color: '#aaa', background: '#f0ebe3', borderRadius: 10, padding: '2px 8px' }}>
      📊 {label} of history
    </span>
  );
};

// ── Main export ───────────────────────────────────────────────────────────────
const WeatherMetricsPanel = ({ latestWeather, userId, locationId }) => {
  const [open, setOpen]   = useState(true);
  const [stats, setStats] = useState(null); // loaded from /weather-stats

  // Load historical benchmark stats once per locationId
  useEffect(() => {
    if (!locationId || !userId) return;
    api.get(`${BASE_WEATHER}/location/${locationId}/weather-stats?user_id=${userId}`)
      .then(r => setStats(r.data))
      .catch(() => setStats(null));
  }, [locationId, userId]);

  const h = latestWeather?.history;
  const m = latestWeather?.metrics;

  const ts = h?.timestamp
    ? new Date(h.timestamp).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
    : null;

  // Convenience: pull a stats entry or return null
  const hs = (key) => stats?.history?.[key] ?? null;  // WeatherHistory stats
  const ms = (key) => stats?.metrics?.[key] ?? null;  // WeatherMetrics stats

  // Pass alertable props only when userId is present
  const alertProps = userId ? { userId, locationId } : {};

  return (
    <div style={wrap}>
      {/* Header */}
      <div style={header} onClick={() => setOpen(v => !v)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 18 }}>🌿</span>
          <span style={titleStyle}>Conditions &amp; Metrics</span>
          {ts && <span style={metaBadge}>as of {ts}</span>}
          {h?.is_night && <span style={{ fontSize: 11, color: '#7a6fa0', background: '#f0eeff', borderRadius: 10, padding: '2px 8px' }}>🌙 Night</span>}
          <RecordBadge count={stats?.record_count} />
          {userId && <span style={{ fontSize: 11, color: '#aaa', background: '#f0ebe3', borderRadius: 10, padding: '2px 8px' }}>Click a card for benchmarks · hover for 🔔</span>}
        </div>
        <span style={{ color: '#bbb', fontSize: 13 }}>{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div style={body}>
          {!h && !m ? (
            <div style={{ color: '#bbb', textAlign: 'center', padding: 24 }}>No weather data for this location</div>
          ) : (
            <>
              {h?.sunrise && <SunStrip sunrise={h.sunrise} sunset={h.sunset} />}

              {/* ── Current conditions ──────────────────────────────────── */}
              {h && (
                <Section title="Current conditions">
                  <Stat icon="🌡️" label="Temperature"         value={fmt(h.temp)}                      unit="°C"    color="#b53060" metricKey="temp"                    statEntry={hs('temp')}                    {...alertProps} />
                  <Stat icon="💧" label="Humidity"             value={fmt(h.humidity, 0)}               unit="%"     color="#1a6fa3" metricKey="humidity"                statEntry={hs('humidity')}                {...alertProps} />
                  <Stat icon="🌬️" label="Wind speed"           value={fmt(h.wind_speed)}                unit="m/s"   color="#4a5568" metricKey="wind_speed"              statEntry={hs('wind_speed')}              {...alertProps}
                    sub={h.wind_deg != null ? `${h.wind_deg}°` : undefined} />
                  <Stat icon="☁️" label="Cloud cover"          value={fmt(h.cloud_coverage, 0)}         unit="%"     color="#7a8fa0" metricKey="cloud_coverage"           statEntry={hs('cloud_coverage')}          {...alertProps} />
                  <Stat icon="🌧️" label="Precipitation"        value={fmt(h.precipitation)}             unit="mm"    color="#1a7a6e" metricKey="precipitation"           statEntry={hs('precipitation')}           {...alertProps} />
                  <Stat icon="🌦️" label="Rain"                 value={fmt(h.rain)}                      unit="mm"    color="#1a7a6e" metricKey="rain"                    statEntry={hs('rain')}                    {...alertProps} />
                  <Stat icon="🌨️" label="Snowfall"             value={fmt(h.snowfall)}                  unit="cm"    color="#5577a0" metricKey="snowfall"                {...alertProps} />
                  <Stat icon="⬇️" label="Pressure"             value={fmt(h.pressure, 1)}               unit="hPa"   color="#47637a" metricKey="pressure"               statEntry={hs('pressure')}                {...alertProps} />
                  <Stat icon="🌫️" label="Dew point"            value={fmt(h.dew_point)}                 unit="°C"    color="#8b6340" metricKey="dew_point"              statEntry={hs('dew_point')}               {...alertProps} />
                  <Stat icon="💨" label="Vapour press. def."   value={fmt(h.vapour_pressure_deficit)}   unit="kPa"   color="#6b7a4a" metricKey="vapour_pressure_deficit" statEntry={hs('vapour_pressure_deficit')} {...alertProps} />
                </Section>
              )}

              {/* ── Soil ───────────────────────────────────────────────── */}
              {h && (
                <Section title="Soil">
                  <Stat icon="🌱" label="Soil temp (0 cm)"      value={fmt(h.soil_temperature_0cm)}     unit="°C"      color="#8b6340" metricKey="soil_temperature_0cm"   statEntry={hs('soil_temperature_0cm')}   {...alertProps} />
                  <Stat icon="🪱" label="Soil moisture (0–1 cm)" value={fmt(h.soil_moisture_0_to_1cm, 3)} unit="m³/m³" color="#317f43" metricKey="soil_moisture_0_to_1cm" statEntry={hs('soil_moisture_0_to_1cm')} {...alertProps} />
                </Section>
              )}

              {/* ── 7-day agronomic summary ─────────────────────────────── */}
              {m && (
                <Section title="7-day agronomic summary">
                  <Stat icon="🌡️" label="Temp max (day)"      value={fmt(m.temp_max_day_7d)}         unit="°C"    color="#b53060" metricKey="temp_max_day_7d"       statEntry={ms('temp_max_day_7d')}       {...alertProps} />
                  <Stat icon="🌙" label="Temp min (night)"    value={fmt(m.temp_min_night_7d)}       unit="°C"    color="#1a6fa3" metricKey="temp_min_night_7d"     statEntry={ms('temp_min_night_7d')}     {...alertProps} />
                  <Stat icon="🌤️" label="Temp min (day)"      value={fmt(m.temp_min_day_7d)}         unit="°C"    color="#47637a" metricKey="temp_min_day_7d"       statEntry={ms('temp_min_day_7d')}       {...alertProps} />
                  <Stat icon="🔥" label="Temp max (night)"    value={fmt(m.temp_max_night_7d)}       unit="°C"    color="#b87300" metricKey="temp_max_night_7d"     statEntry={ms('temp_max_night_7d')}     {...alertProps} />
                  <Stat icon="🌧️" label="Rain 7d"             value={fmt(m.rain_cum_7d)}             unit="mm"    color="#1a7a6e" metricKey="rain_cum_7d"           statEntry={ms('rain_cum_7d')}           {...alertProps} />
                  <Stat icon="💦" label="ET₀"                 value={fmt(m.et0)}                     unit="mm"    color="#317f43" metricKey="et0"                   statEntry={ms('et0')}                   {...alertProps} />
                  <Stat icon="📉" label="Water deficit 7d"   value={fmt(m.water_deficit_7d)}        unit="mm"    color="#470736" metricKey="water_deficit_7d"      statEntry={ms('water_deficit_7d')}      {...alertProps} />
                  <Stat icon="💧" label="Humidity mean 7d"   value={fmt(m.humidity_mean_7d)}        unit="%"     color="#1a6fa3" metricKey="humidity_mean_7d"      statEntry={ms('humidity_mean_7d')}      {...alertProps} />
                  <Stat icon="🥶" label="Frost days 7d"      value={fmt(m.frost_days_count_7d, 0)}  unit="d"     color="#5577a0" metricKey="frost_days_count_7d"   statEntry={ms('frost_days_count_7d')}   {...alertProps} />
                  <Stat icon="🌞" label="Heat days 7d"       value={fmt(m.heat_days_count_7d, 0)}   unit="d"     color="#c0392b" metricKey="heat_days_count_7d"    statEntry={ms('heat_days_count_7d')}    {...alertProps} />
                  <Stat icon="☀️" label="Solar rad. (Rs)"    value={fmt(m.rs_mj_m2_day)}            unit="MJ/m²" color="#b87300" metricKey="rs_mj_m2_day"         statEntry={ms('rs_mj_m2_day')}          {...alertProps} />
                  <Stat icon="🌐" label="Extraterr. rad."    value={fmt(m.ra_mj_m2_day)}            unit="MJ/m²" color="#d4a017" metricKey="ra_mj_m2_day"         statEntry={ms('ra_mj_m2_day')}          {...alertProps} />
                  <Stat icon="🌱" label="GDD (base 10)"      value={fmt(m.gdd_base_10, 1)}          unit="°C·d"  color="#317f43" metricKey="gdd_base_10"          statEntry={ms('gdd_base_10')}           {...alertProps} />
                </Section>
              )}

              {/* ── 30-day summary ─────────────────────────────────────── */}
              {m && (
                <Section title="30-day summary">
                  <Stat icon="🌧️" label="Rain 30d"            value={fmt(m.rain_cum_30d)}              unit="mm"  color="#1a7a6e" metricKey="rain_cum_30d"          statEntry={ms('rain_cum_30d')}          {...alertProps} />
                  <Stat icon="📉" label="Water deficit 30d"   value={fmt(m.water_deficit_30d)}         unit="mm"  color="#470736" metricKey="water_deficit_30d"     statEntry={ms('water_deficit_30d')}     {...alertProps} />
                  <Stat icon="💧" label="Humidity mean 30d"   value={fmt(m.humidity_mean_30d)}         unit="%"   color="#1a6fa3" metricKey="humidity_mean_30d"     statEntry={ms('humidity_mean_30d')}     {...alertProps} />
                  <Stat icon="🥶" label="Frost days 30d"      value={fmt(m.frost_days_count_30d, 0)}   unit="d"   color="#5577a0" metricKey="frost_days_count_30d"  statEntry={ms('frost_days_count_30d')}  {...alertProps} />
                  <Stat icon="🔥" label="Heat days 30d"       value={fmt(m.heat_days_count_30d, 0)}    unit="d"   color="#b53060" metricKey="heat_days_count_30d"   statEntry={ms('heat_days_count_30d')}   {...alertProps} />
                  <Stat icon="🌱" label="SPI 1m"              value={fmt(m.spi_1m, 2)}                 unit=""    color="#317f43" metricKey="spi_1m"                statEntry={ms('spi_1m')}                {...alertProps} />
                </Section>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default WeatherMetricsPanel;

// ── Styles ────────────────────────────────────────────────────────────────────
const wrap       = { background: '#fff', borderRadius: 14, border: '1px solid var(--color-accent-soil)', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', overflow: 'hidden', marginBottom: 20 };
const header     = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 20px', cursor: 'pointer', background: 'var(--color-bg-champagne)', borderBottom: '1px solid var(--color-accent-soil)', userSelect: 'none' };
const titleStyle = { fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, color: 'var(--color-accent-chernozem)' };
const metaBadge  = { fontSize: 11, color: '#aaa', background: '#f0ebe3', borderRadius: 10, padding: '2px 8px' };
const body       = { padding: '16px 20px 20px', background: 'var(--color-bg-champagne)' };

const inp        = { padding: '6px 10px', borderRadius: 6, border: '1px solid #ddd', fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fff' };
const lbl        = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 10, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.04em' };
const btnPrimary   = { background: 'var(--color-green-primary, #054e05)', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' };
const btnSecondary = { background: '#eee', color: '#555', border: 'none', borderRadius: 6, padding: '7px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' };