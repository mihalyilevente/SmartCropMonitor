import api from './client';


export const getSprayingWindows = async (locationId) => {
  try {
    const response = await api.get(`/api/v1/weather/${locationId}/spraying-windows`);
    return response.data;
  } catch (error) {
    console.error('Failed to fetch spraying windows:', error);
    throw error;
  }
};


export const calculateWindowMetrics = (windows) => {
  if (!windows || windows.length === 0) {
    return {
      totalWindows: 0,
      excellentWindows: 0,
      goodWindows: 0,
      averageScore: 0,
      totalDuration: 0,
      bestWindow: null,
    };
  }

  const excellentWindows = windows.filter(w => w.score >= 0.8).length;
  const goodWindows = windows.filter(w => w.score >= 0.6 && w.score < 0.8).length;
  const averageScore = windows.reduce((sum, w) => sum + w.score, 0) / windows.length;

  const totalDuration = windows.reduce((total, window) => {
    const start = new Date(window.start);
    const end = new Date(window.end);
    return total + (end - start) / (1000 * 60 * 60);
  }, 0);

  const bestWindow = windows.reduce((best, current) =>
    current.score > (best?.score ?? 0) ? current : best, null
  );

  return {
    totalWindows: windows.length,
    excellentWindows,
    goodWindows,
    averageScore,
    totalDuration,
    bestWindow,
  };
};


export const getCurrentSprayingWindow = (windows) => {
  if (!windows || windows.length === 0) return null;

  const now = new Date();

  return windows.find(window => {
    const start = new Date(window.start);
    const end = new Date(window.end);
    return now >= start && now <= end;
  }) || null;
};

export const getNextSprayingWindow = (windows) => {
  if (!windows || windows.length === 0) return null;

  const now = new Date();

  const futureWindows = windows
    .filter(window => new Date(window.start) > now)
    .sort((a, b) => new Date(a.start) - new Date(b.start));

  return futureWindows.length > 0 ? futureWindows[0] : null;
};


export const formatDuration = (hours) => {
  if (hours < 1) {
    return `${Math.round(hours * 60)}m`;
  } else if (hours < 24) {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  } else {
    const d = Math.floor(hours / 24);
    const h = Math.round(hours % 24);
    return h > 0 ? `${d}d ${h}h` : `${d}d`;
  }
};

export const assessSprayingConditions = (weatherData) => {
  if (!weatherData) return null;

  const conditions = {
    temperature: {
      value: weatherData.temp,
      suitable: weatherData.temp > 5 && weatherData.temp < 28,
      message: weatherData.temp <= 5 ? 'Too cold' : weatherData.temp >= 28 ? 'Too hot' : 'Good',
    },
    windSpeed: {
      value: weatherData.wind_speed,
      suitable: weatherData.wind_speed < 3.5,
      message: weatherData.wind_speed >= 3.5 ? 'Too windy' : 'Good',
    },
    humidity: {
      value: weatherData.humidity,
      suitable: weatherData.humidity >= 50 && weatherData.humidity <= 85,
      message: weatherData.humidity < 50 ? 'Too dry' : weatherData.humidity > 85 ? 'Too humid' : 'Good',
    },
    precipitation: {
      value: weatherData.precipitation || weatherData.rain || 0,
      suitable: (weatherData.precipitation || weatherData.rain || 0) <= 0.05,
      message: (weatherData.precipitation || weatherData.rain || 0) > 0.05 ? 'Rain expected' : 'Dry',
    },
  };

  const overallSuitability = Object.values(conditions).every(c => c.suitable);

  return {
    conditions,
    overallSuitability,
    score: Object.values(conditions).filter(c => c.suitable).length / Object.keys(conditions).length,
  };
};