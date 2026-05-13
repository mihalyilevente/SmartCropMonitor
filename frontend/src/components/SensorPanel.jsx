/**
 * SensorPanel.jsx
 * Fixed API base path: /api/v1/sensors/
 *
 * Endpoints used:
 *   GET  /api/v1/sensors/user_sensors/{user_id}
 *   GET  /api/v1/sensors/sensor_status/{sensor_id}
 *   GET  /api/v1/sensors/user_sensors_latest/{user_id}   ← for live values strip
 *   GET  /api/v1/sensors/sensor_history/{sensor_id}?days=N
 *   POST /api/v1/sensors/add_sensor
 *   PATCH /api/v1/sensors/update_sensor/{sensor_id}
 *
 * History response shape:
 *   { sensor_id, labels: string[], datasets: { temp: number[], humidity: number[], pressure: number[] } }
 */
import { useState, useEffect, useCallback } from 'react';
import api from '../api/client';

const BASE = '/api/v1/sensors';

// ── SVG Sparkline — uses parallel labels[] + values[] arrays ──────────────────
const Spark = ({ labels = [], values = [], color = '#317f43', title = '', unit = '' }) => {
  const valid = values
    .map((v, i) => ({ v: Number(v), t: labels[i] }))
    .filter(p => !isNaN(p.v) && p.v != null);

  if (!valid.length) return (
    <div style={{ minWidth: 170, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 10, color: '#aaa', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{title}</span>
      <span style={{ fontSize: 11, color: '#ccc' }}>No data</span>
    </div>
  );

  const W = 190, H = 64, px = 4, py = 8;
  const ys = valid.map(p => p.v);
  const min = Math.min(...ys), max = Math.max(...ys), range = max - min || 1;
  const sx = (i) => px + (i / (valid.length - 1 || 1)) * (W - 2 * px);
  const sy = (v) => py + (1 - (v - min) / range) * (H - 2 * py - 12);
  const pts = valid.map((p, i) => `${sx(i)},${sy(p.v)}`).join(' ');
  const area =
    `M${sx(0)},${H - 12} ` +
    valid.map((p, i) => `L${sx(i)},${sy(p.v)}`).join(' ') +
    ` L${sx(valid.length - 1)},${H - 12} Z`;
  const gId = `sg${title.replace(/\W/g, '')}${color.replace('#', '')}`;

  const last = valid[valid.length - 1];
  const lastTime = last.t
    ? new Date(last.t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : '';
  const firstDate = valid[0].t
    ? new Date(valid[0].t).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })
    : '';
  const lastDate = last.t
    ? new Date(last.t).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })
    : '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 190 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 10, color: '#aaa', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{title}</span>
        <span style={{ fontSize: 13, fontWeight: 800, color, letterSpacing: '-0.01em' }}>
          {last.v.toFixed(1)}<span style={{ fontSize: 10, fontWeight: 400, color: '#bbb', marginLeft: 2 }}>{unit}</span>
        </span>
      </div>
      <svg width={W} height={H} style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <linearGradient id={gId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* zero / min / max guide lines */}
        {[min, (min + max) / 2, max].map((v, i) => (
          <line key={i} x1={px} y1={sy(v)} x2={W - px} y2={sy(v)}
            stroke="#ece6dc" strokeWidth="1" strokeDasharray="3 3" />
        ))}
        <path d={area} fill={`url(#${gId})`} />
        <polyline points={pts} fill="none" stroke={color} strokeWidth="2"
          strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={sx(valid.length - 1)} cy={sy(last.v)} r={4}
          fill={color} stroke="#fff" strokeWidth="2" />
        {/* x-axis date labels */}
        <text x={px} y={H} fontSize="9" fill="#ccc" fontFamily="inherit">{firstDate}</text>
        <text x={W - px} y={H} textAnchor="end" fontSize="9" fill="#ccc" fontFamily="inherit">{lastDate}</text>
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#bbb' }}>
        <span>min {min.toFixed(1)} · max {max.toFixed(1)}</span>
        <span>{lastTime}</span>
      </div>
    </div>
  );
};

// ── Online / Offline badge ─────────────────────────────────────────────────────
const Badge = ({ on }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700,
    background: on ? '#e8f5e9' : '#fce4ec',
    color: on ? '#2e7d32' : '#c62828',
    border: `1px solid ${on ? '#a5d6a7' : '#ef9a9a'}`,
  }}>
    <span style={{
      width: 7, height: 7, borderRadius: '50%',
      background: on ? '#43a047' : '#e53935',
      boxShadow: on ? '0 0 0 3px #c8e6c9' : 'none',
    }} />
    {on ? 'Online' : 'Offline'}
  </span>
);

// ── Labelled input ─────────────────────────────────────────────────────────────
const Field = ({ label, ...props }) => (
  <label style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 120 }}>
    <span style={{ fontSize: 10, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
    <input style={{
      padding: '6px 9px', borderRadius: 6,
      border: '1px solid #ddd', fontSize: 13, fontFamily: 'inherit',
      outline: 'none',
    }} {...props} />
  </label>
);

// ── Per-sensor expandable row ──────────────────────────────────────────────────
const SensorRow = ({ sensor, latestMap, onRefresh }) => {
  const [open, setOpen]       = useState(false);
  const [status, setStatus]   = useState(null);
  const [history, setHistory] = useState(null);
  const [days, setDays]       = useState(7);
  const [histLoading, setHistLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [form, setForm]       = useState({
    label: sensor.label || '',
    latitude: '', longitude: '',
    activation_status: sensor.activation_status,
  });

  const loadStatus = useCallback(() =>
    api.get(`${BASE}/sensor_status/${sensor.id}`)
      .then(r => setStatus(r.data))
      .catch(() => {}),
  [sensor.id]);

  const loadHistory = useCallback((d) => {
    setHistLoading(true);
    api.get(`${BASE}/sensor_history/${sensor.id}`, { params: { days: d } })
      .then(r => setHistory(r.data))
      .catch(() => setHistory(null))
      .finally(() => setHistLoading(false));
  }, [sensor.id]);

  useEffect(() => {
    if (open) {
      loadStatus();
      loadHistory(days);
    }
  }, [open]);

  const save = async () => {
    setSaving(true);
    const body = {};
    if (form.label !== sensor.label) body.label = form.label;
    if (form.activation_status !== sensor.activation_status) body.activation_status = form.activation_status;
    if (form.latitude && form.longitude) {
      body.latitude  = parseFloat(form.latitude);
      body.longitude = parseFloat(form.longitude);
    }
    try {
      await api.patch(`${BASE}/update_sensor/${sensor.id}`, body);
      setEditing(false);
      onRefresh();
    } catch { alert('Update failed'); }
    finally { setSaving(false); }
  };

  // live values from latest endpoint
  const live = latestMap?.[sensor.id];
  const lastSeen = status?.last_contact
    ? new Date(status.last_contact).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })
    : 'Never';

  return (
    <div style={rowWrap}>
      {/* ── Row header ── */}
      <div style={rowHead} onClick={() => setOpen(v => !v)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 22 }}>📡</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-accent-chernozem)' }}>
              {sensor.label || `Sensor #${sensor.id}`}
            </div>
            <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>
              ID {sensor.id}
              {sensor.meteorological && ' · Meteo'}
              {sensor.added_at && ` · Added ${new Date(sensor.added_at).toLocaleDateString('en-GB')}`}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Live temp/humidity from latest */}
          {live && (
            <div style={{ display: 'flex', gap: 8, fontSize: 12, color: '#555' }}>
              {live.current_values?.temp != null && (
                <span style={{ fontWeight: 700, color: '#b53060' }}>
                  {live.current_values.temp}°C
                </span>
              )}
              {live.current_values?.humidity != null && (
                <span style={{ fontWeight: 700, color: '#1a6fa3' }}>
                  {live.current_values.humidity}%
                </span>
              )}
            </div>
          )}
          <Badge on={sensor.activation_status} />
          <span style={{ color: '#ccc', fontSize: 13, userSelect: 'none' }}>{open ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* ── Expanded body ── */}
      {open && (
        <div style={rowBody}>
          {/* Status strip */}
          <div style={strip}>
            <div style={stripItem}>
              <span style={stripLbl}>Last contact</span>
              <span style={stripVal}>{lastSeen}</span>
            </div>
            <div style={stripItem}>
              <span style={stripLbl}>Status</span>
              <Badge on={status?.activation_status ?? sensor.activation_status} />
            </div>
            {live && (
              <>
                <div style={stripItem}>
                  <span style={stripLbl}>Temp</span>
                  <span style={{ ...stripVal, color: '#b53060' }}>{live.current_values?.temp ?? '—'} °C</span>
                </div>
                <div style={stripItem}>
                  <span style={stripLbl}>Humidity</span>
                  <span style={{ ...stripVal, color: '#1a6fa3' }}>{live.current_values?.humidity ?? '—'} %</span>
                </div>
                {live.current_values?.pressure > 0 && (
                  <div style={stripItem}>
                    <span style={stripLbl}>Pressure</span>
                    <span style={{ ...stripVal, color: '#7b1fa2' }}>{live.current_values.pressure} hPa</span>
                  </div>
                )}
              </>
            )}
            <div style={stripItem}>
              <span style={stripLbl}>Type</span>
              <span style={stripVal}>{sensor.meteorological ? 'Meteorological' : 'Field'}</span>
            </div>
          </div>

          {/* History plots */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#555' }}>Sensor history</span>
              {[7, 14, 30].map(d => (
                <button key={d}
                  onClick={() => { setDays(d); loadHistory(d); }}
                  style={{
                    padding: '2px 9px', borderRadius: 12, fontSize: 11, fontWeight: 700,
                    border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                    background: days === d ? 'var(--color-green-primary, #054e05)' : '#ede7df',
                    color: days === d ? '#fff' : '#777',
                    transition: 'all 0.12s',
                  }}
                >{d}d</button>
              ))}
              {histLoading && <span style={{ fontSize: 11, color: '#aaa' }}>Loading…</span>}
            </div>

            {history ? (
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                <Spark
                  labels={history.labels}
                  values={history.datasets?.temp ?? []}
                  color="#b53060"
                  title="Temperature"
                  unit="°C"
                />
                <Spark
                  labels={history.labels}
                  values={history.datasets?.humidity ?? []}
                  color="#1a6fa3"
                  title="Humidity"
                  unit="%"
                />
                <Spark
                  labels={history.labels}
                  values={history.datasets?.pressure ?? []}
                  color="#7b1fa2"
                  title="Pressure"
                  unit="hPa"
                />
              </div>
            ) : (
              !histLoading && <span style={{ fontSize: 12, color: '#ccc' }}>No history data</span>
            )}
          </div>

          {/* Edit / save */}
          {editing ? (
            <div style={editBox}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <Field label="Label"
                  value={form.label}
                  onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                />
                <Field label="Latitude" type="number" placeholder="keep current"
                  value={form.latitude}
                  onChange={e => setForm(f => ({ ...f, latitude: e.target.value }))}
                />
                <Field label="Longitude" type="number" placeholder="keep current"
                  value={form.longitude}
                  onChange={e => setForm(f => ({ ...f, longitude: e.target.value }))}
                />
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
                  <input type="checkbox"
                    checked={form.activation_status}
                    onChange={e => setForm(f => ({ ...f, activation_status: e.target.checked }))}
                  />
                  Active
                </label>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button onClick={save} disabled={saving} style={btnPrimary}>
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
                <button onClick={() => setEditing(false)} style={btnSecondary}>Cancel</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setEditing(true)} style={btnEdit}>✏️ Edit sensor</button>
          )}
        </div>
      )}
    </div>
  );
};

// ── Add sensor form ────────────────────────────────────────────────────────────
const AddForm = ({ userId, onAdded }) => {
  const [open, setOpen]     = useState(false);
  const [busy, setBusy]     = useState(false);
  const [apiKey, setApiKey] = useState(null);
  const [form, setForm]     = useState({ label: '', latitude: '', longitude: '', meteorological: false });

  const submit = async () => {
    if (!form.label || !form.latitude || !form.longitude) {
      alert('Label, latitude and longitude are required.');
      return;
    }
    setBusy(true); setApiKey(null);
    try {
      const r = await api.post(`${BASE}/add_sensor`, {
        label:         form.label,
        user_id:       userId,
        latitude:      parseFloat(form.latitude),
        longitude:     parseFloat(form.longitude),
        meteorological: form.meteorological,
      });
      setApiKey(r.data.sensor_api_key);
      setForm({ label: '', latitude: '', longitude: '', meteorological: false });
      onAdded();
    } catch { alert('Failed to add sensor.'); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ marginBottom: 14 }}>
      <button onClick={() => { setOpen(v => !v); setApiKey(null); }} style={btnAdd}>
        {open ? '✕ Cancel' : '＋ Add sensor'}
      </button>

      {open && (
        <div style={addBody}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <Field label="Label *" placeholder="North field sensor"
              value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} />
            <Field label="Latitude *" type="number" placeholder="48.8566"
              value={form.latitude} onChange={e => setForm(f => ({ ...f, latitude: e.target.value }))} />
            <Field label="Longitude *" type="number" placeholder="2.3522"
              value={form.longitude} onChange={e => setForm(f => ({ ...f, longitude: e.target.value }))} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
              <input type="checkbox" checked={form.meteorological}
                onChange={e => setForm(f => ({ ...f, meteorological: e.target.checked }))} />
              Meteorological
            </label>
          </div>
          <button onClick={submit} disabled={busy} style={{ ...btnPrimary, marginTop: 12 }}>
            {busy ? 'Adding…' : 'Add sensor'}
          </button>

          {apiKey && (
            <div style={keyBox}>
              <strong>✅ Sensor created!</strong> Copy this API key — it will not be shown again:
              <code style={keyCode}>{apiKey}</code>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Main export ────────────────────────────────────────────────────────────────
const SensorPanel = ({ userId }) => {
  const [open, setOpen]         = useState(true);
  const [sensors, setSensors]   = useState([]);
  const [latestMap, setLatestMap] = useState({});  // keyed by sensor_id
  const [loading, setLoading]   = useState(true);

  const loadSensors = useCallback(() => {
    if (!userId) return;
    setLoading(true);
    api.get(`${BASE}/user_sensors/${userId}`)
      .then(r => setSensors(r.data))
      .catch(() => setSensors([]))
      .finally(() => setLoading(false));
  }, [userId]);

  const loadLatest = useCallback(() => {
    if (!userId) return;
    api.get(`${BASE}/user_sensors_latest/${userId}`)
      .then(r => {
        const map = {};
        r.data.forEach(s => { map[s.sensor_id] = s; });
        setLatestMap(map);
      })
      .catch(() => {});
  }, [userId]);

  useEffect(() => {
    loadSensors();
    loadLatest();
  }, [loadSensors, loadLatest]);

  const refresh = () => { loadSensors(); loadLatest(); };

  const onlineCount = sensors.filter(s => s.activation_status).length;

  return (
    <div style={panelWrap}>
      {/* Panel header */}
      <div style={panelHead} onClick={() => setOpen(v => !v)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>📡</span>
          <span style={titleStyle}>Sensors</span>
          <span style={countBadge}>{sensors.length} registered</span>
          {onlineCount > 0 && (
            <span style={{ ...countBadge, background: '#e8f5e9', color: '#2e7d32' }}>
              {onlineCount} online
            </span>
          )}
        </div>
        <span style={{ color: '#bbb', fontSize: 13 }}>{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div style={panelBody}>
          <AddForm userId={userId} onAdded={refresh} />

          {loading ? (
            <div style={{ color: '#bbb', padding: 16, textAlign: 'center', fontSize: 13 }}>
              Loading sensors…
            </div>
          ) : sensors.length === 0 ? (
            <div style={{ color: '#bbb', padding: 16, textAlign: 'center', fontSize: 13 }}>
              No sensors registered yet. Add one above.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sensors.map(s => (
                <SensorRow key={s.id} sensor={s} latestMap={latestMap} onRefresh={refresh} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SensorPanel;

// ── Styles ─────────────────────────────────────────────────────────────────────
const panelWrap  = { background: '#fff', borderRadius: 14, border: '1px solid var(--color-accent-soil)', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', overflow: 'hidden', marginBottom: 20 };
const panelHead  = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 20px', cursor: 'pointer', background: 'var(--color-bg-champagne)', borderBottom: '1px solid var(--color-accent-soil)', userSelect: 'none' };
const panelBody  = { padding: '16px 20px 20px' };
const titleStyle = { fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, color: 'var(--color-accent-chernozem)' };
const countBadge = { fontSize: 11, color: '#aaa', background: '#f0ebe3', borderRadius: 10, padding: '2px 8px' };

const rowWrap = { border: '1px solid #ede7df', borderRadius: 10, overflow: 'hidden', background: '#fafaf8' };
const rowHead = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 15px', cursor: 'pointer', userSelect: 'none' };
const rowBody = { padding: '12px 15px 15px', borderTop: '1px solid #ede7df', background: '#fff' };

const strip     = { display: 'flex', gap: 18, background: '#f8f4f0', borderRadius: 8, padding: '8px 14px', marginBottom: 14, flexWrap: 'wrap' };
const stripItem = { display: 'flex', flexDirection: 'column', gap: 2 };
const stripLbl  = { fontSize: 10, color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.05em' };
const stripVal  = { fontSize: 13, fontWeight: 600, color: '#444' };

const editBox = { background: '#f8f4f0', borderRadius: 8, padding: '12px 14px', border: '1px solid #ede7df' };
const addBody = { background: '#f8f4f0', borderRadius: 10, border: '1px solid #ede7df', padding: 14, marginTop: 10 };

const btnPrimary   = { background: 'var(--color-green-primary, #054e05)', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' };
const btnSecondary = { background: '#eee', color: '#555', border: 'none', borderRadius: 6, padding: '7px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' };
const btnEdit      = { background: 'none', border: '1px solid #ddd', borderRadius: 6, padding: '5px 12px', fontSize: 12, cursor: 'pointer', color: '#666', fontFamily: 'inherit' };
const btnAdd       = { background: 'var(--color-accent-mulberry, #470736)', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' };

const keyBox  = { marginTop: 12, background: '#e8f5e9', borderRadius: 8, padding: '10px 14px', border: '1px solid #a5d6a7', fontSize: 13, color: '#2e7d32' };
const keyCode = { display: 'block', marginTop: 6, fontFamily: 'monospace', background: '#fff', padding: '6px 10px', borderRadius: 6, border: '1px solid #c8e6c9', color: '#1b5e20', wordBreak: 'break-all' };
