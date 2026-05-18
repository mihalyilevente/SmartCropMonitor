/**
 * AlertsPanel.jsx
 *
 * Endpoints assumed:
 *   GET    /api/v1/events/user/{user_id}                     → list of events
 *   PATCH  /api/v1/events/{event_id}/status                  → { status: StatusType }
 *   POST   /api/v1/events/rules/create                       → create alert rule
 *   GET    /api/v1/events/rules/user/{user_id}               → list user rules
 *   DELETE /api/v1/events/rules/{rule_id}                    → delete rule
 *
 * StatusType: ACTIVE | ACKNOWLEDGED | RESOLVED | ARCHIVED | IGNORED
 */
import { useState, useEffect, useCallback } from 'react';
import api from '../api/client';

const BASE_EVENTS = '../api/v1/events';

// ── Severity / Status colours ─────────────────────────────────────────────────
const SEV_COLOR = {
  CRITICAL: { bg: '#fce4ec', text: '#b71c1c', border: '#ef9a9a' },
  ERROR:    { bg: '#fce4ec', text: '#c62828', border: '#ef9a9a' },
  WARNING:  { bg: '#fff8e1', text: '#e65100', border: '#ffcc02' },
  INFO:     { bg: '#e3f2fd', text: '#0d47a1', border: '#90caf9' },
};
const STATUS_COLOR = {
  ACTIVE:       { bg: '#e8f5e9', text: '#1b5e20', border: '#a5d6a7' },
  ACKNOWLEDGED: { bg: '#fff3e0', text: '#e65100', border: '#ffcc02' },
  RESOLVED:     { bg: '#f3e5f5', text: '#4a148c', border: '#ce93d8' },
  ARCHIVED:     { bg: '#f5f5f5', text: '#616161', border: '#bdbdbd' },
  IGNORED:      { bg: '#f5f5f5', text: '#9e9e9e', border: '#e0e0e0' },
};

const EVT_ICONS = {
  SENSOR_OFFLINE:   '📡',
  DISEASE_DETECTION: '🦠',
  FROST_HAZARD:     '❄️',
  HEAT_STRESS:      '🔥',
  DROUGHT_WARNING:  '🏜️',
  HEAVY_RAIN:       '🌧️',
  HAIL_STORM:       '⛈️',
  HIGH_WIND:        '💨',
  NDVI_DROP:        '🌿',
  METRIC_ANOMALY:   '📊',
  LOW_BATTERY:      '🔋',
  MANUAL_ALERT:     '✏️',
  OTHER:            '⚠️',
};

const STATUSES = ['ACTIVE', 'ACKNOWLEDGED', 'RESOLVED', 'ARCHIVED', 'IGNORED'];

// ── Pill badge ────────────────────────────────────────────────────────────────
const Pill = ({ label, colors }) => (
  <span style={{
    fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
    background: colors.bg, color: colors.text, border: `1px solid ${colors.border}`,
    textTransform: 'uppercase', letterSpacing: '0.05em',
  }}>{label}</span>
);

// ── Single alert row ──────────────────────────────────────────────────────────
const AlertRow = ({ event, onStatusChange }) => {
  const [updating, setUpdating] = useState(false);
  const [open, setOpen] = useState(false);
  const sev = SEV_COLOR[event.severity] || SEV_COLOR.INFO;
  const sta = STATUS_COLOR[event.status] || STATUS_COLOR.ACTIVE;
  const icon = EVT_ICONS[event.event_type] || EVT_ICONS.OTHER;
  const ts = event.created_at
    ? new Date(event.created_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
    : '—';

  const changeStatus = async (newStatus) => {
    if (newStatus === event.status) return;
    setUpdating(true);
    try {
      await api.patch(`${BASE_EVENTS}/${event.id}/status`, { status: newStatus });
      onStatusChange();
    } catch { alert('Failed to update status.'); }
    finally { setUpdating(false); }
  };

  return (
    <div style={{
      border: `1px solid ${sev.border}`,
      borderRadius: 10, overflow: 'hidden',
      background: '#fafaf8', marginBottom: 6,
    }}>
      {/* Header row */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px', cursor: 'pointer', userSelect: 'none',
        borderLeft: `4px solid ${sev.text}`,
      }} onClick={() => setOpen(v => !v)}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#333' }}>
              {event.event_type?.replace(/_/g, ' ')}
            </span>
            <Pill label={event.severity} colors={sev} />
            <Pill label={event.status}   colors={sta} />
          </div>
          <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{ts}</div>
        </div>
        <span style={{ color: '#bbb', fontSize: 12, flexShrink: 0 }}>{open ? '▲' : '▼'}</span>
      </div>

      {/* Expanded body */}
      {open && (
        <div style={{ padding: '12px 14px 14px', borderTop: `1px solid ${sev.border}`, background: '#fff' }}>
          {/* Metadata */}
          {event.extra_metadata && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Details</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {Object.entries(event.extra_metadata).map(([k, v]) => (
                  <div key={k} style={{ background: '#f5f0ea', borderRadius: 6, padding: '4px 10px', fontSize: 12 }}>
                    <span style={{ color: '#999', marginRight: 4 }}>{k.replace(/_/g, ' ')}:</span>
                    <span style={{ fontWeight: 600, color: '#444' }}>{String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Status selector */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
              Change status
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {STATUSES.map(s => {
                const c = STATUS_COLOR[s];
                const active = s === event.status;
                return (
                  <button
                    key={s}
                    disabled={updating || active}
                    onClick={() => changeStatus(s)}
                    style={{
                      padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                      cursor: active ? 'default' : 'pointer',
                      background: active ? c.bg : '#f5f5f5',
                      color: active ? c.text : '#999',
                      border: active ? `1px solid ${c.border}` : '1px solid #e0e0e0',
                      opacity: updating ? 0.5 : 1,
                      transition: 'all 0.15s',
                      textTransform: 'uppercase', letterSpacing: '0.04em',
                    }}
                  >{s}</button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Template library ──────────────────────────────────────────────────────────
const TEMPLATES = [
  {
    group: '🌡️ Weather',
    items: [
      {
        name: 'Frost Hazard',
        event_type: 'FROST_HAZARD',
        icon: '❄️',
        description: 'Min night temp drops below threshold',
        condition: { metric: 'temp_min_night_7d', operator: '<', value: 0 },
        action: { notify: true, severity: 'WARNING' },
      },
      {
        name: 'Heat Stress',
        event_type: 'HEAT_STRESS',
        icon: '🔥',
        description: 'Max day temp exceeds critical level',
        condition: { metric: 'temp_max_day_7d', operator: '>', value: 35 },
        action: { notify: true, severity: 'WARNING' },
      },
      {
        name: 'Drought Warning',
        event_type: 'DROUGHT_WARNING',
        icon: '🏜️',
        description: '30-day water deficit exceeds limit',
        condition: { metric: 'water_deficit_30d', operator: '>', value: 50 },
        action: { notify: true, severity: 'WARNING' },
      },
      {
        name: 'Heavy Rain',
        event_type: 'HEAVY_RAIN',
        icon: '🌧️',
        description: '7-day cumulative rain exceeds threshold',
        condition: { metric: 'rain_cum_7d', operator: '>', value: 80 },
        action: { notify: true, severity: 'WARNING' },
      },
      {
        name: 'High Wind',
        event_type: 'HIGH_WIND',
        icon: '💨',
        description: 'Wind speed exceeds safe limit',
        condition: { metric: 'wind_speed', operator: '>', value: 15 },
        action: { notify: true, severity: 'INFO' },
      },
      {
        name: 'Low SPI (Drought Index)',
        event_type: 'DROUGHT_WARNING',
        icon: '📉',
        description: 'Standardised Precipitation Index below -1',
        condition: { metric: 'spi_1m', operator: '<', value: -1 },
        action: { notify: true, severity: 'WARNING' },
      },
    ],
  },
  {
    group: '📡 Sensor',
    items: [
      {
        name: 'Sensor Offline',
        event_type: 'SENSOR_OFFLINE',
        icon: '📡',
        description: 'Sensor stops sending data beyond expected interval',
        condition: { metric: 'sensor_silence_multiplier', operator: '>', value: 3 },
        action: { notify: true, severity: 'WARNING' },
      },
      {
        name: 'Low Battery',
        event_type: 'LOW_BATTERY',
        icon: '🔋',
        description: 'Sensor battery level drops below threshold',
        condition: { metric: 'battery_pct', operator: '<', value: 20 },
        action: { notify: true, severity: 'INFO' },
      },
      {
        name: 'Temp Spike (Sensor)',
        event_type: 'HEAT_STRESS',
        icon: '🌡️',
        description: 'Sensor reports unusually high temperature reading',
        condition: { metric: 'sensor_temp', operator: '>', value: 40 },
        action: { notify: true, severity: 'WARNING' },
      },
    ],
  },
  {
    group: '🌿 Field / Vegetation',
    items: [
      {
        name: 'NDVI Drop',
        event_type: 'NDVI_DROP',
        icon: '🌿',
        description: 'Vegetation index drops sharply — possible crop stress',
        condition: { metric: 'ndvi_delta', operator: '<', value: -0.15 },
        action: { notify: true, severity: 'WARNING' },
      },
      {
        name: 'Metric Anomaly',
        event_type: 'METRIC_ANOMALY',
        icon: '📊',
        description: 'Generic field metric deviates beyond normal range',
        condition: { metric: 'anomaly_score', operator: '>', value: 0.8 },
        action: { notify: true, severity: 'INFO' },
      },
    ],
  },
];

// ── Rule creation panel ───────────────────────────────────────────────────────
const RuleCreator = ({ userId, locationId, onCreated }) => {
  const [tab, setTab] = useState('template'); // 'template' | 'custom'
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);

  // Template state
  const [selectedTpl, setSelectedTpl] = useState(null);
  const [tplValues, setTplValues] = useState({});

  // Custom state
  const [custom, setCustom] = useState({
    name: '',
    event_type: 'MANUAL_ALERT',
    severity: 'INFO',
    metric: '',
    operator: '>',
    value: '',
    description: '',
  });

  const EVENT_TYPES = [
    'FROST_HAZARD','HEAT_STRESS','HEAVY_RAIN','HAIL_STORM','HIGH_WIND','DROUGHT_WARNING',
    'LIGHTNING_STRIKE','LOW_SOIL_MOISTURE','HIGH_SOIL_MOISTURE','SOIL_TEMP_LOW','SOIL_TEMP_HIGH',
    'NDVI_DROP','EVI_ANOMALY','PEST_OUTBREAK','DISEASE_DETECTION','METRIC_ANOMALY',
    'SENSOR_OFFLINE','LOW_BATTERY','GATEWAY_DISCONNECTED','DATA_CORRUPTION',
    'MANUAL_ALERT','OTHER',
  ];

  const selectTemplate = (tpl) => {
    setSelectedTpl(tpl);
    setTplValues({ value: tpl.condition.value });
  };

  const submitTemplate = async () => {
    if (!selectedTpl) return;
    setBusy(true);
    try {
      await api.post(`${BASE_EVENTS}/rules/create`, {
        user_id: userId,
        location_id: locationId,
        name: selectedTpl.name,
        event_type: selectedTpl.event_type,
        condition: { ...selectedTpl.condition, value: Number(tplValues.value) },
        action: selectedTpl.action,
        is_active: true,
      });
      setSuccess(true);
      setSelectedTpl(null);
      setTimeout(() => setSuccess(false), 3000);
      onCreated();
    } catch { alert('Failed to create rule.'); }
    finally { setBusy(false); }
  };

  const submitCustom = async () => {
    if (!custom.name || !custom.metric || !custom.value) {
      alert('Name, metric, and value are required.');
      return;
    }
    setBusy(true);
    try {
      await api.post(`${BASE_EVENTS}/rules/create`, {
        user_id: userId,
        location_id: locationId,
        name: custom.name,
        event_type: custom.event_type,
        condition: { metric: custom.metric, operator: custom.operator, value: Number(custom.value) },
        action: { notify: true, severity: custom.severity },
        is_active: true,
      });
      setSuccess(true);
      setCustom({ name: '', event_type: 'MANUAL_ALERT', severity: 'INFO', metric: '', operator: '>', value: '', description: '' });
      setTimeout(() => setSuccess(false), 3000);
      onCreated();
    } catch { alert('Failed to create rule.'); }
    finally { setBusy(false); }
  };

  const inp = (extra) => ({
    padding: '6px 10px', borderRadius: 6,
    border: '1px solid #ddd', fontSize: 13, fontFamily: 'inherit',
    outline: 'none', background: '#fff', ...extra,
  });

  return (
    <div style={{ marginBottom: 20 }}>
      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 14, border: '1px solid #e0d8cf', borderRadius: 8, overflow: 'hidden', width: 'fit-content' }}>
        {[['template', '📋 Templates'], ['custom', '✏️ Custom']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            padding: '7px 18px', fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer',
            background: tab === k ? 'var(--color-accent-soil, #6b4c2a)' : '#f5f0ea',
            color: tab === k ? '#fff' : '#888',
            transition: 'all 0.15s',
          }}>{l}</button>
        ))}
      </div>

      {success && (
        <div style={{ background: '#e8f5e9', border: '1px solid #a5d6a7', borderRadius: 8, padding: '8px 14px', fontSize: 13, color: '#1b5e20', marginBottom: 12 }}>
          ✅ Alert rule created successfully!
        </div>
      )}

      {/* Template tab */}
      {tab === 'template' && (
        <div>
          {TEMPLATES.map(group => (
            <div key={group.group} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                {group.group}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {group.items.map(tpl => {
                  const active = selectedTpl?.name === tpl.name && selectedTpl?.event_type === tpl.event_type;
                  return (
                    <button key={tpl.name + tpl.event_type}
                      onClick={() => active ? setSelectedTpl(null) : selectTemplate(tpl)}
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                        gap: 3, padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
                        border: active ? '2px solid var(--color-accent-soil, #6b4c2a)' : '1px solid #e0d8cf',
                        background: active ? '#fdf6ed' : '#fafaf8',
                        transition: 'all 0.15s', minWidth: 140, textAlign: 'left',
                      }}>
                      <span style={{ fontSize: 16 }}>{tpl.icon}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#444' }}>{tpl.name}</span>
                      <span style={{ fontSize: 10, color: '#aaa', lineHeight: 1.3 }}>{tpl.description}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {selectedTpl && (
            <div style={{ background: '#fdf6ed', border: '1px solid #e0c89a', borderRadius: 10, padding: '14px 16px', marginTop: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#444', marginBottom: 10 }}>
                {selectedTpl.icon} Configure: {selectedTpl.name}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 13, color: '#666' }}>
                  When <strong style={{ color: '#444' }}>{selectedTpl.condition.metric?.replace(/_/g, ' ')}</strong>
                  {' '}<strong style={{ color: '#444' }}>{selectedTpl.condition.operator}</strong>
                </div>
                <input
                  type="number"
                  value={tplValues.value ?? selectedTpl.condition.value}
                  onChange={e => setTplValues(v => ({ ...v, value: e.target.value }))}
                  style={{ ...inp({ width: 90 }) }}
                />
                <button onClick={submitTemplate} disabled={busy} style={btnPrimary}>
                  {busy ? 'Creating…' : '＋ Create Rule'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Custom tab */}
      {tab === 'custom' && (
        <div style={{ background: '#fafaf8', border: '1px solid #e0d8cf', borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
            <label style={lbl}>
              Rule name *
              <input value={custom.name} onChange={e => setCustom(c => ({ ...c, name: e.target.value }))}
                placeholder="My custom alert" style={inp({})} />
            </label>
            <label style={lbl}>
              Event type
              <select value={custom.event_type} onChange={e => setCustom(c => ({ ...c, event_type: e.target.value }))} style={inp({})}>
                {EVENT_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select>
            </label>
            <label style={lbl}>
              Severity
              <select value={custom.severity} onChange={e => setCustom(c => ({ ...c, severity: e.target.value }))} style={inp({})}>
                {['INFO','WARNING','ERROR','CRITICAL'].map(s => <option key={s}>{s}</option>)}
              </select>
            </label>
            <label style={lbl}>
              Metric key *
              <input value={custom.metric} onChange={e => setCustom(c => ({ ...c, metric: e.target.value }))}
                placeholder="e.g. temp_min_night_7d" style={inp({ minWidth: 180 })} />
            </label>
            <label style={lbl}>
              Operator
              <select value={custom.operator} onChange={e => setCustom(c => ({ ...c, operator: e.target.value }))} style={inp({ width: 80 })}>
                {['>', '<', '>=', '<=', '==', '!='].map(o => <option key={o}>{o}</option>)}
              </select>
            </label>
            <label style={lbl}>
              Value *
              <input type="number" value={custom.value} onChange={e => setCustom(c => ({ ...c, value: e.target.value }))}
                placeholder="0" style={inp({ width: 90 })} />
            </label>
          </div>
          <button onClick={submitCustom} disabled={busy} style={{ ...btnPrimary, marginTop: 14 }}>
            {busy ? 'Creating…' : '＋ Create Custom Rule'}
          </button>
        </div>
      )}
    </div>
  );
};

// ── Rules list ────────────────────────────────────────────────────────────────
const RulesList = ({ userId, refresh }) => {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    if (!userId) return;
    setLoading(true);
    api.get(`${BASE_EVENTS}/rules/user/${userId}`)
      .then(r => setRules(r.data))
      .catch(() => setRules([]))
      .finally(() => setLoading(false));
  }, [userId]);

  useEffect(() => { load(); }, [load, refresh]);

  const deleteRule = async (ruleId) => {
    if (!window.confirm('Delete this rule?')) return;
    try {
      await api.delete(`${BASE_EVENTS}/rules/${ruleId}`);
      load();
    } catch { alert('Failed to delete.'); }
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <button onClick={() => { setOpen(v => !v); if (!open) load(); }}
        style={{ ...btnSecondary, marginBottom: open ? 10 : 0 }}>
        {open ? '▲ Hide Rules' : '▼ My Alert Rules'}
        {rules.length > 0 && (
          <span style={{ marginLeft: 6, background: '#f0ebe3', color: '#888', borderRadius: 10, padding: '1px 7px', fontSize: 11 }}>{rules.length}</span>
        )}
      </button>

      {open && (
        <div>
          {loading ? (
            <div style={{ color: '#bbb', fontSize: 13, padding: 10 }}>Loading rules…</div>
          ) : rules.length === 0 ? (
            <div style={{ color: '#bbb', fontSize: 13, padding: 10 }}>No rules yet.</div>
          ) : (
            rules.map(rule => (
              <div key={rule.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between',
                background: '#fafaf8', border: '1px solid #e0d8cf', borderRadius: 8,
                padding: '8px 12px', marginBottom: 6,
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#444' }}>{rule.name}</span>
                    <span style={{
                      fontSize: 10, padding: '1px 7px', borderRadius: 10, fontWeight: 700,
                      background: rule.is_active ? '#e8f5e9' : '#f5f5f5',
                      color: rule.is_active ? '#2e7d32' : '#9e9e9e',
                      border: `1px solid ${rule.is_active ? '#a5d6a7' : '#e0e0e0'}`,
                    }}>{rule.is_active ? 'Active' : 'Inactive'}</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>
                    {rule.event_type?.replace(/_/g, ' ')} · {rule.condition?.metric} {rule.condition?.operator} {rule.condition?.value}
                  </div>
                </div>
                <button onClick={() => deleteRule(rule.id)} style={{
                  background: 'none', border: '1px solid #ffcdd2', color: '#e53935',
                  borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer',
                }}>Delete</button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

// ── Filter bar ────────────────────────────────────────────────────────────────
const FilterBar = ({ filter, setFilter }) => {
  const statusOpts = ['ALL', ...STATUSES];
  const sevOpts = ['ALL', 'CRITICAL', 'ERROR', 'WARNING', 'INFO'];
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
      <div style={{ display: 'flex', gap: 0, border: '1px solid #e0d8cf', borderRadius: 8, overflow: 'hidden' }}>
        {statusOpts.map(s => (
          <button key={s} onClick={() => setFilter(f => ({ ...f, status: s }))} style={{
            padding: '5px 12px', fontSize: 11, fontWeight: 700, border: 'none', cursor: 'pointer',
            background: filter.status === s ? 'var(--color-accent-soil,#6b4c2a)' : '#f5f0ea',
            color: filter.status === s ? '#fff' : '#888', textTransform: 'uppercase', letterSpacing: '0.04em',
          }}>{s}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 0, border: '1px solid #e0d8cf', borderRadius: 8, overflow: 'hidden' }}>
        {sevOpts.map(s => (
          <button key={s} onClick={() => setFilter(f => ({ ...f, severity: s }))} style={{
            padding: '5px 12px', fontSize: 11, fontWeight: 700, border: 'none', cursor: 'pointer',
            background: filter.severity === s ? 'var(--color-accent-soil,#6b4c2a)' : '#f5f0ea',
            color: filter.severity === s ? '#fff' : '#888', textTransform: 'uppercase', letterSpacing: '0.04em',
          }}>{s}</button>
        ))}
      </div>
    </div>
  );
};

// ── Main export ───────────────────────────────────────────────────────────────
const AlertsPanel = ({ userId, locationId }) => {
  const [open, setOpen]       = useState(true);
  const [tab, setTab]         = useState('events'); // 'events' | 'rules'
  const [events, setEvents]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [rulesVer, setRulesVer] = useState(0);
  const [filter, setFilter]   = useState({ status: 'ALL', severity: 'ALL' });

  const loadEvents = useCallback(() => {
    if (!userId) return;
    setLoading(true);
    api.get(`${BASE_EVENTS}/user/${userId}`)
      .then(r => setEvents(r.data))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, [userId]);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  const filtered = events.filter(e => {
    if (filter.status !== 'ALL' && e.status !== filter.status) return false;
    if (filter.severity !== 'ALL' && e.severity !== filter.severity) return false;
    return true;
  });

  const activeCount = events.filter(e => e.status === 'ACTIVE').length;
  const criticalCount = events.filter(e => e.severity === 'CRITICAL' && e.status === 'ACTIVE').length;

  return (
    <div style={panelWrap}>
      {/* Header */}
      <div style={panelHead} onClick={() => setOpen(v => !v)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>🔔</span>
          <span style={titleStyle}>Alerts</span>
          {activeCount > 0 && (
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 700,
              background: criticalCount > 0 ? '#fce4ec' : '#fff8e1',
              color: criticalCount > 0 ? '#c62828' : '#e65100',
              border: `1px solid ${criticalCount > 0 ? '#ef9a9a' : '#ffcc02'}`,
            }}>{activeCount} active{criticalCount > 0 ? ` · ${criticalCount} critical` : ''}</span>
          )}
        </div>
        <span style={{ color: '#bbb', fontSize: 13 }}>{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div style={panelBody}>
          {/* Sub-tabs */}
          <div style={{ display: 'flex', gap: 0, marginBottom: 16, border: '1px solid #e0d8cf', borderRadius: 8, overflow: 'hidden', width: 'fit-content' }}>
            {[['events', '🔔 Events'], ['rules', '⚙️ Rules']].map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} style={{
                padding: '7px 18px', fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer',
                background: tab === k ? 'var(--color-accent-soil, #6b4c2a)' : '#f5f0ea',
                color: tab === k ? '#fff' : '#888',
              }}>{l}</button>
            ))}
          </div>

          {tab === 'events' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10, marginBottom: 4 }}>
                <FilterBar filter={filter} setFilter={setFilter} />
                <button onClick={loadEvents} style={btnSecondary}>↻ Refresh</button>
              </div>

              {loading ? (
                <div style={{ color: '#bbb', padding: 16, textAlign: 'center', fontSize: 13 }}>Loading events…</div>
              ) : filtered.length === 0 ? (
                <div style={{ color: '#bbb', padding: 16, textAlign: 'center', fontSize: 13 }}>
                  {events.length === 0 ? 'No alerts. All good! 🌿' : 'No events match the current filter.'}
                </div>
              ) : (
                <div>
                  {filtered.map(e => (
                    <AlertRow key={e.id} event={e} onStatusChange={loadEvents} />
                  ))}
                </div>
              )}
            </>
          )}

          {tab === 'rules' && (
            <>
              <div style={{ fontSize: 12, color: '#aaa', marginBottom: 12 }}>
                Create rules from ready-made templates or define your own conditions.
              </div>
              <RuleCreator userId={userId} locationId={locationId} onCreated={() => setRulesVer(v => v + 1)} />
              <RulesList userId={userId} refresh={rulesVer} />
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default AlertsPanel;

// ── Styles ────────────────────────────────────────────────────────────────────
const panelWrap  = { background: '#fff', borderRadius: 14, border: '1px solid var(--color-accent-soil)', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', overflow: 'hidden', marginBottom: 20 };
const panelHead  = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 20px', cursor: 'pointer', background: 'var(--color-bg-champagne)', borderBottom: '1px solid var(--color-accent-soil)', userSelect: 'none' };
const panelBody  = { padding: '16px 20px 20px' };
const titleStyle = { fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, color: 'var(--color-accent-chernozem)' };
const btnPrimary   = { background: 'var(--color-green-primary, #054e05)', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' };
const btnSecondary = { background: '#eee', color: '#555', border: 'none', borderRadius: 6, padding: '7px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' };
const lbl = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 10, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.04em' };