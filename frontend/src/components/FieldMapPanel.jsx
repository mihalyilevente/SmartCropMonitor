/**
 * FieldMapPanel.jsx
 * Mapbox GL JS — field boundaries + metric heatmap overlay.
 *
 * Architecture: all map operations go through applyToMap(), which either
 * runs immediately (map already loaded) or queues via map.once('load').
 * This eliminates every timing race between data fetches and map init.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import api from '../api/client';

// ── colour ramps ──────────────────────────────────────────────────────────────
const METRIC_META = {
  ndvi:  { label: 'NDVI',  desc: 'Vegetation index',         min: -1, max: 1, ramp: ['#d73027','#fee08b','#1a9850'] },
  gndvi: { label: 'GNDVI', desc: 'Green vegetation index',   min: -1, max: 1, ramp: ['#d73027','#fee08b','#1a9850'] },
  ndre:  { label: 'NDRE',  desc: 'Red-edge vegetation',      min: -1, max: 1, ramp: ['#762a83','#f7f7f7','#1b7837'] },
  ndwi:  { label: 'NDWI',  desc: 'Water index',              min: -1, max: 1, ramp: ['#8c510a','#f5f5f5','#01665e'] },
  nmdi:  { label: 'NMDI',  desc: 'Moisture / drought index', min:  0, max: 1, ramp: ['#b2182b','#fddbc7','#2166ac'] },
};
const METRICS = Object.keys(METRIC_META);

// ── helpers ───────────────────────────────────────────────────────────────────
function bboxFromGeoJSON(geojson) {
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  geojson.features.forEach(f => {
    const coords = f.geometry.coordinates.flat(Infinity);
    for (let i = 0; i < coords.length; i += 2) {
      if (coords[i]   < minLng) minLng = coords[i];
      if (coords[i]   > maxLng) maxLng = coords[i];
      if (coords[i+1] < minLat) minLat = coords[i+1];
      if (coords[i+1] > maxLat) maxLat = coords[i+1];
    }
  });
  return [[minLng, minLat], [maxLng, maxLat]];
}

function gridToGeoJSON(z, x, y) {
  const features = [];
  for (let row = 0; row < y.length; row++) {
    for (let col = 0; col < x.length; col++) {
      const val = z[row]?.[col];
      if (val === null || val === undefined || isNaN(val)) continue;
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [x[col], y[row]] },
        properties: { value: val },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}

// ── component ─────────────────────────────────────────────────────────────────
const FieldMapPanel = ({ userId, locationId }) => {
  const mapRef    = useRef(null);   // mapboxgl.Map instance
  const loadedRef = useRef(false);  // true once map 'load' event has fired
  const popupRef  = useRef(null);

  const [open, setOpen]                   = useState(true);
  const [fields, setFields]               = useState(null);
  const [metric, setMetric]               = useState('ndvi');
  const [metricData, setMetricData]       = useState(null);
  const [metricLoading, setMetricLoading] = useState(false);
  const [metricError, setMetricError]     = useState(null);
  const [selectedField, setSelectedField] = useState(null);

  // ── applyToMap ──────────────────────────────────────────────────────────────
  // Run fn(map) immediately if map is loaded, otherwise queue on 'load'.
  // This is the single place that bridges the async gap.
  const applyToMap = useCallback((fn) => {
    const map = mapRef.current;
    if (!map) return;
    if (loadedRef.current) {
      fn(map);
    } else {
      map.once('load', () => fn(map));
    }
  }, []);

  // ── 1. init map via callback ref ────────────────────────────────────────────
  const mapCallbackRef = useCallback((node) => {
    if (!node) {
      // node === null: React is unmounting the div — clean up
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current   = null;
        loadedRef.current = false;
      }
      return;
    }
    if (mapRef.current) return; // already initialised

    const token =
      (typeof import.meta !== 'undefined' && import.meta.env?.VITE_MAPBOX_TOKEN) ||
      (typeof process !== 'undefined'      && process.env?.REACT_APP_MAPBOX_TOKEN) ||
      '';

    if (!token) {
      console.error('[FieldMapPanel] No Mapbox token found. Set VITE_MAPBOX_TOKEN or REACT_APP_MAPBOX_TOKEN.');
      return;
    }

    mapboxgl.accessToken = token;

    let map;
    try {
      map = new mapboxgl.Map({
        container: node,
        style: 'mapbox://styles/mapbox/satellite-streets-v12',
        center: [19.648, 47.728],
        zoom: 13,
        attributionControl: false,
      });
    } catch (err) {
      console.error('[FieldMapPanel] mapboxgl.Map() failed:', err);
      return;
    }

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new mapboxgl.ScaleControl({ maxWidth: 100 }), 'bottom-left');

    // Mark as loaded — pending applyToMap callbacks will fire from their own once('load')
    map.on('load', () => { loadedRef.current = true; });

    mapRef.current = map;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Collapse: destroy map so it re-creates cleanly when opened again
  useEffect(() => {
    if (!open && mapRef.current) {
      mapRef.current.remove();
      mapRef.current    = null;
      loadedRef.current = false;
    }
  }, [open]);

  // ── 2. fetch fields ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    api.get('/api/v1/user/fields', { params: { user_id: userId } })
      .then(r => setFields(r.data))
      .catch(() => setFields({ type: 'FeatureCollection', features: [] }));
  }, [userId]);

  // ── 3. fetch metric ─────────────────────────────────────────────────────────
  const loadMetric = useCallback(() => {
    if (!locationId || !userId) return;
    setMetricLoading(true);
    setMetricError(null);
    api.get(`/api/v1/location/${locationId}/latest-metrics/${metric}`, {
      params: { user_id: userId, step: 3 },
    })
      .then(r  => { setMetricData(r.data); setMetricLoading(false); })
      .catch(() => { setMetricData(null); setMetricError('No metric data available'); setMetricLoading(false); });
  }, [locationId, userId, metric]);

  useEffect(() => { loadMetric(); }, [loadMetric]);

  // ── 4. draw field boundaries ─────────────────────────────────────────────────
  useEffect(() => {
    if (!fields || !open) return;
    applyToMap(map => {
      const SRC = 'fields-src';
      if (map.getSource(SRC)) {
        map.getSource(SRC).setData(fields);
      } else {
        map.addSource(SRC, { type: 'geojson', data: fields });

        map.addLayer({
          id: 'fields-fill', type: 'fill', source: SRC,
          paint: {
            'fill-color': ['case',
              ['==', ['get', 'field_type'], 'crop'], 'rgba(134,197,75,0.25)',
              'rgba(100,160,255,0.25)',
            ],
            'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.5, 0.25],
          },
        });
        map.addLayer({
          id: 'fields-outline', type: 'line', source: SRC,
          paint: { 'line-color': '#86c54b', 'line-width': 2, 'line-opacity': 0.9 },
        });
        map.addLayer({
          id: 'fields-label', type: 'symbol', source: SRC,
          layout: {
            'text-field': ['get', 'label'],
            'text-size': 13,
            'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
          },
          paint: {
            'text-color': '#fff',
            'text-halo-color': '#1a2a12',
            'text-halo-width': 1.5,
          },
        });

        let hoverId = null;
        map.on('mousemove', 'fields-fill', e => {
          map.getCanvas().style.cursor = 'pointer';
          if (hoverId !== null) map.setFeatureState({ source: SRC, id: hoverId }, { hover: false });
          hoverId = e.features[0].id;
          map.setFeatureState({ source: SRC, id: hoverId }, { hover: true });
        });
        map.on('mouseleave', 'fields-fill', () => {
          map.getCanvas().style.cursor = '';
          if (hoverId !== null) map.setFeatureState({ source: SRC, id: hoverId }, { hover: false });
          hoverId = null;
        });
        map.on('click', 'fields-fill', e => {
          const p = e.features[0].properties;
          if (popupRef.current) popupRef.current.remove();
          popupRef.current = new mapboxgl.Popup({ closeButton: true, maxWidth: '220px' })
            .setLngLat(e.lngLat)
            .setHTML(`<div style="font-family:sans-serif;font-size:13px;line-height:1.6">
              <strong style="font-size:14px">${p.label}</strong><br/>
              Type: <em>${p.field_type}</em><br/>
              Crop: <em>${p.crop_type || '—'}</em>
            </div>`)
            .addTo(map);
          setSelectedField(p);
        });
      }

      if (fields.features.length > 0) {
        const bbox = bboxFromGeoJSON(fields);
        map.fitBounds(bbox, { padding: 60, maxZoom: 16, duration: 800 });
      }
    });
  }, [fields, open, applyToMap]);

  // ── 5. draw metric heatmap ───────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    applyToMap(map => {
      const HM_SRC   = 'metric-src';
      const HM_LAYER = 'metric-heatmap';

      if (map.getLayer(HM_LAYER)) map.removeLayer(HM_LAYER);
      if (map.getSource(HM_SRC))  map.removeSource(HM_SRC);
      if (!metricData) return;

      const { z, x, y } = metricData;
      const gj   = gridToGeoJSON(z, x, y);
      const meta = METRIC_META[metric];

      map.addSource(HM_SRC, { type: 'geojson', data: gj });
      map.addLayer({
        id: HM_LAYER, type: 'heatmap', source: HM_SRC, maxzoom: 18,
        paint: {
          'heatmap-weight': [
            'interpolate', ['linear'], ['get', 'value'],
            meta.min, 0, meta.max, 1,
          ],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 10, 0.8, 16, 2.5],
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0, 'rgba(0,0,0,0)', 0.2, meta.ramp[0], 0.5, meta.ramp[1], 1, meta.ramp[2],
          ],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 10, 16, 24],
          'heatmap-opacity': 0.75,
        },
      }, map.getLayer('fields-fill') ? 'fields-fill' : undefined);
    });
  }, [metricData, metric, open, applyToMap]);

  // ── render ───────────────────────────────────────────────────────────────────
  const meta = METRIC_META[metric];

  return (
    <div style={styles.panel}>
      <div style={styles.panelHeader} onClick={() => setOpen(v => !v)}>
        <div style={styles.panelTitle}>
          <span style={styles.panelIcon}>🗺</span>
          <span>Field Map &amp; Metrics</span>
          {fields && (
            <span style={styles.badge}>
              {fields.features.length} field{fields.features.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div style={styles.panelRight}>
          {metricLoading && <span style={styles.loadingDot} title="Loading metric…" />}
          <span style={styles.chevron}>{open ? '▲' : '▼'}</span>
        </div>
      </div>

      {open && (
        <div style={styles.panelBody}>
          <div style={styles.toolbar}>
            <span style={styles.toolbarLabel}>Overlay:</span>
            {METRICS.map(m => (
              <button
                key={m}
                onClick={() => setMetric(m)}
                style={{ ...styles.metricBtn, ...(metric === m ? styles.metricBtnActive : {}) }}
              >
                {METRIC_META[m].label}
              </button>
            ))}
            {metricError && <span style={styles.errorNote}>{metricError}</span>}
          </div>

          <div style={styles.mapWrap}>
            <div ref={mapCallbackRef} style={styles.map} />

            <div style={styles.legend}>
              <div style={styles.legendTitle}>
                {meta.label} <span style={styles.legendDesc}>{meta.desc}</span>
              </div>
              <div style={{
                ...styles.legendGradient,
                background: `linear-gradient(to right, ${meta.ramp.join(',')})`,
              }} />
              <div style={styles.legendLabels}>
                <span>{meta.min}</span><span>{meta.max}</span>
              </div>
            </div>

            {selectedField && (
              <div style={styles.fieldChip}>
                <strong>{selectedField.label}</strong>
                <span style={styles.chipSep}>·</span>
                {selectedField.crop_type}
                <button style={styles.chipClose} onClick={() => setSelectedField(null)}>×</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ── styles ────────────────────────────────────────────────────────────────────
const styles = {
  panel: {
    marginBottom: 20, borderRadius: 12,
    border: '1px solid var(--color-accent-soil)',
    overflow: 'hidden', background: 'var(--color-bg-magnolia)',
  },
  panelHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '12px 18px', cursor: 'pointer',
    background: 'var(--color-bg-magnolia)', userSelect: 'none',
  },
  panelTitle: { display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 14 },
  panelIcon: { fontSize: 16 },
  badge: {
    background: 'var(--color-accent-soil)', color: '#fff',
    fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
  },
  panelRight: { display: 'flex', alignItems: 'center', gap: 10 },
  loadingDot: {
    width: 8, height: 8, borderRadius: '50%', background: '#86c54b',
    display: 'inline-block', animation: 'pulse 1s infinite',
  },
  chevron: { fontSize: 11, opacity: 0.5 },
  panelBody: {},
  toolbar: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '10px 16px',
    borderTop: '1px solid var(--color-accent-soil)', flexWrap: 'wrap',
  },
  toolbarLabel: { fontSize: 12, fontWeight: 600, color: 'var(--color-accent-chernozem)', marginRight: 4 },
  metricBtn: {
    padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
    border: '1px solid var(--color-accent-soil)',
    background: 'transparent', cursor: 'pointer', color: 'inherit', transition: 'all 0.15s',
  },
  metricBtnActive: {
    background: 'var(--color-accent-soil)', color: '#fff',
    borderColor: 'var(--color-accent-soil)',
  },
  errorNote: { fontSize: 12, color: '#c0392b', marginLeft: 8 },
  mapWrap: { position: 'relative', height: 480 },
  map: { width: '100%', height: '100%' },
  legend: {
    position: 'absolute', bottom: 36, right: 12,
    background: 'rgba(255,255,255,0.92)', borderRadius: 8,
    padding: '8px 12px', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', minWidth: 140,
  },
  legendTitle:    { fontSize: 12, fontWeight: 700, marginBottom: 4 },
  legendDesc:     { fontWeight: 400, opacity: 0.65, fontSize: 11 },
  legendGradient: { height: 8, borderRadius: 4, marginBottom: 3 },
  legendLabels:   { display: 'flex', justifyContent: 'space-between', fontSize: 11, opacity: 0.7 },
  fieldChip: {
    position: 'absolute', top: 12, left: 12,
    background: 'rgba(255,255,255,0.93)', borderRadius: 8, padding: '6px 12px',
    fontSize: 13, fontWeight: 500, boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
    display: 'flex', alignItems: 'center', gap: 6,
  },
  chipSep:   { opacity: 0.4 },
  chipClose: {
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: 16, lineHeight: 1, padding: '0 2px', opacity: 0.5,
  },
};

export default FieldMapPanel;