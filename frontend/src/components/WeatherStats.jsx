/**
 * WeatherMetricsPanel.jsx
 * Consumes GET /api/v1/weather/location/{id}/latest-weather
 * Shape: { history: {...}, metrics: {...} }
 *
 * Collapsible panel. Shows live conditions + full agronomic metrics grid.
 */
import { useState } from 'react';

// ── Small stat card ────────────────────────────────────────────────────────────
const Stat = ({ label, value, unit, icon, color = '#317f43', sub }) => (
  <div style={{
    background: '#fff',
    border: '1px solid #ece6dc',
    borderRadius: 10,
    padding: '10px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 110,
  }}>
    <span style={{ fontSize: 18 }}>{icon}</span>
    <span style={{ fontSize: 10, color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>{label}</span>
    <span style={{ fontSize: 20, fontWeight: 800, color, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
      {value ?? '—'}
      {value != null && <span style={{ fontSize: 11, fontWeight: 400, color: '#aaa', marginLeft: 3 }}>{unit}</span>}
    </span>
    {sub && <span style={{ fontSize: 10, color: '#aaa' }}>{sub}</span>}
  </div>
);

// ── Section divider ────────────────────────────────────────────────────────────
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

// ── Sunrise/sunset strip ───────────────────────────────────────────────────────
const SunStrip = ({ sunrise, sunset }) => {
  const fmt = (iso) => iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20, background: '#fff8ee', borderRadius: 10, padding: '8px 16px', border: '1px solid #f5e6c8', fontSize: 13, marginBottom: 14 }}>
      <span>🌅 Sunrise <strong>{fmt(sunrise)}</strong></span>
      <span style={{ color: '#ddd' }}>│</span>
      <span>🌇 Sunset <strong>{fmt(sunset)}</strong></span>
    </div>
  );
};

// ── Main export ────────────────────────────────────────────────────────────────
const WeatherMetricsPanel = ({ latestWeather }) => {
  const [open, setOpen] = useState(true);

  const h = latestWeather?.history;
  const m = latestWeather?.metrics;

  const fmt = (v, d = 1) => (v != null && !isNaN(v)) ? Number(v).toFixed(d) : null;
  const ts  = h?.timestamp ? new Date(h.timestamp).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : null;

  return (
    <div style={wrap}>
      {/* Header */}
      <div style={header} onClick={() => setOpen(v => !v)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>🌿</span>
          <span style={titleStyle}>Conditions &amp; Metrics</span>
          {ts && <span style={metaBadge}>as of {ts}</span>}
          {h?.is_night && <span style={{ fontSize: 11, color: '#7a6fa0', background: '#f0eeff', borderRadius: 10, padding: '2px 8px' }}>🌙 Night</span>}
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

              {h && (
                <Section title="Current conditions">
                  <Stat icon="🌡️" label="Temperature"   value={fmt(h.temp)}       unit="°C"   color="#b53060" />
                  <Stat icon="💧" label="Humidity"       value={fmt(h.humidity, 0)} unit="%"   color="#1a6fa3" />
                  <Stat icon="🌬️" label="Wind speed"     value={fmt(h.wind_speed)} unit="m/s"  color="#4a5568"
                    sub={h.wind_deg != null ? `${h.wind_deg}°` : undefined} />
                  <Stat icon="☁️" label="Cloud cover"    value={fmt(h.cloud_coverage, 0)} unit="%" color="#7a8fa0" />
                  <Stat icon="🌧️" label="Precipitation"  value={fmt(h.precipitation)} unit="mm" color="#1a7a6e" />
                  <Stat icon="⬇️" label="Pressure"       value={fmt(h.pressure, 1)} unit="hPa" color="#47637a" />
                  <Stat icon="🌫️" label="Dew point"      value={fmt(h.dew_point)}   unit="°C"  color="#8b6340" />
                  <Stat icon="💨" label="Vapour press. def." value={fmt(h.vapour_pressure_deficit)} unit="kPa" color="#6b7a4a" />
                </Section>
              )}

              {h && (
                <Section title="Soil">
                  <Stat icon="🌱" label="Soil temp (0cm)"     value={fmt(h.soil_temperature_0cm)} unit="°C"   color="#8b6340" />
                  <Stat icon="🪱" label="Soil moisture (0–1cm)" value={fmt(h.soil_moisture_0_to_1cm, 3)} unit="m³/m³" color="#317f43" />
                </Section>
              )}

              {m && (
                <Section title="7-day agronomic summary">
                  <Stat icon="🌡️" label="Temp max (day)"   value={fmt(m.temp_max_day_7d)}   unit="°C"  color="#b53060" />
                  <Stat icon="❄️" label="Temp min (night)"  value={fmt(m.temp_min_night_7d)} unit="°C"  color="#1a6fa3" />
                  <Stat icon="🌧️" label="Rain 7d"           value={fmt(m.rain_cum_7d)}       unit="mm"  color="#1a7a6e" />
                  <Stat icon="💦" label="ET₀"               value={fmt(m.et0)}               unit="mm"  color="#317f43" />
                  <Stat icon="📉" label="Water deficit 7d"  value={fmt(m.water_deficit_7d)}  unit="mm"  color="#470736" />
                  <Stat icon="💧" label="Humidity mean 7d"  value={fmt(m.humidity_mean_7d)}  unit="%"   color="#1a6fa3" />
                  <Stat icon="🥶" label="Frost days 7d"     value={fmt(m.frost_days_count_7d, 0)} unit="d" color="#5577a0" />
                  <Stat icon="☀️" label="Solar rad."        value={fmt(m.rs_mj_m2_day)}      unit="MJ/m²" color="#b87300" />
                  <Stat icon="🌱" label="GDD (base 10)"     value={fmt(m.gdd_base_10, 1)}    unit="°C·d" color="#317f43" />
                </Section>
              )}

              {m && (
                <Section title="30-day summary">
                  <Stat icon="🌧️" label="Rain 30d"          value={fmt(m.rain_cum_30d)}        unit="mm"  color="#1a7a6e" />
                  <Stat icon="📉" label="Water deficit 30d"  value={fmt(m.water_deficit_30d)}   unit="mm"  color="#470736" />
                  <Stat icon="💧" label="Humidity mean 30d"  value={fmt(m.humidity_mean_30d)}   unit="%"   color="#1a6fa3" />
                  <Stat icon="🥶" label="Frost days 30d"     value={fmt(m.frost_days_count_30d, 0)} unit="d" color="#5577a0" />
                  <Stat icon="🔥" label="Heat days 30d"      value={fmt(m.heat_days_count_30d, 0)} unit="d" color="#b53060" />
                  <Stat icon="🌱" label="SPI 1m"             value={fmt(m.spi_1m, 2)}           unit=""    color="#317f43" />
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

const wrap = { background: '#fff', borderRadius: 14, border: '1px solid var(--color-accent-soil)', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', overflow: 'hidden', marginBottom: 20 };
const header = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 20px', cursor: 'pointer', background: 'var(--color-bg-champagne)', borderBottom: '1px solid var(--color-accent-soil)', userSelect: 'none' };
const titleStyle = { fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, color: 'var(--color-accent-chernozem)' };
const metaBadge = { fontSize: 11, color: '#aaa', background: '#f0ebe3', borderRadius: 10, padding: '2px 8px' };
const body = { padding: '16px 20px 20px', background: 'var(--color-bg-champagne)' };
