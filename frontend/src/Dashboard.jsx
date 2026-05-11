import React, { useState, useEffect } from 'react';
import { getCurrentWeather, getWeatherMetrics } from './api/weather';
import WeatherStats from './components/WeatherStats';
import WeatherChart from './components/WeatherChart';
import logo from './assets/logo.png'; // Correct asset import

const Dashboard = ({ userId, onLogout }) => {
  const [currentWeather, setCurrentWeather] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [locationId, setLocationId] = useState(1); // Default location

  useEffect(() => {
    getCurrentWeather(locationId).then(setCurrentWeather);
    getWeatherMetrics(locationId).then(setMetrics);
  }, [locationId]);

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.branding}>
          <img src={logo} style={{ width: 40 }} alt="logo" />
          <h1 style={{ fontFamily: 'var(--font-heading)' }}>SmartCrop Monitor</h1>
        </div>
        <button onClick={onLogout} style={styles.logoutBtn}>Logout</button>
      </header>

      {currentWeather && (
        <div style={styles.weatherBanner}>
          <h2>Current: {currentWeather.temp}°C | {currentWeather.weather_description}</h2>
          <p>Humidity: {currentWeather.humidity}% | Wind: {currentWeather.wind_speed} m/s</p>
        </div>
      )}

      {/* Renders Haskell-calculated metrics */}
      <WeatherStats metrics={metrics} />

      <div style={styles.mainGrid}>
        <div style={styles.panel}>
           <h3>Temperature History (7 Days)</h3>
           {/* Backend sends data as { t, dt } */}
           <WeatherChart data={metrics?.history_7d} />
        </div>

        <div style={styles.panel}>
           <h3>Soil Conditions</h3>
           <p>Last recorded moisture: {currentWeather?.soil_moisture_0_to_1cm ?? 'N/A'}</p>
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
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
    color: 'var(--color-accent-chernozem)'
  },
  logoutBtn: {
    background: 'var(--color-accent-mulberry)',
    color: '#fff',
    border: 'none',
    padding: '8px 15px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: '600'
  }
};

export default Dashboard;