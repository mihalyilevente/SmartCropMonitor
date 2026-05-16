/**
 * TasksPanel.jsx
 *
 * Endpoints:
 *   GET   /api/v1/events/tasks?user_id=1
 *   POST  /api/v1/events/tasks
 *   PATCH /api/v1/events/tasks/{task_id}
 *
 * Status_task:  TODO | IN_PROGRESS | ON_HOLD | REVIEW | COMPLETED | CANCELLED
 * Priority_task: LOW | MEDIUM | HIGH | CRITICAL
 */
import { useState, useEffect, useCallback } from 'react';
import api from '../api/client';

const BASE = '/api/v1/events/tasks';

const STATUS_CFG = {
  TODO:        { label: 'To Do',       bg: '#f3f4f6', text: '#374151', border: '#d1d5db' },
  IN_PROGRESS: { label: 'In Progress', bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
  ON_HOLD:     { label: 'On Hold',     bg: '#fef9c3', text: '#854d0e', border: '#fde047' },
  REVIEW:      { label: 'Review',      bg: '#ede9fe', text: '#5b21b6', border: '#c4b5fd' },
  COMPLETED:   { label: 'Completed',   bg: '#dcfce7', text: '#166534', border: '#86efac' },
  CANCELLED:   { label: 'Cancelled',   bg: '#f5f5f5', text: '#9e9e9e', border: '#e0e0e0' },
};

const PRIORITY_CFG = {
  LOW:      { label: 'Low',      color: '#6b7280', dot: '#9ca3af' },
  MEDIUM:   { label: 'Medium',   color: '#d97706', dot: '#fbbf24' },
  HIGH:     { label: 'High',     color: '#dc2626', dot: '#f87171' },
  CRITICAL: { label: 'Critical', color: '#7c3aed', dot: '#a78bfa' },
};

const TASK_TYPES = [
  'IRRIGATION', 'SPRAYING', 'FERTILIZATION', 'HARVESTING', 'SOWING',
  'PLANTING', 'PLOWING', 'HARROWING', 'MOWING', 'WEEDING',
  'SOIL_SAMPLING', 'MAINTENANCE', 'INSPECTION', 'OTHER',
];

// ── Pill badge ────────────────────────────────────────────────────────────────
const StatusPill = ({ status }) => {
  const c = STATUS_CFG[status] || STATUS_CFG.TODO;
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
      background: c.bg, color: c.text, border: `1px solid ${c.border}`,
      textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap',
    }}>{c.label}</span>
  );
};

const PriorityDot = ({ priority }) => {
  const c = PRIORITY_CFG[priority] || PRIORITY_CFG.MEDIUM;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: c.color, fontWeight: 700 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.dot, flexShrink: 0 }} />
      {c.label}
    </span>
  );
};

// ── Create task form ──────────────────────────────────────────────────────────
const CreateTaskForm = ({ userId, onCreated }) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    task_type: 'INSPECTION',
    priority: 'MEDIUM',
    status: 'TODO',
    task_timestamp: new Date().toISOString().slice(0, 16),
    extra_metadata: { note: '' },
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    setBusy(true);
    try {
      await api.post(BASE, {
        user_id: userId,
        task_type: form.task_type,
        priority: form.priority,
        status: form.status,
        task_timestamp: new Date(form.task_timestamp).toISOString(),
        extra_metadata: form.extra_metadata.note ? { note: form.extra_metadata.note } : null,
      });
      setOpen(false);
      setForm({ task_type: 'INSPECTION', priority: 'MEDIUM', status: 'TODO', task_timestamp: new Date().toISOString().slice(0, 16), extra_metadata: { note: '' } });
      onCreated();
    } catch { alert('Failed to create task.'); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ marginBottom: 14 }}>
      <button onClick={() => setOpen(v => !v)} style={btnAdd}>
        {open ? '✕ Cancel' : '＋ New Task'}
      </button>

      {open && (
        <div style={formBox}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
            <label style={lbl}>
              Task type
              <select value={form.task_type} onChange={e => set('task_type', e.target.value)} style={inp}>
                {TASK_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select>
            </label>
            <label style={lbl}>
              Priority
              <select value={form.priority} onChange={e => set('priority', e.target.value)} style={inp}>
                {Object.keys(PRIORITY_CFG).map(p => <option key={p} value={p}>{PRIORITY_CFG[p].label}</option>)}
              </select>
            </label>
            <label style={lbl}>
              Status
              <select value={form.status} onChange={e => set('status', e.target.value)} style={inp}>
                {Object.keys(STATUS_CFG).map(s => <option key={s} value={s}>{STATUS_CFG[s].label}</option>)}
              </select>
            </label>
            <label style={lbl}>
              Scheduled for
              <input type="datetime-local" value={form.task_timestamp}
                onChange={e => set('task_timestamp', e.target.value)} style={inp} />
            </label>
            <label style={{ ...lbl, flex: 1, minWidth: 200 }}>
              Note
              <input placeholder="Optional note…" value={form.extra_metadata.note}
                onChange={e => setForm(f => ({ ...f, extra_metadata: { note: e.target.value } }))}
                style={{ ...inp, width: '100%' }} />
            </label>
          </div>
          <button onClick={submit} disabled={busy} style={{ ...btnPrimary, marginTop: 12 }}>
            {busy ? 'Creating…' : 'Create Task'}
          </button>
        </div>
      )}
    </div>
  );
};

// ── Task row ──────────────────────────────────────────────────────────────────
const TaskRow = ({ task, onUpdate }) => {
  const [updating, setUpdating] = useState(false);
  const [open, setOpen] = useState(false);

  const ts = task.task_timestamp
    ? new Date(task.task_timestamp).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })
    : '—';

  const changeStatus = async (status) => {
    setUpdating(true);
    try {
      await api.patch(`${BASE}/${task.id}`, { status });
      onUpdate();
    } catch { alert('Update failed.'); }
    finally { setUpdating(false); }
  };

  const changePriority = async (priority) => {
    setUpdating(true);
    try {
      await api.patch(`${BASE}/${task.id}`, { priority });
      onUpdate();
    } catch { alert('Update failed.'); }
    finally { setUpdating(false); }
  };

  return (
    <div style={{ border: '1px solid #e8e0d6', borderRadius: 10, overflow: 'hidden', marginBottom: 6, background: '#fafaf8' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setOpen(v => !v)}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#333' }}>
              {task.task_type?.replace(/_/g, ' ')}
            </span>
            <StatusPill status={task.status} />
            <PriorityDot priority={task.priority} />
          </div>
          <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>
            📅 {ts}
            {task.extra_metadata?.note && <> · {task.extra_metadata.note}</>}
          </div>
        </div>
        <span style={{ color: '#ccc', fontSize: 12 }}>{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div style={{ padding: '10px 14px 14px', borderTop: '1px solid #ede7df', background: '#fff' }}>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
              Change Status
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {Object.entries(STATUS_CFG).map(([s, c]) => (
                <button key={s} disabled={updating || s === task.status} onClick={() => changeStatus(s)}
                  style={{
                    padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                    cursor: s === task.status ? 'default' : 'pointer',
                    background: s === task.status ? c.bg : '#f5f5f5',
                    color: s === task.status ? c.text : '#999',
                    border: s === task.status ? `1px solid ${c.border}` : '1px solid #e0e0e0',
                    opacity: updating ? 0.5 : 1, transition: 'all 0.15s',
                    textTransform: 'uppercase', letterSpacing: '0.04em',
                  }}>{c.label}</button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
              Change Priority
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {Object.entries(PRIORITY_CFG).map(([p, c]) => (
                <button key={p} disabled={updating || p === task.priority} onClick={() => changePriority(p)}
                  style={{
                    padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                    cursor: p === task.priority ? 'default' : 'pointer',
                    background: p === task.priority ? '#fff3e0' : '#f5f5f5',
                    color: p === task.priority ? c.color : '#999',
                    border: p === task.priority ? `1px solid ${c.dot}` : '1px solid #e0e0e0',
                    opacity: updating ? 0.5 : 1, transition: 'all 0.15s',
                  }}>{c.label}</button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Main export ───────────────────────────────────────────────────────────────
const TasksPanel = ({ userId }) => {
  const [open, setOpen] = useState(true);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('ALL');

  const load = useCallback(() => {
    if (!userId) return;
    setLoading(true);
    api.get(BASE, { params: { user_id: userId } })
      .then(r => setTasks(r.data))
      .catch(() => setTasks([]))
      .finally(() => setLoading(false));
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const filtered = filterStatus === 'ALL'
    ? tasks
    : tasks.filter(t => t.status === filterStatus);

  const activeCount = tasks.filter(t => !['COMPLETED','CANCELLED'].includes(t.status)).length;

  return (
    <div style={panelWrap}>
      <div style={panelHead} onClick={() => setOpen(v => !v)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>✅</span>
          <span style={titleStyle}>Tasks</span>
          <span style={badge}>{tasks.length} total</span>
          {activeCount > 0 && <span style={{ ...badge, background: '#dbeafe', color: '#1e40af' }}>{activeCount} active</span>}
        </div>
        <span style={{ color: '#bbb', fontSize: 13 }}>{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div style={panelBody}>
          <CreateTaskForm userId={userId} onCreated={load} />

          {/* Filter */}
          <div style={{ display: 'flex', gap: 0, marginBottom: 14, border: '1px solid #e0d8cf', borderRadius: 8, overflow: 'hidden', width: 'fit-content' }}>
            {['ALL', ...Object.keys(STATUS_CFG)].map(s => (
              <button key={s} onClick={() => setFilterStatus(s)} style={{
                padding: '5px 11px', fontSize: 11, fontWeight: 700, border: 'none', cursor: 'pointer',
                background: filterStatus === s ? 'var(--color-accent-soil,#6b4c2a)' : '#f5f0ea',
                color: filterStatus === s ? '#fff' : '#888',
                textTransform: 'uppercase', letterSpacing: '0.03em',
              }}>{s === 'ALL' ? 'All' : STATUS_CFG[s].label}</button>
            ))}
          </div>

          {loading ? (
            <div style={{ color: '#bbb', padding: 16, textAlign: 'center', fontSize: 13 }}>Loading tasks…</div>
          ) : filtered.length === 0 ? (
            <div style={{ color: '#bbb', padding: 16, textAlign: 'center', fontSize: 13 }}>
              {tasks.length === 0 ? 'No tasks yet. Create one above.' : 'No tasks match filter.'}
            </div>
          ) : (
            filtered.map(t => <TaskRow key={t.id} task={t} onUpdate={load} />)
          )}
        </div>
      )}
    </div>
  );
};

export default TasksPanel;

// ── Styles ────────────────────────────────────────────────────────────────────
const panelWrap  = { background: '#fff', borderRadius: 14, border: '1px solid var(--color-accent-soil)', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', overflow: 'hidden', marginBottom: 20 };
const panelHead  = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 20px', cursor: 'pointer', background: 'var(--color-bg-champagne)', borderBottom: '1px solid var(--color-accent-soil)', userSelect: 'none' };
const panelBody  = { padding: '16px 20px 20px' };
const titleStyle = { fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, color: 'var(--color-accent-chernozem)' };
const badge      = { fontSize: 11, color: '#aaa', background: '#f0ebe3', borderRadius: 10, padding: '2px 8px' };
const formBox    = { background: '#f8f4f0', borderRadius: 10, border: '1px solid #e0d8cf', padding: 14, marginTop: 10 };
const inp        = { padding: '6px 10px', borderRadius: 6, border: '1px solid #ddd', fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fff' };
const lbl        = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 10, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.04em' };
const btnPrimary = { background: 'var(--color-green-primary,#054e05)', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' };
const btnAdd     = { background: 'var(--color-accent-mulberry,#470736)', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' };