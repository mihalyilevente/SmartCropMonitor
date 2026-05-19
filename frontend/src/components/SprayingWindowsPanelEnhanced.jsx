import { useState, useEffect, useRef } from 'react';
import { getSprayingWindows, getCurrentSprayingWindow, calculateWindowMetrics, formatDuration } from '../api/spraying';
import { useLang } from '../context/LanguageContext';

const InteractiveTimeline = ({ windows, weatherForecast, title }) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const width = canvas.width, height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    const now = new Date(), endTime = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), totalTime = endTime - now;

    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#f8fcee'); gradient.addColorStop(1, '#e8f5e8');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = '#e1e8ed'; ctx.lineWidth = 1;
    for (let i = 0; i <= 7; i++) { const x = (i / 7) * width; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }

    if (weatherForecast?.length > 0) {
      weatherForecast.forEach(forecast => {
        const time = new Date(forecast.timestamp), x = ((time - now) / totalTime) * width;
        const temp = forecast.weather_data?.temp || 0, wind = forecast.weather_data?.wind_speed || 0, rain = forecast.weather_data?.precipitation || 0;
        let s = 1;
        if (temp < 5 || temp > 28) s *= 0.5;
        if (wind > 3.5) s *= 0.3;
        if (rain > 0.05) s *= 0.2;
        ctx.fillStyle = `rgba(49,127,67,${s * 0.3})`; ctx.fillRect(x - 5, 0, 10, height * 0.3);
      });
    }

    windows.forEach((window, index) => {
      const start = new Date(window.start), end = new Date(window.end);
      const startX = Math.max(0, ((start - now) / totalTime) * width), endX = Math.min(width, ((end - now) / totalTime) * width);
      const windowWidth = Math.max(endX - startX, 3);
      let color = window.score >= 0.8 ? '#317f43' : window.score >= 0.6 ? '#d8975a' : window.score >= 0.4 ? '#fdcb6e' : '#d63031';
      const y = height * 0.4 + (index % 3) * 25;
      ctx.fillStyle = color + '80'; ctx.fillRect(startX, y, windowWidth, 20);
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.strokeRect(startX, y, windowWidth, 20);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 10px Arial'; ctx.textAlign = 'center';
      ctx.fillText(`${Math.round(window.score * 100)}%`, startX + windowWidth / 2, y + 14);
    });

    ctx.strokeStyle = '#054e05'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, height); ctx.stroke();
  }, [windows, weatherForecast]);

  return (
    <div style={{ position: 'relative', marginTop: 20 }}>
      <h4 style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-accent-chernozem)', marginBottom: 12, fontSize: 14 }}>
        {title}
      </h4>
      <canvas ref={canvasRef} width={800} height={150} style={{ border: '1px solid var(--color-accent-soil)', borderRadius: 12, background: '#fff', cursor: 'pointer', maxWidth: '100%', height: 'auto' }} onClick={() => {}} />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 10, color: '#6c757d' }}>
        {[...Array(8)].map((_, i) => {
          const day = new Date(Date.now() + i * 24 * 60 * 60 * 1000);
          return <span key={i}>{day.toLocaleDateString('hu-HU', { weekday: 'short', day: 'numeric' })}</span>;
        })}
      </div>
    </div>
  );
};

// ── Current conditions panel ───────────────────────────────────────────────────
const CurrentConditionsPanel = ({ currentWeather, currentWindow }) => {
  const { t } = useLang();
  if (!currentWeather) return null;

  const conditions = [
    { labelKey: 'spray_enh_temp',     value: currentWeather.temp,                    unit: '°C',  good: currentWeather.temp > 5 && currentWeather.temp < 28,           icon: '🌡️' },
    { labelKey: 'spray_enh_wind',     value: currentWeather.wind_speed,              unit: 'm/s', good: currentWeather.wind_speed < 3.5,                                icon: '💨' },
    { labelKey: 'spray_enh_humidity', value: currentWeather.humidity,                unit: '%',   good: currentWeather.humidity >= 50 && currentWeather.humidity <= 85, icon: '💧' },
    { labelKey: 'spray_enh_precip',   value: currentWeather.precipitation || 0,      unit: 'mm',  good: (currentWeather.precipitation || 0) <= 0.05,                    icon: '🌧️' },
  ];
  const overallGood = conditions.filter(c => c.good).length >= 3;

  const headLabel = currentWindow
    ? t('spray_enh_cond_active')
    : overallGood
    ? t('spray_enh_cond_ok')
    : t('spray_enh_cond_poor');

  return (
    <div style={{ background: currentWindow ? 'linear-gradient(135deg, #e8f5e8, #d4f2d4)' : overallGood ? '#fff8e1' : '#ffe0e0', border: `2px solid ${currentWindow ? '#317f43' : overallGood ? '#d8975a' : '#d63031'}`, borderRadius: 16, padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 20 }}>{currentWindow ? '🌾' : overallGood ? '⚠️' : '❌'}</span>
        <h4 style={{ margin: 0, color: 'var(--color-accent-chernozem)', fontFamily: 'var(--font-heading)' }}>{headLabel}</h4>
        {currentWindow && (
          <span style={{ background: '#317f43', color: '#fff', padding: '4px 12px', borderRadius: 12, fontSize: 12, fontWeight: 700, animation: 'pulse 2s infinite' }}>
            {t('spray_enh_spray_now')}
          </span>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
        {conditions.map((condition, index) => (
          <div key={index} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: condition.good ? '#f0f8f0' : '#fff0f0', borderRadius: 10, border: `1px solid ${condition.good ? '#c8e6c9' : '#ffcdd2'}` }}>
            <span>{condition.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: '#666', fontWeight: 600 }}>{t(condition.labelKey)}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: condition.good ? '#317f43' : '#d63031' }}>{condition.value}{condition.unit}</div>
            </div>
            <span style={{ fontSize: 12, color: condition.good ? '#317f43' : '#d63031' }}>{condition.good ? '✓' : '✗'}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Main export ────────────────────────────────────────────────────────────────
const SprayingWindowsPanelEnhanced = ({ locationId, currentWeather, weatherForecast }) => {
  const { t } = useLang();
  const [open, setOpen]               = useState(true);
  const [windows, setWindows]         = useState([]);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState(null);
  const [currentWindow, setCurrentWindow] = useState(null);
  const [metrics, setMetrics]         = useState({});

  const fetchWindows = () => {
    if (!locationId) return;
    setLoading(true); setError(null);
    getSprayingWindows(locationId)
      .then(data => {
        setWindows(data || []);
        setCurrentWindow(getCurrentSprayingWindow(data || []));
        setMetrics(calculateWindowMetrics(data || []));
        setLoading(false);
      })
      .catch(() => { setError(t('spray_enh_err')); setLoading(false); });
  };

  useEffect(() => { const i = setInterval(fetchWindows, 5 * 60 * 1000); return () => clearInterval(i); }, [locationId]); // eslint-disable-line
  useEffect(() => { fetchWindows(); }, [locationId]); // eslint-disable-line

  return (
    <div style={styles.wrap}>
      <div style={styles.header} onClick={() => setOpen(v => !v)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>🌾</span>
          <span style={styles.titleStyle}>{t('spray_enh_title')}</span>
          {currentWindow && (
            <span style={{ background: '#317f43', color: '#fff', padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, animation: 'pulse 2s infinite' }}>
              {t('spray_enh_active')}
            </span>
          )}
          {metrics.totalWindows > 0 && (
            <span style={styles.metaBadge}>
              {t('spray_enh_optimal', metrics.excellentWindows, metrics.totalWindows, formatDuration(metrics.totalDuration))}
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
          <CurrentConditionsPanel currentWeather={currentWeather} currentWindow={currentWindow} />

          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>
              <div style={{ width: '100%', height: 120, borderRadius: 12, marginBottom: 16, background: '#f0f0f0' }} />
              <div>{t('spray_enh_analyzing')}</div>
            </div>
          ) : error ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#d63031' }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>⚠️</div>
              <div>{error}</div>
              <button onClick={fetchWindows} style={{ marginTop: 12, padding: '8px 16px', background: '#d63031', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
                {t('spray_enh_retry')}
              </button>
            </div>
          ) : (
            <InteractiveTimeline windows={windows} weatherForecast={weatherForecast} title={t('spray_enh_timeline')} />
          )}
        </div>
      )}
    </div>
  );
};

export default SprayingWindowsPanelEnhanced;

const styles = {
  wrap:      { background: '#fff', borderRadius: 14, border: '1px solid var(--color-accent-soil)', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', overflow: 'hidden', marginBottom: 20 },
  header:    { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 20px', cursor: 'pointer', background: 'var(--color-bg-champagne)', borderBottom: '1px solid var(--color-accent-soil)', userSelect: 'none' },
  titleStyle:{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, color: 'var(--color-accent-chernozem)' },
  metaBadge: { fontSize: 11, color: '#aaa', background: '#f0ebe3', borderRadius: 10, padding: '2px 8px' },
  body:      { padding: '16px 20px 20px', background: 'var(--color-bg-champagne)' },
  spinner:   { fontSize: 14, color: '#317f43' },
};