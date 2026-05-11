import api from './client';

export const getCurrentWeather = (locationId) =>
  api.get(`/api/v1/weather/current/${locationId}`).then(res => res.data);

export const getWeatherHistory = (locationId) =>
  api.get(`/api/v1/weather/history/${locationId}`).then(res => res.data);

export const getWeatherMetrics = (locationId) =>
  api.get(`/api/v1/weather/metrics/${locationId}`).then(res => res.data);