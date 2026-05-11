import React, { useState, useEffect } from 'react';
import api from './api/client';
import { getCurrentWeather, getWeatherMetrics } from './api/weather';
import WeatherStats from './components/WeatherStats';
import WeatherChart from './components/WeatherChart';
import logo from './assets/logo1.png';

const Dashboard = ({ userId, onLogout }) => {
  const [locations, setLocations] = useState([]);
  const [locationId, setLocationId] = useState(null);
  const [currentWeather, setCurrentWeather] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (userId) {
      setLoading(true);
      api.get(`/api/v1/user/locations`, { params: { user_id: userId } })
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

  useEffect(() => {
    if (userId && locationId) {
      getCurrentWeather(locationId, userId)
        .then(setCurrentWeather)
        .catch(() => setCurrentWeather(null));

      getWeatherMetrics(locationId, userId)
        .then(setMetrics)
        .catch(() => setMetrics(null));
    }
  }, [locationId, userId]);

  if (loading) return <div style={styles.container}>Slow free loading...</div>;

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.branding}>
          <img src={logo} style={{ width: 40 }} alt="logo" />
          <h1 style={{ fontFamily: 'var(--font-heading)' }}>SmartCrop Monitor</h1>
        </div>

        {locations.length > 0 ? (
          <div style={styles.locationSelector}>
            <label style={styles.label}>Emplacement:</label>
            <select
              value={locationId || ''}
              onChange={(e) => setLocationId(Number(e.target.value))}
              style={styles.select}
            >
              {locations.map(loc => (
                <option key={loc.id} value={loc.id}>
                  {loc.label || `Emplacement #${loc.id}`}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div style={{color: 'red'}}>No location</div>
        )}

        <button onClick={onLogout} style={styles.logoutBtn}>Logout</button>
      </header>

      {currentWeather ? (
        <div style={styles.weatherBanner}>
          <h2>{currentWeather.temp}°C | {currentWeather.weather_main}</h2>
          <p>{currentWeather.weather_description}</p>
          <p>Humidité: {currentWeather.humidity}% | Wind speed: {currentWeather.wind_speed} m/s</p>
        </div>
      ) : (
        <div style={styles.weatherBanner}>No weather data for this location</div>
      )}

      <WeatherStats metrics={metrics} />

      <div style={styles.mainGrid}>
        <div style={styles.panel}>
           <h3>Temperature history</h3>
           <WeatherChart data={metrics?.history_7d} />
        </div>

        <div style={styles.panel}>
          <h3>Soil condition</h3>
          <p><strong>Soil temperature:</strong> {currentWeather?.soil_temperature_0cm ?? '--'}°C</p>
          <p><strong>Soil moisture:</strong> {currentWeather?.soil_moisture_0_to_1cm ?? '--'}</p>
          <p><strong>Cloud coverage:</strong> {currentWeather?.cloud_coverage ?? '0'}%</p>
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
  locationSelector: {
    display: 'flex',
    alignItems: 'center',
    backgroundColor: 'var(--color-bg-magnolia)',
    padding: '5px 15px',
    borderRadius: '10px',
    border: '1px solid var(--color-accent-soil)'
  },
  label: { marginRight: '10px', fontWeight: 'bold', color: 'var(--color-accent-chernozem)' },
  select: {
    padding: '8px',
    borderRadius: '6px',
    border: '1px solid var(--color-accent-soil)',
    cursor: 'pointer',
    fontFamily: 'inherit'
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
    cursor: 'pointer',
    fontWeight: 'bold'
  }
};

export default Dashboard;