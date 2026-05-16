/**
 * SegmentationModal.jsx
 *
 * Flow:
 *  1. Mount → POST /api/v1/segment-preview/{locationId}
 *  2. Mapbox satellite map + detected fields as GeoJSON layer
 *  3. Click polygon or sidebar row → toggle selection
 *  4. "Save" → POST /api/v1/segment-confirm/{locationId}
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import api from '../api/client';

/* ─── palette ─── */
const CLR = {
  soil:           '#6B4226',
  magnolia:       '#FAF7F2',
  selected:       '#2980b9',
  selectedFill:   'rgba(41,128,185,0.35)',
  unselected:     '#2ecc71',
  unselectedFill: 'rgba(46,204,113,0.25)',
  hover:          '#e67e22',
  hoverFill:      'rgba(230,126,34,0.40)',
};

/* ─── bbox from GeoJSON features ─── */
function bboxFromFeatures(features) {
  let minLng = Infinity, maxLng = -Infinity;
  let minLat = Infinity, maxLat = -Infinity;
  for (const f of features) {
    const coords = f.geometry.coordinates.flat(Infinity);
    for (let i = 0; i < coords.length; i += 2) {
      if (coords[i]   < minLng) minLng = coords[i];
      if (coords[i]   > maxLng) maxLng = coords[i];
      if (coords[i+1] < minLat) minLat = coords[i+1];
      if (coords[i+1] > maxLat) maxLat = coords[i+1];
    }
  }
  return [[minLng, minLat], [maxLng, maxLat]];
}

/* ─── build GeoJSON for a field list, tagging each with selection state ─── */
function buildGeoJSON(fields, selectedIds) {
  return {
    type: 'FeatureCollection',
    features: fields.map(f => ({
      type: 'Feature',
      id: f.id,
      geometry: f.geometry,
      properties: {
        fieldId:  f.id,
        label:    f.label,
        area_ha:  f.area_ha,
        selected: selectedIds.has(f.id) ? 1 : 0,
      },
    })),
  };
}

const SRC   = 'segm-fields-src';
const FILL  = 'segm-fields-fill';
const LINE  = 'segm-fields-line';
const LABEL = 'segm-fields-label';

/* ─── Map component (self-contained) ─── */
function SegmentMap({ validFields, selected, hoveredId, onToggle, onHover }) {
  const mapRef    = useRef(null);
  const loadedRef = useRef(false);
  const fittedRef = useRef(false);

  /* snapshot refs so Mapbox callbacks don't close over stale state */
  const selectedRef = useRef(selected);
  const hoveredRef  = useRef(hoveredId);
  selectedRef.current = selected;
  hoveredRef.current  = hoveredId;

  const applyToMap = useCallback((fn) => {
    const map = mapRef.current;
    if (!map) return;
    loadedRef.current ? fn(map) : map.once('load', () => fn(map));
  }, []);

  /* Init map */
  const mapCallbackRef = useCallback((node) => {
    if (!node) {
      mapRef.current?.remove();
      mapRef.current    = null;
      loadedRef.current = false;
      fittedRef.current = false;
      return;
    }
    if (mapRef.current) return;

    const token = import.meta.env.VITE_MAPBOX_TOKEN || '';
    if (!token) { console.error('[SegmentMap] no VITE_MAPBOX_TOKEN'); return; }

    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: node,
      style: 'mapbox://styles/mapbox/satellite-streets-v12',
      center: [19.648, 47.728],
      zoom: 13,
      attributionControl: false,
      renderWorldCopies: false,
    });

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

    map.on('load', () => {
      loadedRef.current = true;

      /* ── Sources & layers ── */
      map.addSource(SRC, {
        type: 'geojson',
        data: buildGeoJSON([], new Set()),
        promoteId: 'fieldId',
      });

      /* Fill — colour driven by 'selected' property */
      map.addLayer({
        id: FILL,
        type: 'fill',
        source: SRC,
        paint: {
          'fill-color': [
            'case',
            ['==', ['get', 'selected'], 1], CLR.selectedFill,
            CLR.unselectedFill,
          ],
          'fill-opacity': 1,
        },
      });

      /* Outline */
      map.addLayer({
        id: LINE,
        type: 'line',
        source: SRC,
        paint: {
          'line-color': [
            'case',
            ['==', ['get', 'selected'], 1], CLR.selected,
            CLR.unselected,
          ],
          'line-width': 2,
        },
      });

      /* Labels */
      map.addLayer({
        id: LABEL,
        type: 'symbol',
        source: SRC,
        layout: {
          'text-field': ['get', 'label'],
          'text-size': 11,
          'text-font': ['DIN Offc Pro Bold', 'Arial Unicode MS Bold'],
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': '#fff',
          'text-halo-color': '#000',
          'text-halo-width': 1,
        },
      });

      /* ── Click: toggle ── */
      map.on('click', FILL, (e) => {
        const fid = e.features?.[0]?.properties?.fieldId;
        if (fid != null) onToggle(Number(fid));
      });

      /* ── Hover ── */
      map.on('mousemove', FILL, (e) => {
        const fid = e.features?.[0]?.properties?.fieldId;
        if (fid != null) {
          map.getCanvas().style.cursor = 'pointer';
          onHover(Number(fid));
        }
      });
      map.on('mouseleave', FILL, () => {
        map.getCanvas().style.cursor = '';
        onHover(null);
      });
    });

    mapRef.current = map;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* Update source data whenever fields or selection changes */
  useEffect(() => {
    applyToMap(map => {
      const src = map.getSource(SRC);
      if (!src) return;
      src.setData(buildGeoJSON(validFields, selected));

      /* Fit to fields once after they first arrive */
      if (!fittedRef.current && validFields.length > 0) {
        fittedRef.current = true;
        const bbox = bboxFromFeatures(buildGeoJSON(validFields, selected).features);
        if (isFinite(bbox[0][0])) {
          map.fitBounds(bbox, { padding: 60, maxZoom: 16, duration: 800 });
        }
      }
    });
  }, [validFields, selected, applyToMap]);

  /* Highlight hovered field via feature-state */
  useEffect(() => {
    applyToMap(map => {
      /* Paint hover outline */
      if (map.getLayer(LINE)) {
        map.setPaintProperty(LINE, 'line-color', [
          'case',
          ['==', ['get', 'fieldId'], hoveredId ?? -1], CLR.hover,
          ['==', ['get', 'selected'], 1],              CLR.selected,
          CLR.unselected,
        ]);
        map.setPaintProperty(LINE, 'line-width', [
          'case',
          ['==', ['get', 'fieldId'], hoveredId ?? -1], 3,
          2,
        ]);
        map.setPaintProperty(FILL, 'fill-color', [
          'case',
          ['==', ['get', 'fieldId'], hoveredId ?? -1], CLR.hoverFill,
          ['==', ['get', 'selected'], 1],              CLR.selectedFill,
          CLR.unselectedFill,
        ]);
      }
    });
  }, [hoveredId, applyToMap]);

  return <div ref={mapCallbackRef} style={{ position: 'absolute', inset: 0 }} />;
}

/* ─── Main modal ─── */
export default function SegmentationModal({ userId, locationId, onClose, onConfirmed }) {
  const [phase, setPhase]           = useState('loading');
  const [allFields, setAllFields]   = useState([]);
  const [selected, setSelected]     = useState(new Set());
  const [hoveredId, setHoveredId]   = useState(null);
  const [errorMsg, setErrorMsg]     = useState('');
  const [confirmMsg, setConfirmMsg] = useState('');
  const [showRejected, setShowRejected] = useState(false);

  const validFields   = allFields.filter(f => f.valid);
  const invalidFields = allFields.filter(f => !f.valid);

  /* ── 1. Preview on mount ── */
  useEffect(() => {
    if (!locationId) return;
    setPhase('loading');
    api.post(`/api/v1/segment-preview/${locationId}`)
      .then(res => {
        const { fields: f = [] } = res.data;
        setAllFields(f);
        setSelected(new Set(f.filter(x => x.valid).map(x => x.id)));
        setPhase('ready');
      })
      .catch(err => {
        setErrorMsg(err?.response?.data?.detail || 'Segmentation failed');
        setPhase('error');
      });
  }, [locationId]);

  /* ── 2. Toggle ── */
  const toggleField = useCallback(id => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const selectAll  = () => setSelected(new Set(validFields.map(f => f.id)));
  const selectNone = () => setSelected(new Set());

  /* ── 3. Confirm ── */
  const handleConfirm = () => {
    if (selected.size === 0) return;
    setPhase('confirming');
    api.post(`/api/v1/segment-confirm/${locationId}`, {
      selected_ids: [...selected],
      fields_data: allFields,
    })
      .then(res => {
        setConfirmMsg(`✓ ${res.data.saved_count} field(s) saved`);
        setPhase('done');
        setTimeout(() => onConfirmed?.(), 1200);
      })
      .catch(err => {
        setErrorMsg(err?.response?.data?.detail || 'Failed to save fields');
        setPhase('error');
      });
  };

  /* ── Render ── */
  return (
    <div style={s.backdrop} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={s.modal}>

        {/* Header */}
        <div style={s.header}>
          <div>
            <h2 style={s.title}>Field Segmentation</h2>
            {phase === 'ready' && (
              <p style={s.subtitle}>
                <span style={{ color: '#27ae60', fontWeight: 700 }}>
                  {validFields.length} fields detected
                </span>
                {invalidFields.length > 0 && (
                  <span style={{ color: '#bbb' }}>
                    {' '}· {invalidFields.length} filtered out
                  </span>
                )}
                <span style={{ color: '#888' }}>{' '}· {selected.size} selected</span>
              </p>
            )}
          </div>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Body */}
        <div style={s.body}>

          {phase === 'loading' && (
            <div style={s.centered}>
              <div style={s.spinner} />
              <p style={{ marginTop: 16, color: CLR.soil, fontWeight: 600 }}>
                Running segmentation model…
              </p>
              <p style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                This may take up to a minute
              </p>
            </div>
          )}

          {phase === 'error' && (
            <div style={s.centered}>
              <div style={{ fontSize: 40 }}>⚠️</div>
              <p style={{ color: '#e74c3c', fontWeight: 700, marginTop: 12 }}>{errorMsg}</p>
              <button style={{ ...s.btn, ...s.btnSecondary, marginTop: 16 }} onClick={onClose}>
                Close
              </button>
            </div>
          )}

          {phase === 'done' && (
            <div style={s.centered}>
              <div style={{ fontSize: 48 }}>✅</div>
              <p style={{ color: '#27ae60', fontWeight: 700, marginTop: 12, fontSize: 16 }}>
                {confirmMsg}
              </p>
            </div>
          )}

          {(phase === 'ready' || phase === 'confirming') && (
            <div style={s.twoCol}>

              {/* ── Map ── */}
              <div style={s.mapWrap}>
                <SegmentMap
                  validFields={validFields}
                  selected={selected}
                  hoveredId={hoveredId}
                  onToggle={toggleField}
                  onHover={setHoveredId}
                />

                {/* Legend */}
                <div style={s.legend}>
                  {[
                    { color: CLR.selected,   label: 'Selected' },
                    { color: CLR.unselected, label: 'Click to select' },
                  ].map(({ color, label }) => (
                    <div key={label} style={s.legendItem}>
                      <div style={{ ...s.legendDot, background: color }} />
                      <span style={{ fontSize: 11, color: '#ddd' }}>{label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Sidebar ── */}
              <div style={s.sidebar}>
                <div style={s.sidebarHeader}>
                  <span style={s.sidebarTitle}>Fields</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button style={s.microBtn} onClick={selectAll}>All</button>
                    <button style={s.microBtn} onClick={selectNone}>None</button>
                  </div>
                </div>

                <div style={s.fieldList}>
                  {validFields.map(f => {
                    const isSel = selected.has(f.id);
                    const isHov = hoveredId === f.id;
                    return (
                      <div
                        key={f.id}
                        style={{
                          ...s.fieldRow,
                          ...(isHov ? s.fieldRowHover    : {}),
                          ...(isSel ? s.fieldRowSelected : {}),
                        }}
                        onMouseEnter={() => setHoveredId(f.id)}
                        onMouseLeave={() => setHoveredId(null)}
                        onClick={() => toggleField(f.id)}
                      >
                        <input
                          type="checkbox"
                          checked={isSel}
                          readOnly
                          style={{ accentColor: CLR.selected, cursor: 'pointer', flexShrink: 0 }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={s.fieldName}>{f.label}</div>
                          {f.area_ha != null && (
                            <div style={s.fieldMeta}>
                              {Number(f.area_ha).toFixed(2)} ha
                            </div>
                          )}
                        </div>
                        <div style={{
                          ...s.fieldBadge,
                          background: isSel ? '#dbeeff' : '#e8f8ee',
                          color:      isSel ? CLR.selected : '#27ae60',
                        }}>
                          {isSel ? '✓' : '○'}
                        </div>
                      </div>
                    );
                  })}

                  {validFields.length === 0 && (
                    <div style={{ padding: 24, textAlign: 'center', color: '#aaa', fontSize: 13 }}>
                      No valid fields detected
                    </div>
                  )}

                  {/* Filtered-out accordion */}
                  {invalidFields.length > 0 && (
                    <div style={s.rejectedSection}>
                      <button
                        style={s.rejectedToggle}
                        onClick={() => setShowRejected(v => !v)}
                      >
                        {showRejected ? '▾' : '▸'}
                        &nbsp;{invalidFields.length} filtered out (too small / invalid)
                      </button>
                      {showRejected && invalidFields.map(f => (
                        <div key={f.id} style={s.rejectedRow}>
                          <span style={s.rejectedName}>{f.label}</span>
                          {f.error && <span style={s.rejectedErr}>{f.error}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {(phase === 'ready' || phase === 'confirming') && (
          <div style={s.footer}>
            <span style={{ fontSize: 13, color: '#888' }}>
              {selected.size} of {validFields.length} fields selected
            </span>
            <div style={{ display: 'flex', gap: 10 }}>
              <button style={{ ...s.btn, ...s.btnSecondary }} onClick={onClose}>
                Cancel
              </button>
              <button
                style={{
                  ...s.btn, ...s.btnPrimary,
                  opacity: selected.size === 0 || phase === 'confirming' ? 0.45 : 1,
                }}
                disabled={selected.size === 0 || phase === 'confirming'}
                onClick={handleConfirm}
              >
                {phase === 'confirming' ? 'Saving…' : `Save ${selected.size} Field(s)`}
              </button>
            </div>
          </div>
        )}
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
    width: 'min(96vw, 1140px)', maxHeight: '92vh',
    display: 'flex', flexDirection: 'column',
    boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    padding: '18px 24px 14px', borderBottom: '1px solid #eee',
    background: CLR.magnolia,
  },
  title:    { margin: 0, fontSize: 18, fontWeight: 800, color: CLR.soil },
  subtitle: { margin: '4px 0 0', fontSize: 13 },
  closeBtn: {
    background: 'none', border: 'none', fontSize: 18,
    cursor: 'pointer', color: '#aaa', padding: '2px 6px',
    borderRadius: 6, lineHeight: 1,
  },
  body:   { flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' },
  footer: {
    padding: '14px 24px', borderTop: '1px solid #eee',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    background: CLR.magnolia,
  },
  centered: {
    flex: 1, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    minHeight: 300, padding: 40,
  },
  spinner: {
    width: 44, height: 44, border: '4px solid #eee',
    borderTop: `4px solid ${CLR.soil}`,
    borderRadius: '50%', animation: 'spin 0.9s linear infinite',
  },
  twoCol:  { flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 },

  /* Map side — position:relative so absolute child fills it */
  mapWrap: {
    flex: '1 1 65%', position: 'relative',
    borderRight: '1px solid #eee', minWidth: 0,
  },
  legend: {
    position: 'absolute', bottom: 28, left: 12, zIndex: 10,
    background: 'rgba(0,0,0,0.65)', borderRadius: 8,
    padding: '7px 12px', display: 'flex', gap: 16,
    pointerEvents: 'none',
  },
  legendItem: { display: 'flex', alignItems: 'center', gap: 6 },
  legendDot:  { width: 12, height: 12, borderRadius: 2, flexShrink: 0 },

  /* Sidebar */
  sidebar: {
    flex: '0 0 290px', display: 'flex', flexDirection: 'column',
    minWidth: 220, maxWidth: 320,
  },
  sidebarHeader: {
    padding: '12px 16px', borderBottom: '1px solid #eee',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    background: CLR.magnolia, flexShrink: 0,
  },
  sidebarTitle: { fontWeight: 700, fontSize: 13, color: CLR.soil },
  microBtn: {
    fontSize: 11, padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
    border: `1px solid ${CLR.soil}`, background: 'transparent',
    color: CLR.soil, fontWeight: 600,
  },
  fieldList: { flex: 1, overflowY: 'auto', padding: '6px 0' },
  fieldRow: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '8px 14px', cursor: 'pointer',
    transition: 'background 0.1s', borderBottom: '1px solid #f5f5f5',
  },
  fieldRowHover:    { background: '#fff8ee' },
  fieldRowSelected: { background: '#f0fbf4' },
  fieldName: {
    fontSize: 13, fontWeight: 600, color: '#333',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  fieldMeta:  { fontSize: 11, color: '#888', marginTop: 1 },
  fieldBadge: {
    width: 22, height: 22, borderRadius: 6, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 12, fontWeight: 800,
  },
  rejectedSection: { borderTop: '1px solid #f0f0f0', marginTop: 4 },
  rejectedToggle: {
    width: '100%', textAlign: 'left', padding: '8px 14px',
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: 12, color: '#aaa',
  },
  rejectedRow: {
    padding: '4px 14px 4px 24px', borderBottom: '1px solid #f8f8f8',
    display: 'flex', flexDirection: 'column', gap: 1,
  },
  rejectedName: { fontSize: 11, color: '#bbb' },
  rejectedErr:  { fontSize: 10, color: '#e8a0a0' },

  btn:          { padding: '9px 20px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer', border: 'none', transition: 'opacity 0.15s' },
  btnPrimary:   { background: CLR.soil, color: '#fff' },
  btnSecondary: { background: 'transparent', color: CLR.soil, border: `1px solid ${CLR.soil}` },
};

/* spinner keyframes */
if (typeof document !== 'undefined' && !document.getElementById('segm-spin-kf')) {
  const st = document.createElement('style');
  st.id = 'segm-spin-kf';
  st.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
  document.head.appendChild(st);
}