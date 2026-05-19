import { useState, useEffect, useCallback } from 'react';
import api from '../api/client';
import { useLang } from '../context/LanguageContext';

const BASE = '/api/v1/events/tasks';

// status/priority config — labels теперь из locale
const STATUS_KEYS = ['TODO','IN_PROGRESS','ON_HOLD','REVIEW','COMPLETED','CANCELLED'];
const PRIORITY_KEYS = ['LOW','MEDIUM','HIGH','CRITICAL'];

const STATUS_STYLE = {
  TODO:        { bg: '#f3f4f6', text: '#374151', border: '#d1d5db' },
  IN_PROGRESS: { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
  ON_HOLD:     { bg: '#fef9c3', text: '#854d0e', border: '#fde047' },
  REVIEW:      { bg: '#ede9fe', text: '#5b21b6', border: '#c4b5fd' },
  COMPLETED:   { bg: '#dcfce7', text: '#166534', border: '#86efac' },
  CANCELLED:   { bg: '#f5f5f5', text: '#9e9e9e', border: '#e0e0e0' },
};
const PRIORITY_STYLE = {
  LOW:      { color: '#6b7280', dot: '#9ca3af' },
  MEDIUM:   { color: '#d97706', dot: '#fbbf24' },
  HIGH:     { color: '#dc2626', dot: '#f87171' },
  CRITICAL: { color: '#7c3aed', dot: '#a78bfa' },
};

const TASK_TYPES = [
  'IRRIGATION','SPRAYING','FERTILIZATION','HARVESTING','SOWING',
  'PLANTING','PLOWING','HARROWING','MOWING','WEEDING',
  'SOIL_SAMPLING','MAINTENANCE','INSPECTION','OTHER',
];

const StatusPill = ({ status }) => {
  const { t } = useLang();
  const c = STATUS_STYLE[status] || STATUS_STYLE.TODO;
  const labelKey = `task_status_${status.toLowerCase()}`;
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: c.bg, color: c.text, border: `1px solid ${c.border}`, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
      {t(labelKey)}
    </span>
  );
};

const PriorityDot = ({ priority }) => {
  const { t } = useLang();
  const c = PRIORITY_STYLE[priority] || PRIORITY_STYLE.MEDIUM;
  const labelKey = `task_priority_${priority.toLowerCase()}`;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: c.color, fontWeight: 700 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.dot, flexShrink: 0 }} />
      {t(labelKey)}
    </span>
  );
};

const CreateTaskForm = ({ userId, onCreated }) => {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [busy, setBusy]  = useState(false);
  const [form, setForm]  = useState({ task_type: 'INSPECTION', priority: 'MEDIUM', status: 'TODO', task_timestamp: new Date().toISOString().slice(0, 16), extra_metadata: { note: '' } });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    setBusy(true);
    try {
      await api.post(BASE, { user_id: userId, task_type: form.task_type, priority: form.priority, status: form.status, task_timestamp: new Date(form.task_timestamp).toISOString(), extra_metadata: form.extra_metadata.note ? { note: form.extra_metadata.note } : null });
      setOpen(false);
      setForm({ task_type: 'INSPECTION', priority: 'MEDIUM', status: 'TODO', task_timestamp: new Date().toISOString().slice(0, 16), extra_metadata: { note: '' } });
      onCreated();
    } catch { alert(t('tasks_err_create')); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ marginBottom: 14 }}>
      <button onClick={() => setOpen(v => !v)} style={btnAdd}>
        {open ? t('tasks_cancel_btn') : t('tasks_new_btn')}
      </button>

      {open && (
        <div style={formBox}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
            <label style={lbl}>
              {t('tasks_form_type')}
              <select value={form.task_type} onChange={e => set('task_type', e.target.value)} style={inp}>
                {TASK_TYPES.map(tp => <option key={tp} value={tp}>{tp.replace(/_/g, ' ')}</option>)}
              </select>
            </label>
            <label style={lbl}>
              {t('tasks_form_priority')}
              <select value={form.priority} onChange={e => set('priority', e.target.value)} style={inp}>
                {PRIORITY_KEYS.map(p => <option key={p} value={p}>{t(`task_priority_${p.toLowerCase()}`)}</option>)}
              </select>
            </label>
            <label style={lbl}>
              {t('tasks_form_status')}
              <select value={form.status} onChange={e => set('status', e.target.value)} style={inp}>
                {STATUS_KEYS.map(s => <option key={s} value={s}>{t(`task_status_${s.toLowerCase()}`)}</option>)}
              </select>
            </label>
            <label style={lbl}>
              {t('tasks_form_scheduled')}
              <input type="datetime-local" value={form.task_timestamp} onChange={e => set('task_timestamp', e.target.value)} style={inp} />
            </label>
            <label style={{ ...lbl, flex: 1, minWidth: 200 }}>
              {t('tasks_form_note')}
              <input placeholder={t('tasks_form_note_ph')} value={form.extra_metadata.note}
                onChange={e => setForm(f => ({ ...f, extra_metadata: { note: e.target.value } }))}
                style={{ ...inp, width: '100%' }} />
            </label>
          </div>
          <button onClick={submit} disabled={busy} style={{ ...btnPrimary, marginTop: 12 }}>
            {busy ? t('tasks_creating') : t('tasks_create_btn')}
          </button>
        </div>
      )}
    </div>
  );
};

const TaskRow = ({ task, onUpdate }) => {
  const { t } = useLang();
  const [updating, setUpdating] = useState(false);
  const [open, setOpen]         = useState(false);

  const ts = task.task_timestamp
    ? new Date(task.task_timestamp).toLocaleString('hu-HU', { dateStyle: 'short', timeStyle: 'short' })
    : '—';

  const changeStatus = async (status) => {
    setUpdating(true);
    try { await api.patch(`${BASE}/${task.id}`, { status }); onUpdate(); }
    catch { alert(t('tasks_err_update')); }
    finally { setUpdating(false); }
  };

  const changePriority = async (priority) => {
    setUpdating(true);
    try { await api.patch(`${BASE}/${task.id}`, { priority }); onUpdate(); }
    catch { alert(t('tasks_err_update')); }
    finally { setUpdating(false); }
  };

  return (
    <div style={{ border: '1px solid #e8e0d6', borderRadius: 10, overflow: 'hidden', marginBottom: 6, background: '#fafaf8' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer', userSelect: 'none' }} onClick={() => setOpen(v => !v)}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#333' }}>{task.task_type?.replace(/_/g, ' ')}</span>
            <StatusPill status={task.status} />
            <PriorityDot priority={task.priority} />
          </div>
          <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>
            📅 {ts}{task.extra_metadata?.note && <> · {task.extra_metadata.note}</>}
          </div>
        </div>
        <span style={{ color: '#ccc', fontSize: 12 }}>{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div style={{ padding: '10px 14px 14px', borderTop: '1px solid #ede7df', background: '#fff' }}>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{t('tasks_change_status')}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {STATUS_KEYS.map(s => {
                const c = STATUS_STYLE[s];
                const active = s === task.status;
                return (
                  <button key={s} disabled={updating || active} onClick={() => changeStatus(s)} style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: active ? 'default' : 'pointer', background: active ? c.bg : '#f5f5f5', color: active ? c.text : '#999', border: active ? `1px solid ${c.border}` : '1px solid #e0e0e0', opacity: updating ? 0.5 : 1, transition: 'all 0.15s', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {t(`task_status_${s.toLowerCase()}`)}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{t('tasks_change_priority')}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {PRIORITY_KEYS.map(p => {
                const c = PRIORITY_STYLE[p];
                const active = p === task.priority;
                return (
                  <button key={p} disabled={updating || active} onClick={() => changePriority(p)} style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: active ? 'default' : 'pointer', background: active ? '#fff3e0' : '#f5f5f5', color: active ? c.color : '#999', border: active ? `1px solid ${c.dot}` : '1px solid #e0e0e0', opacity: updating ? 0.5 : 1, transition: 'all 0.15s' }}>
                    {t(`task_priority_${p.toLowerCase()}`)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const TasksPanel = ({ userId }) => {
  const { t } = useLang();
  const [open, setOpen]               = useState(true);
  const [tasks, setTasks]             = useState([]);
  const [loading, setLoading]         = useState(true);
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

  const filtered    = filterStatus === 'ALL' ? tasks : tasks.filter(tk => tk.status === filterStatus);
  const activeCount = tasks.filter(tk => !['COMPLETED','CANCELLED'].includes(tk.status)).length;

  return (
    <div style={panelWrap}>
      <div style={panelHead} onClick={() => setOpen(v => !v)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>✅</span>
          <span style={titleStyle}>{t('tasks_title')}</span>
          <span style={badge}>{t('tasks_total', tasks.length)}</span>
          {activeCount > 0 && <span style={{ ...badge, background: '#dbeafe', color: '#1e40af' }}>{t('tasks_active', activeCount)}</span>}
        </div>
        <span style={{ color: '#bbb', fontSize: 13 }}>{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div style={panelBody}>
          <CreateTaskForm userId={userId} onCreated={load} />

          <div style={{ display: 'flex', gap: 0, marginBottom: 14, border: '1px solid #e0d8cf', borderRadius: 8, overflow: 'hidden', width: 'fit-content' }}>
            {['ALL', ...STATUS_KEYS].map(s => (
              <button key={s} onClick={() => setFilterStatus(s)} style={{ padding: '5px 11px', fontSize: 11, fontWeight: 700, border: 'none', cursor: 'pointer', background: filterStatus === s ? 'var(--color-accent-soil,#6b4c2a)' : '#f5f0ea', color: filterStatus === s ? '#fff' : '#888', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                {s === 'ALL' ? t('tasks_filter_all') : t(`task_status_${s.toLowerCase()}`)}
              </button>
            ))}
          </div>

          {loading ? (
            <div style={{ color: '#bbb', padding: 16, textAlign: 'center', fontSize: 13 }}>{t('tasks_loading')}</div>
          ) : filtered.length === 0 ? (
            <div style={{ color: '#bbb', padding: 16, textAlign: 'center', fontSize: 13 }}>
              {tasks.length === 0 ? t('tasks_empty_all') : t('tasks_empty_filter')}
            </div>
          ) : (
            filtered.map(tk => <TaskRow key={tk.id} task={tk} onUpdate={load} />)
          )}
        </div>
      )}
    </div>
  );
};

export default TasksPanel;

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