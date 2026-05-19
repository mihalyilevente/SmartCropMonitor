import { useState, useRef, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import 'mapbox-gl/dist/mapbox-gl.css';
import api from '../api/client';
import { useLang } from '../context/LanguageContext';

const CLR = { soil: '#6B4226', magnolia: '#FAF7F2', green: '#27ae60', blue: '#2980b9' };

const FIELD_TYPE_VALUES = ['crop','pasture','hayfield','orchard','vineyard','greenhouse','fallow','other'];

function calcAreaHa(polygon) {
  const R = 6371008.8;
  const coords = polygon[0];
  if (!coords || coords.length < 3) return 0;
  let area = 0;
  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    const [lng1, lat1] = coords[j].map(v => v * Math.PI / 180);
    const [lng2, lat2] = coords[i].map(v => v * Math.PI / 180);
    area += (lng2 - lng1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }
  return Math.abs(area * R * R / 2) / 10000;
}

const DRAW_STYLES = [
  { id: 'gl-draw-polygon-fill-active',   type: 'fill',   filter: ['all',['==','$type','Polygon'],['==','active','true']],  paint: { 'fill-color': 'rgba(46,204,113,0.20)', 'fill-outline-color': '#2ecc71' } },
  { id: 'gl-draw-polygon-fill-inactive', type: 'fill',   filter: ['all',['==','$type','Polygon'],['==','active','false']], paint: { 'fill-color': 'rgba(41,128,185,0.25)', 'fill-outline-color': '#2980b9' } },
  { id: 'gl-draw-polygon-stroke-active', type: 'line',   filter: ['all',['==','$type','Polygon'],['==','active','true']],  layout: { 'line-cap': 'round','line-join': 'round' }, paint: { 'line-color': '#2ecc71','line-width': 2.5,'line-dasharray': [2,2] } },
  { id: 'gl-draw-polygon-stroke-inactive',type:'line',   filter: ['all',['==','$type','Polygon'],['==','active','false']], layout: { 'line-cap': 'round','line-join': 'round' }, paint: { 'line-color': '#2980b9','line-width': 2 } },
  { id: 'gl-draw-polygon-midpoint',      type: 'circle', filter: ['all',['==','$type','Point'],['==','meta','midpoint']],  paint: { 'circle-radius': 4,'circle-color': '#fff','circle-stroke-width': 2,'circle-stroke-color': '#2ecc71' } },
  { id: 'gl-draw-polygon-and-line-vertex-active',  type: 'circle', filter: ['all',['==','$type','Point'],['==','meta','vertex'],['==','active','true']],  paint: { 'circle-radius': 6,'circle-color': '#fff','circle-stroke-width': 2.5,'circle-stroke-color': '#2ecc71' } },
  { id: 'gl-draw-polygon-and-line-vertex-inactive',type: 'circle', filter: ['all',['==','$type','Point'],['==','meta','vertex'],['==','active','false']], paint: { 'circle-radius': 5,'circle-color': '#fff','circle-stroke-width': 2,'circle-stroke-color': '#2980b9' } },
  { id: 'gl-draw-line-active',           type: 'line',   filter: ['all',['==','$type','LineString'],['==','active','true']],layout: { 'line-cap': 'round','line-join': 'round' }, paint: { 'line-color': '#2ecc71','line-width': 2,'line-dasharray': [2,2] } },
];

export default function ManualFieldModal({ locationId, onClose, onSaved }) {
  const { t } = useLang();
  const mapRef    = useRef(null);
  const drawRef   = useRef(null);
  const loadedRef = useRef(false);

  const [drawnGeom,  setDrawnGeom]  = useState(null);
  const [areaHa,     setAreaHa]     = useState(null);
  const [drawMode,   setDrawMode]   = useState('idle');
  const [phase,      setPhase]      = useState('ready');
  const [label,      setLabel]      = useState('');
  const [fieldType,  setFieldType]  = useState('crop');
  const [cropType,   setCropType]   = useState('');
  const [seasonYear, setSeasonYear] = useState(new Date().getFullYear());
  const [errorMsg,   setErrorMsg]   = useState('');

  // Field type display labels per locale
  const fieldTypeLabel = (v) => {
    const icons = { crop:'🌾', pasture:'🐄', hayfield:'🌿', orchard:'🍎', vineyard:'🍇', greenhouse:'🏠', fallow:'🟫', other:'⬜' };
    return `${icons[v] || ''} ${v.replace(/_/g,' ')}`;
  };

  const mapCallbackRef = useCallback((node) => {
    if (!node) {
      drawRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      loadedRef.current = false;
      return;
    }
    if (mapRef.current) return;

    const token = import.meta.env.VITE_MAPBOX_TOKEN || '';
    if (!token) { console.error('[ManualFieldModal] no VITE_MAPBOX_TOKEN'); return; }
    mapboxgl.accessToken = token;

    const savedView = (() => { try { return JSON.parse(sessionStorage.getItem('fmp_view')); } catch { return null; } })();
    const map = new mapboxgl.Map({
      container: node,
      style: 'mapbox://styles/mapbox/satellite-streets-v12',
      center: savedView ? [savedView.lng, savedView.lat] : [19.648, 47.728],
      zoom: savedView ? savedView.zoom : 14,
      attributionControl: false, renderWorldCopies: false,
    });

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new mapboxgl.ScaleControl({ maxWidth: 100 }), 'bottom-left');

    const draw = new MapboxDraw({ displayControlsDefault: false, styles: DRAW_STYLES });
    map.addControl(draw, 'top-left');
    drawRef.current = draw;

    map.on('load', () => { loadedRef.current = true; });
    map.on('draw.create', (e) => {
      const feature = e.features[0]; if (!feature) return;
      const geom = feature.geometry;
      setDrawnGeom(geom); setAreaHa(calcAreaHa(geom.coordinates)); setDrawMode('done');
      requestAnimationFrame(() => { try { draw.changeMode('simple_select', { featureIds: [feature.id] }); } catch (_e) { /* mode change not critical */ } });
    });
    map.on('draw.update', (e) => {
      const feature = e.features[0]; if (!feature) return;
      const geom = feature.geometry;
      setDrawnGeom(geom); setAreaHa(calcAreaHa(geom.coordinates));
    });
    map.on('draw.delete', () => { setDrawnGeom(null); setAreaHa(null); setDrawMode('idle'); });
    mapRef.current = map;
  }, []); // eslint-disable-line

  const startDraw = () => {
    const draw = drawRef.current; if (!draw) return;
    draw.deleteAll(); setDrawnGeom(null); setAreaHa(null);
    setDrawMode('drawing'); draw.changeMode('draw_polygon');
  };
  const undoVertex = () => { const draw = drawRef.current; if (!draw || drawMode !== 'drawing') return; try { draw.trash(); } catch (_e) { /* trash not available in this mode */ } };
  const resetDraw  = () => {
    const draw = drawRef.current; if (!draw) return;
    try { draw.changeMode('simple_select'); } catch (_e) { /* mode change not critical */ }
    draw.deleteAll(); setDrawnGeom(null); setAreaHa(null); setDrawMode('idle');
  };

  const handleSave = async () => {
    if (!drawnGeom || !label.trim()) return;
    setPhase('saving'); setErrorMsg('');
    const multiGeom = { type: 'MultiPolygon', coordinates: [drawnGeom.coordinates] };
    try {
      const res = await api.post('/api/v1/manual-add-field', {
        location_id: locationId, label: label.trim(),
        field_type: fieldType, geometry: multiGeom,
        crop_type: cropType || null, season_year: seasonYear || null,
      });
      setPhase('saved');
      setTimeout(() => onSaved?.(res.data.field), 1000);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setErrorMsg(typeof detail === 'string' ? detail : JSON.stringify(detail) || t('mfm_save_failed'));
      setPhase('error');
    }
  };

  const canSave = drawnGeom && label.trim() && (phase === 'ready' || phase === 'error');

  const subtitle = drawMode === 'idle'
    ? t('mfm_subtitle_idle')
    : drawMode === 'drawing'
    ? t('mfm_subtitle_drawing')
    : t('mfm_subtitle_done', areaHa?.toFixed(2) ?? '0');

  const footerHint = drawMode === 'drawing'
    ? t('mfm_footer_drawing')
    : drawMode === 'done'
    ? t('mfm_footer_done')
    : t('mfm_footer_idle');

  return (
    <div style={s.backdrop} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={s.modal}>

        {/* Header */}
        <div style={s.header}>
          <div>
            <h2 style={s.title}>{t('mfm_title')}</h2>
            <p style={s.subtitle}>{subtitle}</p>
          </div>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Body */}
        <div style={s.body}>
          <div style={s.twoCol}>

            {/* Map */}
            <div style={s.mapWrap}>
              <div ref={mapCallbackRef} style={{ position: 'absolute', inset: 0 }} />

              <div style={s.drawToolbar}>
                {drawMode !== 'drawing' && (
                  <button style={{ ...s.drawBtn, background: CLR.green }} onClick={startDraw}>
                    {drawMode === 'done' ? t('mfm_redraw_btn') : t('mfm_draw_btn')}
                  </button>
                )}
                {drawMode === 'drawing' && (
                  <>
                    <button style={{ ...s.drawBtn, background: '#e67e22' }} onClick={undoVertex}>{t('mfm_undo_btn')}</button>
                    <button style={{ ...s.drawBtn, background: '#c0392b' }} onClick={resetDraw}>{t('mfm_cancel_draw_btn')}</button>
                  </>
                )}
                {drawMode === 'done' && (
                  <button style={{ ...s.drawBtn, background: '#7f8c8d' }} onClick={resetDraw}>{t('mfm_clear_btn')}</button>
                )}
              </div>

              {areaHa != null && <div style={s.areaBadge}>{areaHa.toFixed(2)} ha</div>}

              {drawMode === 'idle' && (
                <div style={s.idleHint}>
                  <span style={{ fontSize: 32 }}>🖊️</span>
                  <p style={{ margin: '8px 0 0', color: '#ddd', fontSize: 13 }}>{t('mfm_draw_btn')}</p>
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div style={s.sidebar}>
              <div style={s.sidebarHeader}>
                <span style={s.sidebarTitle}>{t('mfm_sidebar_title')}</span>
              </div>
              <div style={s.form}>

                <div style={s.field}>
                  <label style={s.label}>{t('mfm_field_name')} <span style={s.required}>*</span></label>
                  <input style={s.input} placeholder={t('mfm_field_name_ph')} value={label} onChange={e => setLabel(e.target.value)} maxLength={128} />
                </div>

                <div style={s.field}>
                  <label style={s.label}>{t('mfm_field_type')}</label>
                  <select style={s.input} value={fieldType} onChange={e => setFieldType(e.target.value)}>
                    {FIELD_TYPE_VALUES.map(v => <option key={v} value={v}>{fieldTypeLabel(v)}</option>)}
                  </select>
                </div>

                <div style={s.field}>
                  <label style={s.label}>{t('mfm_crop_type')} <span style={s.optional}>{t('mfm_crop_optional')}</span></label>
                  <input style={s.input} placeholder={t('mfm_crop_ph')} value={cropType} onChange={e => setCropType(e.target.value)} />
                </div>

                <div style={s.field}>
                  <label style={s.label}>{t('mfm_season_year')} <span style={s.optional}>{t('mfm_season_optional')}</span></label>
                  <input style={s.input} type="number" min={2000} max={2100} value={seasonYear} onChange={e => setSeasonYear(Number(e.target.value))} />
                </div>

                {areaHa != null && (
                  <div style={s.field}>
                    <label style={s.label}>{t('mfm_area')}</label>
                    <div style={s.areaDisplay}>{areaHa.toFixed(2)} ha</div>
                  </div>
                )}

                {phase === 'error'  && errorMsg && <div style={s.errorBox}>{errorMsg}</div>}
                {phase === 'saved'  && <div style={s.successBox}>{t('mfm_saved_ok')}</div>}
                {drawMode !== 'done' && <div style={s.hintBox}>{t('mfm_hint_draw_first')}</div>}
                {drawMode === 'done' && !label.trim() && <div style={s.hintBox}>{t('mfm_hint_name')}</div>}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={s.footer}>
          <div style={{ fontSize: 12, color: '#aaa' }}>{footerHint}</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button style={{ ...s.btn, ...s.btnSecondary }} onClick={onClose}>{t('mfm_cancel')}</button>
            <button style={{ ...s.btn, ...s.btnPrimary, opacity: canSave ? 1 : 0.4 }} disabled={!canSave} onClick={handleSave}>
              {phase === 'saving' ? t('mfm_saving') : t('mfm_save_btn')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const s = {
  backdrop:   { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(3px)' },
  modal:      { background: '#fff', borderRadius: 16, width: 'min(96vw, 1100px)', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.4)', overflow: 'hidden' },
  header:     { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '18px 24px 14px', borderBottom: '1px solid #eee', background: CLR.magnolia, flexShrink: 0 },
  title:      { margin: 0, fontSize: 18, fontWeight: 800, color: CLR.soil },
  subtitle:   { margin: '5px 0 0', fontSize: 13, color: '#666' },
  closeBtn:   { background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#aaa', padding: '2px 6px', borderRadius: 6, lineHeight: 1, flexShrink: 0 },
  body:       { flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 },
  footer:     { padding: '14px 24px', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: CLR.magnolia, flexShrink: 0 },
  twoCol:     { flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 },
  mapWrap:    { flex: '1 1 65%', position: 'relative', borderRight: '1px solid #eee', minWidth: 0 },
  drawToolbar:{ position: 'absolute', top: 12, left: 12, zIndex: 10, display: 'flex', gap: 8 },
  drawBtn:    { color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.3)', transition: 'opacity 0.15s' },
  areaBadge:  { position: 'absolute', bottom: 28, left: 12, zIndex: 10, background: 'rgba(0,0,0,0.65)', color: '#fff', borderRadius: 8, padding: '6px 12px', fontSize: 13, fontWeight: 700 },
  idleHint:   { position: 'absolute', inset: 0, zIndex: 5, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' },
  sidebar:    { flex: '0 0 300px', display: 'flex', flexDirection: 'column', minWidth: 240, maxWidth: 340 },
  sidebarHeader:{ padding: '12px 18px', borderBottom: '1px solid #eee', background: CLR.magnolia, flexShrink: 0 },
  sidebarTitle: { fontWeight: 700, fontSize: 13, color: CLR.soil },
  form:       { flex: 1, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 },
  field:      { display: 'flex', flexDirection: 'column', gap: 5 },
  label:      { fontSize: 12, fontWeight: 600, color: '#555' },
  required:   { color: '#e74c3c' },
  optional:   { color: '#aaa', fontWeight: 400 },
  input:      { padding: '8px 10px', borderRadius: 7, fontSize: 13, border: '1px solid #ddd', fontFamily: 'inherit', outline: 'none', transition: 'border 0.15s', background: '#fff' },
  areaDisplay:{ padding: '8px 10px', borderRadius: 7, fontSize: 13, background: '#f5faf7', color: CLR.green, fontWeight: 700, border: '1px solid #c8ecd8' },
  hintBox:    { fontSize: 12, color: '#aaa', textAlign: 'center', padding: '10px', background: '#fafafa', borderRadius: 7, border: '1px dashed #ddd' },
  errorBox:   { fontSize: 12, color: '#c0392b', background: '#fff3f3', border: '1px solid #f5c6cb', borderRadius: 7, padding: '10px 12px', lineHeight: 1.5 },
  successBox: { fontSize: 13, color: CLR.green, background: '#f0fbf4', border: '1px solid #c8ecd8', borderRadius: 7, padding: '10px 12px', fontWeight: 600 },
  btn:          { padding: '9px 20px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer', border: 'none', transition: 'opacity 0.15s' },
  btnPrimary:   { background: CLR.soil, color: '#fff' },
  btnSecondary: { background: 'transparent', color: CLR.soil, border: `1px solid ${CLR.soil}` },
};