/**
 * Dashboard.jsx
 * Main view. Collapsible panels below the header banner:
 *  0. MorningBriefingPanel — daily risk summary
 *  1. AlertsPanel          — events list + alert rules
 *  2. TasksPanel
 *  3. FieldWorkPanel
 *  4. FieldsPanel
 *  5. WeatherMetricsPanel  — latest-weather (history + metrics objects)
 *  6. WeatherCharts        — hourly time series
 *  7. SprayingWindowsPanel — optimal application times
 *  8. FieldMapPanel        — Mapbox GL JS field boundaries + heatmap
 *  9. SensorPanel          — sensor management
 */

import { useState, useEffect, useRef } from 'react';
import api from './api/client';
import { getCurrentWeather, getWeatherHistory, getWeatherMetrics } from './api/weather';
import { useFontSize } from './context/FontSizeContext';
import AlertsPanel from './components/AlertsPanel';
import TasksPanel from './components/TasksPanel';
import FieldWorkPanel from './components/FieldWorkPanel';
import FieldsPanel from './components/FieldsPanel';
import PasturePanel from './components/PasturePanel';
import SensorPanel from './components/SensorPanel';
import WeatherCharts from './components/WeatherCharts';
import WeatherMetricsPanel from './components/WeatherMetricsPanel';
import SprayingWindowsPanel from './components/SprayingWindowsPanel';
import FieldMapPanel from './components/FieldMapPanel';
import AddLocationModal from './components/AddLocationModal';
import SegmentationModal from './components/SegmentationModal';
import ManualFieldModal from './components/ManualFieldModal';
import MorningBriefingPanel from './components/MorningBriefingPanel';
import logo from './assets/logo1.png';

const Dashboard = ({ userId, onLogout }) => {
  const { largeFonts, toggleFonts } = useFontSize();

  const [locations, setLocations]           = useState([]);
  const [locationId, setLocationId]         = useState(null);
  const [locationCenter, setLocationCenter] = useState(null);
  const [currentWeather, setCurrentWeather] = useState(null);
  const [latestWeather, setLatestWeather]   = useState(null);
  const [chartData, setChartData]           = useState([]);
  const [loading, setLoading]               = useState(true);
  const [showAddLocation, setShowAddLocation]       = useState(false);
  const [showSegmentation, setShowSegmentation]     = useState(false);
  const [showManualField, setShowManualField]       = useState(false);
  const [segmentationStatus, setSegmentationStatus] = useState(null);
  const fieldMapRef = useRef(null);

  // ── data fetching ──────────────────────────────────────────────────────────
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

  useEffect(() => {
    fetchLocations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    if (!locationId || locations.length === 0) return;
    const loc = locations.find(l => l.id === locationId);
    if (loc?.lat != null && loc?.lon != null) {
      setLocationCenter({ lat: loc.lat, lon: loc.lon });
    }
  }, [locationId, locations]);

  useEffect(() => {
    if (!userId || !locationId) return;
    getCurrentWeather(locationId, userId).then(setCurrentWeather).catch(() => setCurrentWeather(null));
    getWeatherHistory(locationId, userId).then(setLatestWeather).catch(() => setLatestWeather(null));
    getWeatherMetrics(locationId, userId).then(setChartData).catch(() => setChartData([]));
  }, [locationId, userId]);

  const handleLocationAdded = (newLocation) => {
    setShowAddLocation(false);
    fetchLocations().then(() => {
      if (newLocation?.id) setLocationId(newLocation.id);
    });
  };

  const handleSegmentationConfirmed = () => {
    setShowSegmentation(false);
    setSegmentationStatus('done');
    fieldMapRef.current?.refreshFields?.();
    setTimeout(() => setSegmentationStatus(null), 4000);
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

        {/* Location selector + action buttons */}
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

          <button onClick={() => setShowAddLocation(true)} style={styles.addLocationBtn} title="Add new location">
            + Add Location
          </button>

          {locationId && (
            <button onClick={() => setShowManualField(true)} style={styles.manualFieldBtn} title="Draw a field boundary manually">
              ✏️ Draw Field
            </button>
          )}

          {locationId && (
            <button
              onClick={() => setShowSegmentation(true)}
              style={{ ...styles.segmentBtn, ...(segmentationStatus === 'done' ? styles.segmentBtnDone : {}) }}
              title="Run AI field segmentation"
            >
              {segmentationStatus === 'done' ? '✓ Fields Updated' : '🛰 Segment Fields'}
            </button>
          )}
        </div>

        {/* ── Right side: accessibility toggle + logout ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Large font toggle */}
          <button
            onClick={toggleFonts}
            title={largeFonts ? 'Switch to normal font size' : 'Switch to large font size'}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: largeFonts ? 'var(--color-accent-chernozem)' : '#f0ebe3',
              color: largeFonts ? '#fff' : 'var(--color-accent-chernozem)',
              border: `1px solid ${largeFonts ? 'var(--color-accent-chernozem)' : 'var(--color-accent-soil)'}`,
              borderRadius: 8, padding: '7px 13px',
              cursor: 'pointer', fontWeight: 700, fontSize: 13,
              fontFamily: 'inherit', transition: 'all 0.2s',
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ fontSize: largeFonts ? 17 : 14, lineHeight: 1 }}>A</span>
            <span style={{ fontSize: 11, lineHeight: 1 }}>A</span>
            <span style={{ fontSize: 10, marginLeft: 2, opacity: 0.7 }}>
              {largeFonts ? 'Large' : 'Normal'}
            </span>
          </button>

          <button onClick={onLogout} style={styles.logoutBtn}>Logout</button>
        </div>
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

      {/* ── Panels ── */}
      <MorningBriefingPanel userId={userId} locationId={locationId} chartData={chartData} />
      <AlertsPanel userId={userId} locationId={locationId} />
      <TasksPanel userId={userId} />
      <FieldWorkPanel userId={userId} locationId={locationId} />
      <FieldsPanel userId={userId} locationId={locationId} />
      <PasturePanel userId={userId} locationId={locationId} />

      <WeatherMetricsPanel latestWeather={latestWeather} userId={userId} locationId={locationId} />
      <WeatherCharts data={chartData} />
      <SprayingWindowsPanel userId={userId} locationId={locationId} />
      <FieldMapPanel ref={fieldMapRef} userId={userId} locationId={locationId} locationCenter={locationCenter} />
      <SensorPanel userId={userId} />

      {/* ── Modals ── */}
      {showAddLocation && (
        <AddLocationModal
          userId={userId}
          onClose={() => setShowAddLocation(false)}
          onSaved={handleLocationAdded}
        />
      )}

      {showManualField && locationId && (
        <ManualFieldModal
          userId={userId}
          locationId={locationId}
          onClose={() => setShowManualField(false)}
          onSaved={() => {
            setShowManualField(false);
            fieldMapRef.current?.refreshFields?.();
          }}
        />
      )}

      {showSegmentation && locationId && (
        <SegmentationModal
          userId={userId}
          locationId={locationId}
          onClose={() => setShowSegmentation(false)}
          onConfirmed={handleSegmentationConfirmed}
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
    flexWrap: 'wrap',
    gap: 8,
  },
  branding: { display: 'flex', alignItems: 'center', gap: 10 },
  locationRow: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
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
    color: '#fff', border: 'none', padding: '8px 14px',
    borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13,
    whiteSpace: 'nowrap', transition: 'opacity 0.15s',
  },
  manualFieldBtn: {
    background: 'linear-gradient(135deg, #2471a3, #1a5276)',
    color: '#fff', border: 'none', padding: '8px 16px',
    borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13,
    whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(36,113,163,0.35)',
    transition: 'opacity 0.15s', letterSpacing: '0.01em',
  },
  segmentBtn: {
    background: 'linear-gradient(135deg, #2c7a4b, #1a5c38)',
    color: '#fff', border: 'none', padding: '8px 16px',
    borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13,
    whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(44,122,75,0.35)',
    transition: 'opacity 0.15s, transform 0.1s', letterSpacing: '0.01em',
  },
  segmentBtnDone: {
    background: 'linear-gradient(135deg, #27ae60, #1e8449)',
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