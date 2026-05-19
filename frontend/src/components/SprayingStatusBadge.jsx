import { useState, useEffect } from 'react';
import { getSprayingWindows, getCurrentSprayingWindow, getNextSprayingWindow, assessSprayingConditions } from '../api/spraying';
import { useLang } from '../context/LanguageContext';

const SprayingStatusBadge = ({ locationId, currentWeather, compact = false }) => {
  const { t } = useLang();
  const [windows, setWindows]         = useState([]);
  const [currentWindow, setCurrentWindow] = useState(null);
  const [nextWindow, setNextWindow]   = useState(null);
  const [conditions, setConditions]   = useState(null);

  useEffect(() => {
    if (!locationId) return;
    getSprayingWindows(locationId)
      .then(data => {
        setWindows(data || []);
        setCurrentWindow(getCurrentSprayingWindow(data || []));
        setNextWindow(getNextSprayingWindow(data || []));
      })
      .catch(() => {});
  }, [locationId]);

  useEffect(() => {
    if (currentWeather) setConditions(assessSprayingConditions(currentWeather));
  }, [currentWeather]);

  let statusKey, color, icon, messageKey, messageArg;

  if (currentWindow) {
    statusKey  = 'badge_active'; color = '#317f43'; icon = '🌾'; messageKey = 'badge_optimal';
  } else if (nextWindow) {
    const hoursToNext = Math.round((new Date(nextWindow.start) - new Date()) / (1000 * 60 * 60));
    statusKey = 'badge_upcoming'; color = '#d8975a'; icon = '⏰'; messageKey = 'badge_next_window'; messageArg = hoursToNext;
  } else if (conditions?.overallSuitability) {
    statusKey = 'badge_suitable'; color = '#317f43'; icon = '✅'; messageKey = 'badge_suitable_msg';
  } else if (conditions) {
    statusKey = 'badge_unsuitable'; color = '#d63031'; icon = '❌'; messageKey = 'badge_unsuitable_msg';
  } else {
    statusKey = 'badge_unknown'; color = '#aaa'; icon = '❓'; messageKey = 'badge_no_data';
  }

  const message = messageArg !== undefined ? t(messageKey, messageArg) : t(messageKey);

  if (compact) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: color + '20', border: `1px solid ${color}`, borderRadius: 12, padding: '4px 10px', fontSize: 11, fontWeight: 600, color }}>
        <span style={{ fontSize: 12 }}>{icon}</span>
        <span>{t(statusKey)}</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: color + '15', border: `2px solid ${color}`, borderRadius: 16, padding: '8px 14px', fontSize: 13, fontWeight: 600, color, minWidth: 200, transition: 'all 0.3s ease', cursor: 'pointer' }}>
      <span style={{ fontSize: 16 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>{t(statusKey)}</div>
        <div style={{ fontSize: 11, opacity: 0.8, fontWeight: 400 }}>{message}</div>
      </div>
      {windows.length > 0 && (
        <div style={{ background: color, color: '#fff', borderRadius: 8, padding: '2px 6px', fontSize: 10, fontWeight: 700 }}>
          {windows.length}
        </div>
      )}
    </div>
  );
};

export default SprayingStatusBadge;