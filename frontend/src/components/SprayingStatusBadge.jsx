import { useState, useEffect } from 'react';
import {
  getSprayingWindows,
  getCurrentSprayingWindow,
  getNextSprayingWindow,
  assessSprayingConditions
} from '../api/spraying';

const SprayingStatusBadge = ({ locationId, currentWeather, compact = false }) => {
  const [windows, setWindows] = useState([]);
  const [currentWindow, setCurrentWindow] = useState(null);
  const [nextWindow, setNextWindow] = useState(null);
  const [conditions, setConditions] = useState(null);

  useEffect(() => {
    if (!locationId) return;

    getSprayingWindows(locationId)
      .then(windowsData => {
        setWindows(windowsData || []);
        setCurrentWindow(getCurrentSprayingWindow(windowsData || []));
        setNextWindow(getNextSprayingWindow(windowsData || []));
      })
      .catch(err => {
        console.error('Failed to fetch spraying windows for badge:', err);
      });
  }, [locationId]);

  useEffect(() => {
    if (currentWeather) {
      setConditions(assessSprayingConditions(currentWeather));
    }
  }, [currentWeather]);

  let status, color, icon, message;

  if (currentWindow) {
    status = 'ACTIVE';
    color = '#317f43';
    icon = '🌾';
    message = 'Optimal spraying window';
  } else if (nextWindow) {
    const timeToNext = new Date(nextWindow.start) - new Date();
    const hoursToNext = Math.round(timeToNext / (1000 * 60 * 60));

    status = 'UPCOMING';
    color = '#d8975a';
    icon = '⏰';
    message = `Next window in ${hoursToNext}h`;
  } else if (conditions?.overallSuitability) {
    status = 'SUITABLE';
    color = '#317f43';
    icon = '✅';
    message = 'Conditions suitable';
  } else if (conditions) {
    status = 'UNSUITABLE';
    color = '#d63031';
    icon = '❌';
    message = 'Poor conditions';
  } else {
    status = 'UNKNOWN';
    color = '#aaa';
    icon = '❓';
    message = 'No data available';
  }

  if (compact) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        background: color + '20',
        border: `1px solid ${color}`,
        borderRadius: 12,
        padding: '4px 10px',
        fontSize: 11,
        fontWeight: 600,
        color: color,
      }}>
        <span style={{ fontSize: 12 }}>{icon}</span>
        <span>{status}</span>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      background: color + '15',
      border: `2px solid ${color}`,
      borderRadius: 16,
      padding: '8px 14px',
      fontSize: 13,
      fontWeight: 600,
      color: color,
      minWidth: 200,
      transition: 'all 0.3s ease',
      cursor: 'pointer',
    }}>
      <span style={{ fontSize: 16 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>
          {status}
        </div>
        <div style={{ fontSize: 11, opacity: 0.8, fontWeight: 400 }}>
          {message}
        </div>
      </div>
      {windows.length > 0 && (
        <div style={{
          background: color,
          color: '#fff',
          borderRadius: 8,
          padding: '2px 6px',
          fontSize: 10,
          fontWeight: 700,
        }}>
          {windows.length}
        </div>
      )}
    </div>
  );
};

export default SprayingStatusBadge;