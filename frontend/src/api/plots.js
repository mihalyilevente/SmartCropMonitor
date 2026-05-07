import api from './client';

export const getPlotData = (filename, mode, filter) =>
  api.get(`/api/v1/plot-data/${filename}`, { params: { mode, filter } }).then(r => r.data);
