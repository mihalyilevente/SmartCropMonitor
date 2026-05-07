import api from './client';

export const getUserFiles = (userId) =>
  api.get(`/user/files?user_id=${userId}`).then(r => r.data);

export const addLocation = (userId, location) =>
  api.post(`/api/v1/locations?user_id=${userId}`, location);

export const triggerSync = () =>
  api.post('/sync-manual');
