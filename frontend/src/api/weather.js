import api from './client';

export const getCurrentWeather = (locationId, userId) =>
  api.get(`/api/v1/weather/user/weather-current`, {
    params: { location_id: locationId, user_id: userId }
  }).then(res => res.data);

export const getWeatherHistory = (locationId, userId) =>
  api.get(`/api/v1/weather/location/${locationId}/latest-weather`, {
    params: { user_id: userId }
  }).then(res => res.data);

export const getWeatherMetrics = (locationId, userId) =>
  api.get(`/api/v1/weather/location/${locationId}/weather-charts`, {
    params: { user_id: userId }
  }).then(res => res.data);