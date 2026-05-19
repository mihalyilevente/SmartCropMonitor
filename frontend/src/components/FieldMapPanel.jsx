import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import api from '../api/client';
import { useLang } from '../context/LanguageContext';

const METRIC_META = {
  ndvi:  { label: 'NDVI',  descKey: 'fmp_ndvi_desc',  min: -1, max: 1, ramp: ['#d73027','#fee08b','#1a9850'] },
  gndvi: { label: 'GNDVI', descKey: 'fmp_gndvi_desc', min: -1, max: 1, ramp: ['#d73027','#fee08b','#1a9850'] },
  ndre:  { label: 'NDRE',  descKey: 'fmp_ndre_desc',  min: -1, max: 1, ramp: ['#762a83','#f7f7f7','#1b7837'] },
  ndwi:  { label: 'NDWI',  descKey: 'fmp_ndwi_desc',  min: -1, max: 1, ramp: ['#8c510a','#f5f5f5','#01665e'] },
  nmdi:  { label: 'NMDI',  descKey: 'fmp_nmdi_desc',  min:  0, max: 1, ramp: ['#b2182b','#fddbc7','#2166ac'] },
};
const METRICS = Object.keys(METRIC_META);

const CONTOUR_SRC   = 'dem-contour-src';
const CONTOUR_LAYER = 'dem-contour-lines';
const CONTOUR_LABEL = 'dem-contour-labels';

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

function utmToWgs84(easting, northing, zone = 34) {
  const a = 6378137.0, e1sq = 0.00669437999014, k0 = 0.9996;
  const e0 = easting - 500000.0, M = northing / k0;
  const mu = M / (a * (1 - e1sq/4 - 3*e1sq*e1sq/64));
  const e1 = (1 - Math.sqrt(1-e1sq)) / (1 + Math.sqrt(1-e1sq));
  const fp = mu + (3*e1/2)*Math.sin(2*mu) + (21*e1*e1/16)*Math.sin(4*mu) + (151*e1*e1*e1/96)*Math.sin(6*mu);
  const e2 = e1sq/(1-e1sq), C1 = e2*Math.cos(fp)**2, T1 = Math.tan(fp)**2;
  const R1 = a*(1-e1sq)/Math.pow(1-e1sq*Math.sin(fp)**2, 1.5);
  const N  = a/Math.sqrt(1-e1sq*Math.sin(fp)**2), D = e0/(N*k0);
  const lat = fp - (N*Math.tan(fp)/R1) * (D*D/2 - (5+3*T1+10*C1-4*C1*C1-9*e2)*D*D*D*D/24 + (61+90*T1+298*C1+45*T1*T1-3*C1*C1-252*e2)*D*D*D*D*D*D/720);
  const lon0 = ((zone-1)*6 - 180 + 3) * Math.PI/180;
  const lon = lon0 + (D - (1+2*T1+C1)*D*D*D/6 + (5-2*C1+28*T1-3*C1*C1+8*e2+24*T1*T1)*D*D*D*D*D/120) / Math.cos(fp);
  return [lon*180/Math.PI, lat*180/Math.PI];
}

function isUtm(coords) { return Math.abs(coords[0]) > 180 || Math.abs(coords[1]) > 90; }

function gridToGeoJSON(z, x, y) {
  const needsConversion = isUtm([x[0], y[0]]);
  const features = [];
  const xWgs = needsConversion ? x.map(ex => utmToWgs84(ex, y[0])[0]) : x;
  for (let row = 0; row < y.length; row++) {
    const latVal = needsConversion ? utmToWgs84(x[0], y[row])[1] : y[row];
    for (let col = 0; col < x.length; col++) {
      const val = z[row]?.[col];
      if (val === null || val === undefined || isNaN(val)) continue;
      features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [needsConversion ? xWgs[col] : x[col], latVal] }, properties: { value: val } });
    }
  }
  return { type: 'FeatureCollection', features };
}

function addContourLayers(map, geojson) {
  if (map.getLayer(CONTOUR_LABEL)) map.removeLayer(CONTOUR_LABEL);
  if (map.getLayer(CONTOUR_LAYER)) map.removeLayer(CONTOUR_LAYER);
  if (map.getSource(CONTOUR_SRC))  map.removeSource(CONTOUR_SRC);
  map.addSource(CONTOUR_SRC, { type: 'geojson', data: geojson });
  map.addLayer({ id: CONTOUR_LAYER, type: 'line', source: CONTOUR_SRC, paint: { 'line-color': ['case', ['==',['get','index_line'],true], '#5a3e1b', 'rgba(90,62,27,0.45)'], 'line-width': ['case', ['==',['get','index_line'],true], 1.6, 0.8], 'line-opacity': 0.85 } });
  map.addLayer({ id: CONTOUR_LABEL, type: 'symbol', source: CONTOUR_SRC, filter: ['==',['get','index_line'],true], layout: { 'symbol-placement': 'line', 'text-field': ['concat',['to-string',['get','elevation']],' m'], 'text-size': 10, 'text-font': ['DIN Pro Medium','Arial Unicode MS Regular'], 'text-offset': [0,-0.4], 'symbol-spacing': 200 }, paint: { 'text-color': '#3b2a10', 'text-halo-color': 'rgba(255,255,255,0.75)', 'text-halo-width': 1.2 } });
}

function removeContourLayers(map) {
  if (map.getLayer(CONTOUR_LABEL)) map.removeLayer(CONTOUR_LABEL);
  if (map.getLayer(CONTOUR_LAYER)) map.removeLayer(CONTOUR_LAYER);
  if (map.getSource(CONTOUR_SRC))  map.removeSource(CONTOUR_SRC);
}

const FieldMapPanel = forwardRef(({ userId, locationId, locationCenter }, ref) => {
  const { t } = useLang();
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
  const [contoursOn, setContoursOn]       = useState(false);
  const [contourData, setContourData]     = useState(null);
  const [contourLoading, setContourLoading] = useState(false);
  const [contourError, setContourError]   = useState(null);
  const [contourMeta, setContourMeta]     = useState(null);

  useImperativeHandle(ref, () => ({
    refreshFields: () => {
      if (!userId) return;
      api.get('/api/v1/user/fields', { params: { user_id: userId } }).then(r => setFields(r.data)).catch(() => {});
    },
  }));

  const applyToMap = useCallback((fn) => {
    const map = mapRef.current; if (!map) return;
    if (loadedRef.current) { fn(map); } else { map.once('load', () => fn(map)); }
  }, []);

  const mapCallbackRef = useCallback((node) => {
    if (!node) { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; loadedRef.current = false; } return; }
    if (mapRef.current) return;

    const token = import.meta.env.VITE_MAPBOX_TOKEN || '';
    if (!token) { setMapError(t('fmp_map_err_token')); return; }
    mapboxgl.accessToken = token;

    let map;
    try {
      const savedView = (() => { try { return JSON.parse(sessionStorage.getItem('fmp_view')); } catch { return null; } })();
      map = new mapboxgl.Map({ container: node, style: 'mapbox://styles/mapbox/satellite-streets-v12', center: savedView ? [savedView.lng, savedView.lat] : [19.648, 47.728], zoom: savedView ? savedView.zoom : 13, attributionControl: false, renderWorldCopies: false });
      map.on('moveend', () => { const c = map.getCenter(); try { sessionStorage.setItem('fmp_view', JSON.stringify({ lat: c.lat, lng: c.lng, zoom: map.getZoom() })); } catch (_e) { /* sessionStorage unavailable */ } });
    } catch (err) { setMapError(t('fmp_map_err_init', err.message)); return; }

    map.on('error', e => console.error('[FieldMapPanel]', e.error?.message || String(e)));
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new mapboxgl.ScaleControl({ maxWidth: 100 }), 'bottom-left');
    map.on('load', () => { loadedRef.current = true; });
    mapRef.current = map;
  }, []); // eslint-disable-line

  useEffect(() => {
    if (!userId) return;
    api.get('/api/v1/user/fields', { params: { user_id: userId } }).then(r => setFields(r.data)).catch(() => setFields({ type: 'FeatureCollection', features: [] }));
  }, [userId]);

  const loadMetric = useCallback(() => {
    if (!locationId || !userId) return;
    setMetricLoading(true); setMetricError(null);
    api.get(`/api/v1/location/${locationId}/latest-metrics/${metric}`, { params: { user_id: userId, step: 3 } })
      .then(r => { setMetricData(r.data); setMetricLoading(false); })
      .catch(() => { setMetricData(null); setMetricError(t('fmp_no_metric')); setMetricLoading(false); });
  }, [locationId, userId, metric]); // eslint-disable-line

  useEffect(() => { loadMetric(); }, [loadMetric]);

  useEffect(() => {
    if (!contoursOn || !locationId || !userId || contourData) return;
    setContourLoading(true); setContourError(null);
    api.get(`/api/v1/location/${locationId}/dem-contours`, { params: { user_id: userId, interval: 10 } })
      .then(r => { setContourData(r.data); setContourMeta(r.data.meta); setContourLoading(false); })
      .catch(() => { setContourError(t('fmp_contours_err')); setContourLoading(false); setContoursOn(false); });
  }, [contoursOn, locationId, userId, contourData]); // eslint-disable-line

  useEffect(() => { setContourData(null); setContourMeta(null); setContourError(null); setContoursOn(false); }, [locationId]);

  useEffect(() => {
    if (!open) return;
    applyToMap(map => { if (contoursOn && contourData) addContourLayers(map, contourData); else removeContourLayers(map); });
  }, [contoursOn, contourData, open, applyToMap]);

  useEffect(() => {
    if (!locationCenter?.lat || !locationCenter?.lon) return;
    const fly = (map) => {
      map.flyTo({ center: [locationCenter.lon, locationCenter.lat], zoom: 14, duration: 1200, essential: true });
      try { sessionStorage.setItem('fmp_view', JSON.stringify({ lat: locationCenter.lat, lng: locationCenter.lon, zoom: 14 })); } catch (_e) { /* sessionStorage unavailable */ }
    };
    const map = mapRef.current; if (!map) return;
    if (loadedRef.current) { fly(map); } else { map.once('load', () => fly(map)); }
  }, [locationCenter]);

  useEffect(() => {
    if (!fields || !open) return;
    applyToMap(map => {
      const SRC = 'fields-src';
      if (map.getSource(SRC)) {
        map.getSource(SRC).setData(fields);
      } else {
        map.addSource(SRC, { type: 'geojson', data: fields });
        map.addLayer({ id: 'fields-fill', type: 'fill', source: SRC, paint: { 'fill-color': ['case',['==',['get','field_type'],'crop'],'rgba(134,197,75,0.25)','rgba(100,160,255,0.25)'], 'fill-opacity': ['case',['boolean',['feature-state','hover'],false],0.55,0.3] } });
        map.addLayer({ id: 'fields-outline', type: 'line', source: SRC, paint: { 'line-color': '#86c54b', 'line-width': 2.5 } });
        map.addLayer({ id: 'fields-label', type: 'symbol', source: SRC, layout: { 'text-field': ['get','label'], 'text-size': 13, 'text-font': ['DIN Pro Medium','Arial Unicode MS Regular'] }, paint: { 'text-color': '#fff', 'text-halo-color': '#1a2a12', 'text-halo-width': 1.5 } });

        let hoverId = null;
        map.on('mousemove', 'fields-fill', e => {
          map.getCanvas().style.cursor = 'pointer';
          if (hoverId !== null) map.setFeatureState({ source: SRC, id: hoverId }, { hover: false });
          hoverId = e.features[0].id;
          map.setFeatureState({ source: SRC, id: hoverId }, { hover: true });
        });
        map.on('mouseleave', 'fields-fill', () => { map.getCanvas().style.cursor = ''; if (hoverId !== null) map.setFeatureState({ source: SRC, id: hoverId }, { hover: false }); hoverId = null; });
        map.on('click', 'fields-fill', e => {
          const p = e.features[0].properties;
          if (popupRef.current) popupRef.current.remove();
          popupRef.current = new mapboxgl.Popup({ closeButton: true, maxWidth: '220px' })
            .setLngLat(e.lngLat)
            .setHTML(`<div style="font-family:sans-serif;font-size:13px;line-height:1.6"><strong style="font-size:14px">${p.label}</strong><br/>${t('fmp_popup_type')} <em>${p.field_type}</em><br/>${t('fmp_popup_crop')} <em>${p.crop_type || '—'}</em></div>`)
            .addTo(map);
          setSelectedField(p);
        });
      }
      if (fields.features.length > 0) {
        const hasSavedView = (() => { try { return !!sessionStorage.getItem('fmp_view'); } catch { return false; } })();
        if (!hasSavedView) map.fitBounds(bboxFromGeoJSON(fields), { padding: 60, maxZoom: 16, duration: 800 });
      }
    });
  }, [fields, open, applyToMap]); // eslint-disable-line

  useEffect(() => {
    if (!open) return;
    applyToMap(map => {
      const HM_SRC = 'metric-src', HM_LAYER = 'metric-layer';
      if (map.getLayer(HM_LAYER)) map.removeLayer(HM_LAYER);
      if (map.getSource(HM_SRC))  map.removeSource(HM_SRC);
      if (!metricData) return;
      const { z, x, y } = metricData;
      const gj   = gridToGeoJSON(z, x, y);
      const meta = METRIC_META[metric];
      let dMin = Infinity, dMax = -Infinity;
      gj.features.forEach(f => { const v = f.properties.value; if (v < dMin) dMin = v; if (v > dMax) dMax = v; });
      const dMid = dMin + (dMax - dMin) * 0.5;
      map.addSource(HM_SRC, { type: 'geojson', data: gj });
      map.addLayer({ id: HM_LAYER, type: 'circle', source: HM_SRC, paint: {
        'circle-color': ['interpolate',['linear'],['get','value'], dMin, meta.ramp[0], dMid, meta.ramp[1], dMax, meta.ramp[2]],
        'circle-radius': ['interpolate',['exponential',1.5],['zoom'], 8,0.5, 10,1.2, 12,3, 14,6, 16,12, 18,22],
        'circle-opacity': 0.7, 'circle-blur': 0, 'circle-stroke-width': 0, 'circle-pitch-alignment': 'map',
      } }, map.getLayer('fields-fill') ? 'fields-fill' : undefined);
    });
  }, [metricData, metric, open, applyToMap]);

  const meta = METRIC_META[metric];

  const contourTitle = !locationId
    ? t('fmp_contours_no_loc')
    : contourLoading ? t('fmp_contours_loading')
    : contourError   ? contourError
    : contoursOn     ? t('fmp_contours_hide')
    : t('fmp_contours_show');

  return (
    <div style={styles.panel}>
      <div style={styles.panelHeader} onClick={() => setOpen(v => !v)}>
        <div style={styles.panelTitle}>
          <span style={styles.panelIcon}>🗺</span>
          <span>{t('fmp_title')}</span>
          {fields && (
            <span style={styles.badge}>{t('fmp_fields_count', fields.features.length)}</span>
          )}
        </div>
        <div style={styles.panelRight}>
          {(metricLoading || contourLoading) && <span style={styles.loadingDot} title={t('loading')} />}
          <span style={styles.chevron}>{open ? '▲' : '▼'}</span>
        </div>
      </div>

      {open && (
        <div style={styles.panelBody}>
          <div style={styles.toolbar}>
            <span style={styles.toolbarLabel}>{t('fmp_overlay')}</span>
            {METRICS.map(m => (
              <button key={m} onClick={() => setMetric(m)} style={{ ...styles.metricBtn, ...(metric === m ? styles.metricBtnActive : {}) }}>
                {METRIC_META[m].label}
              </button>
            ))}

            <span style={styles.divider} />

            <button onClick={() => { if (contoursOn) setContoursOn(false); else if (locationId) setContoursOn(true); }}
              disabled={!locationId || contourLoading}
              title={contourTitle}
              style={{ ...styles.metricBtn, ...(contoursOn ? styles.contourBtnActive : {}), opacity: (!locationId || contourLoading) ? 0.45 : 1 }}>
              {contourLoading ? `⟳ ${t('fmp_contours_loading')}` : t('fmp_contours')}
            </button>

            {contoursOn && contourMeta && (
              <span style={styles.elevBadge}>
                {t('fmp_elev_range', contourMeta.elev_min, contourMeta.elev_max, contourMeta.interval_m)}
              </span>
            )}

            {metricError  && <span style={styles.errorNote}>{metricError}</span>}
            {contourError && <span style={styles.errorNote}>{contourError}</span>}
          </div>

          <div style={styles.mapWrap}>
            {mapError ? (
              <div style={styles.mapErrorMsg}>{mapError}</div>
            ) : (
              <div ref={mapCallbackRef} style={{ position: 'absolute', inset: 0 }} />
            )}

            <div style={styles.legend}>
              <div style={styles.legendTitle}>
                {meta.label} <span style={styles.legendDesc}>{t(meta.descKey)}</span>
              </div>
              <div style={{ height: 8, borderRadius: 4, marginBottom: 3, background: `linear-gradient(to right, ${meta.ramp.join(',')})` }} />
              <div style={styles.legendLabels}><span>{meta.min}</span><span>{meta.max}</span></div>
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
  panel:       { marginBottom: 20, borderRadius: 12, border: '1px solid var(--color-accent-soil)', background: 'var(--color-bg-magnolia)' },
  panelHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 18px', cursor: 'pointer', background: 'var(--color-bg-magnolia)', borderRadius: '12px 12px 0 0', userSelect: 'none' },
  panelTitle:  { display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 14 },
  panelIcon:   { fontSize: 16 },
  badge:       { background: 'var(--color-accent-soil)', color: '#fff', fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20 },
  panelRight:  { display: 'flex', alignItems: 'center', gap: 10 },
  loadingDot:  { width: 8, height: 8, borderRadius: '50%', background: '#86c54b', display: 'inline-block', animation: 'pulse 1s infinite' },
  chevron:     { fontSize: 11, opacity: 0.5 },
  panelBody:   {},
  toolbar:     { display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderTop: '1px solid var(--color-accent-soil)', flexWrap: 'wrap' },
  toolbarLabel:{ fontSize: 12, fontWeight: 600, color: 'var(--color-accent-chernozem)', marginRight: 4 },
  metricBtn:   { padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, border: '1px solid var(--color-accent-soil)', background: 'transparent', cursor: 'pointer', color: 'inherit', transition: 'all 0.15s' },
  metricBtnActive:  { background: 'var(--color-accent-soil)', color: '#fff', borderColor: 'var(--color-accent-soil)' },
  contourBtnActive: { background: '#5a3e1b', color: '#fff', borderColor: '#5a3e1b' },
  divider:     { display: 'inline-block', width: 1, height: 18, background: 'var(--color-accent-soil)', opacity: 0.35, margin: '0 4px' },
  elevBadge:   { fontSize: 11, fontWeight: 600, color: '#5a3e1b', background: 'rgba(90,62,27,0.1)', border: '1px solid rgba(90,62,27,0.25)', borderRadius: 20, padding: '2px 10px' },
  errorNote:   { fontSize: 12, color: '#c0392b', marginLeft: 8 },
  mapWrap:     { position: 'relative', height: '480px', width: '100%' },
  mapErrorMsg: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: '#c0392b', background: '#fff3f3' },
  legend:      { position: 'absolute', bottom: 36, right: 12, zIndex: 10, background: 'rgba(255,255,255,0.92)', borderRadius: 8, padding: '8px 12px', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', minWidth: 140 },
  legendTitle: { fontSize: 12, fontWeight: 700, marginBottom: 4 },
  legendDesc:  { fontWeight: 400, opacity: 0.65, fontSize: 11 },
  legendLabels:{ display: 'flex', justifyContent: 'space-between', fontSize: 11, opacity: 0.7 },
  fieldChip:   { position: 'absolute', top: 12, left: 12, zIndex: 10, background: 'rgba(255,255,255,0.93)', borderRadius: 8, padding: '6px 12px', fontSize: 13, fontWeight: 500, boxShadow: '0 2px 6px rgba(0,0,0,0.12)', display: 'flex', alignItems: 'center', gap: 6 },
  chipClose:   { background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 2px', opacity: 0.5 },
};

FieldMapPanel.displayName = 'FieldMapPanel';
export default FieldMapPanel;