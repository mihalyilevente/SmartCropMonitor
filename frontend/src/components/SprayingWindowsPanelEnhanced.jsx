import { useState, useEffect, useRef } from 'react';
import api from '../api/client';
import {
  getSprayingWindows,
  getCurrentSprayingWindow,
  getNextSprayingWindow,
  calculateWindowMetrics,
  formatDuration
} from '../api/spraying';

const InteractiveTimeline = ({ windows, weatherForecast }) => {
  const [selectedWindow, setSelectedWindow] = useState(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    drawTimeline();
  }, [windows, weatherForecast]);

  const drawTimeline = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    const now = new Date();
    const endTime = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const totalTime = endTime - now;

    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#f8fcee');
    gradient.addColorStop(1, '#e8f5e8');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = '#e1e8ed';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 7; i++) {
      const x = (i / 7) * width;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    if (weatherForecast && weatherForecast.length > 0) {
      weatherForecast.forEach((forecast, index) => {
        const time = new Date(forecast.timestamp);
        const x = ((time - now) / totalTime) * width;

        const temp = forecast.weather_data?.temp || 0;
        const wind = forecast.weather_data?.wind_speed || 0;
        const rain = forecast.weather_data?.precipitation || 0;

        let suitability = 1;
        if (temp < 5 || temp > 28) suitability *= 0.5;
        if (wind > 3.5) suitability *= 0.3;
        if (rain > 0.05) suitability *= 0.2;

        const alpha = suitability * 0.3;
        ctx.fillStyle = `rgba(49, 127, 67, ${alpha})`;
        ctx.fillRect(x - 5, 0, 10, height * 0.3);
      });
    }

    windows.forEach((window, index) => {
      const start = new Date(window.start);
      const end = new Date(window.end);

      const startX = Math.max(0, ((start - now) / totalTime) * width);
      const endX = Math.min(width, ((end - now) / totalTime) * width);
      const windowWidth = Math.max(endX - startX, 3);

      let color;
      if (window.score >= 0.8) color = '#317f43';
      else if (window.score >= 0.6) color = '#d8975a';
      else if (window.score >= 0.4) color = '#fdcb6e';
      else color = '#d63031';

      const y = height * 0.4 + (index % 3) * 25;
      ctx.fillStyle = color + '80';
      ctx.fillRect(startX, y, windowWidth, 20);

      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(startX, y, windowWidth, 20);

      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px Arial';
      ctx.textAlign = 'center';
      const text = `${Math.round(window.score * 100)}%`;
      const textX = startX + windowWidth / 2;
      ctx.fillText(text, textX, y + 14);
    });

    ctx.strokeStyle = '#054e05';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, height);
    ctx.stroke();
  };

  return (
    <div style={{ position: 'relative', marginTop: 20 }}>
      <h4 style={{
        fontFamily: 'var(--font-heading)',
        color: 'var(--color-accent-chernozem)',
        marginBottom: 12,
        fontSize: 14
      }}>
        7-Day Interactive Timeline
      </h4>

      <canvas
        ref={canvasRef}
        width={800}
        height={150}
        style={{
          border: '1px solid var(--color-accent-soil)',
          borderRadius: 12,
          background: '#fff',
          cursor: 'pointer',
          maxWidth: '100%',
          height: 'auto',
        }}
        onClick={(e) => {
          const rect = e.target.getBoundingClientRect();
          const x = e.clientX - rect.left;
        }}
      />

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginTop: 8,
        fontSize: 10,
        color: '#6c757d'
      }}>
        {[...Array(8)].map((_, i) => {
          const day = new Date(Date.now() + i * 24 * 60 * 60 * 1000);
          return (
            <span key={i}>
              {day.toLocaleDateString('en-GB', {
                weekday: 'short',
                day: 'numeric'
              })}
            </span>
          );
        })}
      </div>
    </div>
  );
};

const CurrentConditionsPanel = ({ currentWeather, currentWindow }) => {
  if (!currentWeather) return null;

  const conditions = [
    {
      label: 'Temperature',
      value: currentWeather.temp,
      unit: '°C',
      good: currentWeather.temp > 5 && currentWeather.temp < 28,
      icon: '🌡️'
    },
    {
      label: 'Wind Speed',
      value: currentWeather.wind_speed,
      unit: 'm/s',
      good: currentWeather.wind_speed < 3.5,
      icon: '💨'
    },
    {
      label: 'Humidity',
      value: currentWeather.humidity,
      unit: '%',
      good: currentWeather.humidity >= 50 && currentWeather.humidity <= 85,
      icon: '💧'
    },
    {
      label: 'Precipitation',
      value: currentWeather.precipitation || 0,
      unit: 'mm',
      good: (currentWeather.precipitation || 0) <= 0.05,
      icon: '🌧️'
    }
  ];

  const suitableCount = conditions.filter(c => c.good).length;
  const overallGood = suitableCount >= 3;

  return (
    <div style={{
      background: currentWindow ?
        'linear-gradient(135deg, #e8f5e8, #d4f2d4)' :
        overallGood ? '#fff8e1' : '#ffe0e0',
      border: `2px solid ${currentWindow ? '#317f43' : overallGood ? '#d8975a' : '#d63031'}`,
      borderRadius: 16,
      padding: 16,
      marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 20 }}>
          {currentWindow ? '🌾' : overallGood ? '⚠️' : '❌'}
        </span>
        <h4 style={{
          margin: 0,
          color: 'var(--color-accent-chernozem)',
          fontFamily: 'var(--font-heading)'
        }}>
          {currentWindow ? 'Active Spraying Window' :
           overallGood ? 'Conditions Suitable' : 'Poor Conditions'}
        </h4>
        {currentWindow && (
          <span style={{
            background: '#317f43',
            color: '#fff',
            padding: '4px 12px',
            borderRadius: 12,
            fontSize: 12,
            fontWeight: 700,
            animation: 'pulse 2s infinite',
          }}>
            SPRAY NOW
          </span>
        )}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
        gap: 8
      }}>
        {conditions.map((condition, index) => (
          <div
            key={index}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              background: condition.good ? '#f0f8f0' : '#fff0f0',
              borderRadius: 10,
              border: `1px solid ${condition.good ? '#c8e6c9' : '#ffcdd2'}`,
            }}
          >
            <span>{condition.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: '#666', fontWeight: 600 }}>
                {condition.label}
              </div>
              <div style={{
                fontSize: 14,
                fontWeight: 700,
                color: condition.good ? '#317f43' : '#d63031'
              }}>
                {condition.value}{condition.unit}
              </div>
            </div>
            <span style={{
              fontSize: 12,
              color: condition.good ? '#317f43' : '#d63031'
            }}>
              {condition.good ? '✓' : '✗'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

const SprayingWindowsPanelEnhanced = ({ locationId, userId, currentWeather, weatherForecast }) => {
  const [open, setOpen] = useState(true);
  const [windows, setWindows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [currentWindow, setCurrentWindow] = useState(null);
  const [nextWindow, setNextWindow] = useState(null);
  const [metrics, setMetrics] = useState({});

  useEffect(() => {
    const interval = setInterval(fetchWindows, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [locationId]);

  const fetchWindows = () => {
    if (!locationId) return;

    setLoading(true);
    setError(null);

    getSprayingWindows(locationId)
      .then(windowsData => {
        setWindows(windowsData || []);
        setCurrentWindow(getCurrentSprayingWindow(windowsData || []));
        setNextWindow(getNextSprayingWindow(windowsData || []));
        setMetrics(calculateWindowMetrics(windowsData || []));
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch spraying windows:', err);
        setError('Failed to load spraying windows');
        setLoading(false);
      });
  };

  useEffect(fetchWindows, [locationId]);

  return (
    <div style={styles.wrap}>
      <div style={styles.header} onClick={() => setOpen(v => !v)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>🌾</span>
          <span style={styles.titleStyle}>Spraying Analysis</span>
          {currentWindow && (
            <span style={{
              background: '#317f43',
              color: '#fff',
              padding: '4px 10px',
              borderRadius: 12,
              fontSize: 11,
              fontWeight: 700,
              animation: 'pulse 2s infinite',
            }}>
              ACTIVE
            </span>
          )}
          {metrics.totalWindows > 0 && (
            <span style={styles.metaBadge}>
              {metrics.excellentWindows}/{metrics.totalWindows} optimal •
              {formatDuration(metrics.totalDuration)} total
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
          <CurrentConditionsPanel
            currentWeather={currentWeather}
            currentWindow={currentWindow}
          />

          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>
              <div className="loading-shimmer" style={{
                width: '100%',
                height: 120,
                borderRadius: 12,
                marginBottom: 16
              }} />
              <div>Analyzing weather patterns...</div>
            </div>
          ) : error ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#d63031' }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>⚠️</div>
              <div>{error}</div>
              <button
                onClick={fetchWindows}
                style={{
                  marginTop: 12,
                  padding: '8px 16px',
                  background: '#d63031',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                }}
              >
                Retry
              </button>
            </div>
          ) : (
            <InteractiveTimeline
              windows={windows}
              weatherForecast={weatherForecast}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default SprayingWindowsPanelEnhanced;

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