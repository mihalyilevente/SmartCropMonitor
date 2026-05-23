import { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis, Legend, CartesianGrid,
} from 'recharts';
import api from '../api/client';
import { useLang } from '../context/LanguageContext';

const BASE = '/api/v1/fieldwork';

const WORK_TYPES = [
  'PLOWING','SUBSOILING','DISCING','HARROWING','CULTIVATION','ROLLING',
  'SOWING','PLANTING','FERTILIZATION','SPRAYING','IRRIGATION','WEEDING',
  'PRUNING','GRAFTING','MULCHING','THINNING','TRELLIS_REPAIR',
  'MOWING','RAKING','BALING','GRAZING','HARVESTING','DESICCATION',
  'SOIL_SAMPLING','MAINTENANCE',
];

const STATUS_CFG = {
  DRAFT:       { bg: '#f5f5f5', text: '#757575', border: '#e0e0e0' },
  PLANNED:     { bg: '#e3f2fd', text: '#0d47a1', border: '#90caf9' },
  SCHEDULED:   { bg: '#e8eaf6', text: '#283593', border: '#9fa8da' },
  ON_HOLD:     { bg: '#fff9c4', text: '#f57f17', border: '#fff176' },
  IN_PROGRESS: { bg: '#e1f5fe', text: '#01579b', border: '#81d4fa' },
  COMPLETED:   { bg: '#e8f5e9', text: '#1b5e20', border: '#a5d6a7' },
  VERIFIED:    { bg: '#f3e5f5', text: '#4a148c', border: '#ce93d8' },
  CANCELLED:   { bg: '#f5f5f5', text: '#9e9e9e', border: '#e0e0e0' },
  FAILED:      { bg: '#fce4ec', text: '#b71c1c', border: '#ef9a9a' },
};

const STATUS_COLORS = {
  DRAFT:'#bdbdbd', PLANNED:'#1565c0', SCHEDULED:'#283593', ON_HOLD:'#f9a825',
  IN_PROGRESS:'#0277bd', COMPLETED:'#2e7d32', VERIFIED:'#6a1b9a',
  CANCELLED:'#9e9e9e', FAILED:'#c62828',
};

const WORK_ICONS = {
  PLOWING:'🚜', SUBSOILING:'⛏️', DISCING:'⚙️', HARROWING:'🔧', CULTIVATION:'🌱',
  ROLLING:'🛞', SOWING:'🌾', PLANTING:'🪴', FERTILIZATION:'🧪', SPRAYING:'💧',
  IRRIGATION:'🚿', WEEDING:'🌿', PRUNING:'✂️', GRAFTING:'🔗', MULCHING:'🍂',
  THINNING:'🔪', TRELLIS_REPAIR:'🪝', MOWING:'🌿', RAKING:'🪣', BALING:'📦',
  GRAZING:'🐄', HARVESTING:'🌾', DESICCATION:'☀️', SOIL_SAMPLING:'🧫',
  MAINTENANCE:'🔨',
};

const PALETTE = [
  '#6b4c2a','#054e05','#8d6e63','#388e3c','#5d4037',
  '#2e7d32','#a1887f','#1b5e20','#795548','#4caf50',
  '#bf360c','#e65100','#827717','#f9a825',
];

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtEur  = v => `${Number(v || 0).toFixed(0)} €`;
const fmtTon  = v => `${Number(v || 0).toFixed(2)} t`;
const fmtPct  = v => `${Math.round((v || 0) * 100)}%`;
const fmtHa   = v => v != null ? `${Number(v).toFixed(1)} ha` : '—';

const YearPicker = ({ year, setYear }) => {
  const cur = new Date().getFullYear();
  return (
    <div style={{ display:'flex', gap:0, border:'1px solid #e0d8cf', borderRadius:8,
      overflow:'hidden', width:'fit-content', marginBottom:18 }}>
      {Array.from({length:5},(_,i)=>cur-i).map(y => (
        <button key={y} onClick={()=>setYear(y)} style={{
          padding:'5px 14px', fontSize:12, fontWeight:700, border:'none', cursor:'pointer',
          background: year===y ? 'var(--color-accent-soil,#6b4c2a)' : '#f5f0ea',
          color: year===y ? '#fff' : '#888',
        }}>{y}</button>
      ))}
    </div>
  );
};

const Sec = ({ children }) => (
  <div style={{ fontSize:10, fontWeight:700, color:'#aaa', textTransform:'uppercase',
    letterSpacing:'0.07em', marginBottom:8, marginTop:2 }}>{children}</div>
);

const Card = ({ icon, label, value, sub, color='#6b4c2a' }) => (
  <div style={{ flex:'1 1 130px', background:'#fff', borderRadius:10, padding:'12px 14px',
    border:`1px solid #e8e0d8`, borderLeft:`4px solid ${color}` }}>
    <div style={{ fontSize:18, marginBottom:3 }}>{icon}</div>
    <div style={{ fontSize:10, color:'#aaa', fontWeight:600, marginBottom:1 }}>{label}</div>
    <div style={{ fontSize:19, fontWeight:800, color:'#333' }}>{value}</div>
    {sub && <div style={{ fontSize:11, color:'#bbb', marginTop:1 }}>{sub}</div>}
  </div>
);

const ChartBox = ({ children, style }) => (
  <div style={{ background:'#fafaf8', borderRadius:10, border:'1px solid #ede7df',
    padding:'12px 14px', ...style }}>{children}</div>
);

const EmptyState = ({ text }) => (
  <div style={{ color:'#ccc', textAlign:'center', padding:'24px 0', fontSize:13 }}>{text}</div>
);

const StatusPill = ({ status }) => {
  const c = STATUS_CFG[status] || STATUS_CFG.PLANNED;
  return (
    <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:20,
      background:c.bg, color:c.text, border:`1px solid ${c.border}`,
      textTransform:'uppercase', letterSpacing:'0.05em', whiteSpace:'nowrap' }}>
      {status.replace(/_/g,' ')}
    </span>
  );
};

// ── Create form ───────────────────────────────────────────────────────────────
const CreateWorkForm = ({ userId, fields: fieldsProp, onCreated }) => {
  const { t } = useLang();
  const fields = Array.isArray(fieldsProp) ? fieldsProp : [];
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    field_id:'', work_type:'PLOWING', work_status:'PLANNED',
    work_date: new Date().toISOString().slice(0,16),
    work_cost:'', harvest_ton:'', note:'',
  });
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  useEffect(() => { if (fields.length && !form.field_id) set('field_id', fields[0].id); }, [fields]); // eslint-disable-line

  const submit = async () => {
    if (!form.field_id) { alert(t('fw_err_field')); return; }
    setBusy(true);
    try {
      await api.post(`${BASE}/create`, {
        user_id: userId, field_id: Number(form.field_id),
        work_type: form.work_type, work_status: form.work_status,
        work_date: new Date(form.work_date).toISOString(),
        work_cost: form.work_cost ? Number(form.work_cost) : null,
        harvest_ton: form.harvest_ton ? Number(form.harvest_ton) : null,
        extra_metadata: form.note ? { note: form.note } : null,
      });
      setOpen(false); onCreated();
    } catch { alert(t('fw_err_create')); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ marginBottom:14 }}>
      <button onClick={()=>setOpen(v=>!v)} style={btnAdd}>
        {open ? t('fw_cancel_btn') : t('fw_log_btn')}
      </button>
      {open && (
        <div style={formBox}>
          <div style={{ display:'flex', flexWrap:'wrap', gap:12, alignItems:'flex-end' }}>
            {fields.length > 0 ? (
              <label style={lbl}>{t('fw_field')}
                <select value={form.field_id} onChange={e=>set('field_id',e.target.value)} style={inp}>
                  {fields.map(f=><option key={f.id} value={f.id}>{f.label||`Field ${f.id}`}</option>)}
                </select>
              </label>
            ) : (
              <label style={lbl}>{t('fw_field_id')}
                <input type="number" value={form.field_id} onChange={e=>set('field_id',e.target.value)} style={{...inp,width:120}} />
              </label>
            )}
            <label style={lbl}>{t('fw_work_type')}
              <select value={form.work_type} onChange={e=>set('work_type',e.target.value)} style={inp}>
                {WORK_TYPES.map(tp=><option key={tp} value={tp}>{WORK_ICONS[tp]||'🌾'} {tp.replace(/_/g,' ')}</option>)}
              </select>
            </label>
            <label style={lbl}>{t('fw_status')}
              <select value={form.work_status} onChange={e=>set('work_status',e.target.value)} style={inp}>
                {Object.keys(STATUS_CFG).map(s=><option key={s} value={s}>{t(`fw_status_${s.toLowerCase()}`)}</option>)}
              </select>
            </label>
            <label style={lbl}>{t('fw_date')}
              <input type="datetime-local" value={form.work_date} onChange={e=>set('work_date',e.target.value)} style={inp}/>
            </label>
            <label style={lbl}>{t('fw_cost')}
              <input type="number" value={form.work_cost} onChange={e=>set('work_cost',e.target.value)} style={{...inp,width:100}}/>
            </label>
            <label style={lbl}>{t('fw_harvest')}
              <input type="number" value={form.harvest_ton} onChange={e=>set('harvest_ton',e.target.value)} style={{...inp,width:110}}/>
            </label>
            <label style={{...lbl,flex:1,minWidth:200}}>{t('fw_note')}
              <input value={form.note} onChange={e=>set('note',e.target.value)} style={{...inp,width:'100%'}}/>
            </label>
          </div>
          <button onClick={submit} disabled={busy} style={{...btnPrimary,marginTop:12}}>
            {busy ? t('fw_saving') : t('fw_save_btn')}
          </button>
        </div>
      )}
    </div>
  );
};

// ── Work row ──────────────────────────────────────────────────────────────────
const WorkRow = ({ record, onUpdate }) => {
  const { t } = useLang();
  const [open,setOpen]=[useState(false)][0];const[_open,_setOpen]=useState(false);
  const [updating,setUpdating]=useState(false);
  const icon=WORK_ICONS[record.work_type]||'🌾';
  const ts=record.work_date ? new Date(record.work_date).toLocaleString('hu-HU',{dateStyle:'medium',timeStyle:'short'}) : '—';
  const sc=STATUS_CFG[record.work_status]||STATUS_CFG.PLANNED;

  const changeStatus=async s=>{
    if(s===record.work_status)return;
    setUpdating(true);
    try{ await api.patch(`${BASE}/${record.id}`,{work_status:s}); onUpdate(); }
    catch{ alert(t('fw_err_status')); } finally{ setUpdating(false); }
  };
  const del=async()=>{
    if(!window.confirm('?'))return;
    try{ await api.delete(`${BASE}/${record.id}`,{params:{user_id:record.user_id}}); onUpdate(); }
    catch{ alert(t('fw_err_delete')); }
  };

  return (
    <div style={{border:`1px solid ${sc.border}`,borderRadius:10,overflow:'hidden',background:'#fafaf8',marginBottom:6}}>
      <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',cursor:'pointer',userSelect:'none',borderLeft:`4px solid ${sc.text}`}}
        onClick={()=>_setOpen(v=>!v)}>
        <span style={{fontSize:18}}>{icon}</span>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
            <span style={{fontSize:13,fontWeight:700,color:'#333'}}>{record.work_type?.replace(/_/g,' ')}</span>
            <StatusPill status={record.work_status}/>
            {record.field_label&&<span style={{fontSize:11,color:'#888'}}>{record.field_label}</span>}
          </div>
          <div style={{fontSize:11,color:'#aaa',marginTop:2,display:'flex',gap:12,flexWrap:'wrap'}}>
            <span>📅 {ts}</span>
            {record.work_cost!=null&&<span>💶 {Number(record.work_cost).toFixed(2)} €</span>}
            {record.harvest_ton!=null&&<span>🌾 {Number(record.harvest_ton).toFixed(3)} t</span>}
            {record.extra_metadata?.note&&<span>📝 {record.extra_metadata.note}</span>}
          </div>
        </div>
        <span style={{color:'#ccc',fontSize:12}}>{_open?'▲':'▼'}</span>
      </div>
      {_open&&(
        <div style={{padding:'10px 14px 14px',borderTop:'1px solid #ede7df',background:'#fff'}}>
          <div style={{fontSize:10,fontWeight:700,color:'#bbb',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:6}}>{t('fw_change_status')}</div>
          <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:12}}>
            {Object.entries(STATUS_CFG).map(([s,c])=>(
              <button key={s} disabled={updating||s===record.work_status} onClick={()=>changeStatus(s)}
                style={{padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:700,
                  cursor:s===record.work_status?'default':'pointer',
                  background:s===record.work_status?c.bg:'#f5f5f5',
                  color:s===record.work_status?c.text:'#999',
                  border:s===record.work_status?`1px solid ${c.border}`:'1px solid #e0e0e0',
                  opacity:updating?0.5:1,transition:'all 0.15s',
                  textTransform:'uppercase',letterSpacing:'0.04em'}}>
                {t(`fw_status_${s.toLowerCase()}`)}
              </button>
            ))}
          </div>
          <button onClick={del} style={{background:'none',border:'1px solid #ffcdd2',color:'#e53935',borderRadius:6,padding:'4px 12px',fontSize:12,cursor:'pointer'}}>
            {t('fw_delete_btn')}
          </button>
        </div>
      )}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// ANALYTICS TAB 1 – Work Types
// ══════════════════════════════════════════════════════════════════════════════
const WorkTypeAnalytics = ({ userId }) => {
  const [data,setData]   = useState(null);
  const [loading,setLoading] = useState(true);
  const [year,setYear]   = useState(new Date().getFullYear());
  const [selected,setSelected] = useState(null); // drill-down work type

  const load = useCallback(()=>{
    if(!userId)return;
    setLoading(true);
    api.get(`${BASE}/analytics/work-types/user/${userId}`,{params:{year}})
      .then(r=>{ setData(r.data); setSelected(null); })
      .catch(()=>setData(null))
      .finally(()=>setLoading(false));
  },[userId,year]);
  useEffect(()=>{ load(); },[load]);

  if(loading) return <EmptyState text="Loading…"/>;
  if(!data||!data.types.length) return <EmptyState text="No data for this period."/>;

  const { types, summary } = data;
  const sel = selected ? types.find(t=>t.work_type===selected) : null;

  // radar data: normalise count, completion_rate, avg_cost (inverted) across top-8
  const top8 = types.slice(0,8);
  const maxCount   = Math.max(...top8.map(t=>t.count),1);
  const maxCost    = Math.max(...top8.map(t=>t.avg_cost),1);
  const radarData  = top8.map(t=>({
    type: (WORK_ICONS[t.work_type]||'') + ' ' + t.work_type.replace(/_/g,' ').toLowerCase(),
    Frequency:   Math.round(t.count/maxCount*100),
    Completion:  Math.round(t.completion_rate*100),
    CostEfficiency: Math.round((1 - t.avg_cost/maxCost)*100),
  }));

  return (
    <div>
      <YearPicker year={year} setYear={setYear}/>

      {/* Summary badges */}
      <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:16}}>
        {[
          {label:'Most frequent',   val: summary.most_frequent?.replace(/_/g,' '),        icon:'🔁'},
          {label:'Best completion', val: summary.best_completion_rate?.replace(/_/g,' '),  icon:'✅'},
          {label:'Most expensive',  val: summary.most_expensive_avg?.replace(/_/g,' '),    icon:'💶'},
          {label:'Needs attention', val: summary.worst_completion_rate?.replace(/_/g,' '), icon:'⚠️'},
        ].filter(b=>b.val).map(b=>(
          <div key={b.label} style={{background:'#fff',borderRadius:8,border:'1px solid #e0d8cf',
            padding:'6px 12px',fontSize:11}}>
            <span style={{fontSize:16,marginRight:6}}>{b.icon}</span>
            <span style={{color:'#aaa',marginRight:4}}>{b.label}:</span>
            <span style={{fontWeight:700,color:'#444',textTransform:'capitalize'}}>{b.val}</span>
          </div>
        ))}
      </div>

      {/* Main chart row */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>

        {/* Count + completion horizontal bars */}
        <ChartBox>
          <Sec>Operations count &amp; completion by type</Sec>
          <ResponsiveContainer width="100%" height={Math.max(160, types.length*26)}>
            <BarChart layout="vertical"
              data={types.map(d=>({...d,label:(WORK_ICONS[d.work_type]||'') + ' ' + d.work_type.replace(/_/g,' ').toLowerCase()}))}
              margin={{top:0,right:16,left:4,bottom:0}}
              onClick={e=>e?.activePayload && setSelected(e.activePayload[0]?.payload?.work_type)}>
              <XAxis type="number" tick={{fontSize:10}} allowDecimals={false}/>
              <YAxis type="category" dataKey="label" tick={{fontSize:10}} width={120}/>
              <Tooltip contentStyle={{fontSize:11}}
                formatter={(v,n)=>[v, n==='count'?'Total':n==='completed'?'Completed':'Failed']}/>
              <Legend iconSize={10} wrapperStyle={{fontSize:11}}/>
              <Bar dataKey="count"     fill="#8d6e63" radius={[0,3,3,0]} name="count"/>
              <Bar dataKey="completed" fill="#2e7d32" radius={[0,3,3,0]} name="completed"/>
              <Bar dataKey="failed"    fill="#c62828" radius={[0,3,3,0]} name="failed"/>
            </BarChart>
          </ResponsiveContainer>
          <div style={{fontSize:10,color:'#bbb',marginTop:4}}>Click a bar to drill down</div>
        </ChartBox>

        {/* Avg cost per type */}
        <ChartBox>
          <Sec>Average cost per operation type (€)</Sec>
          <ResponsiveContainer width="100%" height={Math.max(160, types.filter(t=>t.avg_cost>0).length*26)}>
            <BarChart layout="vertical"
              data={types.filter(t=>t.avg_cost>0)
                .sort((a,b)=>b.avg_cost-a.avg_cost)
                .map(d=>({...d,label:(WORK_ICONS[d.work_type]||'')+' '+d.work_type.replace(/_/g,' ').toLowerCase()}))}
              margin={{top:0,right:16,left:4,bottom:0}}>
              <XAxis type="number" tick={{fontSize:10}}/>
              <YAxis type="category" dataKey="label" tick={{fontSize:10}} width={120}/>
              <Tooltip contentStyle={{fontSize:11}} formatter={v=>[`${v} €`,'Avg cost']}/>
              <Bar dataKey="avg_cost" radius={[0,3,3,0]} name="avg_cost">
                {types.filter(t=>t.avg_cost>0).sort((a,b)=>b.avg_cost-a.avg_cost)
                  .map((_,i)=><Cell key={i} fill={PALETTE[i%PALETTE.length]}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartBox>
      </div>

      {/* Radar: frequency × completion × cost-efficiency */}
      {radarData.length >= 3 && (
        <ChartBox style={{marginBottom:14}}>
          <Sec>Multi-metric radar — top {top8.length} operation types</Sec>
          <div style={{fontSize:11,color:'#bbb',marginBottom:8}}>
            Frequency (relative ops count) · Completion (%) · Cost Efficiency (higher = cheaper relative to others)
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <RadarChart data={radarData} margin={{top:8,right:30,bottom:8,left:30}}>
              <PolarGrid stroke="#e0d8cf"/>
              <PolarAngleAxis dataKey="type" tick={{fontSize:10}}/>
              <PolarRadiusAxis angle={30} domain={[0,100]} tick={{fontSize:9}} tickCount={3}/>
              <Radar name="Frequency"      dataKey="Frequency"      stroke="#6b4c2a" fill="#6b4c2a" fillOpacity={0.18}/>
              <Radar name="Completion"     dataKey="Completion"     stroke="#054e05" fill="#054e05" fillOpacity={0.18}/>
              <Radar name="Cost Efficiency" dataKey="CostEfficiency" stroke="#e65100" fill="#e65100" fillOpacity={0.12}/>
              <Legend iconSize={10} wrapperStyle={{fontSize:11}}/>
              <Tooltip contentStyle={{fontSize:11}} formatter={v=>[`${v}`, '']}/>
            </RadarChart>
          </ResponsiveContainer>
        </ChartBox>
      )}

      {/* Harvest-capable types */}
      {types.some(t=>t.total_harvest_ton>0) && (
        <ChartBox style={{marginBottom:14}}>
          <Sec>Total harvest by operation type (t)</Sec>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={types.filter(t=>t.total_harvest_ton>0).map(d=>({
              ...d, label:(WORK_ICONS[d.work_type]||'')+' '+d.work_type.replace(/_/g,' ')
            }))} margin={{top:4,right:16,left:-8,bottom:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0ebe3"/>
              <XAxis dataKey="label" tick={{fontSize:10}}/>
              <YAxis tick={{fontSize:10}}/>
              <Tooltip contentStyle={{fontSize:11}} formatter={v=>[`${v} t`,'Harvest']}/>
              <Bar dataKey="total_harvest_ton" fill="#388e3c" radius={[3,3,0,0]} name="total_harvest_ton"/>
            </BarChart>
          </ResponsiveContainer>
        </ChartBox>
      )}

      {/* Drill-down panel */}
      {sel && (
        <ChartBox style={{border:'2px solid #6b4c2a',marginBottom:14}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
            <Sec>{WORK_ICONS[sel.work_type]||''} {sel.work_type.replace(/_/g,' ')} — detail</Sec>
            <button onClick={()=>setSelected(null)}
              style={{background:'none',border:'1px solid #e0d8cf',borderRadius:6,
                padding:'3px 10px',fontSize:11,cursor:'pointer',color:'#888'}}>
              ✕ Close
            </button>
          </div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:14}}>
            <Card icon="📋" label="Total ops"     value={sel.count}                       color="#6b4c2a"/>
            <Card icon="✅" label="Completion"    value={fmtPct(sel.completion_rate)}     color="#2e7d32"/>
            <Card icon="💶" label="Avg cost"      value={fmtEur(sel.avg_cost)}
              sub={`${fmtEur(sel.min_cost)} – ${fmtEur(sel.max_cost)}`}                  color="#8d6e63"/>
            <Card icon="🌾" label="Total harvest" value={fmtTon(sel.total_harvest_ton)}   color="#388e3c"/>
            <Card icon="🗺️" label="Fields used"   value={sel.fields_involved}             color="#5d4037"/>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            {/* Monthly ops */}
            <div>
              <Sec>Monthly operations</Sec>
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={sel.by_month} margin={{top:2,right:8,left:-16,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0ebe3"/>
                  <XAxis dataKey="month" tick={{fontSize:9}} tickFormatter={v=>v.slice(5)}/>
                  <YAxis tick={{fontSize:9}} allowDecimals={false}/>
                  <Tooltip contentStyle={{fontSize:11}} formatter={(v,n)=>[v,n==='count'?'Ops':'Cost (€)']}/>
                  <Bar dataKey="count" fill="#6b4c2a" radius={[2,2,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
            {/* Status pie */}
            <div>
              <Sec>Status breakdown</Sec>
              <ResponsiveContainer width="100%" height={140}>
                <PieChart>
                  <Pie data={sel.by_status} dataKey="count" nameKey="status"
                    cx="50%" cy="50%" outerRadius={55} innerRadius={26}
                    label={({status,percent})=>percent>0.05?`${(percent*100).toFixed(0)}%`:''} labelLine={false}
                    style={{fontSize:10}}>
                    {sel.by_status.map(d=>(
                      <Cell key={d.status} fill={STATUS_COLORS[d.status]||'#888'}/>
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{fontSize:11}} formatter={(v,n)=>[v,n]}/>
                  <Legend iconSize={8} wrapperStyle={{fontSize:10}}/>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </ChartBox>
      )}

      {/* Full type table */}
      <ChartBox>
        <Sec>Full breakdown table</Sec>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
            <thead>
              <tr style={{background:'#f5f0ea',textAlign:'left'}}>
                {['Type','Ops','Done','Rate','Cancelled','Avg €','Total €','Harvest t','Fields'].map(h=>(
                  <th key={h} style={{padding:'6px 10px',fontWeight:700,color:'#888',
                    borderBottom:'1px solid #e0d8cf',whiteSpace:'nowrap'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {types.map((t,i)=>(
                <tr key={t.work_type}
                  onClick={()=>setSelected(t.work_type===selected?null:t.work_type)}
                  style={{background: t.work_type===selected ? '#fdf6ef' : i%2===0?'#fff':'#fafaf8',
                    cursor:'pointer', transition:'background 0.1s'}}>
                  <td style={{padding:'6px 10px',fontWeight:600,color:'#444'}}>
                    {WORK_ICONS[t.work_type]||''} {t.work_type.replace(/_/g,' ')}
                  </td>
                  <td style={{padding:'6px 10px',textAlign:'right'}}>{t.count}</td>
                  <td style={{padding:'6px 10px',textAlign:'right',color:'#2e7d32'}}>{t.completed}</td>
                  <td style={{padding:'6px 10px',textAlign:'right',
                    color: t.completion_rate>=0.8?'#2e7d32':t.completion_rate>=0.5?'#f57f17':'#c62828',
                    fontWeight:700}}>{fmtPct(t.completion_rate)}</td>
                  <td style={{padding:'6px 10px',textAlign:'right',color:'#9e9e9e'}}>{t.cancelled||0}</td>
                  <td style={{padding:'6px 10px',textAlign:'right'}}>{t.avg_cost?fmtEur(t.avg_cost):'—'}</td>
                  <td style={{padding:'6px 10px',textAlign:'right',fontWeight:600}}>{t.total_cost?fmtEur(t.total_cost):'—'}</td>
                  <td style={{padding:'6px 10px',textAlign:'right',color:'#388e3c'}}>{t.total_harvest_ton?fmtTon(t.total_harvest_ton):'—'}</td>
                  <td style={{padding:'6px 10px',textAlign:'right'}}>{t.fields_involved}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartBox>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// ANALYTICS TAB 2 – Location / Farm
// ══════════════════════════════════════════════════════════════════════════════
const LocationAnalytics = ({ userId }) => {
  const [data,setData]   = useState(null);
  const [loading,setLoading] = useState(true);
  const [year,setYear]   = useState(new Date().getFullYear());
  const [selLoc,setSelLoc] = useState(null);

  const load = useCallback(()=>{
    if(!userId)return;
    setLoading(true);
    api.get(`${BASE}/analytics/locations/user/${userId}`,{params:{year}})
      .then(r=>{ setData(r.data); setSelLoc(null); })
      .catch(()=>setData(null))
      .finally(()=>setLoading(false));
  },[userId,year]);
  useEffect(()=>{ load(); },[load]);

  if(loading) return <EmptyState text="Loading…"/>;
  if(!data||!data.locations?.length) return <EmptyState text="No data for this period."/>;

  const { farm, locations } = data;
  const selected = selLoc!=null ? locations.find(l=>l.location_id===selLoc) : null;

  // Comparison bar data
  const compData = locations.map(l=>({
    name: l.location_label,
    'Ops':          l.total_ops,
    'Cost (€)':     l.total_cost,
    'Harvest (t)':  l.total_harvest_ton,
    '€/ha':         l.cost_per_ha||0,
    'Completion %': Math.round(l.completion_rate*100),
  }));

  return (
    <div>
      <YearPicker year={year} setYear={setYear}/>

      {/* Farm-level KPI banner */}
      <ChartBox style={{marginBottom:16,borderLeft:'4px solid #6b4c2a'}}>
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
          <span style={{fontSize:22}}>🏡</span>
          <div>
            <div style={{fontWeight:800,fontSize:15,color:'#333'}}>
              {farm.farm_name || 'Your Farm'}
            </div>
            <div style={{fontSize:11,color:'#aaa'}}>
              {farm.locations_count} location{farm.locations_count!==1?'s':''} ·{' '}
              {fmtHa(farm.total_area_ha)} total area
              {farm.farm_size_ha ? ` · registered ${fmtHa(farm.farm_size_ha)}` : ''}
            </div>
          </div>
        </div>
        <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
          <Card icon="📋" label="Total ops"       value={farm.total_ops}                    color="#6b4c2a"/>
          <Card icon="💶" label="Total cost"      value={fmtEur(farm.total_cost)}
            sub={farm.cost_per_ha ? `${fmtEur(farm.cost_per_ha)} / ha` : undefined}         color="#8d6e63"/>
          <Card icon="🌾" label="Total harvest"   value={fmtTon(farm.total_harvest_ton)}
            sub={farm.harvest_per_ha ? `${farm.harvest_per_ha.toFixed(3)} t/ha` : undefined} color="#054e05"/>
          <Card icon="✅" label="Completion"      value={fmtPct(farm.completion_rate)}       color={farm.completion_rate>=0.8?'#2e7d32':'#f57f17'}/>
        </div>
      </ChartBox>

      {/* Comparison: ops per location */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>

        <ChartBox>
          <Sec>Operations &amp; completion by location</Sec>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={compData} margin={{top:4,right:8,left:-8,bottom:40}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0ebe3"/>
              <XAxis dataKey="name" tick={{fontSize:10}} angle={-25} textAnchor="end" interval={0}/>
              <YAxis tick={{fontSize:10}} allowDecimals={false}/>
              <Tooltip contentStyle={{fontSize:11}}/>
              <Legend iconSize={10} wrapperStyle={{fontSize:11}}/>
              <Bar dataKey="Ops" fill="#6b4c2a" radius={[3,3,0,0]}
                onClick={e=>{ const l=locations.find(x=>x.location_label===e.name); if(l) setSelLoc(l.location_id===selLoc?null:l.location_id); }}/>
              <Bar dataKey="Completion %" fill="#2e7d32" radius={[3,3,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </ChartBox>

        <ChartBox>
          <Sec>Cost &amp; harvest by location</Sec>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={compData} margin={{top:4,right:8,left:-8,bottom:40}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0ebe3"/>
              <XAxis dataKey="name" tick={{fontSize:10}} angle={-25} textAnchor="end" interval={0}/>
              <YAxis yAxisId="cost" tick={{fontSize:10}}/>
              <YAxis yAxisId="harv" orientation="right" tick={{fontSize:10}}/>
              <Tooltip contentStyle={{fontSize:11}}/>
              <Legend iconSize={10} wrapperStyle={{fontSize:11}}/>
              <Bar yAxisId="cost" dataKey="Cost (€)"    fill="#8d6e63" radius={[3,3,0,0]}/>
              <Bar yAxisId="harv" dataKey="Harvest (t)" fill="#388e3c" radius={[3,3,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </ChartBox>
      </div>

      {/* Cost per ha comparison */}
      {locations.some(l=>l.cost_per_ha) && (
        <ChartBox style={{marginBottom:14}}>
          <Sec>Cost efficiency — € per hectare by location</Sec>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={[...locations].sort((a,b)=>(b.cost_per_ha||0)-(a.cost_per_ha||0)).map(l=>({
              name:l.location_label, '€/ha':l.cost_per_ha||0
            }))} margin={{top:4,right:16,left:-8,bottom:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0ebe3"/>
              <XAxis dataKey="name" tick={{fontSize:10}}/>
              <YAxis tick={{fontSize:10}}/>
              <Tooltip contentStyle={{fontSize:11}} formatter={v=>[`${v} €`,'€/ha']}/>
              <Bar dataKey="€/ha" radius={[3,3,0,0]}>
                {[...locations].sort((a,b)=>(b.cost_per_ha||0)-(a.cost_per_ha||0))
                  .map((_,i)=><Cell key={i} fill={PALETTE[i%PALETTE.length]}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartBox>
      )}

      {/* Location cards grid */}
      <Sec>Locations overview — click to expand</Sec>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))',gap:10,marginBottom:14}}>
        {locations.map(loc=>{
          const active = loc.location_id===selLoc;
          return (
            <div key={loc.location_id}
              onClick={()=>setSelLoc(loc.location_id===selLoc?null:loc.location_id)}
              style={{background:'#fff',borderRadius:10,padding:'12px 14px',cursor:'pointer',
                border:`2px solid ${active?'#6b4c2a':'#e0d8cf'}`,transition:'all 0.15s'}}>
              <div style={{fontWeight:700,fontSize:13,color:'#333',marginBottom:4}}>
                📍 {loc.location_label}
              </div>
              <div style={{display:'flex',flexWrap:'wrap',gap:6,fontSize:11}}>
                <span style={{background:'#f5f0ea',borderRadius:6,padding:'2px 8px'}}>
                  {loc.total_ops} ops
                </span>
                <span style={{background:'#e8f5e9',borderRadius:6,padding:'2px 8px',color:'#2e7d32'}}>
                  {fmtPct(loc.completion_rate)}
                </span>
                {loc.total_cost>0 && (
                  <span style={{background:'#fafafa',borderRadius:6,padding:'2px 8px'}}>
                    {fmtEur(loc.total_cost)}
                  </span>
                )}
                <span style={{background:'#f0f4f0',borderRadius:6,padding:'2px 8px',color:'#555'}}>
                  {loc.fields_count} fields · {fmtHa(loc.total_area_ha)}
                </span>
                {loc.most_common_type && (
                  <span style={{background:'#fff8e1',borderRadius:6,padding:'2px 8px',color:'#e65100'}}>
                    {WORK_ICONS[loc.most_common_type]||''} {loc.most_common_type.replace(/_/g,' ')}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Drill-down for selected location */}
      {selected && (
        <ChartBox style={{border:'2px solid #6b4c2a',marginBottom:14}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
            <div style={{fontWeight:800,fontSize:14,color:'#333'}}>
              📍 {selected.location_label}
            </div>
            <button onClick={()=>setSelLoc(null)}
              style={{background:'none',border:'1px solid #e0d8cf',borderRadius:6,
                padding:'3px 10px',fontSize:11,cursor:'pointer',color:'#888'}}>
              ✕ Close
            </button>
          </div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:14}}>
            <Card icon="📋" label="Total ops"     value={selected.total_ops}                        color="#6b4c2a"/>
            <Card icon="✅" label="Completion"    value={fmtPct(selected.completion_rate)}          color="#2e7d32"/>
            <Card icon="💶" label="Total cost"    value={fmtEur(selected.total_cost)}
              sub={selected.cost_per_ha?`${fmtEur(selected.cost_per_ha)}/ha`:undefined}             color="#8d6e63"/>
            <Card icon="🌾" label="Harvest"       value={fmtTon(selected.total_harvest_ton)}
              sub={selected.harvest_per_ha?`${selected.harvest_per_ha.toFixed(3)} t/ha`:undefined}  color="#388e3c"/>
            <Card icon="🗺️" label="Fields"        value={`${selected.fields_count} fields`}
              sub={fmtHa(selected.total_area_ha)}                                                   color="#5d4037"/>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            {/* ops by type */}
            <div>
              <Sec>Operations by type</Sec>
              <ResponsiveContainer width="100%" height={Math.max(120, selected.by_type.length*22)}>
                <BarChart layout="vertical"
                  data={selected.by_type.map(d=>({...d,label:(WORK_ICONS[d.work_type]||'')+' '+d.work_type.replace(/_/g,' ').toLowerCase()}))}
                  margin={{top:0,right:12,left:4,bottom:0}}>
                  <XAxis type="number" tick={{fontSize:9}} allowDecimals={false}/>
                  <YAxis type="category" dataKey="label" tick={{fontSize:9}} width={110}/>
                  <Tooltip contentStyle={{fontSize:11}} formatter={(v,n)=>[v,n==='count'?'Ops':'Cost (€)']}/>
                  <Bar dataKey="count"      fill="#6b4c2a" radius={[0,3,3,0]} name="count"/>
                </BarChart>
              </ResponsiveContainer>
            </div>
            {/* monthly ops */}
            <div>
              <Sec>Monthly activity</Sec>
              <ResponsiveContainer width="100%" height={Math.max(120, selected.by_month.length*22)}>
                <BarChart data={selected.by_month} margin={{top:0,right:8,left:-16,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0ebe3"/>
                  <XAxis dataKey="month" tick={{fontSize:9}} tickFormatter={v=>v.slice(5)}/>
                  <YAxis tick={{fontSize:9}} allowDecimals={false}/>
                  <Tooltip contentStyle={{fontSize:11}} formatter={(v,n)=>[v,n==='count'?'Ops':'Cost (€)']}/>
                  <Bar dataKey="count"      fill="#8d6e63" radius={[2,2,0,0]} name="count"/>
                  <Bar dataKey="total_cost" fill="#054e05" radius={[2,2,0,0]} name="total_cost"/>
                  <Legend iconSize={9} wrapperStyle={{fontSize:10}}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </ChartBox>
      )}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// LOG TAB (existing list)
// ══════════════════════════════════════════════════════════════════════════════
const LogTab = ({ userId, locationId, records, fields, loading, onUpdate, onCreated,
  filterType, setFilterType, filterStatus, setFilterStatus }) => {
  const { t } = useLang();
  const typeOptions = ['ALL',...new Set(records.map(r=>r.work_type))];
  const filtered = records.filter(r=>{
    if(filterType!=='ALL'&&r.work_type!==filterType) return false;
    if(filterStatus!=='ALL'&&r.work_status!==filterStatus) return false;
    return true;
  });
  return (
    <>
      <CreateWorkForm userId={userId} fields={fields} onCreated={onCreated}/>
      <div style={{display:'flex',gap:10,flexWrap:'wrap',marginBottom:14}}>
        <div style={{display:'flex',gap:0,border:'1px solid #e0d8cf',borderRadius:8,overflow:'hidden'}}>
          {['ALL',...Object.keys(STATUS_CFG)].map(s=>(
            <button key={s} onClick={()=>setFilterStatus(s)} style={{
              padding:'5px 10px',fontSize:10,fontWeight:700,border:'none',cursor:'pointer',
              background:filterStatus===s?'var(--color-accent-soil,#6b4c2a)':'#f5f0ea',
              color:filterStatus===s?'#fff':'#888',textTransform:'uppercase',letterSpacing:'0.03em'}}>
              {t(`fw_status_${s.toLowerCase()}`)}
            </button>
          ))}
        </div>
      </div>
      {typeOptions.length>2&&(
        <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:14}}>
          {typeOptions.map(tp=>(
            <button key={tp} onClick={()=>setFilterType(tp)} style={{
              padding:'4px 10px',borderRadius:20,fontSize:11,fontWeight:700,border:'none',cursor:'pointer',
              background:filterType===tp?'var(--color-green-primary,#054e05)':'#ede7df',
              color:filterType===tp?'#fff':'#777'}}>
              {tp==='ALL'?t('fw_all_types'):`${WORK_ICONS[tp]||''} ${tp.replace(/_/g,' ')}`}
            </button>
          ))}
        </div>
      )}
      {loading
        ? <EmptyState text={t('fw_loading')}/>
        : filtered.length===0
          ? <EmptyState text={records.length===0?t('fw_empty_all'):t('fw_empty_filter')}/>
          : filtered.map(r=><WorkRow key={r.id} record={r} onUpdate={onUpdate}/>)
      }
    </>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ══════════════════════════════════════════════════════════════════════════════
const FieldWorkPanel = ({ userId, locationId }) => {
  const { t } = useLang();
  const [open,setOpen]   = useState(true);
  const [tab,setTab]     = useState('log');
  const [records,setRecords] = useState([]);
  const [fields,setFields]   = useState([]);
  const [loading,setLoading] = useState(true);
  const [filterType,setFilterType]     = useState('ALL');
  const [filterStatus,setFilterStatus] = useState('ALL');

  const loadFields = useCallback(()=>{
    if(!userId)return;
    api.get('/api/v1/fields/user_fields',{params:{user_id:userId,...(locationId?{location_id:locationId}:{})}})
      .then(r=>{const d=r.data;setFields(Array.isArray(d)?d:(d?.fields??d?.items??[]));})
      .catch(()=>setFields([]));
  },[userId,locationId]);

  const loadRecords = useCallback(()=>{
    if(!userId)return;
    setLoading(true);
    api.get(`${BASE}/user/${userId}`)
      .then(r=>{const d=r.data;setRecords(Array.isArray(d)?d:(d?.items??[]));})
      .catch(()=>setRecords([]))
      .finally(()=>setLoading(false));
  },[userId]);

  useEffect(()=>{loadFields();loadRecords();},[loadFields,loadRecords]);

  const inProgress = records.filter(r=>r.work_status==='IN_PROGRESS').length;

  const TABS_DEF = [
    ['log',       '📋 ' + (t('fw_tab_log')       || 'Work Log')],
    ['by_type',   '📊 ' + (t('fw_tab_types')     || 'By Operation')],
    ['by_location','📍 ' + (t('fw_tab_locations') || 'By Location')],
  ];

  return (
    <div style={panelWrap}>
      <div style={panelHead} onClick={()=>setOpen(v=>!v)}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <span style={{fontSize:18}}>🚜</span>
          <span style={titleStyle}>{t('fw_title')}</span>
          <span style={badge}>{t('fw_records',records.length)}</span>
          {inProgress>0&&<span style={{...badge,background:'#e1f5fe',color:'#01579b'}}>{t('fw_in_progress',inProgress)}</span>}
        </div>
        <span style={{color:'#bbb',fontSize:13}}>{open?'▲':'▼'}</span>
      </div>

      {open&&(
        <div style={panelBody}>
          {/* Sub-tab bar */}
          <div style={{display:'flex',gap:0,marginBottom:16,border:'1px solid #e0d8cf',
            borderRadius:8,overflow:'hidden',width:'fit-content'}}>
            {TABS_DEF.map(([k,l])=>(
              <button key={k} onClick={()=>setTab(k)} style={{
                padding:'7px 18px',fontSize:13,fontWeight:700,border:'none',cursor:'pointer',
                background:tab===k?'var(--color-accent-soil,#6b4c2a)':'#f5f0ea',
                color:tab===k?'#fff':'#888'}}>
                {l}
              </button>
            ))}
          </div>

          {tab==='log' && (
            <LogTab userId={userId} locationId={locationId} records={records} fields={fields}
              loading={loading} onUpdate={loadRecords} onCreated={loadRecords}
              filterType={filterType} setFilterType={setFilterType}
              filterStatus={filterStatus} setFilterStatus={setFilterStatus}/>
          )}
          {tab==='by_type'     && <WorkTypeAnalytics     userId={userId}/>}
          {tab==='by_location' && <LocationAnalytics     userId={userId}/>}
        </div>
      )}
    </div>
  );
};

export default FieldWorkPanel;

// ── Styles ────────────────────────────────────────────────────────────────────
const panelWrap  = {background:'#fff',borderRadius:14,border:'1px solid var(--color-accent-soil)',boxShadow:'0 2px 10px rgba(0,0,0,0.05)',overflow:'hidden',marginBottom:20};
const panelHead  = {display:'flex',justifyContent:'space-between',alignItems:'center',padding:'13px 20px',cursor:'pointer',background:'var(--color-bg-champagne)',borderBottom:'1px solid var(--color-accent-soil)',userSelect:'none'};
const panelBody  = {padding:'16px 20px 20px'};
const titleStyle = {fontFamily:'var(--font-heading)',fontWeight:700,fontSize:15,color:'var(--color-accent-chernozem)'};
const badge      = {fontSize:11,color:'#aaa',background:'#f0ebe3',borderRadius:10,padding:'2px 8px'};
const formBox    = {background:'#f8f4f0',borderRadius:10,border:'1px solid #e0d8cf',padding:14,marginTop:10};
const inp        = {padding:'6px 10px',borderRadius:6,border:'1px solid #ddd',fontSize:13,fontFamily:'inherit',outline:'none',background:'#fff'};
const lbl        = {display:'flex',flexDirection:'column',gap:4,fontSize:10,fontWeight:700,color:'#aaa',textTransform:'uppercase',letterSpacing:'0.04em'};
const btnPrimary = {background:'var(--color-green-primary,#054e05)',color:'#fff',border:'none',borderRadius:6,padding:'7px 16px',fontWeight:700,fontSize:13,cursor:'pointer',fontFamily:'inherit'};
const btnAdd     = {background:'var(--color-accent-soil,#6b4c2a)',color:'#fff',border:'none',borderRadius:8,padding:'7px 16px',fontWeight:700,fontSize:13,cursor:'pointer',fontFamily:'inherit'};