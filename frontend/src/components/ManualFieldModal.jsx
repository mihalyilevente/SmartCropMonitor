/**
 * ManualFieldModal.jsx
 *
 * Draw a field polygon on a Mapbox satellite map, fill in metadata, save.
 *
 * Dependencies (already in most Mapbox setups):
 *   npm i @mapbox/mapbox-gl-draw
 *
 * Flow:
 *  1. Map loads → MapboxDraw initialised in draw_polygon mode
 *  2. User clicks vertices → clicks first point to close → polygon appears
 *  3. Sidebar shows area + form fields (label, field_type, crop_type, season_year)
 *  4. "Save Field" → POST /api/v1/manual-add-field
 */

import { useState, useRef, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import 'mapbox-gl/dist/mapbox-gl.css';
import api from '../api/client';

/* ─── palette ─── */
const CLR = {
  soil:    '#6B4226',
  magnolia:'#FAF7F2',
  green:   '#27ae60',
  blue:    '#2980b9',
};

/* ─── field type options (must match backend FieldType enum) ─── */
const FIELD_TYPES = [
  { value: 'crop',        label: '🌾 Crop' },
  { value: 'pasture',     label: '🐄 Pasture' },
  { value: 'hayfield',    label: '🌿 Hayfield' },
  { value: 'orchard',     label: '🍎 Orchard' },
  { value: 'vineyard',    label: '🍇 Vineyard' },
  { value: 'greenhouse',  label: '🏠 Greenhouse' },
  { value: 'fallow',      label: '🟫 Fallow' },
  { value: 'other',       label: '⬜ Other' },
];

/* ─── geodesic area (Shoelace on a sphere, good enough for fields) ─── */
function calcAreaHa(polygon) {
  // polygon = GeoJSON Polygon coords[0] (outer ring)
  const R = 6371008.8; // Earth radius m
  const coords = polygon[0];
  if (!coords || coords.length < 3) return 0;
  let area = 0;
  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    const [lng1, lat1] = coords[j].map(v => v * Math.PI / 180);
    const [lng2, lat2] = coords[i].map(v => v * Math.PI / 180);
    area += (lng2 - lng1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }
  return Math.abs(area * R * R / 2) / 10000; // → hectares
}

/* ─── Draw custom styles: bright lime outline while drawing ─── */
const DRAW_STYLES = [
  // Active polygon fill
  { id: 'gl-draw-polygon-fill-active', type: 'fill', filter: ['all', ['==', '$type', 'Polygon'], ['==', 'active', 'true']],
    paint: { 'fill-color': 'rgba(46,204,113,0.20)', 'fill-outline-color': '#2ecc71' } },
  // Inactive polygon fill
  { id: 'gl-draw-polygon-fill-inactive', type: 'fill', filter: ['all', ['==', '$type', 'Polygon'], ['==', 'active', 'false']],
    paint: { 'fill-color': 'rgba(41,128,185,0.25)', 'fill-outline-color': '#2980b9' } },
  // Active stroke
  { id: 'gl-draw-polygon-stroke-active', type: 'line', filter: ['all', ['==', '$type', 'Polygon'], ['==', 'active', 'true']],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#2ecc71', 'line-width': 2.5, 'line-dasharray': [2, 2] } },
  // Inactive stroke
  { id: 'gl-draw-polygon-stroke-inactive', type: 'line', filter: ['all', ['==', '$type', 'Polygon'], ['==', 'active', 'false']],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#2980b9', 'line-width': 2 } },
  // Midpoint handles
  { id: 'gl-draw-polygon-midpoint', type: 'circle', filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'midpoint']],
    paint: { 'circle-radius': 4, 'circle-color': '#fff', 'circle-stroke-width': 2, 'circle-stroke-color': '#2ecc71' } },
  // Vertex handles (active)
  { id: 'gl-draw-polygon-and-line-vertex-active', type: 'circle',
    filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'vertex'], ['==', 'active', 'true']],
    paint: { 'circle-radius': 6, 'circle-color': '#fff', 'circle-stroke-width': 2.5, 'circle-stroke-color': '#2ecc71' } },
  // Vertex handles (inactive)
  { id: 'gl-draw-polygon-and-line-vertex-inactive', type: 'circle',
    filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'vertex'], ['==', 'active', 'false']],
    paint: { 'circle-radius': 5, 'circle-color': '#fff', 'circle-stroke-width': 2, 'circle-stroke-color': '#2980b9' } },
  // Line drawing guide
  { id: 'gl-draw-line-active', type: 'line', filter: ['all', ['==', '$type', 'LineString'], ['==', 'active', 'true']],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#2ecc71', 'line-width': 2, 'line-dasharray': [2, 2] } },
];

/* ─── Main modal ─── */
export default function ManualFieldModal({ userId: _userId, locationId, onClose, onSaved }) {
  const mapRef    = useRef(null);
  const drawRef   = useRef(null);
  const loadedRef = useRef(false);

  const [drawnGeom,  setDrawnGeom]  = useState(null);  // GeoJSON Polygon
  const [areaHa,     setAreaHa]     = useState(null);
  const [drawMode,   setDrawMode]   = useState('idle'); // idle | drawing | done
  const [phase,      setPhase]      = useState('ready'); // ready | saving | saved | error

  /* form */
  const [label,      setLabel]      = useState('');
  const [fieldType,  setFieldType]  = useState('crop');
  const [cropType,   setCropType]   = useState('');
  const [seasonYear, setSeasonYear] = useState(new Date().getFullYear());
  const [errorMsg,   setErrorMsg]   = useState('');

  /* ── Init map + draw ── */
  const mapCallbackRef = useCallback((node) => {
    if (!node) {
      drawRef.current = null;
      mapRef.current?.remove();
      mapRef.current    = null;
      loadedRef.current = false;
      return;
    }
    if (mapRef.current) return;

    const token = import.meta.env.VITE_MAPBOX_TOKEN || '';
    if (!token) { console.error('[ManualFieldModal] no VITE_MAPBOX_TOKEN'); return; }

    mapboxgl.accessToken = token;

    const savedView = (() => {
      try { return JSON.parse(sessionStorage.getItem('fmp_view')); } catch { return null; }
    })();

    const map = new mapboxgl.Map({
      container: node,
      style: 'mapbox://styles/mapbox/satellite-streets-v12',
      center: savedView ? [savedView.lng, savedView.lat] : [19.648, 47.728],
      zoom:   savedView ? savedView.zoom : 14,
      attributionControl: false,
      renderWorldCopies: false,
    });

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new mapboxgl.ScaleControl({ maxWidth: 100 }), 'bottom-left');

    const draw = new MapboxDraw({
      displayControlsDefault: false,
      styles: DRAW_STYLES,
    });
    map.addControl(draw, 'top-left');
    drawRef.current = draw;

    map.on('load', () => {
      loadedRef.current = true;
    });

    /* polygon created */
    map.on('draw.create', (e) => {
      const feature = e.features[0];
      if (!feature) return;
      const geom = feature.geometry; // Polygon
      const ha   = calcAreaHa(geom.coordinates);
      setDrawnGeom(geom);
      setAreaHa(ha);
      setDrawMode('done');
      // Switch to simple_select so user can adjust vertices
      draw.changeMode('simple_select', { featureIds: [feature.id] });
    });

    /* polygon updated (vertex drag) */
    map.on('draw.update', (e) => {
      const feature = e.features[0];
      if (!feature) return;
      const geom = feature.geometry;
      const ha   = calcAreaHa(geom.coordinates);
      setDrawnGeom(geom);
      setAreaHa(ha);
    });

    /* polygon deleted */
    map.on('draw.delete', () => {
      setDrawnGeom(null);
      setAreaHa(null);
      setDrawMode('idle');
    });

    mapRef.current = map;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Start drawing ── */
  const startDraw = () => {
    const draw = drawRef.current;
    if (!draw) return;
    draw.deleteAll();
    setDrawnGeom(null);
    setAreaHa(null);
    setDrawMode('drawing');
    draw.changeMode('draw_polygon');
  };

  /* ── Undo last vertex (only while drawing) ── */
  const undoVertex = () => {
    const draw = drawRef.current;
    if (!draw || drawMode !== 'drawing') return;
    // MapboxDraw doesn't expose undo, but trash() removes selected; while
    // draw_polygon is active it removes the last drawn vertex.
    try { draw.trash(); } catch { /* noop */ }
  };

  /* ── Reset / redraw ── */
  const resetDraw = () => {
    const draw = drawRef.current;
    if (!draw) return;
    draw.deleteAll();
    setDrawnGeom(null);
    setAreaHa(null);
    setDrawMode('idle');
  };

  /* ── Save ── */
  const handleSave = async () => {
    if (!drawnGeom || !label.trim()) return;
    setPhase('saving');
    setErrorMsg('');

    // Backend expects MULTIPOLYGON
    const multiGeom = {
      type: 'MultiPolygon',
      coordinates: [drawnGeom.coordinates],
    };

    try {
      const res = await api.post('/api/v1/manual-add-field', {
        location_id: locationId,
        label:       label.trim(),
        field_type:  fieldType,
        geometry:    multiGeom,
        crop_type:   cropType || null,
        season_year: seasonYear || null,
      });
      setPhase('saved');
      setTimeout(() => onSaved?.(res.data.field), 1000);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setErrorMsg(typeof detail === 'string' ? detail : JSON.stringify(detail) || 'Save failed');
      setPhase('error');
    }
  };

  const canSave = drawnGeom && label.trim() && phase === 'ready';

  /* ─── Render ─── */
  return (
    <div style={s.backdrop} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={s.modal}>

        {/* Header */}
        <div style={s.header}>
          <div>
            <h2 style={s.title}>Add Field Manually</h2>
            <p style={s.subtitle}>
              {drawMode === 'idle'    && 'Click &quot;Draw Field&quot; to start placing vertices on the map'}
              {drawMode === 'drawing' && '📍 Click on the map to place vertices — click the first point to close the polygon'}
              {drawMode === 'done'    && `✓ Polygon drawn${areaHa != null ? ` · ${areaHa.toFixed(2)} ha` : ''} — drag vertices to adjust`}
            </p>
          </div>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Body */}
        <div style={s.body}>
          <div style={s.twoCol}>

            {/* ── Map ── */}
            <div style={s.mapWrap}>
              <div ref={mapCallbackRef} style={{ position: 'absolute', inset: 0 }} />

              {/* Draw toolbar overlay */}
              <div style={s.drawToolbar}>
                {drawMode !== 'drawing' && (
                  <button
                    style={{ ...s.drawBtn, background: CLR.green }}
                    onClick={startDraw}
                  >
                    {drawMode === 'done' ? '✏️ Redraw' : '✏️ Draw Field'}
                  </button>
                )}
                {drawMode === 'drawing' && (
                  <>
                    <button style={{ ...s.drawBtn, background: '#e67e22' }} onClick={undoVertex}>
                      ↩ Undo vertex
                    </button>
                    <button style={{ ...s.drawBtn, background: '#c0392b' }} onClick={resetDraw}>
                      ✕ Cancel
                    </button>
                  </>
                )}
                {drawMode === 'done' && (
                  <button style={{ ...s.drawBtn, background: '#7f8c8d' }} onClick={resetDraw}>
                    🗑 Clear
                  </button>
                )}
              </div>

              {/* Area badge */}
              {areaHa != null && (
                <div style={s.areaBadge}>
                  {areaHa.toFixed(2)} ha
                </div>
              )}

              {/* Hint overlay while idle */}
              {drawMode === 'idle' && (
                <div style={s.idleHint}>
                  <span style={{ fontSize: 32 }}>🖊️</span>
                  <p style={{ margin: '8px 0 0', color: '#ddd', fontSize: 13 }}>
                    Click &quot;Draw Field&quot; to start
                  </p>
                </div>
              )}
            </div>

            {/* ── Sidebar: metadata form ── */}
            <div style={s.sidebar}>
              <div style={s.sidebarHeader}>
                <span style={s.sidebarTitle}>Field Details</span>
              </div>

              <div style={s.form}>

                {/* Label */}
                <div style={s.field}>
                  <label style={s.label}>
                    Field name <span style={s.required}>*</span>
                  </label>
                  <input
                    style={s.input}
                    placeholder="e.g. North Wheat Block"
                    value={label}
                    onChange={e => setLabel(e.target.value)}
                    maxLength={128}
                  />
                </div>

                {/* Field type */}
                <div style={s.field}>
                  <label style={s.label}>Field type</label>
                  <select
                    style={s.input}
                    value={fieldType}
                    onChange={e => setFieldType(e.target.value)}
                  >
                    {FIELD_TYPES.map(ft => (
                      <option key={ft.value} value={ft.value}>{ft.label}</option>
                    ))}
                  </select>
                </div>

                {/* Crop type */}
                <div style={s.field}>
                  <label style={s.label}>Crop type <span style={s.optional}>(optional)</span></label>
                  <input
                    style={s.input}
                    placeholder="e.g. WHEAT_WINTER"
                    value={cropType}
                    onChange={e => setCropType(e.target.value)}
                  />
                </div>

                {/* Season year */}
                <div style={s.field}>
                  <label style={s.label}>Season year <span style={s.optional}>(optional)</span></label>
                  <input
                    style={s.input}
                    type="number"
                    min={2000}
                    max={2100}
                    value={seasonYear}
                    onChange={e => setSeasonYear(Number(e.target.value))}
                  />
                </div>

                {/* Area (read-only) */}
                {areaHa != null && (
                  <div style={s.field}>
                    <label style={s.label}>Area</label>
                    <div style={s.areaDisplay}>{areaHa.toFixed(2)} ha</div>
                  </div>
                )}

                {/* Error */}
                {phase === 'error' && errorMsg && (
                  <div style={s.errorBox}>{errorMsg}</div>
                )}

                {/* Status */}
                {phase === 'saved' && (
                  <div style={s.successBox}>✓ Field saved successfully!</div>
                )}

                {/* Validation hints */}
                {drawMode !== 'done' && (
                  <div style={s.hintBox}>
                    Draw a polygon on the map first
                  </div>
                )}
                {drawMode === 'done' && !label.trim() && (
                  <div style={s.hintBox}>
                    Enter a field name to continue
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={s.footer}>
          <div style={{ fontSize: 12, color: '#aaa' }}>
            {drawMode === 'drawing'
              ? 'Click the first vertex to close the polygon'
              : drawMode === 'done'
              ? 'Drag any vertex to adjust the boundary'
              : 'Use satellite view to precisely trace field boundaries'}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button style={{ ...s.btn, ...s.btnSecondary }} onClick={onClose}>
              Cancel
            </button>
            <button
              style={{
                ...s.btn, ...s.btnPrimary,
                opacity: canSave ? 1 : 0.4,
              }}
              disabled={!canSave}
              onClick={handleSave}
            >
              {phase === 'saving' ? 'Saving…' : '💾 Save Field'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Styles ─── */
const s = {
  backdrop: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000, backdropFilter: 'blur(3px)',
  },
  modal: {
    background: '#fff', borderRadius: 16,
    width: 'min(96vw, 1100px)', maxHeight: '92vh',
    display: 'flex', flexDirection: 'column',
    boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    padding: '18px 24px 14px', borderBottom: '1px solid #eee',
    background: CLR.magnolia, flexShrink: 0,
  },
  title:    { margin: 0, fontSize: 18, fontWeight: 800, color: CLR.soil },
  subtitle: { margin: '5px 0 0', fontSize: 13, color: '#666' },
  closeBtn: {
    background: 'none', border: 'none', fontSize: 18,
    cursor: 'pointer', color: '#aaa', padding: '2px 6px',
    borderRadius: 6, lineHeight: 1, flexShrink: 0,
  },
  body:   { flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 },
  footer: {
    padding: '14px 24px', borderTop: '1px solid #eee',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    background: CLR.magnolia, flexShrink: 0,
  },
  twoCol: { flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 },

  /* Map */
  mapWrap: {
    flex: '1 1 65%', position: 'relative',
    borderRight: '1px solid #eee', minWidth: 0,
  },
  drawToolbar: {
    position: 'absolute', top: 12, left: 12, zIndex: 10,
    display: 'flex', gap: 8,
  },
  drawBtn: {
    color: '#fff', border: 'none', borderRadius: 8,
    padding: '8px 14px', fontWeight: 700, fontSize: 13,
    cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    transition: 'opacity 0.15s',
  },
  areaBadge: {
    position: 'absolute', bottom: 28, left: 12, zIndex: 10,
    background: 'rgba(0,0,0,0.65)', color: '#fff',
    borderRadius: 8, padding: '6px 12px',
    fontSize: 13, fontWeight: 700,
  },
  idleHint: {
    position: 'absolute', inset: 0, zIndex: 5,
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    pointerEvents: 'none',
  },

  /* Sidebar */
  sidebar: {
    flex: '0 0 300px', display: 'flex', flexDirection: 'column',
    minWidth: 240, maxWidth: 340,
  },
  sidebarHeader: {
    padding: '12px 18px', borderBottom: '1px solid #eee',
    background: CLR.magnolia, flexShrink: 0,
  },
  sidebarTitle: { fontWeight: 700, fontSize: 13, color: CLR.soil },
  form: {
    flex: 1, overflowY: 'auto',
    padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14,
  },
  field: { display: 'flex', flexDirection: 'column', gap: 5 },
  label: { fontSize: 12, fontWeight: 600, color: '#555' },
  required: { color: '#e74c3c' },
  optional:  { color: '#aaa', fontWeight: 400 },
  input: {
    padding: '8px 10px', borderRadius: 7, fontSize: 13,
    border: '1px solid #ddd', fontFamily: 'inherit',
    outline: 'none', transition: 'border 0.15s',
    background: '#fff',
  },
  areaDisplay: {
    padding: '8px 10px', borderRadius: 7, fontSize: 13,
    background: '#f5faf7', color: CLR.green, fontWeight: 700,
    border: '1px solid #c8ecd8',
  },
  hintBox: {
    fontSize: 12, color: '#aaa', textAlign: 'center',
    padding: '10px', background: '#fafafa', borderRadius: 7,
    border: '1px dashed #ddd',
  },
  errorBox: {
    fontSize: 12, color: '#c0392b', background: '#fff3f3',
    border: '1px solid #f5c6cb', borderRadius: 7,
    padding: '10px 12px', lineHeight: 1.5,
  },
  successBox: {
    fontSize: 13, color: CLR.green, background: '#f0fbf4',
    border: '1px solid #c8ecd8', borderRadius: 7,
    padding: '10px 12px', fontWeight: 600,
  },

  btn:          { padding: '9px 20px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer', border: 'none', transition: 'opacity 0.15s' },
  btnPrimary:   { background: CLR.soil, color: '#fff' },
  btnSecondary: { background: 'transparent', color: CLR.soil, border: `1px solid ${CLR.soil}` },
};