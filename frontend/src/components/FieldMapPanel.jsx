/**
 * FieldMapPanel.jsx
 * Mapbox GL JS — field boundaries + metric heatmap overlay.
 *
 * KEY: all map operations go through applyToMap() which queues on 'load' if needed.
 * Callback ref guarantees the div is in the DOM before mapboxgl.Map() is called.
 */

import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import api from '../api/client';

const METRIC_META = {
  ndvi:  { label: 'NDVI',  desc: 'Vegetation index',         min: -1, max: 1, ramp: ['#d73027','#fee08b','#1a9850'] },
  gndvi: { label: 'GNDVI', desc: 'Green vegetation index',   min: -1, max: 1, ramp: ['#d73027','#fee08b','#1a9850'] },
  ndre:  { label: 'NDRE',  desc: 'Red-edge vegetation',      min: -1, max: 1, ramp: ['#762a83','#f7f7f7','#1b7837'] },
  ndwi:  { label: 'NDWI',  desc: 'Water index',              min: -1, max: 1, ramp: ['#8c510a','#f5f5f5','#01665e'] },
  nmdi:  { label: 'NMDI',  desc: 'Moisture / drought index', min:  0, max: 1, ramp: ['#b2182b','#fddbc7','#2166ac'] },
};
const METRICS = Object.keys(METRIC_META);

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

// Convert UTM (zone 34N / EPSG:32634) to WGS84 [lng, lat]
// Hungary satellite data comes in UTM 34N (x≈397000-400000, y≈5280000-5300000)
function utmToWgs84(easting, northing, zone = 34) {
  const a = 6378137.0, e1sq = 0.00669437999014, k0 = 0.9996;
  const e0 = easting - 500000.0;
  const M = northing / k0;
  const mu = M / (a * (1 - e1sq/4 - 3*e1sq*e1sq/64));
  const e1 = (1 - Math.sqrt(1-e1sq)) / (1 + Math.sqrt(1-e1sq));
  const fp = mu + (3*e1/2)*Math.sin(2*mu) + (21*e1*e1/16)*Math.sin(4*mu)
           + (151*e1*e1*e1/96)*Math.sin(6*mu);
  const e2 = e1sq/(1-e1sq);
  const C1 = e2*Math.cos(fp)**2, T1 = Math.tan(fp)**2;
  const R1 = a*(1-e1sq)/Math.pow(1-e1sq*Math.sin(fp)**2, 1.5);
  const N  = a/Math.sqrt(1-e1sq*Math.sin(fp)**2);
  const D  = e0/(N*k0);
  const lat = fp - (N*Math.tan(fp)/R1) * (D*D/2
    - (5+3*T1+10*C1-4*C1*C1-9*e2)*D*D*D*D/24
    + (61+90*T1+298*C1+45*T1*T1-3*C1*C1-252*e2)*D*D*D*D*D*D/720);
  const lon0 = ((zone-1)*6 - 180 + 3) * Math.PI/180;
  const lon = lon0 + (D - (1+2*T1+C1)*D*D*D/6
    + (5-2*C1+28*T1-3*C1*C1+8*e2+24*T1*T1)*D*D*D*D*D/120) / Math.cos(fp);
  return [lon*180/Math.PI, lat*180/Math.PI]; // [lng, lat] for Mapbox
}

// Detect if coordinates are UTM (large metre values) or already WGS84
function isUtm(coords) {
  return Math.abs(coords[0]) > 180 || Math.abs(coords[1]) > 90;
}

function gridToGeoJSON(z, x, y) {
  const needsConversion = isUtm([x[0], y[0]]);
  const features = [];
  // Pre-convert x coords once (they repeat per row)
  const xWgs = needsConversion ? x.map(ex => utmToWgs84(ex, y[0])[0]) : x;
  for (let row = 0; row < y.length; row++) {
    // Convert y once per row
    const latVal = needsConversion ? utmToWgs84(x[0], y[row])[1] : y[row];
    for (let col = 0; col < x.length; col++) {
      const val = z[row]?.[col];
      if (val === null || val === undefined || isNaN(val)) continue;
      const lngVal = needsConversion ? xWgs[col] : x[col];
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lngVal, latVal] },
        properties: { value: val },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}

const FieldMapPanel = forwardRef(({ userId, locationId, locationCenter }, ref) => {
  const mapRef    = useRef(null);
  const loadedRef = useRef(false);
  const popupRef  = useRef(null);

  const [open, setOpen]                   = useState(true);
  const [fields, setFields]               = useState(null);
  const [metric, setMetric]               = useState('ndvi');
  const [metricData, setMetricData]       = useState(null);
  const [metricLoading, setMetricLoading] = useState(false);
  const [metricError, setMetricError]     = useState(null);
  const [selectedField, setSelectedField] = useState(null);
  const [mapError, setMapError]           = useState(null);

  // Expose refreshFields to parent via ref
  useImperativeHandle(ref, () => ({
    refreshFields: () => {
      if (!userId) return;
      api.get('/api/v1/user/fields', { params: { user_id: userId } })
        .then(r => setFields(r.data))
        .catch(() => {});
    },
  }));

  // Run fn(map) now if loaded, else queue on 'load'
  const applyToMap = useCallback((fn) => {
    const map = mapRef.current;
    if (!map) return;
    if (loadedRef.current) {
      fn(map);
    } else {
      map.once('load', () => fn(map));
    }
  }, []);

  // Callback ref: called by React with the real DOM node (or null on unmount)
  const mapCallbackRef = useCallback((node) => {
    if (!node) {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current    = null;
        loadedRef.current = false;
      }
      return;
    }
    if (mapRef.current) return;

    // Vite exposes env vars via import.meta.env with VITE_ prefix only.
    // process.env does not exist in Vite — reading it throws or returns undefined.
    const token = import.meta.env.VITE_MAPBOX_TOKEN || '';

    if (!token) {
      const msg = 'Mapbox token missing — set VITE_MAPBOX_TOKEN or REACT_APP_MAPBOX_TOKEN';
      console.error('[FieldMapPanel]', msg);
      setMapError(msg);
      return;
    }

    console.log('[FieldMapPanel] init — size:', node.offsetWidth, 'x', node.offsetHeight,
      '| token:', token.slice(0, 12) + '…');

    mapboxgl.accessToken = token;

    let map;
    try {
      // Restore last saved view so reload doesn't fly to wrong location
      const savedView = (() => {
        try { return JSON.parse(sessionStorage.getItem('fmp_view')); } catch { return null; }
      })();

      map = new mapboxgl.Map({
        container: node,
        style: 'mapbox://styles/mapbox/satellite-streets-v12',
        center: savedView ? [savedView.lng, savedView.lat] : [19.648, 47.728],
        zoom:   savedView ? savedView.zoom : 13,
        attributionControl: false,
        renderWorldCopies: false,
      });

      // Persist view on every move so reload restores it
      map.on('moveend', () => {
        const c = map.getCenter();
        try {
          sessionStorage.setItem('fmp_view', JSON.stringify({ lat: c.lat, lng: c.lng, zoom: map.getZoom() }));
        } catch {
          // Session storage can be unavailable in private browsing or strict modes.
        }
      });
    } catch (err) {
      const msg = 'Map init failed: ' + err.message;
      console.error('[FieldMapPanel]', msg);
      setMapError(msg);
      return;
    }

    map.on('error', e => {
      const msg = e.error?.message || String(e);
      console.error('[FieldMapPanel] runtime error:', msg);
      // Don't setMapError here — tile 404s etc are non-fatal
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new mapboxgl.ScaleControl({ maxWidth: 100 }), 'bottom-left');
    map.on('load', () => {
      console.log('[FieldMapPanel] ✅ map loaded');
      loadedRef.current = true;
    });

    mapRef.current = map;
  }, []);

  // Fetch fields
  useEffect(() => {
    if (!userId) return;
    api.get('/api/v1/user/fields', { params: { user_id: userId } })
      .then(r => setFields(r.data))
      .catch(() => setFields({ type: 'FeatureCollection', features: [] }));
  }, [userId]);

  // Fetch metric
  const loadMetric = useCallback(() => {
    if (!locationId || !userId) return;
    setMetricLoading(true);
    setMetricError(null);
    api.get(`/api/v1/location/${locationId}/latest-metrics/${metric}`, {
      params: { user_id: userId, step: 3 },
    })
      .then(r  => { setMetricData(r.data); setMetricLoading(false); })
      .catch(() => { setMetricData(null); setMetricError('No metric data'); setMetricLoading(false); });
  }, [locationId, userId, metric]);

  useEffect(() => { loadMetric(); }, [loadMetric]);

  // Fly to location center when locationId or locationCenter changes
  useEffect(() => {
    if (!locationCenter?.lat || !locationCenter?.lon) return;
    const fly = (map) => {
      map.flyTo({
        center: [locationCenter.lon, locationCenter.lat],
        zoom: 14,
        duration: 1200,
        essential: true,
      });
      // Update sessionStorage so the new center is remembered
      try {
        sessionStorage.setItem('fmp_view', JSON.stringify({
          lat: locationCenter.lat,
          lng: locationCenter.lon,
          zoom: 14,
        }));
      } catch { /* noop */ }
    };
    const map = mapRef.current;
    if (!map) return;
    if (loadedRef.current) { fly(map); } else { map.once('load', () => fly(map)); }
  }, [locationCenter]);

  // Draw field boundaries
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
            'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.55, 0.3],
          },
        });
        map.addLayer({
          id: 'fields-outline', type: 'line', source: SRC,
          paint: { 'line-color': '#86c54b', 'line-width': 2.5 },
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
              Crop: <em>${p.crop_type || '—'}</em></div>`)
            .addTo(map);
          setSelectedField(p);
        });
      }
      if (fields.features.length > 0) {
        // Only auto-fit on first load (no saved view). After that user controls zoom.
        const hasSavedView = (() => {
          try { return !!sessionStorage.getItem('fmp_view'); } catch { return false; }
        })();
        if (!hasSavedView) {
          map.fitBounds(bboxFromGeoJSON(fields), { padding: 60, maxZoom: 16, duration: 800 });
        }
      }
    });
  }, [fields, open, applyToMap]);

  // Draw metric overlay as circle layer (precise per-pixel coloring, not blurred heatmap)
  useEffect(() => {
    if (!open) return;
    applyToMap(map => {
      const HM_SRC   = 'metric-src';
      const HM_LAYER = 'metric-layer';

      if (map.getLayer(HM_LAYER)) map.removeLayer(HM_LAYER);
      if (map.getSource(HM_SRC))  map.removeSource(HM_SRC);
      if (!metricData) return;

      const { z, x, y } = metricData;
      const gj   = gridToGeoJSON(z, x, y);
      const meta = METRIC_META[metric];

      // Use reduce instead of spread to avoid stack overflow on large arrays
      let dMin = Infinity, dMax = -Infinity;
      gj.features.forEach(f => {
        const v = f.properties.value;
        if (v < dMin) dMin = v;
        if (v > dMax) dMax = v;
      });
      const dMid = dMin + (dMax - dMin) * 0.5;
      console.log('[FieldMapPanel] metric overlay:', gj.features.length, 'pts | range:', dMin.toFixed(3), '—', dMax.toFixed(3));

      map.addSource(HM_SRC, { type: 'geojson', data: gj });

      // Sharp circle pixels — no blur, tight radius so each point covers exactly
      // its 30m grid cell at current zoom without overlap bleeding.
      map.addLayer({
        id: HM_LAYER,
        type: 'circle',
        source: HM_SRC,
        paint: {
          'circle-color': [
            'interpolate', ['linear'], ['get', 'value'],
            dMin, meta.ramp[0],
            dMid, meta.ramp[1],
            dMax, meta.ramp[2],
          ],
          // Each UTM cell is 30m. At step=3 → 90m cells.
          // circle-radius in px ≈ (cell_m * zoom_scale) / 2
          // tuned so cells tile with no gap and no overlap:
          'circle-radius': [
              'interpolate', ['exponential', 1.5], ['zoom'],
              8,  0.5,
              10, 1.2,
              12, 3,
              14, 6,
              16, 12,
              18, 22,
            ],
                      'circle-opacity': 0.7,
          'circle-blur': 0,
          'circle-stroke-width': 0,
          'circle-pitch-alignment': 'map',
        },
      }, map.getLayer('fields-fill') ? 'fields-fill' : undefined);
    });
  }, [metricData, metric, open, applyToMap]);

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
          {metricLoading && <span style={styles.loadingDot} title="Loading…" />}
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

          {/* Map container — explicit px height, NO overflow:hidden on ancestors */}
          <div style={styles.mapWrap}>
            {mapError ? (
              <div style={styles.mapErrorMsg}>{mapError}</div>
            ) : (
              <div
                ref={mapCallbackRef}
                style={{ position: 'absolute', inset: 0 }}
              />
            )}

            <div style={styles.legend}>
              <div style={styles.legendTitle}>
                {meta.label} <span style={styles.legendDesc}>{meta.desc}</span>
              </div>
              <div style={{
                height: 8, borderRadius: 4, marginBottom: 3,
                background: `linear-gradient(to right, ${meta.ramp.join(',')})`,
              }} />
              <div style={styles.legendLabels}>
                <span>{meta.min}</span><span>{meta.max}</span>
              </div>
            </div>

            {selectedField && (
              <div style={styles.fieldChip}>
                <strong>{selectedField.label}</strong>
                <span style={{ opacity: 0.4 }}>·</span>
                {selectedField.crop_type}
                <button style={styles.chipClose} onClick={() => setSelectedField(null)}>×</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

const styles = {
  panel: {
    marginBottom: 20,
    borderRadius: 12,
    border: '1px solid var(--color-accent-soil)',
    // ⚠️ NO overflow:hidden here — it clips the Mapbox canvas
    background: 'var(--color-bg-magnolia)',
  },
  panelHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '12px 18px', cursor: 'pointer',
    background: 'var(--color-bg-magnolia)',
    borderRadius: '12px 12px 0 0',
    userSelect: 'none',
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
  // Explicit px height + position:relative so child position:absolute inset:0 works
  mapWrap: { position: 'relative', height: '480px', width: '100%' },
  mapErrorMsg: {
    position: 'absolute', inset: 0, display: 'flex',
    alignItems: 'center', justifyContent: 'center',
    fontSize: 13, color: '#c0392b', background: '#fff3f3',
  },
  legend: {
    position: 'absolute', bottom: 36, right: 12, zIndex: 10,
    background: 'rgba(255,255,255,0.92)', borderRadius: 8,
    padding: '8px 12px', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', minWidth: 140,
  },
  legendTitle: { fontSize: 12, fontWeight: 700, marginBottom: 4 },
  legendDesc:  { fontWeight: 400, opacity: 0.65, fontSize: 11 },
  legendLabels: { display: 'flex', justifyContent: 'space-between', fontSize: 11, opacity: 0.7 },
  fieldChip: {
    position: 'absolute', top: 12, left: 12, zIndex: 10,
    background: 'rgba(255,255,255,0.93)', borderRadius: 8, padding: '6px 12px',
    fontSize: 13, fontWeight: 500, boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
    display: 'flex', alignItems: 'center', gap: 6,
  },
  chipClose: {
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: 16, lineHeight: 1, padding: '0 2px', opacity: 0.5,
  },
};

export default FieldMapPanel;