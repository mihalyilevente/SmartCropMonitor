/**
 * CalculatorsPanel.jsx
 * Farm calculator suite — 9 calculators + agronomic reference
 * Calls POST /api/v1/calculators/<tool>
 */
import { useState } from 'react';
import api from '../api/client';
import { useLang } from '../context/LanguageContext';

const BASE = '/api/v1/calculators';

// ── Design tokens ────────────────────────────────────────────────────────────
const C = {
  green:  'var(--color-green-primary, #054e05)',
  soil:   'var(--color-accent-soil,   #c8b89a)',
  champ:  'var(--color-bg-champagne,  #f8f4ed)',
  text:   'var(--color-accent-chernozem, #3a2e1e)',
  muted:  '#8a7a6a',
  border: '#e0d8cf',
  white:  '#fff',
  err:    '#b53060',
  ok:     '#1a7a6e',
  warn:   '#b87300',
};

// ── Shared primitives ─────────────────────────────────────────────────────────
const Card = ({ children, style }) => (
  <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 20px', ...style }}>
    {children}
  </div>
);

const Label = ({ children }) => (
  <span style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
    {children}
  </span>
);

const Row = ({ label, children }) => (
  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
    <Label>{label}</Label>
    {children}
  </label>
);

const Inp = ({ value, onChange, type = 'number', min, step = 'any', placeholder, style }) => (
  <input
    type={type} value={value} onChange={onChange}
    min={min} step={step} placeholder={placeholder}
    style={{
      padding: '7px 10px', borderRadius: 7, border: `1px solid ${C.border}`,
      fontSize: 13, fontFamily: 'inherit', outline: 'none', background: C.white,
      width: '100%', boxSizing: 'border-box', ...style,
    }}
  />
);

const Sel = ({ value, onChange, options }) => (
  <select value={value} onChange={onChange}
    style={{ padding: '7px 10px', borderRadius: 7, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: 'inherit', background: C.white, outline: 'none' }}>
    {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
  </select>
);

const RunBtn = ({ onClick, loading, t }) => (
  <button onClick={onClick} disabled={loading}
    style={{ background: loading ? '#aaa' : C.green, color: C.white, border: 'none', borderRadius: 8, padding: '9px 24px', fontWeight: 700, fontSize: 13, cursor: loading ? 'default' : 'pointer', fontFamily: 'inherit' }}>
    {loading ? `⏳ ${t('calc_btn_running')}` : `▶  ${t('calc_btn_run')}`}
  </button>
);

const Err = ({ msg }) => msg ? (
  <div style={{ background: '#fff0f4', border: `1px solid ${C.err}44`, borderRadius: 8, padding: '8px 12px', fontSize: 12, color: C.err }}>{msg}</div>
) : null;

const KV = ({ k, v, unit, highlight }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: `1px solid ${C.border}`, fontSize: 13 }}>
    <span style={{ color: C.muted }}>{k}</span>
    <span style={{ fontWeight: 700, color: highlight ? C.green : C.text }}>
      {v}{unit ? <span style={{ fontWeight: 400, color: C.muted, marginLeft: 3 }}>{unit}</span> : null}
    </span>
  </div>
);

const SectionTitle = ({ children }) => (
  <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: 18, marginBottom: 8, borderBottom: `1px solid ${C.border}`, paddingBottom: 4 }}>
    {children}
  </div>
);

const AddProductBtn = ({ onClick, t }) => (
  <button onClick={onClick}
    style={{ background: 'none', border: `1px dashed ${C.border}`, borderRadius: 7, padding: '7px 14px', cursor: 'pointer', fontSize: 12, color: C.muted }}>
    {t('calc_btn_add_product')}
  </button>
);

// ── Calculator registry (labelKey instead of hardcoded label) ────────────────
const CALCS = [
  { id: 'irrigation', icon: '💧', labelKey: 'calc_irrigation' },
  { id: 'swb',        icon: '🌊', labelKey: 'calc_swb' },
  { id: 'fertilizer', icon: '🌿', labelKey: 'calc_fertilizer' },
  { id: 'tankmix',    icon: '🧪', labelKey: 'calc_tankmix' },
  { id: 'spray',      icon: '🚜', labelKey: 'calc_spray' },
  { id: 'nutrient',   icon: '⚗️',  labelKey: 'calc_nutrient' },
  { id: 'lime',       icon: '🪨', labelKey: 'calc_lime' },
  { id: 'machinery',  icon: '⚙️',  labelKey: 'calc_machinery' },
  { id: 'seed',       icon: '🌱', labelKey: 'calc_seed' },
  { id: 'reference',  icon: '📚', labelKey: 'calc_reference' },
];

// ─────────────────────────────────────────────────────────────────────────────
// 1. Irrigation Runtime
// ─────────────────────────────────────────────────────────────────────────────
const CalcIrrigation = () => {
  const { t } = useLang();
  const [f, setF] = useState({ target_mm: 25, area_ha: 10, flow_lph: 5000, efficiency: 0.85 });
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = k => e => setF(p => ({ ...p, [k]: Number(e.target.value) }));
  const run = async () => {
    setBusy(true); setErr('');
    try { setRes((await api.post(`${BASE}/irrigation-runtime`, f)).data); }
    catch (e) { setErr(e.response?.data?.detail || 'Error'); }
    finally { setBusy(false); }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Row label={t('calc_lbl_target_mm')}><Inp value={f.target_mm}  onChange={set('target_mm')}  min={0} /></Row>
        <Row label={t('calc_lbl_area_ha')}>  <Inp value={f.area_ha}    onChange={set('area_ha')}    min={0} /></Row>
        <Row label={t('calc_lbl_flow_lph')}> <Inp value={f.flow_lph}   onChange={set('flow_lph')}   min={0} /></Row>
        <Row label={t('calc_lbl_efficiency')}><Inp value={f.efficiency} onChange={set('efficiency')} min={0} step={0.01} /></Row>
      </div>
      <RunBtn onClick={run} loading={busy} t={t} />
      <Err msg={err} />
      {res && <>
        <SectionTitle>{t('calc_sec_results')}</SectionTitle>
        <KV k={t('calc_res_runtime')}     v={res.irr_runtime_h}                   unit="h"   highlight />
        <KV k={t('calc_res_runtime')}     v={res.irr_runtime_min}                 unit="min" />
        <KV k={t('calc_res_total_water')} v={res.irr_total_m3}                    unit="m³" />
        <KV k={t('calc_res_total_water')} v={res.irr_total_liters?.toLocaleString()} unit="L" />
        <KV k={t('calc_res_rate')}        v={res.irr_mm_per_hour}                 unit="mm/h" />
      </>}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. Soil Water Balance
// ─────────────────────────────────────────────────────────────────────────────
const CalcSWB = () => {
  const { t } = useLang();
  const [meta, setMeta] = useState({ initial_sw: 100, field_cap: 130, wilting_pt: 50, root_depth: 30, cn: 75 });
  const [stepsText, setStepsText] = useState(
    JSON.stringify([
      { date: '2026-06-01', precip_mm: 0,  irrigation_mm: 20, et0: 5.2,  kc: 0.8  },
      { date: '2026-06-02', precip_mm: 12, irrigation_mm: 0,  et0: 4.8,  kc: 0.8  },
      { date: '2026-06-03', precip_mm: 0,  irrigation_mm: 0,  et0: 5.5,  kc: 0.85 },
    ], null, 2)
  );
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const setM = k => e => setMeta(p => ({ ...p, [k]: Number(e.target.value) }));
  const run = async () => {
    setBusy(true); setErr('');
    try {
      const steps = JSON.parse(stepsText);
      setRes((await api.post(`${BASE}/soil-water-balance`, { ...meta, steps })).data);
    } catch (e) { setErr(e.response?.data?.detail || e.message); }
    finally { setBusy(false); }
  };
  const tableHeaders = [
    t('calc_th_date'), t('calc_th_sw'), t('calc_th_depl'),
    t('calc_th_etc'),  t('calc_th_runoff'), t('calc_th_perc'), t('calc_th_stress'),
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
        <Row label={t('calc_lbl_initial_sw')}><Inp value={meta.initial_sw} onChange={setM('initial_sw')} /></Row>
        <Row label={t('calc_lbl_field_cap')}> <Inp value={meta.field_cap}  onChange={setM('field_cap')}  /></Row>
        <Row label={t('calc_lbl_wilting_pt')}><Inp value={meta.wilting_pt} onChange={setM('wilting_pt')} /></Row>
        <Row label={t('calc_lbl_root_depth')}><Inp value={meta.root_depth} onChange={setM('root_depth')} /></Row>
        <Row label={t('calc_lbl_cn')}>        <Inp value={meta.cn}         onChange={setM('cn')}         /></Row>
      </div>
      <Row label={t('calc_lbl_swb_steps')}>
        <textarea value={stepsText} onChange={e => setStepsText(e.target.value)}
          rows={8} style={{ padding: 10, borderRadius: 7, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: 'monospace', resize: 'vertical', background: C.white }} />
      </Row>
      <RunBtn onClick={run} loading={busy} t={t} />
      <Err msg={err} />
      {res && <>
        <SectionTitle>{t('calc_sec_summary')}</SectionTitle>
        <KV k={t('calc_res_final_sw')}   v={res.swbr_final_sw}   unit="mm" highlight />
        <KV k={t('calc_res_mean_dep')}   v={res.swbr_mean_dep}   unit="mm" />
        <KV k={t('calc_res_total_etc')}  v={res.swbr_total_etc}  unit="mm" />
        <KV k={t('calc_res_total_rain')} v={res.swbr_total_rain} unit="mm" />
        <KV k={t('calc_res_total_irr')}  v={res.swbr_total_irr}  unit="mm" />
        <KV k={t('calc_res_stress_days')} v={res.swbr_stress_days} unit="d" />
        {res.swbr_steps?.length > 0 && <>
          <SectionTitle>{t('calc_sec_daily')}</SectionTitle>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: C.champ }}>
                  {tableHeaders.map(h =>
                    <th key={h} style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 700, color: C.muted, borderBottom: `1px solid ${C.border}` }}>{h}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {res.swbr_steps.map((s, i) => (
                  <tr key={i} style={{ background: s.sws_stress ? '#fff3f6' : i % 2 ? C.champ : C.white }}>
                    <td style={{ padding: '4px 8px' }}>{s.sws_date}</td>
                    <td style={{ padding: '4px 8px', fontWeight: 700 }}>{s.sws_sw}</td>
                    <td style={{ padding: '4px 8px', color: s.sws_depletion > 30 ? C.err : C.text }}>{s.sws_depletion}</td>
                    <td style={{ padding: '4px 8px' }}>{s.sws_etc}</td>
                    <td style={{ padding: '4px 8px' }}>{s.sws_runoff}</td>
                    <td style={{ padding: '4px 8px' }}>{s.sws_perc}</td>
                    <td style={{ padding: '4px 8px' }}>{s.sws_stress ? '⚠️' : '✅'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>}
      </>}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. Fertilizer Rate
// ─────────────────────────────────────────────────────────────────────────────
const CalcFertilizer = () => {
  const { t } = useLang();
  const [need, setNeed] = useState({ n_kg_ha: 120, p_kg_ha: 50, k_kg_ha: 80 });
  const [area, setArea] = useState(10);
  const [splits, setSplits] = useState(2);
  const [products, setProducts] = useState([
    { name: 'Urea', n_pct: 46, p_pct: 0,  k_pct: 0,  cost_per_kg: 0.45 },
    { name: 'DAP',  n_pct: 18, p_pct: 46, k_pct: 0,  cost_per_kg: 0.55 },
    { name: 'MOP',  n_pct: 0,  p_pct: 0,  k_pct: 60, cost_per_kg: 0.38 },
  ]);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const setN   = k => e => setNeed(p => ({ ...p, [k]: Number(e.target.value) }));
  const setProd = (i, k) => e => setProducts(ps => ps.map((p, j) =>
    j === i ? { ...p, [k]: k === 'name' ? e.target.value : Number(e.target.value) } : p
  ));
  const run = async () => {
    setBusy(true); setErr('');
    try { setRes((await api.post(`${BASE}/fertilizer-rate`, { need, area_ha: area, products, splits })).data); }
    catch (e) { setErr(e.response?.data?.detail || 'Error'); }
    finally { setBusy(false); }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <SectionTitle>{t('calc_sec_npk_need')}</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
        <Row label={t('calc_lbl_n_kgha')}><Inp value={need.n_kg_ha} onChange={setN('n_kg_ha')} /></Row>
        <Row label={t('calc_lbl_p_kgha')}><Inp value={need.p_kg_ha} onChange={setN('p_kg_ha')} /></Row>
        <Row label={t('calc_lbl_k_kgha')}><Inp value={need.k_kg_ha} onChange={setN('k_kg_ha')} /></Row>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Row label={t('calc_lbl_area_ha')}><Inp value={area} onChange={e => setArea(Number(e.target.value))} /></Row>
        <Row label={t('calc_lbl_splits')}>
          <Sel value={splits} onChange={e => setSplits(Number(e.target.value))}
            options={[[1,'1'],[2,'2'],[3,'3'],[4,'4']]} />
        </Row>
      </div>
      <SectionTitle>{t('calc_sec_avail_prod')}</SectionTitle>
      {products.map((p, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: 8, alignItems: 'end' }}>
          <Row label={t('calc_lbl_name')}>  <Inp value={p.name}        onChange={setProd(i,'name')}        type="text" /></Row>
          <Row label={t('calc_lbl_n_pct')}> <Inp value={p.n_pct}       onChange={setProd(i,'n_pct')}       /></Row>
          <Row label={t('calc_lbl_p_pct')}> <Inp value={p.p_pct}       onChange={setProd(i,'p_pct')}       /></Row>
          <Row label={t('calc_lbl_k_pct')}> <Inp value={p.k_pct}       onChange={setProd(i,'k_pct')}       /></Row>
          <Row label={t('calc_lbl_cost_kg')}><Inp value={p.cost_per_kg} onChange={setProd(i,'cost_per_kg')} step={0.01} /></Row>
        </div>
      ))}
      <AddProductBtn onClick={() => setProducts(ps => [...ps, { name: '', n_pct: 0, p_pct: 0, k_pct: 0, cost_per_kg: 0 }])} t={t} />
      <RunBtn onClick={run} loading={busy} t={t} />
      <Err msg={err} />
      {res && <>
        <SectionTitle>{t('calc_sec_app_plan')}</SectionTitle>
        {res.frr_splits?.map((s, i) => (
          <KV key={i} k={`${s.ns_split_num}. ${s.ns_product_name}`} v={s.ns_rate_kg_ha} unit="kg/ha" />
        ))}
        <SectionTitle>{t('calc_sec_totals')}</SectionTitle>
        <KV k={t('calc_res_total_n')} v={res.frr_total_n} unit="kg" />
        <KV k={t('calc_res_total_p')} v={res.frr_total_p} unit="kg" />
        <KV k={t('calc_res_total_k')} v={res.frr_total_k} unit="kg" />
        <KV k={t('calc_res_est_cost')} v={res.frr_total_cost?.toFixed(2)} unit="€" highlight />
      </>}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. Tank Mix
// ─────────────────────────────────────────────────────────────────────────────
const CalcTankMix = () => {
  const { t } = useLang();
  const [area, setArea] = useState(10);
  const [vol,  setVol]  = useState(200);
  const [ph,   setPh]   = useState(7.0);
  const [prods, setProds] = useState([
    { name: 'Herbicide A', rate_l_ha: 1.5, type: 'EC', ph_min: 4.5, ph_max: 8.0 },
    { name: 'Fungicide B', rate_l_ha: 0.8, type: 'SC', ph_min: 5.0, ph_max: 8.5 },
  ]);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const setP = (i, k) => e => setProds(ps => ps.map((p, j) =>
    j === i ? { ...p, [k]: k === 'name' || k === 'type' ? e.target.value : Number(e.target.value) } : p
  ));
  const run = async () => {
    setBusy(true); setErr('');
    try { setRes((await api.post(`${BASE}/tank-mix`, { area_ha: area, water_vol_l_ha: vol, products: prods, water_ph: ph })).data); }
    catch (e) { setErr(e.response?.data?.detail || 'Error'); }
    finally { setBusy(false); }
  };
  const typeOptions = [
    ['EC','EC'],['SC','SC'],['WP','WP'],['SL','SL'],
    ['surfactant', t('calc_type_surf')],
    ['adjuvant',   t('calc_type_adj')],
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
        <Row label={t('calc_lbl_area_ha')}>   <Inp value={area} onChange={e => setArea(Number(e.target.value))} /></Row>
        <Row label={t('calc_lbl_water_lha')}>  <Inp value={vol}  onChange={e => setVol(Number(e.target.value))}  /></Row>
        <Row label={t('calc_lbl_water_ph')}>   <Inp value={ph}   onChange={e => setPh(Number(e.target.value))}   step={0.1} /></Row>
      </div>
      <SectionTitle>{t('calc_sec_products')}</SectionTitle>
      {prods.map((p, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: 8, alignItems: 'end' }}>
          <Row label={t('calc_lbl_name')}>  <Inp value={p.name}      onChange={setP(i,'name')}      type="text" /></Row>
          <Row label={t('calc_lbl_lha')}>   <Inp value={p.rate_l_ha} onChange={setP(i,'rate_l_ha')} step={0.1}  /></Row>
          <Row label={t('calc_lbl_type')}>  <Sel value={p.type}      onChange={setP(i,'type')}      options={typeOptions} /></Row>
          <Row label={t('calc_lbl_ph_min')}><Inp value={p.ph_min}    onChange={setP(i,'ph_min')}    step={0.1}  /></Row>
          <Row label={t('calc_lbl_ph_max')}><Inp value={p.ph_max}    onChange={setP(i,'ph_max')}    step={0.1}  /></Row>
        </div>
      ))}
      <AddProductBtn onClick={() => setProds(ps => [...ps, { name: '', rate_l_ha: 1, type: 'SC', ph_min: 5, ph_max: 8 }])} t={t} />
      <RunBtn onClick={run} loading={busy} t={t} />
      <Err msg={err} />
      {res && <>
        <SectionTitle>{t('calc_sec_mix_order')}</SectionTitle>
        {res.tmr_products?.sort((a, b) => a.order - b.order).map((p, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 7, background: p.ph_ok ? C.champ : '#fff3f6', marginBottom: 4, fontSize: 13 }}>
            <span><strong style={{ color: C.muted }}>{p.order}.</strong> {p.name}</span>
            <span style={{ fontWeight: 700 }}>{p.amount_l} L {p.ph_ok ? '✅' : '⚠️ pH'}</span>
          </div>
        ))}
        <KV k={t('calc_res_total_water')} v={res.tmr_total_water_l} unit="L" highlight />
        {res.tmr_ph_risk && (
          <div style={{ background: '#fff8ee', border: `1px solid ${C.warn}44`, borderRadius: 8, padding: '8px 12px', fontSize: 12, color: C.warn, marginTop: 6 }}>
            ⚠️ {res.tmr_ph_warning}
          </div>
        )}
      </>}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. Spray Volume
// ─────────────────────────────────────────────────────────────────────────────
const CalcSpray = () => {
  const { t } = useLang();
  const [f, setF] = useState({ nozzle_l_min: 0.8, speed_km_h: 6, boom_m: 12, area_ha: 20, nozzles: 24 });
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = k => e => setF(p => ({ ...p, [k]: Number(e.target.value) }));
  const run = async () => {
    setBusy(true); setErr('');
    try { setRes((await api.post(`${BASE}/spray-volume`, f)).data); }
    catch (e) { setErr(e.response?.data?.detail || 'Error'); }
    finally { setBusy(false); }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
        <Row label={t('calc_lbl_nozzle_lmin')}><Inp value={f.nozzle_l_min} onChange={set('nozzle_l_min')} step={0.1} /></Row>
        <Row label={t('calc_lbl_nozzles')}>     <Inp value={f.nozzles}      onChange={set('nozzles')}      min={1}    /></Row>
        <Row label={t('calc_lbl_speed_kmh')}>   <Inp value={f.speed_km_h}   onChange={set('speed_km_h')}   step={0.5} /></Row>
        <Row label={t('calc_lbl_boom_m')}>       <Inp value={f.boom_m}       onChange={set('boom_m')}       step={0.5} /></Row>
        <Row label={t('calc_lbl_area_ha')}>      <Inp value={f.area_ha}      onChange={set('area_ha')}                /></Row>
      </div>
      <RunBtn onClick={run} loading={busy} t={t} />
      <Err msg={err} />
      {res && <>
        <SectionTitle>{t('calc_sec_results')}</SectionTitle>
        <KV k={t('calc_res_volume')} v={res.svr_vol_l_ha}                    unit="L/ha" highlight />
        <KV k={t('calc_res_total')}  v={res.svr_total_liters?.toLocaleString()} unit="L" />
        <KV k={t('calc_res_time')}   v={res.svr_time_h}                      unit="h" />
        <KV k={t('calc_res_time')}   v={res.svr_time_min}                    unit="min" />
      </>}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. Soil Nutrient Balance
// ─────────────────────────────────────────────────────────────────────────────
const CalcNutrient = () => {
  const { t } = useLang();
  const [f, setF] = useState({ n_soil:0, p_soil:0, k_soil:0, n_fert:120, p_fert:50, k_fert:80, n_crop:130, p_crop:45, k_crop:80, n_atm:10, n_fixation:0 });
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = k => e => setF(p => ({ ...p, [k]: Number(e.target.value) }));
  const run = async () => {
    setBusy(true); setErr('');
    try { setRes((await api.post(`${BASE}/soil-nutrient-balance`, f)).data); }
    catch (e) { setErr(e.response?.data?.detail || 'Error'); }
    finally { setBusy(false); }
  };
  const statusColor = s => s === 'surplus' ? C.ok : s === 'deficit' ? C.err : C.warn;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
        <Row label={t('calc_lbl_n_soil')}><Inp value={f.n_soil}     onChange={set('n_soil')}     /></Row>
        <Row label={t('calc_lbl_p_soil')}><Inp value={f.p_soil}     onChange={set('p_soil')}     /></Row>
        <Row label={t('calc_lbl_k_soil')}><Inp value={f.k_soil}     onChange={set('k_soil')}     /></Row>
        <Row label={t('calc_lbl_n_fert')}><Inp value={f.n_fert}     onChange={set('n_fert')}     /></Row>
        <Row label={t('calc_lbl_p_fert')}><Inp value={f.p_fert}     onChange={set('p_fert')}     /></Row>
        <Row label={t('calc_lbl_k_fert')}><Inp value={f.k_fert}     onChange={set('k_fert')}     /></Row>
        <Row label={t('calc_lbl_n_crop')}><Inp value={f.n_crop}     onChange={set('n_crop')}     /></Row>
        <Row label={t('calc_lbl_p_crop')}><Inp value={f.p_crop}     onChange={set('p_crop')}     /></Row>
        <Row label={t('calc_lbl_k_crop')}><Inp value={f.k_crop}     onChange={set('k_crop')}     /></Row>
        <Row label={t('calc_lbl_n_atm')}> <Inp value={f.n_atm}      onChange={set('n_atm')}      /></Row>
        <Row label={t('calc_lbl_n_fix')}>  <Inp value={f.n_fixation} onChange={set('n_fixation')} /></Row>
      </div>
      <RunBtn onClick={run} loading={busy} t={t} />
      <Err msg={err} />
      {res && <>
        <SectionTitle>{t('calc_sec_balance')}</SectionTitle>
        {[['N', res.snr_n_balance, res.snr_n_status],
          ['P', res.snr_p_balance, res.snr_p_status],
          ['K', res.snr_k_balance, res.snr_k_status]].map(([n, v, s]) => (
          <div key={n} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, background: C.champ, marginBottom: 4, fontSize: 14 }}>
            <span style={{ fontWeight: 700 }}>{n}</span>
            <span style={{ fontWeight: 700, color: statusColor(s) }}>
              {v > 0 ? '+' : ''}{v} kg/ha &nbsp;<span style={{ fontSize: 11 }}>({s})</span>
            </span>
          </div>
        ))}
      </>}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 7. Lime Requirement
// ─────────────────────────────────────────────────────────────────────────────
const CalcLime = () => {
  const { t } = useLang();
  const [f, setF] = useState({ current_ph: 5.8, target_ph: 6.5, area_ha: 10, soil_texture: 'loam', om_pct: 2.5, lime_ecce: 0.9 });
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = k => e => setF(p => ({ ...p, [k]: k === 'soil_texture' ? e.target.value : Number(e.target.value) }));
  const run = async () => {
    setBusy(true); setErr('');
    try { setRes((await api.post(`${BASE}/lime-requirement`, f)).data); }
    catch (e) { setErr(e.response?.data?.detail || 'Error'); }
    finally { setBusy(false); }
  };
  const textureOptions = [
    ['sandy', t('calc_tex_sandy')],
    ['loam',  t('calc_tex_loam')],
    ['clay',  t('calc_tex_clay')],
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
        <Row label={t('calc_lbl_current_ph')}><Inp value={f.current_ph}   onChange={set('current_ph')}   step={0.1}  /></Row>
        <Row label={t('calc_lbl_target_ph')}> <Inp value={f.target_ph}    onChange={set('target_ph')}    step={0.1}  /></Row>
        <Row label={t('calc_lbl_area_ha')}>   <Inp value={f.area_ha}      onChange={set('area_ha')}                  /></Row>
        <Row label={t('calc_lbl_soil_texture')}>
          <Sel value={f.soil_texture} onChange={set('soil_texture')} options={textureOptions} />
        </Row>
        <Row label={t('calc_lbl_om_pct')}>  <Inp value={f.om_pct}    onChange={set('om_pct')}    step={0.1}  /></Row>
        <Row label={t('calc_lbl_lime_cce')}><Inp value={f.lime_ecce} onChange={set('lime_ecce')} step={0.05} /></Row>
      </div>
      <RunBtn onClick={run} loading={busy} t={t} />
      <Err msg={err} />
      {res && <>
        <SectionTitle>{t('calc_sec_results')}</SectionTitle>
        <KV k={t('calc_res_rate')}       v={res.lr_lime_t_ha}    unit="t/ha" highlight />
        <KV k={t('calc_res_total_field')} v={res.lr_lime_total_t} unit="t" />
        <div style={{ background: '#f0fff4', border: `1px solid ${C.ok}44`, borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#1b5e20', marginTop: 8 }}>
          💡 {res.lr_recommendation}
        </div>
      </>}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 8. Machinery Cost
// ─────────────────────────────────────────────────────────────────────────────
const CalcMachinery = () => {
  const { t } = useLang();
  const [f, setF] = useState({ purchase_price: 250000, salvage_value: 30000, life_years: 12, annual_hours: 600, fuel_l_h: 18, fuel_price: 1.4, oil_pct: 0.15, repair_pct: 0.03, labour_h: 20, capacity_ha_h: 3, area_ha: 500 });
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = k => e => setF(p => ({ ...p, [k]: Number(e.target.value) }));
  const run = async () => {
    setBusy(true); setErr('');
    try { setRes((await api.post(`${BASE}/machinery-cost`, f)).data); }
    catch (e) { setErr(e.response?.data?.detail || 'Error'); }
    finally { setBusy(false); }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
        <Row label={t('calc_lbl_purchase')}>   <Inp value={f.purchase_price} onChange={set('purchase_price')}            /></Row>
        <Row label={t('calc_lbl_salvage')}>    <Inp value={f.salvage_value}  onChange={set('salvage_value')}             /></Row>
        <Row label={t('calc_lbl_life_years')}> <Inp value={f.life_years}     onChange={set('life_years')}                /></Row>
        <Row label={t('calc_lbl_annual_h')}>   <Inp value={f.annual_hours}   onChange={set('annual_hours')}              /></Row>
        <Row label={t('calc_lbl_fuel_lh')}>    <Inp value={f.fuel_l_h}       onChange={set('fuel_l_h')}       step={0.5} /></Row>
        <Row label={t('calc_lbl_fuel_price')}> <Inp value={f.fuel_price}     onChange={set('fuel_price')}     step={0.05}/></Row>
        <Row label={t('calc_lbl_oil_pct')}>    <Inp value={f.oil_pct}        onChange={set('oil_pct')}        step={0.01}/></Row>
        <Row label={t('calc_lbl_repair_pct')}> <Inp value={f.repair_pct}     onChange={set('repair_pct')}     step={0.005}/></Row>
        <Row label={t('calc_lbl_labour_h')}>   <Inp value={f.labour_h}       onChange={set('labour_h')}                 /></Row>
        <Row label={t('calc_lbl_capacity')}>   <Inp value={f.capacity_ha_h}  onChange={set('capacity_ha_h')}  step={0.5} /></Row>
        <Row label={t('calc_lbl_area_ha')}>    <Inp value={f.area_ha}        onChange={set('area_ha')}                  /></Row>
      </div>
      <RunBtn onClick={run} loading={busy} t={t} />
      <Err msg={err} />
      {res && <>
        <SectionTitle>{t('calc_sec_cost_h')}</SectionTitle>
        <KV k={t('calc_res_depreciation')} v={res.mcr_depreciation_h}              unit="€/h" />
        <KV k={t('calc_res_fuel')}         v={res.mcr_fuel_h}                      unit="€/h" />
        <KV k={t('calc_res_oil')}          v={res.mcr_oil_h}                       unit="€/h" />
        <KV k={t('calc_res_repairs')}      v={res.mcr_repair_h}                    unit="€/h" />
        <KV k={t('calc_res_labour')}       v={res.mcr_labour_h}                    unit="€/h" />
        <KV k={t('calc_res_total')}        v={res.mcr_total_cost_h}                unit="€/h" highlight />
        <SectionTitle>{t('calc_sec_field_cost')}</SectionTitle>
        <KV k={t('calc_res_cost_ha')}      v={res.mcr_cost_per_ha}                 unit="€/ha" highlight />
        <KV k={t('calc_res_total_field')}  v={res.mcr_total_cost_field?.toLocaleString()} unit="€" />
      </>}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 9. Seed Rate
// ─────────────────────────────────────────────────────────────────────────────
const CalcSeed = () => {
  const { t } = useLang();
  const [f, setF] = useState({ target_plants_m2: 250, tkw_g: 42, area_ha: 50, germination_pct: 94, field_emergence: 0.83, row_spacing_cm: 12.5 });
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = k => e => setF(p => ({ ...p, [k]: Number(e.target.value) }));
  const run = async () => {
    setBusy(true); setErr('');
    try { setRes((await api.post(`${BASE}/seed-rate`, f)).data); }
    catch (e) { setErr(e.response?.data?.detail || 'Error'); }
    finally { setBusy(false); }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
        <Row label={t('calc_lbl_target_pl')}>   <Inp value={f.target_plants_m2} onChange={set('target_plants_m2')}           /></Row>
        <Row label={t('calc_lbl_tkw')}>         <Inp value={f.tkw_g}            onChange={set('tkw_g')}            step={0.5} /></Row>
        <Row label={t('calc_lbl_area_ha')}>     <Inp value={f.area_ha}          onChange={set('area_ha')}                    /></Row>
        <Row label={t('calc_lbl_germ_pct')}>    <Inp value={f.germination_pct}  onChange={set('germination_pct')}  step={0.5} /></Row>
        <Row label={t('calc_lbl_emergence')}>   <Inp value={f.field_emergence}  onChange={set('field_emergence')}  step={0.01}/></Row>
        <Row label={t('calc_lbl_row_spacing')}> <Inp value={f.row_spacing_cm}   onChange={set('row_spacing_cm')}   step={0.5} /></Row>
      </div>
      <RunBtn onClick={run} loading={busy} t={t} />
      <Err msg={err} />
      {res && <>
        <SectionTitle>{t('calc_sec_results')}</SectionTitle>
        <KV k={t('calc_res_seeds_m2')}   v={res.srr_seeds_m2}                    highlight />
        <KV k={t('calc_res_seeds_ha')}   v={res.srr_seeds_ha?.toLocaleString()}            />
        <KV k={t('calc_res_rate')}       v={res.srr_kg_ha}                        unit="kg/ha" highlight />
        <KV k={t('calc_res_total_seed')} v={res.srr_total_kg?.toLocaleString()}   unit="kg" />
        <KV k={t('calc_res_seeds_row')}  v={res.srr_seeds_per_m_row}                        />
      </>}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 10. Agronomy Reference
// ─────────────────────────────────────────────────────────────────────────────
const RefPanel = () => {
  const { t } = useLang();
  const [data,   setData]   = useState(null);
  const [tab,    setTab]    = useState('crops');
  const [loaded, setLoaded] = useState(false);
  const load = async () => {
    if (loaded) return;
    const r = await api.get(`${BASE}/reference`);
    setData(r.data);
    setLoaded(true);
  };

  const tabs = [
    ['crops',              t('calc_ref_crops')],
    ['fertilizers',        t('calc_ref_fertilizers')],
    ['soil_texture_fc_wp', t('calc_ref_soil_fc')],
    ['ph_optimal_ranges',  t('calc_ref_ph')],
    ['spray_guidelines',   t('calc_ref_spray')],
  ];

  if (!loaded) return (
    <div style={{ textAlign: 'center', padding: 30 }}>
      <button onClick={load} style={{ background: C.green, color: C.white, border: 'none', borderRadius: 8, padding: '10px 28px', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
        {t('calc_btn_load_ref')}
      </button>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {tabs.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            style={{ padding: '5px 12px', borderRadius: 20, border: tab === k ? `1.5px solid ${C.green}` : `1px solid ${C.border}`, background: tab === k ? C.green : C.white, color: tab === k ? C.white : C.muted, fontSize: 12, fontWeight: tab === k ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit' }}>
            {l}
          </button>
        ))}
      </div>
      {data && (
        <div style={{ fontSize: 12 }}>
          {tab === 'crops' && Object.entries(data.crops).map(([crop, d]) => (
            <div key={crop} style={{ marginBottom: 12, background: C.champ, borderRadius: 10, padding: '10px 14px' }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6, textTransform: 'capitalize' }}>{crop.replace(/_/g, ' ')}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 20px', color: C.muted }}>
                {d.target_plants    && <span>Target {d.target_plants} pl/m²</span>}
                {d.typical_tkw_g    && <span>TKW {d.typical_tkw_g}g</span>}
                {d.typical_yield_t_ha && <span>Yield ~{d.typical_yield_t_ha} t/ha</span>}
                {d.npk_uptake        && <span>NPK: {d.npk_uptake.n}/{d.npk_uptake.p}/{d.npk_uptake.k} kg/ha</span>}
                {d.n_fixation_kg_ha  && <span>N-fix: ~{d.n_fixation_kg_ha} kg/ha</span>}
              </div>
              <div style={{ marginTop: 6, color: C.muted }}>
                Kc: initial {d.kc_stages.initial} / mid {d.kc_stages.mid} / late {d.kc_stages.late}
              </div>
            </div>
          ))}
          {tab === 'fertilizers' && Object.entries(data.fertilizers).map(([name, d]) => (
            <div key={name} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: C.champ, borderRadius: 7, marginBottom: 4 }}>
              <span style={{ fontWeight: 700 }}>{name}</span>
              <span>N {d.n_pct}% / P {d.p_pct}% / K {d.k_pct}%</span>
            </div>
          ))}
          {tab === 'soil_texture_fc_wp' && Object.entries(data.soil_texture_fc_wp).map(([tx, d]) => (
            <div key={tx} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: C.champ, borderRadius: 7, marginBottom: 4 }}>
              <span style={{ fontWeight: 700, textTransform: 'capitalize' }}>{tx.replace(/_/g, ' ')}</span>
              <span>FC {d.fc_mm_per_30cm} mm / WP {d.wp_mm_per_30cm} mm (per 30cm)</span>
            </div>
          ))}
          {tab === 'ph_optimal_ranges' && Object.entries(data.ph_optimal_ranges).map(([tx, d]) => (
            <div key={tx} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: C.champ, borderRadius: 7, marginBottom: 4 }}>
              <span style={{ fontWeight: 700, textTransform: 'capitalize' }}>{tx.replace(/_/g, ' ')}</span>
              <span>pH {d.min}–{d.max}</span>
            </div>
          ))}
          {tab === 'spray_guidelines' && (
            <div style={{ background: C.champ, borderRadius: 10, padding: '12px 16px', lineHeight: 2 }}>
              {Object.entries(data.spray_guidelines).map(([k, v]) => (
                <div key={k}><strong>{k.replace(/_/g, ' ')}:</strong> {v}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Calculator map ────────────────────────────────────────────────────────────
const CALC_MAP = {
  irrigation: CalcIrrigation,
  swb:        CalcSWB,
  fertilizer: CalcFertilizer,
  tankmix:    CalcTankMix,
  spray:      CalcSpray,
  nutrient:   CalcNutrient,
  lime:       CalcLime,
  machinery:  CalcMachinery,
  seed:       CalcSeed,
  reference:  RefPanel,
};

// ── Main panel ────────────────────────────────────────────────────────────────
const CalculatorsPanel = () => {
  const { t } = useLang();
  const [active, setActive] = useState('irrigation');
  const ActiveComp = CALC_MAP[active];
  const activeCalc = CALCS.find(c => c.id === active);

  return (
    <div style={{ background: C.champ, minHeight: '100%', fontFamily: 'var(--font-body, sans-serif)' }}>
      <div style={{ display: 'flex', gap: 0, minHeight: 600 }}>

        {/* Sidebar */}
        <div style={{ width: 200, flexShrink: 0, background: C.white, borderRight: `1px solid ${C.border}`, padding: '16px 0' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', padding: '0 16px 10px' }}>
            {t('calc_sidebar_title')}
          </div>
          {CALCS.map(c => (
            <button key={c.id} onClick={() => setActive(c.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '9px 16px', border: 'none',
                background: active === c.id ? C.champ : 'transparent',
                borderLeft: active === c.id ? `3px solid ${C.green}` : '3px solid transparent',
                cursor: 'pointer', fontSize: 12, fontWeight: active === c.id ? 700 : 400,
                color: active === c.id ? C.text : C.muted, textAlign: 'left', fontFamily: 'inherit',
              }}>
              <span>{c.icon}</span>
              <span>{t(c.labelKey)}</span>
            </button>
          ))}
        </div>

        {/* Main content */}
        <div style={{ flex: 1, padding: '24px 28px', overflowY: 'auto' }}>
          <div style={{ marginBottom: 20 }}>
            <h2 style={{ fontFamily: 'var(--font-heading, serif)', fontSize: 20, fontWeight: 800, color: C.text, margin: 0 }}>
              {activeCalc?.icon}{' '}{t(activeCalc?.labelKey)}
            </h2>
          </div>
          <Card>
            <ActiveComp />
          </Card>
        </div>

      </div>
    </div>
  );
};

export default CalculatorsPanel;