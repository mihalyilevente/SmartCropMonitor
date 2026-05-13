/**
 * Dashboard.jsx
 * Main view. Three collapsible panels below the header banner:
 *  1. WeatherMetricsPanel  — latest-weather endpoint (history + metrics objects)
 *  2. WeatherCharts        — weather-charts endpoint (hourly time series)
 *  3. SensorPanel          — sensor management, status, history plots
 */
import React, { useState, useEffect } from 'react';
import api from './api/client';
import { getCurrentWeather, getWeatherHistory, getWeatherMetrics } from './api/weather';
import SensorPanel from './components/SensorPanel';
import WeatherCharts from './components/WeatherCharts';
import WeatherMetricsPanel from './components/WeatherMetricsPanel';
import logo from './assets/logo1.png';

const Dashboard = ({ userId, onLogout }) => {
  const [locations, setLocations]       = useState([]);
  const [locationId, setLocationId]     = useState(null);
  const [currentWeather, setCurrentWeather] = useState(null);
  const [latestWeather, setLatestWeather]   = useState(null);   // { history, metrics }
  const [chartData, setChartData]           = useState([]);      // hourly array
  const [loading, setLoading]           = useState(true);

  // Fetch locations on mount
  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    api.get('/api/v1/user/locations', { params: { user_id: userId } })
      .then(res => {
        setLocations(res.data);
        if (res.data.length > 0) setLocationId(res.data[0].id);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [userId]);

  // Fetch weather data when location changes
  useEffect(() => {
    if (!userId || !locationId) return;

    // Current conditions banner
    getCurrentWeather(locationId, userId)
      .then(setCurrentWeather)
      .catch(() => setCurrentWeather(null));

    // Latest weather + metrics (WeatherMetricsPanel)
    getWeatherHistory(locationId, userId)
      .then(setLatestWeather)
      .catch(() => setLatestWeather(null));

    // Hourly time series for charts (WeatherCharts)
    getWeatherMetrics(locationId, userId)
      .then(setChartData)
      .catch(() => setChartData([]));
  }, [locationId, userId]);

  if (loading) return <div style={styles.container}>Loading…</div>;

  return (
    <div style={styles.container}>
      {/* ── Header ── */}
      <header style={styles.header}>
        <div style={styles.branding}>
          <img src={logo} style={{ width: 40 }} alt="logo" />
          <h1 style={{ fontFamily: 'var(--font-heading)', margin: 0 }}>SmartCrop Monitor</h1>
        </div>

        {locations.length > 0 ? (
          <div style={styles.locationSelector}>
            <label style={styles.label}>Location:</label>
            <select
              value={locationId || ''}
              onChange={e => setLocationId(Number(e.target.value))}
              style={styles.select}
            >
              {locations.map(loc => (
                <option key={loc.id} value={loc.id}>
                  {loc.label || `Location #${loc.id}`}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div style={{ color: 'red', fontSize: 13 }}>No locations configured</div>
        )}

        <button onClick={onLogout} style={styles.logoutBtn}>Logout</button>
      </header>

      {/* ── Current weather banner ── */}
      {currentWeather ? (
        <div style={styles.weatherBanner}>
          <h2 style={{ margin: '0 0 4px' }}>
            {currentWeather.temp}°C &nbsp;·&nbsp; {currentWeather.weather_main}
          </h2>
          <p style={{ margin: '0 0 4px', opacity: 0.8 }}>{currentWeather.weather_description}</p>
          <p style={{ margin: 0, fontSize: 13, opacity: 0.7 }}>
            Humidity: {currentWeather.humidity}% &nbsp;·&nbsp; Wind: {currentWeather.wind_speed} m/s
          </p>
        </div>
      ) : (
        <div style={{ ...styles.weatherBanner, color: '#aaa' }}>No weather data for this location</div>
      )}

      {/* ── Collapsible panels ── */}
      <WeatherMetricsPanel latestWeather={latestWeather} />
      <WeatherCharts data={chartData} />
      <SensorPanel userId={userId} />
    </div>
  );
};

const styles = {
  container: {
    padding: '20px',
    backgroundColor: 'var(--color-bg-champagne)',
    minHeight: '100vh',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 12,
    borderBottom: '1px solid var(--color-accent-soil)',
  },
  branding: { display: 'flex', alignItems: 'center', gap: 10 },
  locationSelector: {
    display: 'flex', alignItems: 'center',
    backgroundColor: 'var(--color-bg-magnolia)',
    padding: '5px 15px', borderRadius: 10,
    border: '1px solid var(--color-accent-soil)',
  },
  label: { marginRight: 10, fontWeight: 'bold', color: 'var(--color-accent-chernozem)', fontSize: 13 },
  select: {
    padding: '7px 10px', borderRadius: 6,
    border: '1px solid var(--color-accent-soil)',
    cursor: 'pointer', fontFamily: 'inherit', fontSize: 13,
  },
  weatherBanner: {
    background: 'var(--color-bg-magnolia)',
    padding: '18px 24px', borderRadius: 12, marginBottom: 20,
    border: '1px solid var(--color-accent-soil)',
  },
  logoutBtn: {
    background: 'var(--color-accent-mulberry)',
    color: '#fff', border: 'none', padding: '8px 16px',
    borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: 13,
  },
};

export default Dashboard;