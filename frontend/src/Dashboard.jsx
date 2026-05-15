/**
 * Dashboard.jsx
 * Main view. Collapsible panels below the header banner:
 *  1. WeatherMetricsPanel  — latest-weather endpoint (history + metrics objects)
 *  2. WeatherCharts        — weather-charts endpoint (hourly time series)
 *  3. SprayingWindowsPanel — spraying-windows endpoint (optimal application times)  ← NEW
 *  4. FieldMapPanel        — Mapbox GL JS: field boundaries + metric heatmap
 *  5. SensorPanel          — sensor management, status, history plots
 */

import { useState, useEffect } from 'react';
import api from './api/client';
import { getCurrentWeather, getWeatherHistory, getWeatherMetrics } from './api/weather';
import SensorPanel from './components/SensorPanel';
import WeatherCharts from './components/WeatherCharts';
import WeatherMetricsPanel from './components/WeatherMetricsPanel';
import SprayingWindowsPanel from './components/SprayingWindowsPanel';
import FieldMapPanel from './components/FieldMapPanel';
import AddLocationModal from './components/AddLocationModal';
import logo from './assets/logo1.png';

const Dashboard = ({ userId, onLogout }) => {
  const [locations, setLocations]       = useState([]);
  const [locationId, setLocationId]     = useState(null);
  const [currentWeather, setCurrentWeather] = useState(null);
  const [latestWeather, setLatestWeather]   = useState(null);   // { history, metrics }
  const [chartData, setChartData]           = useState([]);      // hourly array
  const [loading, setLoading]           = useState(true);
  const [showAddLocation, setShowAddLocation] = useState(false); // ← NEW

  // ── helpers ────────────────────────────────────────────────────────────────
  const fetchLocations = () => {
    if (!userId) return;
    setLoading(true);
    return api.get('/api/v1/user/locations', { params: { user_id: userId } })
      .then(res => {
        setLocations(res.data);
        if (res.data.length > 0 && !locationId) setLocationId(res.data[0].id);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  // Fetch locations on mount
  useEffect(() => {
    fetchLocations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Called from AddLocationModal after a successful save
  const handleLocationAdded = (newLocation) => {
    setShowAddLocation(false);
    fetchLocations().then(() => {
      if (newLocation?.id) setLocationId(newLocation.id);
    });
  };

  if (loading) return <div style={styles.container}>Loading…</div>;

  return (
    <div style={styles.container}>
      {/* ── Header ── */}
      <header style={styles.header}>
        <div style={styles.branding}>
          <img src={logo} style={{ width: 40 }} alt="logo" />
          <h1 style={{ fontFamily: 'var(--font-heading)', margin: 0 }}>SmartCrop Monitor</h1>
        </div>

        {/* Location selector + Add Location button */}
        <div style={styles.locationRow}>
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

          {/* ── Add Location button ── */}
          <button
            onClick={() => setShowAddLocation(true)}
            style={styles.addLocationBtn}
            title="Add new location"
          >
            + Add Location
          </button>
        </div>

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

      {/* ── Spraying Windows Panel ── */}
      <SprayingWindowsPanel userId={userId} locationId={locationId} />

      {/* ── Field Map (NEW) ── */}
      <FieldMapPanel userId={userId} locationId={locationId} />

      <SensorPanel userId={userId} />

      {/* ── Add Location Modal ── */}
      {showAddLocation && (
        <AddLocationModal
          userId={userId}
          onClose={() => setShowAddLocation(false)}
          onSaved={handleLocationAdded}
        />
      )}
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

  locationRow: {
    display: 'flex', alignItems: 'center', gap: 8,
  },
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
  addLocationBtn: {
    background: 'var(--color-accent-soil)',
    color: '#fff',
    border: 'none',
    padding: '8px 14px',
    borderRadius: 8,
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 13,
    whiteSpace: 'nowrap',
    transition: 'opacity 0.15s',
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