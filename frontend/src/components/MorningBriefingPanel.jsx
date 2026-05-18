/**
 * MorningBriefingPanel.jsx
 *
 * US1 — Daily Morning Prioritization
 * Shows a ranked summary of active risk alerts sorted by severity.
 * Intended to be placed above AlertsPanel in Dashboard.
 *
 * Endpoint: GET /api/v1/events/user/{user_id}
 */

import { useState, useEffect, useCallback } from 'react';
import api from '../api/client';

// ── Risk ranking ──────────────────────────────────────────────────────────────

const RISK_ORDER = { CRITICAL: 0, ERROR: 1, WARNING: 2, INFO: 3 };

const RISK_STYLE = {
  HIGH:   { bg: '#fce4ec', border: '#ef9a9a', text: '#b71c1c', dot: '#e53935' },
  MEDIUM: { bg: '#fff8e1', border: '#ffcc02', text: '#e65100', dot: '#ffa000' },
  LOW:    { bg: '#e3f2fd', border: '#90caf9', text: '#0d47a1', dot: '#1e88e5' },
};

const severityToRisk = (sev) => {
  if (sev === 'CRITICAL' || sev === 'ERROR') return 'HIGH';
  if (sev === 'WARNING') return 'MEDIUM';
  return 'LOW';
};

const EVT_ICONS = {
  DISEASE_DETECTION: '🦠',
  FROST_HAZARD:      '❄️',
  HEAT_STRESS:       '🔥',
  DROUGHT_WARNING:   '🏜️',
  HEAVY_RAIN:        '🌧️',
  HAIL_STORM:        '⛈️',
  HIGH_WIND:         '💨',
  NDVI_DROP:         '🌿',
  METRIC_ANOMALY:    '📊',
  SENSOR_OFFLINE:    '📡',
  LOW_BATTERY:       '🔋',
  PEST_OUTBREAK:     '🐛',
  OTHER:             '⚠️',
};

// ── Sub-components ────────────────────────────────────────────────────────────

const RiskBadge = ({ level }) => {
  const s = RISK_STYLE[level] || RISK_STYLE.LOW;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 10, fontWeight: 700, padding: '2px 9px', borderRadius: 20,
      background: s.bg, color: s.text, border: `1px solid ${s.border}`,
      textTransform: 'uppercase', letterSpacing: '0.05em',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, display: 'inline-block' }} />
      {level}
    </span>
  );
};

const RiskRow = ({ event, rank }) => {
  const risk = severityToRisk(event.severity);
  const icon = EVT_ICONS[event.event_type] || EVT_ICONS.OTHER;
  const model = event.extra_metadata?.model;
  const loc   = event.extra_metadata?.location_label;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '9px 14px', borderRadius: 8, marginBottom: 5,
      background: RISK_STYLE[risk]?.bg || '#f9f9f9',
      border: `1px solid ${RISK_STYLE[risk]?.border || '#ddd'}`,
    }}>
      <span style={{ fontSize: 11, fontWeight: 800, color: '#bbb', minWidth: 18, textAlign: 'center' }}>
        #{rank}
      </span>
      <span style={{ fontSize: 17 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#333' }}>
          {event.event_type.replace(/_/g, ' ')}
          {model ? <span style={{ fontWeight: 400, color: '#888', marginLeft: 6, fontSize: 12 }}>({model})</span> : null}
        </div>
        {loc && <div style={{ fontSize: 11, color: '#aaa', marginTop: 1 }}>{loc}</div>}
      </div>
      <RiskBadge level={risk} />
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

const MorningBriefingPanel = ({ userId }) => {
  const [open, setOpen]       = useState(true);
  const [events, setEvents]   = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (!userId) return;
    setLoading(true);
    api.get(`/api/v1/events/user/${userId}`)
      .then(r => setEvents(r.data || []))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const active = events
    .filter(e => e.status === 'ACTIVE')
    .sort((a, b) => (RISK_ORDER[a.severity] ?? 9) - (RISK_ORDER[b.severity] ?? 9));

  const highCount   = active.filter(e => severityToRisk(e.severity) === 'HIGH').length;
  const mediumCount = active.filter(e => severityToRisk(e.severity) === 'MEDIUM').length;

  const now         = new Date();
  const greeting    = now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening';
  const dateStr     = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const overallStatus = highCount > 0 ? 'HIGH' : mediumCount > 0 ? 'MEDIUM' : 'LOW';
  const statusMsg   = {
    HIGH:   'Immediate attention required in some areas.',
    MEDIUM: 'Some areas need monitoring today.',
    LOW:    'All fields look good. Routine checks only.',
  }[overallStatus];

  return (
    <div style={wrap}>
      <div style={head} onClick={() => setOpen(v => !v)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>☀️</span>
          <span style={titleSt}>Morning Briefing</span>
          <span style={{ fontSize: 11, color: '#aaa', fontWeight: 400 }}>{dateStr}</span>
          {!loading && active.length > 0 && <RiskBadge level={overallStatus} />}
        </div>
        <span style={{ color: '#bbb', fontSize: 13 }}>{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div style={body}>
          {loading ? (
            <div style={{ color: '#bbb', textAlign: 'center', padding: 20, fontSize: 13 }}>
              Loading briefing…
            </div>
          ) : (
            <>
              <div style={{
                padding: '10px 14px', borderRadius: 8, marginBottom: 12,
                background: RISK_STYLE[overallStatus].bg,
                border: `1px solid ${RISK_STYLE[overallStatus].border}`,
                fontSize: 13, color: RISK_STYLE[overallStatus].text, fontWeight: 600,
              }}>
                {greeting}. {statusMsg}
                {active.length > 0 && (
                  <span style={{ fontWeight: 400, color: '#888', marginLeft: 6 }}>
                    {highCount > 0 ? `${highCount} high · ` : ''}
                    {mediumCount > 0 ? `${mediumCount} medium · ` : ''}
                    {active.length} total active
                  </span>
                )}
              </div>

              {active.length === 0 ? (
                <div style={{ color: '#aaa', fontSize: 13, padding: '8px 0' }}>
                  No active alerts — all fields clear 🌿
                </div>
              ) : (
                active.slice(0, 8).map((e, i) => (
                  <RiskRow key={e.id} event={e} rank={i + 1} />
                ))
              )}

              {active.length > 8 && (
                <div style={{ fontSize: 12, color: '#aaa', marginTop: 6, textAlign: 'center' }}>
                  +{active.length - 8} more — see Alerts panel below
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default MorningBriefingPanel;

// ── Styles ────────────────────────────────────────────────────────────────────
const wrap    = { background: '#fff', borderRadius: 14, border: '1px solid var(--color-accent-soil)', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', overflow: 'hidden', marginBottom: 20 };
const head    = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 20px', cursor: 'pointer', background: 'var(--color-bg-champagne)', borderBottom: '1px solid var(--color-accent-soil)', userSelect: 'none' };
const body    = { padding: '16px 20px 20px' };
const titleSt = { fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, color: 'var(--color-accent-chernozem)' };