import { useState, useEffect } from 'react';
import api from '../api/client';
import { useLang } from '../context/LanguageContext';

const BASE_WEATHER = '/api/v1/weather';
const BASE_EVENTS  = '/api/v1/events';

const fmt = (v, d = 1) => (v != null && !isNaN(v)) ? Number(v).toFixed(d) : null;
const r1  = (v) => v != null ? Number(v).toFixed(1) : '—';

// ── Position bar ──────────────────────────────────────────────────────────────
const PositionBar = ({ current, min, max, color }) => {
  const { t } = useLang();
  if (current == null || min == null || max == null || min === max) return null;
  const pct = Math.max(0, Math.min(100, ((current - min) / (max - min)) * 100));
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 9, color: '#bbb', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {t('wmp_position_bar')}
      </div>
      <div style={{ position: 'relative', height: 8, background: '#f0ebe3', borderRadius: 4 }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: `${color}55`, borderRadius: 4 }} />
        <div style={{ position: 'absolute', top: '50%', left: `${pct}%`, transform: 'translate(-50%, -50%)', width: 12, height: 12, borderRadius: '50%', background: color, border: '2px solid #fff', boxShadow: `0 0 0 2px ${color}66` }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#bbb', marginTop: 4 }}>
        <span>{t('wmp_pos_min')} {r1(min)}</span>
        <span>{t('wmp_pos_max')} {r1(max)}</span>
      </div>
    </div>
  );
};

// ── Stat detail drawer ────────────────────────────────────────────────────────
const PERIOD_LABELS = {
  all:   'wmp_period_all',
  day:   'wmp_period_day',
  night: 'wmp_period_night',
  '7d':  'wmp_period_7d',
  '30d': 'wmp_period_30d',
};

const StatDrawer = ({ statEntry, statsLoading, unit, current, color, statsPeriod }) => {
  const { t } = useLang();

  if (statsLoading) {
    return (
      <div style={{ paddingTop: 10, borderTop: '1px solid #f0ebe3', marginTop: 8, fontSize: 11, color: '#bbb' }}>
        {t('wmp_history_loading')}
      </div>
    );
  }
  if (!statEntry || (statEntry.avg == null && statEntry.min == null)) {
    return (
      <div style={{ paddingTop: 10, borderTop: '1px solid #f0ebe3', marginTop: 8, fontSize: 11, color: '#bbb' }}>
        {t('wmp_history_none')}
      </div>
    );
  }

  const { avg, min, max, std } = statEntry;
  const periodLabel = statsPeriod ? t(PERIOD_LABELS[statsPeriod] ?? 'wmp_period_all') : null;

  return (
    <div style={{ paddingTop: 10, borderTop: '1px solid #f0ebe3', marginTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {t('wmp_history_title')}
        </span>
        {periodLabel && (
          <span style={{
            fontSize: 9, fontWeight: 700,
            color, background: `${color}18`,
            border: `1px solid ${color}44`,
            borderRadius: 8, padding: '1px 6px',
            textTransform: 'uppercase', letterSpacing: '0.04em',
          }}>
            {periodLabel}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {[
          [t('wmp_history_avg'), avg],
          [t('wmp_history_min'), min],
          [t('wmp_history_max'), max],
          [t('wmp_history_std'), std],
        ].map(([label, val]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
            <span style={{ color: '#aaa' }}>{label}</span>
            <span style={{ fontWeight: 700, color: '#444' }}>
              {val != null ? `${r1(val)}${unit ? ' ' + unit : ''}` : '—'}
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
  const { t } = useLang();
  const [operator,  setOperator]  = useState(currentValue >= 0 ? '>' : '<');
  const [threshold, setThreshold] = useState(String(currentValue ?? ''));
  const [severity,  setSeverity]  = useState('WARNING');
  const [name,      setName]      = useState(`Alert: ${metric.replace(/_/g, ' ')}`);
  const [busy,      setBusy]      = useState(false);
  const [done,      setDone]      = useState(false);

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
    } catch { alert(t('qa_err')); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 14, padding: '24px 28px', maxWidth: 420, width: '90%', boxShadow: '0 8px 40px rgba(0,0,0,0.18)', border: '1px solid #e0d8cf' }} onClick={e => e.stopPropagation()}>
        {done ? (
          <div style={{ textAlign: 'center', padding: '20px 0', color: '#1b5e20', fontSize: 16, fontWeight: 700 }}>
            {t('qa_done')}
          </div>
        ) : (
          <>
            <div style={{ fontWeight: 800, fontSize: 17, color: '#333', marginBottom: 4 }}>{t('qa_title')}</div>
            <div style={{ fontSize: 12, color: '#aaa', marginBottom: 18 }}>
              {t('qa_metric')} <strong style={{ color: '#555' }}>{metric.replace(/_/g, ' ')}</strong>
              {currentValue != null && <> {t('qa_current')} <strong style={{ color: '#555' }}>{Number(currentValue).toFixed(2)}</strong></>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={lbl}>
                {t('qa_rule_name')}
                <input value={name} onChange={e => setName(e.target.value)} style={inp} />
              </label>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <label style={lbl}>
                  {t('qa_trigger')}
                  <select value={operator} onChange={e => setOperator(e.target.value)} style={inp}>
                    {['>', '<', '>=', '<=', '=='].map(o => <option key={o}>{o}</option>)}
                  </select>
                </label>
                <label style={lbl}>
                  {t('qa_threshold')}
                  <input type="number" value={threshold} onChange={e => setThreshold(e.target.value)} style={{ ...inp, width: 100 }} />
                </label>
                <label style={lbl}>
                  {t('qa_severity')}
                  <select value={severity} onChange={e => setSeverity(e.target.value)} style={inp}>
                    {['INFO','WARNING','ERROR','CRITICAL'].map(s => <option key={s}>{s}</option>)}
                  </select>
                </label>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={submit} disabled={busy} style={btnPrimary}>
                {busy ? t('qa_creating') : t('qa_create_btn')}
              </button>
              <button onClick={onClose} style={btnSecondary}>{t('qa_cancel')}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ── Metric card ───────────────────────────────────────────────────────────────
const Stat = ({ label, value, unit, icon, color = '#317f43', sub, metricKey, userId, locationId, statEntry, statsLoading, statsPeriod }) => {
  const { t } = useLang();
  const [expanded,  setExpanded]  = useState(false);
  const [hovered,   setHovered]   = useState(false);
  const [showAlert, setShowAlert] = useState(false);

  return (
    <>
      <div
        style={{
          background: '#fff',
          border: expanded ? `1.5px solid ${color}` : hovered ? `1px solid ${color}88` : '1px solid #ece6dc',
          borderRadius: 10,
          padding: '10px 14px 28px 14px',
          display: 'flex', flexDirection: 'column', gap: 2,
          minWidth: 130, position: 'relative',
          cursor: 'pointer',
          transition: 'border-color 0.15s, box-shadow 0.15s, transform 0.1s',
          boxShadow: expanded ? `0 0 0 3px ${color}22, 0 2px 12px rgba(0,0,0,0.08)` : hovered ? '0 2px 10px rgba(0,0,0,0.07)' : 'none',
          transform: hovered && !expanded ? 'translateY(-1px)' : 'none',
        }}
        onClick={() => setExpanded(v => !v)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Top row: icon + 🔔 alert button */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', minHeight: 24 }}>
          <span style={{ fontSize: 18 }}>{icon}</span>
          {metricKey && userId && (
            <button
              onClick={e => { e.stopPropagation(); setShowAlert(true); }}
              title={t('qa_alert_btn_title')}
              style={{
                background: 'none', border: '1px solid #e0d8cf', borderRadius: 6,
                fontSize: 11, cursor: 'pointer', color: '#bbb', padding: '2px 6px',
                opacity: hovered ? 1 : 0,
                transition: 'opacity 0.15s', lineHeight: 1,
              }}>🔔</button>
          )}
        </div>

        {/* Label */}
        <span style={{ fontSize: 10, color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>
          {label}
        </span>

        {/* Main value */}
        <span style={{ fontSize: 20, fontWeight: 800, color, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
          {value ?? '—'}
          {value != null && <span style={{ fontSize: 11, fontWeight: 400, color: '#aaa', marginLeft: 3 }}>{unit}</span>}
        </span>

        {/* Avg hint */}
        {!expanded && statEntry?.avg != null && (
          <span style={{ fontSize: 10, color: '#bbb', marginTop: 1 }}>
            avg {r1(statEntry.avg)}{unit ? ' ' + unit : ''}
          </span>
        )}

        {sub && !expanded && <span style={{ fontSize: 10, color: '#aaa' }}>{sub}</span>}

        {/* 📊 expand chip */}
        <div style={{
          position: 'absolute', bottom: 7, right: 8,
          display: 'flex', alignItems: 'center', gap: 3,
          fontSize: 9, fontWeight: 700,
          color: expanded ? color : hovered ? '#999' : '#ccc',
          background: expanded ? `${color}12` : hovered ? '#ede8e0' : '#f5f0ea',
          border: `1px solid ${expanded ? color + '44' : '#e8e2d8'}`,
          borderRadius: 5, padding: '2px 5px',
          userSelect: 'none',
          transition: 'color 0.15s, background 0.15s',
        }}>
          <span>📊</span>
          <span>{expanded ? '▲' : '▼'}</span>
        </div>

        {/* Expanded drawer */}
        {expanded && (
          <StatDrawer statEntry={statEntry} statsLoading={statsLoading} unit={unit} current={value != null ? Number(value) : null} color={color} statsPeriod={statsPeriod} />
        )}
      </div>

      {showAlert && (
        <QuickAlertModal metric={metricKey} currentValue={value != null ? Number(value) : null} userId={userId} locationId={locationId} onClose={() => setShowAlert(false)} />
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
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{children}</div>
  </div>
);

// ── Sunrise/sunset strip ──────────────────────────────────────────────────────
const SunStrip = ({ sunrise, sunset }) => {
  const { t } = useLang();
  const fmtTime = (iso) => iso ? new Date(iso).toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' }) : '—';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20, background: '#fff8ee', borderRadius: 10, padding: '8px 16px', border: '1px solid #f5e6c8', fontSize: 13, marginBottom: 14 }}>
      <span>{t('wm_sunrise')} <strong>{fmtTime(sunrise)}</strong></span>
      <span style={{ color: '#ddd' }}>│</span>
      <span>{t('wm_sunset')} <strong>{fmtTime(sunset)}</strong></span>
    </div>
  );
};

// ── Record count badge ────────────────────────────────────────────────────────
const RecordBadge = ({ count }) => {
  const { t } = useLang();
  if (!count) return null;
  const label = count >= 8760
    ? t('wmp_records_yrs', (count / 8760).toFixed(1))
    : count >= 720
    ? t('wmp_records_mo',  (count / 720).toFixed(1))
    : t('wmp_records', count);
  return (
    <span style={{ fontSize: 10, color: '#aaa', background: '#f0ebe3', borderRadius: 10, padding: '2px 8px' }}>
      {label}
    </span>
  );
};

// ── Period switcher ───────────────────────────────────────────────────────────
const PERIODS = [
  { key: 'all',   labelKey: 'wmp_period_all'   },
  { key: 'day',   labelKey: 'wmp_period_day'   },
  { key: 'night', labelKey: 'wmp_period_night' },
  { key: '7d',    labelKey: 'wmp_period_7d'    },
  { key: '30d',   labelKey: 'wmp_period_30d'   },
];

const PeriodSwitcher = ({ value, onChange }) => {
  const { t } = useLang();
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 4 }}>
        {t('wmp_period_label')}
      </span>
      {PERIODS.map(({ key, labelKey }) => {
        const active = value === key;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            style={{
              padding: '3px 10px',
              fontSize: 11,
              fontWeight: active ? 700 : 500,
              borderRadius: 20,
              border: active ? '1.5px solid var(--color-green-primary, #054e05)' : '1px solid #e0d8cf',
              background: active ? 'var(--color-green-primary, #054e05)' : '#fff',
              color: active ? '#fff' : '#888',
              cursor: 'pointer',
              transition: 'all 0.15s',
              fontFamily: 'inherit',
            }}
          >
            {t(labelKey)}
          </button>
        );
      })}
    </div>
  );
};


const WeatherMetricsPanel = ({ latestWeather, userId, locationId }) => {
  const { t } = useLang();
  const [open,         setOpen]         = useState(true);
  const [stats,        setStats]        = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsPeriod,  setStatsPeriod]  = useState('all');

  useEffect(() => {
    if (!locationId || !userId) return;
    setStatsLoading(true);
    api.get(`${BASE_WEATHER}/location/${locationId}/weather-stats?user_id=${userId}&period=${statsPeriod}`)
      .then(r => setStats(r.data))
      .catch(() => setStats(null))
      .finally(() => setStatsLoading(false));
  }, [locationId, userId, statsPeriod]);

  const h = latestWeather?.history;
  const m = latestWeather?.metrics;

  const ts = h?.timestamp
    ? new Date(h.timestamp).toLocaleString('hu-HU', { dateStyle: 'medium', timeStyle: 'short' })
    : null;

  const hs = (key) => stats?.history?.[key] ?? null;
  const ms = (key) => stats?.metrics?.[key] ?? null;
  const alertProps = userId ? { userId, locationId } : {};
  const statsProps = { statsLoading, statsPeriod };

  return (
    <div style={wrap}>
      <div style={header} onClick={() => setOpen(v => !v)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 18 }}>🌿</span>
          <span style={titleStyle}>{t('wm_title')}</span>
          {ts && <span style={metaBadge}>{t('wm_as_of')} {ts}</span>}
          {h?.is_night && <span style={{ fontSize: 11, color: '#7a6fa0', background: '#f0eeff', borderRadius: 10, padding: '2px 8px' }}>{t('wm_night')}</span>}
          <RecordBadge count={stats?.record_count} />
          {userId && (
            <span style={{ fontSize: 11, color: '#aaa', background: '#f0ebe3', borderRadius: 10, padding: '2px 8px' }}>
              {t('wmp_click_hint')}
            </span>
          )}
        </div>
        <span style={{ color: '#bbb', fontSize: 13 }}>{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div style={body}>
          {!h && !m ? (
            <div style={{ color: '#bbb', textAlign: 'center', padding: 24 }}>{t('wm_no_data')}</div>
          ) : (
            <>
              {h?.sunrise && <SunStrip sunrise={h.sunrise} sunset={h.sunset} />}

              {userId && (
                <PeriodSwitcher value={statsPeriod} onChange={setStatsPeriod} />
              )}

              {h && (
                <Section title={t('wm_sec_current')}>
                  <Stat icon="🌡️" label={t('wm_temp')}       value={fmt(h.temp)}                    unit="°C"    color="#b53060" metricKey="temp"                    statEntry={hs('temp')}                    {...alertProps} {...statsProps} />
                  <Stat icon="💧" label={t('wm_humidity')}    value={fmt(h.humidity, 0)}             unit="%"     color="#1a6fa3" metricKey="humidity"                statEntry={hs('humidity')}                {...alertProps} {...statsProps} />
                  <Stat icon="🌬️" label={t('wm_wind_speed')} value={fmt(h.wind_speed)}              unit="m/s"   color="#4a5568" metricKey="wind_speed"              statEntry={hs('wind_speed')}              {...alertProps} {...statsProps}
                    sub={h.wind_deg != null ? `${h.wind_deg}°` : undefined} />
                  <Stat icon="☁️" label={t('wm_cloud')}      value={fmt(h.cloud_coverage, 0)}       unit="%"     color="#7a8fa0" metricKey="cloud_coverage"           statEntry={hs('cloud_coverage')}          {...alertProps} {...statsProps} />
                  <Stat icon="🌧️" label={t('wm_precip')}     value={fmt(h.precipitation)}           unit="mm"    color="#1a7a6e" metricKey="precipitation"           statEntry={hs('precipitation')}           {...alertProps} {...statsProps} />
                  <Stat icon="🌦️" label={t('wm_rain')}       value={fmt(h.rain)}                    unit="mm"    color="#1a7a6e" metricKey="rain"                    statEntry={hs('rain')}                    {...alertProps} {...statsProps} />
                  <Stat icon="🌨️" label={t('wm_snowfall')}   value={fmt(h.snowfall)}                unit="cm"    color="#5577a0" metricKey="snowfall"                                                          {...alertProps} {...statsProps} />
                  <Stat icon="⬇️" label={t('wm_pressure')}   value={fmt(h.pressure, 1)}             unit="hPa"   color="#47637a" metricKey="pressure"               statEntry={hs('pressure')}                {...alertProps} {...statsProps} />
                  <Stat icon="🌫️" label={t('wm_dew')}        value={fmt(h.dew_point)}               unit="°C"    color="#8b6340" metricKey="dew_point"              statEntry={hs('dew_point')}               {...alertProps} {...statsProps} />
                  <Stat icon="💨" label={t('wm_vpd')}        value={fmt(h.vapour_pressure_deficit)} unit="kPa"   color="#6b7a4a" metricKey="vapour_pressure_deficit" statEntry={hs('vapour_pressure_deficit')} {...alertProps} {...statsProps} />
                </Section>
              )}

              {h && (
                <Section title={t('wm_sec_soil')}>
                  <Stat icon="🌱" label={t('wm_soil_temp')}  value={fmt(h.soil_temperature_0cm)}       unit="°C"    color="#8b6340" metricKey="soil_temperature_0cm"   statEntry={hs('soil_temperature_0cm')}   {...alertProps} {...statsProps} />
                  <Stat icon="🪱" label={t('wm_soil_moist')} value={fmt(h.soil_moisture_0_to_1cm, 3)}  unit="m³/m³" color="#317f43" metricKey="soil_moisture_0_to_1cm" statEntry={hs('soil_moisture_0_to_1cm')} {...alertProps} {...statsProps} />
                </Section>
              )}

              {m && (
                <Section title={t('wm_sec_7d')}>
                  <Stat icon="🌡️" label={t('wm_temp_max')}       value={fmt(m.temp_max_day_7d)}         unit="°C"    color="#b53060" metricKey="temp_max_day_7d"       statEntry={ms('temp_max_day_7d')}       {...alertProps} {...statsProps} />
                  <Stat icon="🌙" label={t('wm_temp_min')}        value={fmt(m.temp_min_night_7d)}       unit="°C"    color="#1a6fa3" metricKey="temp_min_night_7d"     statEntry={ms('temp_min_night_7d')}     {...alertProps} {...statsProps} />
                  <Stat icon="🌤️" label={t('wm_temp_min_day')}   value={fmt(m.temp_min_day_7d)}         unit="°C"    color="#47637a" metricKey="temp_min_day_7d"       statEntry={ms('temp_min_day_7d')}       {...alertProps} {...statsProps} />
                  <Stat icon="🔥" label={t('wm_temp_max_night')}  value={fmt(m.temp_max_night_7d)}       unit="°C"    color="#b87300" metricKey="temp_max_night_7d"     statEntry={ms('temp_max_night_7d')}     {...alertProps} {...statsProps} />
                  <Stat icon="🌧️" label={t('wm_rain_7d')}        value={fmt(m.rain_cum_7d)}             unit="mm"    color="#1a7a6e" metricKey="rain_cum_7d"           statEntry={ms('rain_cum_7d')}           {...alertProps} {...statsProps} />
                  <Stat icon="💦" label="ET₀"                     value={fmt(m.et0)}                     unit="mm"    color="#317f43" metricKey="et0"                   statEntry={ms('et0')}                   {...alertProps} {...statsProps} />
                  <Stat icon="📉" label={t('wm_water_def_7d')}   value={fmt(m.water_deficit_7d)}        unit="mm"    color="#470736" metricKey="water_deficit_7d"      statEntry={ms('water_deficit_7d')}      {...alertProps} {...statsProps} />
                  <Stat icon="💧" label={t('wm_hum_mean_7d')}    value={fmt(m.humidity_mean_7d)}        unit="%"     color="#1a6fa3" metricKey="humidity_mean_7d"      statEntry={ms('humidity_mean_7d')}      {...alertProps} {...statsProps} />
                  <Stat icon="🥶" label={t('wm_frost_7d')}       value={fmt(m.frost_days_count_7d, 0)}  unit="d"     color="#5577a0" metricKey="frost_days_count_7d"   statEntry={ms('frost_days_count_7d')}   {...alertProps} {...statsProps} />
                  <Stat icon="🌞" label={t('wm_heat_7d')}        value={fmt(m.heat_days_count_7d, 0)}   unit="d"     color="#c0392b" metricKey="heat_days_count_7d"    statEntry={ms('heat_days_count_7d')}    {...alertProps} {...statsProps} />
                  <Stat icon="☀️" label={t('wm_solar_rs')}       value={fmt(m.rs_mj_m2_day)}            unit="MJ/m²" color="#b87300" metricKey="rs_mj_m2_day"         statEntry={ms('rs_mj_m2_day')}          {...alertProps} {...statsProps} />
                  <Stat icon="🌐" label={t('wm_extra_rad')}      value={fmt(m.ra_mj_m2_day)}            unit="MJ/m²" color="#d4a017" metricKey="ra_mj_m2_day"         statEntry={ms('ra_mj_m2_day')}          {...alertProps} {...statsProps} />
                  <Stat icon="🌱" label={t('wm_gdd')}            value={fmt(m.gdd_base_10, 1)}          unit="°C·d"  color="#317f43" metricKey="gdd_base_10"          statEntry={ms('gdd_base_10')}           {...alertProps} {...statsProps} />
                </Section>
              )}

              {m && (
                <Section title={t('wm_sec_30d')}>
                  <Stat icon="🌧️" label={t('wm_rain_30d')}       value={fmt(m.rain_cum_30d)}              unit="mm"  color="#1a7a6e" metricKey="rain_cum_30d"          statEntry={ms('rain_cum_30d')}          {...alertProps} {...statsProps} />
                  <Stat icon="📉" label={t('wm_water_def_30d')}  value={fmt(m.water_deficit_30d)}         unit="mm"  color="#470736" metricKey="water_deficit_30d"     statEntry={ms('water_deficit_30d')}     {...alertProps} {...statsProps} />
                  <Stat icon="💧" label={t('wm_hum_mean_30d')}   value={fmt(m.humidity_mean_30d)}         unit="%"   color="#1a6fa3" metricKey="humidity_mean_30d"     statEntry={ms('humidity_mean_30d')}     {...alertProps} {...statsProps} />
                  <Stat icon="🥶" label={t('wm_frost_30d')}      value={fmt(m.frost_days_count_30d, 0)}   unit="d"   color="#5577a0" metricKey="frost_days_count_30d"  statEntry={ms('frost_days_count_30d')}  {...alertProps} {...statsProps} />
                  <Stat icon="🔥" label={t('wm_heat_30d')}       value={fmt(m.heat_days_count_30d, 0)}    unit="d"   color="#b53060" metricKey="heat_days_count_30d"   statEntry={ms('heat_days_count_30d')}   {...alertProps} {...statsProps} />
                  <Stat icon="🌱" label={t('wm_spi')}            value={fmt(m.spi_1m, 2)}                 unit=""    color="#317f43" metricKey="spi_1m"                statEntry={ms('spi_1m')}                {...alertProps} {...statsProps} />
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