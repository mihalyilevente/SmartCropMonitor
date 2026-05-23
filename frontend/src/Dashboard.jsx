import { useState, useEffect, useRef } from 'react';
import api from './api/client';
import { getCurrentWeather, getWeatherHistory, getWeatherMetrics } from './api/weather';
import { useFontSize } from './context/FontSizeContext';
import { useLang } from './context/LanguageContext';
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

// ── Tab definitions ──────────────────────────────────────────────────────────
const TABS = [
  { id: 'overview',   labelKey: 'tab_overview',   icon: '🌱' },
  { id: 'weather',    labelKey: 'tab_weather',    icon: '🌦' },
  { id: 'fields',     labelKey: 'tab_fields',     icon: '🗺️' },
  { id: 'fieldwork',  labelKey: 'tab_fieldwork',  icon: '🚜' },
  { id: 'tasks',      labelKey: 'tab_tasks',      icon: '✅' },
  { id: 'sensors',    labelKey: 'tab_sensors',    icon: '📡' },
];

// ── Compact weather badge ────────────────────────────────────────────────────
const WeatherBadge = ({ currentWeather, t }) => {
  if (!currentWeather) return (
    <div style={styles.weatherBadge}>
      <span style={{ color: '#aaa', fontSize: 13 }}>{t('no_weather')}</span>
    </div>
  );
  return (
    <div style={styles.weatherBadge}>
      <span style={{ fontSize: 22, fontWeight: 700 }}>{currentWeather.temp}°C</span>
      <span style={{ fontSize: 13, opacity: 0.75, marginLeft: 8 }}>{currentWeather.weather_main}</span>
      <span style={{ fontSize: 12, opacity: 0.55, marginLeft: 8 }}>
        💧{currentWeather.humidity}% · 💨{currentWeather.wind_speed} m/s
      </span>
    </div>
  );
};

// ── Two-column layout: panels left, map right ────────────────────────────────
const TwoColumnLayout = ({ left, mapProps }) => (
  <div style={styles.twoCol}>
    <div style={styles.leftCol}>{left}</div>
    <div style={styles.rightCol}>
      <FieldMapPanel
        ref={mapProps.ref}
        userId={mapProps.userId}
        locationId={mapProps.locationId}
        locationCenter={mapProps.locationCenter}
        onAddLocation={mapProps.onAddLocation}
        onDrawField={mapProps.onDrawField}
        onSegment={mapProps.onSegment}
        segmentationStatus={mapProps.segmentationStatus}
      />
    </div>
  </div>
);

// ── Dashboard ────────────────────────────────────────────────────────────────
const Dashboard = ({ userId, onLogout }) => {
  const { largeFonts, toggleFonts } = useFontSize();
  const { t, lang, setLang } = useLang();

  const [activeTab, setActiveTab]           = useState('overview');
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

  const mapProps = {
    ref: fieldMapRef,
    userId,
    locationId,
    locationCenter,
    onAddLocation:   () => setShowAddLocation(true),
    onDrawField:     () => setShowManualField(true),
    onSegment:       () => setShowSegmentation(true),
    segmentationStatus,
  };

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

  useEffect(() => { fetchLocations(); }, [userId]);

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

  if (loading) return <div style={styles.container}>{t('loading')}</div>;

  // ── Tab content ─────────────────────────────────────────────────────────
  const renderTabContent = () => {
    switch (activeTab) {

      case 'overview':
        return (
          <TwoColumnLayout
            mapProps={mapProps}
            left={
              <>
                <MorningBriefingPanel userId={userId} locationId={locationId} chartData={chartData} />
                <AlertsPanel userId={userId} locationId={locationId} />
                <TasksPanel userId={userId} />
              </>
            }
          />
        );

      case 'weather':
        return (
          <TwoColumnLayout
            mapProps={mapProps}
            left={
              <>
                <WeatherMetricsPanel latestWeather={latestWeather} userId={userId} locationId={locationId} />
                <WeatherCharts data={chartData} />
                <SprayingWindowsPanel userId={userId} locationId={locationId} />
              </>
            }
          />
        );

      case 'fields':
        return (
          <TwoColumnLayout
            mapProps={mapProps}
            left={
              <>
                <FieldsPanel userId={userId} locationId={locationId} />
                <PasturePanel userId={userId} locationId={locationId} />
              </>
            }
          />
        );

      case 'fieldwork':
        return (
          <TwoColumnLayout
            mapProps={mapProps}
            left={
              <FieldWorkPanel userId={userId} locationId={locationId} />
            }
          />
        );

      case 'tasks':
        return (
          <TwoColumnLayout
            mapProps={mapProps}
            left={
              <>
                <TasksPanel userId={userId} />
                <AlertsPanel userId={userId} locationId={locationId} />
              </>
            }
          />
        );

      case 'sensors':
        return (
          <TwoColumnLayout
            mapProps={mapProps}
            left={
              <>
                <SensorPanel userId={userId} />
                <WeatherMetricsPanel latestWeather={latestWeather} userId={userId} locationId={locationId} />
              </>
            }
          />
        );

      default:
        return null;
    }
  };

  return (
    <div style={styles.container}>

      {/* ── Header ── */}
      <header style={styles.header}>

        {/* Branding */}
        <div style={styles.branding}>
          <img src={logo} style={{ width: 36 }} alt="logo" />
          <h1 style={{ fontFamily: 'var(--font-heading)', margin: 0, fontSize: 18, whiteSpace: 'nowrap' }}>
            SmartCrop Monitor
          </h1>
        </div>

        {/* Location selector only – action buttons moved to FieldMapPanel */}
        <div style={styles.locationRow}>
          {locations.length > 0 ? (
            <div style={styles.locationSelector}>
              <label style={styles.label}>{t('location_label')}</label>
              <select
                value={locationId || ''}
                onChange={e => setLocationId(Number(e.target.value))}
                style={styles.select}
              >
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>
                    {loc.label || t('location_fallback', loc.id)}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div style={{ color: 'red', fontSize: 13 }}>{t('no_locations')}</div>
          )}
        </div>

        {/* Weather badge */}
        <WeatherBadge currentWeather={currentWeather} t={t} />

        {/* Right: lang + font + logout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <select value={lang} onChange={e => setLang(e.target.value)} style={styles.langSelect}>
            <option value="hu">🇭🇺 Magyar</option>
            <option value="en">🇬🇧 English</option>
            <option value="fr">🇫🇷 Français</option>
            <option value="de">🇩🇪 Deutsch</option>
          </select>

          <button
            onClick={toggleFonts}
            title={largeFonts ? t('font_switch_to_normal') : t('font_switch_to_large')}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              background: largeFonts ? 'var(--color-accent-chernozem)' : '#f0ebe3',
              color: largeFonts ? '#fff' : 'var(--color-accent-chernozem)',
              border: `1px solid ${largeFonts ? 'var(--color-accent-chernozem)' : 'var(--color-accent-soil)'}`,
              borderRadius: 8, padding: '6px 10px',
              cursor: 'pointer', fontWeight: 700, fontSize: 12,
              fontFamily: 'inherit', transition: 'all 0.2s',
            }}
          >
            <span style={{ fontSize: largeFonts ? 16 : 13 }}>A</span>
            <span style={{ fontSize: 10 }}>A</span>
          </button>

          <button onClick={onLogout} style={styles.logoutBtn}>{t('logout')}</button>
        </div>
      </header>

      {/* ── Tab navigation ── */}
      <nav style={styles.tabNav}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              ...styles.tabBtn,
              ...(activeTab === tab.id ? styles.tabBtnActive : {}),
            }}
          >
            <span style={{ fontSize: 16 }}>{tab.icon}</span>
            <span>{t(tab.labelKey) || tab.labelKey}</span>
          </button>
        ))}
      </nav>

      {/* ── Tab content ── */}
      <div style={styles.content}>
        {renderTabContent()}
      </div>

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

// ── Styles ───────────────────────────────────────────────────────────────────
const styles = {
  container: {
    backgroundColor: 'var(--color-bg-champagne)',
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
  },

  // ── Header ──
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 20px',
    borderBottom: '1px solid var(--color-accent-soil)',
    backgroundColor: 'var(--color-bg-magnolia)',
    flexWrap: 'wrap',
    position: 'sticky',
    top: 0,
    zIndex: 100,
  },
  branding: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  locationRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    flex: 1,
    minWidth: 0,
  },
  locationSelector: {
    display: 'flex',
    alignItems: 'center',
    backgroundColor: 'var(--color-bg-champagne)',
    padding: '4px 10px',
    borderRadius: 8,
    border: '1px solid var(--color-accent-soil)',
  },
  label: {
    marginRight: 8,
    fontWeight: 'bold',
    color: 'var(--color-accent-chernozem)',
    fontSize: 12,
    whiteSpace: 'nowrap',
  },
  select: {
    padding: '5px 8px',
    borderRadius: 6,
    border: '1px solid var(--color-accent-soil)',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 13,
    background: 'transparent',
  },
  addLocationBtn: {},
  manualFieldBtn: {},
  segmentBtn: {},
  segmentBtnDone: {},

  // ── Weather badge (inline in header) ──
  weatherBadge: {
    display: 'flex',
    alignItems: 'center',
    background: 'var(--color-bg-champagne)',
    border: '1px solid var(--color-accent-soil)',
    borderRadius: 8,
    padding: '5px 14px',
    flexShrink: 0,
    gap: 4,
  },

  // ── Tab nav ──
  tabNav: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '8px 20px 0',
    borderBottom: '2px solid var(--color-accent-soil)',
    backgroundColor: 'var(--color-bg-magnolia)',
    flexWrap: 'wrap',
  },
  tabBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 16px 10px',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--color-accent-chernozem)',
    opacity: 0.6,
    borderBottom: '2px solid transparent',
    marginBottom: -2,
    borderRadius: '6px 6px 0 0',
    transition: 'opacity 0.15s, background 0.15s',
  },
  tabBtnActive: {
    opacity: 1,
    background: 'var(--color-bg-champagne)',
    borderBottom: '2px solid var(--color-accent-chernozem)',
    color: 'var(--color-accent-chernozem)',
  },

  // ── Content area ──
  content: {
    flex: 1,
    padding: '16px 20px',
    overflowY: 'auto',
  },

  // ── Two-column layout ──
  twoCol: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 16,
    alignItems: 'start',
  },
  leftCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    minWidth: 0,
  },
  rightCol: {
    position: 'sticky',
    top: 8,
    minWidth: 0,
  },

  // ── Misc ──
  logoutBtn: {
    background: 'var(--color-accent-mulberry)',
    color: '#fff', border: 'none', padding: '6px 14px',
    borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: 12,
    whiteSpace: 'nowrap',
  },
  langSelect: {
    padding: '6px 8px',
    borderRadius: 8,
    border: '1px solid var(--color-accent-soil)',
    background: '#f0ebe3',
    color: 'var(--color-accent-chernozem)',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 700,
    fontFamily: 'inherit',
    outline: 'none',
  },
};

export default Dashboard;