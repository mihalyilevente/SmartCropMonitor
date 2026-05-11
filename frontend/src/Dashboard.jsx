import React, { useState, useEffect } from 'react';
import api from './api/client';
import { getCurrentWeather, getWeatherMetrics } from './api/weather';
import WeatherStats from './components/WeatherStats';
import WeatherChart from './components/WeatherChart';
import logo from './assets/logo.png';

const Dashboard = ({ userId, onLogout }) => {
  const [locations, setLocations] = useState([]);
  const [locationId, setLocationId] = useState(null);
  const [currentWeather, setCurrentWeather] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (userId) {
      api.get(`/api/v1/locations/user/locations`, { params: { user_id: userId } })
        .then(res => {
          setLocations(res.data);
          if (res.data.length > 0) {
            setLocationId(res.data[0].id);
          }
          setLoading(false);
        })
        .catch(err => {
          console.error("Error fetching locations:", err);
          setLoading(false);
        });
    }
  }, [userId]);

  // 2. weather req
  useEffect(() => {
    if (userId && locationId) {
      getCurrentWeather(locationId, userId).then(setCurrentWeather).catch(() => setCurrentWeather(null));
      getWeatherMetrics(locationId, userId).then(setMetrics).catch(() => setMetrics(null));
    }
  }, [locationId, userId]);

  if (loading) return <div style={styles.container}>Loading your fields...</div>;

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.branding}>
          <img src={logo} style={{ width: 40 }} alt="logo" />
          <h1 style={{ fontFamily: 'var(--font-heading)' }}>SmartCrop Monitor</h1>
        </div>

        {/* loc choosing */}
        {locations.length > 0 && (
          <div style={styles.locationSelector}>
            <label style={styles.label}>Active Field:</label>
            <select
              value={locationId || ''}
              onChange={(e) => setLocationId(e.target.value)}
              style={styles.select}
            >
              {locations.map(loc => (
                <option key={loc.id} value={loc.id}>
                  {loc.label || `Field #${loc.id}`}
                </option>
              ))}
            </select>
          </div>
        )}

        <button onClick={onLogout} style={styles.logoutBtn}>Logout</button>
      </header>

      {currentWeather ? (
        <div style={styles.weatherBanner}>
          <h2>{currentWeather.temp}°C | {currentWeather.weather_main}</h2>
          <p>{currentWeather.weather_description}</p>
        </div>
      ) : (
        <div style={styles.weatherBanner}>No active weather data for this field.</div>
      )}

      <WeatherStats metrics={metrics} />

      <div style={styles.mainGrid}>
        <div style={styles.panel}>
           <h3>7-Day Temperature Trend</h3>
           <WeatherChart data={metrics?.history_7d} />
        </div>

        <div style={styles.panel}>
           <h3>Environmental Details</h3>
           <p><strong>Soil Temp:</strong> {currentWeather?.soil_temperature_0cm ?? '--'}°C</p>
           <p><strong>Pressure:</strong> {currentWeather?.pressure ?? '--'} hPa</p>
           <p><strong>Clouds:</strong> {currentWeather?.cloud_coverage ?? '0'}%</p>
        </div>
      </div>
    </div>
  );
};

const styles = {
  container: { padding: '20px', backgroundColor: 'var(--color-bg-champagne)', minHeight: '100vh' },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
    paddingBottom: '10px',
    borderBottom: '1px solid var(--color-accent-soil)'
  },
  branding: { display: 'flex', alignItems: 'center', gap: '10px' },
  locationSelector: { display: 'flex', alignItems: 'center', gap: '10px' },
  label: { fontWeight: '600', color: 'var(--color-accent-chernozem)' },
  select: {
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid var(--color-accent-soil)',
    backgroundColor: '#fff',
    fontFamily: 'var(--font-main)'
  },
  weatherBanner: {
    background: 'var(--color-bg-magnolia)',
    padding: '20px',
    borderRadius: '12px',
    marginBottom: '20px',
    border: '1px solid var(--color-accent-soil)'
  },
  mainGrid: { display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' },
  panel: {
    background: '#fff',
    padding: '15px',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
    border: '1px solid var(--color-bg-magnolia)'
  },
  logoutBtn: {
    background: 'var(--color-accent-mulberry)',
    color: '#fff',
    border: 'none',
    padding: '8px 15px',
    borderRadius: '6px',
    cursor: 'pointer'
  }
};

export default Dashboard;