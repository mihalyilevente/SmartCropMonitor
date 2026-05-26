import { useState, useEffect, useRef } from 'react';
import { useLang } from '../context/LanguageContext';
import api from '../api/client';

// ── Alert type groups (values are EventType enum strings) ────────────────────
const ALERT_TYPE_GROUPS = [
  {
    groupKey: 'supp_group_water',
    icon: '💧',
    types: ['LOW_SOIL_MOISTURE', 'HIGH_SOIL_MOISTURE', 'DROUGHT_WARNING', 'HEAVY_RAIN'],
  },
  {
    groupKey: 'supp_group_climate',
    icon: '🌡️',
    types: ['FROST_HAZARD', 'HEAT_STRESS', 'HIGH_WIND', 'SOIL_TEMP_LOW', 'SOIL_TEMP_HIGH'],
  },
  {
    groupKey: 'supp_group_crop',
    icon: '🌿',
    types: ['NDVI_DROP', 'EVI_ANOMALY', 'METRIC_ANOMALY', 'DISEASE_DETECTION', 'PEST_OUTBREAK'],
  },
  {
    groupKey: 'supp_group_sensor',
    icon: '📡',
    types: ['SENSOR_OFFLINE', 'LOW_BATTERY', 'GATEWAY_DISCONNECTED'],
  },
];

const ALL_ALERT_TYPE_VALUES = ALERT_TYPE_GROUPS.flatMap(g => g.types);

const CROP_LABEL_KEYS = {
  WHEAT_WINTER: 'WHEAT_WINTER', WHEAT_SPRING: 'WHEAT_SPRING',
  BARLEY: 'BARLEY', CORN: 'CORN', OATS: 'OATS', RYE: 'RYE', RICE: 'RICE',
  PEAS: 'PEAS', SOYBEANS: 'SOYBEANS', SUNFLOWER: 'SUNFLOWER',
  RAPESEED_WINTER: 'RAPESEED_WINTER', RAPESEED_SPRING: 'RAPESEED_SPRING',
  SUGAR_BEET: 'SUGAR_BEET', POTATOES: 'POTATOES',
  APPLE: 'APPLE', GRAPES_WINE: 'GRAPES_WINE', GRAPES_TABLE: 'GRAPES_TABLE',
  STRAWBERRY: 'STRAWBERRY', TOMATO: 'TOMATO', FALLOW: 'FALLOW',
  COVER_CROP: 'COVER_CROP', OTHER: 'OTHER',
};

const EMPTY_RULE = {
  name: '', description: '', is_active: true,
  field_ids: [], crop_types: [], location_ids: [],
  alert_types: [],
  season_month_from: null, season_day_from: null,
  season_month_to: null,   season_day_to: null,
  arm_after_harvest: false,
  valid_from: null, valid_until: null,
};

// ── helpers ──────────────────────────────────────────────────────────────────
const pad2 = n => String(n).padStart(2, '0');

const fmtSeason = (rule, t) => {
  const { season_month_from: mf, season_day_from: df,
          season_month_to: mt,   season_day_to: dt } = rule;
  if (!mf || !mt) return t('supp_season_all_year');
  const ms = t(`month_${mf}`);
  const me = t(`month_${mt}`);
  return `${pad2(df || 1)} ${ms} → ${pad2(dt || 28)} ${me}`;
};

const _callOrConcat = (val, arg) =>
  typeof val === 'function' ? val(arg) : `${val} ${arg}`;

const fmtScope = (rule, fields, locations, t) => {
  if (rule.field_ids?.length) {
    const names = rule.field_ids.map(id => fields.find(f => f.id === id)?.label || id).join(', ');
    return _callOrConcat(t('supp_scope_fields'), names);
  }
  if (rule.crop_types?.length) {
    const names = rule.crop_types.join(', ');
    return _callOrConcat(t('supp_scope_crops'), names);
  }
  if (rule.location_ids?.length) {
    const names = rule.location_ids.map(id => locations.find(l => l.id === id)?.label || id).join(', ');
    return _callOrConcat(t('supp_scope_locations'), names);
  }
  return t('supp_scope_all');
};

const fmtAlertTypes = (types, t) => {
  if (!types?.length) return t('supp_alert_types_all');
  if (types.length <= 2) return types.map(v => t(`supp_at_${v}`) || v).join(', ');
  return _callOrConcat(t('supp_alert_types_n'), types.length);
};

// ── sub-components ───────────────────────────────────────────────────────────

const Toggle = ({ checked, onChange, disabled }) => (
  <label style={{ ...S.switch, ...(checked ? S.switchOn : {}), ...(disabled ? S.switchDisabled : {}) }}>
    <input
      type="checkbox" checked={checked} disabled={disabled}
      onChange={e => onChange(e.target.checked)}
      style={S.switchInput}
    />
    <span style={{ ...S.knob, transform: checked ? 'translateX(22px)' : 'translateX(0)' }} />
  </label>
);

const StatusBadge = ({ active, t }) => (
  <span style={{ ...S.badge, ...(active ? S.badgeActive : S.badgeOff) }}>
    {active ? t('supp_rule_active') : t('supp_rule_inactive')}
  </span>
);

const Section = ({ title, icon, hint, children }) => (
  <div style={S.section}>
    <div style={S.sectionHead}>
      <span style={S.sectionIcon}>{icon}</span>
      <div>
        <div style={S.sectionTitle}>{title}</div>
        {hint && hint.length > 0 && <div style={S.sectionHint}>{hint}</div>}
      </div>
    </div>
    <div style={S.sectionBody}>{children}</div>
  </div>
);

const FormRow = ({ label, children }) => (
  <div style={S.formRow}>
    <label style={S.label}>{label}</label>
    <div style={S.formRowRight}>{children}</div>
  </div>
);

const MultiSelect = ({ options, selected, onChange, placeholder }) => {
  const [open, setOpen] = useState(false);
  const toggle = val => onChange(
    selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]
  );
  const selectedOptions = options.filter(o => selected.includes(o.value));
  return (
    <div style={{ position: 'relative' }}>
      <div
        style={{ ...S.multiSelectBox, ...(open ? S.multiSelectBoxOpen : {}) }}
        onClick={() => setOpen(o => !o)}
        tabIndex={0}
        onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}
      >
        {selectedOptions.length === 0
          ? <span style={S.muted}>{placeholder}</span>
          : <div style={S.chipRow}>
              {selectedOptions.map(o => (
                <span key={o.value} style={S.chip}>
                  {o.label}
                  <button
                    onClick={e => { e.stopPropagation(); toggle(o.value); }}
                    style={S.chipX}
                  >×</button>
                </span>
              ))}
            </div>
        }
        <span style={S.caret}>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div style={S.dropdown}>
          {options.map(o => (
            <label key={o.value} style={S.dropdownItem}>
              <input
                type="checkbox" checked={selected.includes(o.value)}
                onChange={() => toggle(o.value)}
                style={{ marginRight: 8 }}
              />
              {o.label}
            </label>
          ))}
          {options.length === 0 && <div style={S.muted}>—</div>}
        </div>
      )}
    </div>
  );
};

const AlertTypePicker = ({ selected, onChange, t }) => {
  const toggle = val => onChange(
    selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]
  );
  return (
    <div>
      <label style={{ ...S.dropdownItem, marginBottom: 10 }}>
        <input
          type="checkbox" checked={selected.length === 0}
          onChange={() => onChange([])}
          style={{ marginRight: 8 }}
        />
        <span style={{ fontWeight: 700 }}>{t('supp_field_alert_types_all')}</span>
      </label>
      {ALERT_TYPE_GROUPS.map(group => (
        <div key={group.groupKey} style={S.atGroup}>
          <div style={S.atGroupLabel}>{group.icon} {t(group.groupKey)}</div>
          <div style={S.atGroupItems}>
            {group.types.map(v => (
              <label key={v} style={S.atItem}>
                <input
                  type="checkbox" checked={selected.includes(v)}
                  onChange={() => toggle(v)}
                  style={{ marginRight: 6 }}
                />
                {t(`supp_at_${v}`) || v}
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

// ── main component ───────────────────────────────────────────────────────────

const AlertSuppressionPanel = ({
  userId,
  fields = [],
  locations = [],
}) => {
  const { t: tRaw, lang } = useLang();
  // Fallback: if key missing in locale file, return a sensible English string
  const FALLBACKS = {
    loading: 'Loading…',
    supp_page_title: 'Alert suppression rules',
    supp_page_subtitle: 'Silence alerts after harvest or during specific seasons',
    supp_add_btn: '+ Add rule',
    supp_empty_title: 'No rules yet',
    supp_empty_sub: 'Create a rule to automatically suppress irrelevant alerts.',
    supp_empty_cta: 'Create first rule',
    supp_rule_active: 'Active',
    supp_rule_inactive: 'Inactive',
    supp_scope_all: 'All fields',
    supp_season_all_year: 'All year',
    supp_alert_types_all: 'All alerts',
    supp_after_harvest_tag: 'After harvest',
    supp_edit_btn: 'Edit',
    supp_delete_btn: 'Delete',
    supp_delete_confirm: 'Delete this suppression rule?',
    supp_success_created: 'Rule created',
    supp_success_updated: 'Rule updated',
    supp_success_deleted: 'Rule deleted',
    supp_err_name_required: 'Please enter a rule name',
    supp_err_save: 'Could not save rule',
    supp_err_delete: 'Could not delete rule',
    supp_err_load: 'Could not load rules',
    supp_saving: 'Saving…',
    supp_sec_basic: 'General',
    supp_sec_scope: 'Scope',
    supp_sec_scope_hint: 'Apply to specific fields, crop types, or farms. If nothing selected, applies to all fields.',
    supp_sec_alert_types: 'Alert types',
    supp_sec_alert_types_hint: 'If nothing selected, ALL alert types are suppressed in the defined scope.',
    supp_sec_season: 'Seasonal window',
    supp_sec_season_hint: 'Rule active only during the specified period. Leave empty for year-round.',
    supp_sec_harvest: 'Trigger: after harvest',
    supp_sec_harvest_hint: 'If enabled, the rule only suppresses alerts after a HARVESTING work record is logged for the field.',
    supp_sec_validity: 'Validity (optional)',
    supp_field_name: 'Name *',
    supp_field_name_ph: 'e.g. Suppress irrigation alerts after harvest',
    supp_field_desc: 'Description',
    supp_field_desc_ph: 'Optional notes…',
    supp_field_active: 'Active',
    supp_field_fields: 'Fields',
    supp_field_fields_ph: 'Select specific fields…',
    supp_field_crops: 'Crop types',
    supp_field_crops_ph: 'Apply to all fields with crop…',
    supp_field_locations: 'Farms',
    supp_field_locations_ph: 'Restrict to farm…',
    supp_field_alert_types_all: 'All alert types',
    supp_field_season_start: 'Start',
    supp_field_season_end: 'End',
    supp_field_season_month: '— Month —',
    supp_field_season_day: 'Day',
    supp_field_season_wraps: '(wraps across new year)',
    supp_field_harvest_toggle: 'Activate after harvest',
    supp_field_harvest_info: 'The rule activates once a Harvesting work record is logged for the selected fields.',
    supp_field_valid_from: 'Valid from',
    supp_field_valid_until: 'Valid until',
    supp_cancel: 'Cancel',
    supp_save_new: 'Create rule',
    supp_save_edit: 'Save changes',
    supp_group_water: 'Water & irrigation',
    supp_group_climate: 'Temperature & climate',
    supp_group_crop: 'Crops & disease',
    supp_group_sensor: 'Sensors & system',
    supp_at_LOW_SOIL_MOISTURE: 'Low soil moisture',
    supp_at_HIGH_SOIL_MOISTURE: 'High soil moisture',
    supp_at_DROUGHT_WARNING: 'Drought warning',
    supp_at_HEAVY_RAIN: 'Heavy rain',
    supp_at_FROST_HAZARD: 'Frost hazard',
    supp_at_HEAT_STRESS: 'Heat stress',
    supp_at_HIGH_WIND: 'High wind',
    supp_at_SOIL_TEMP_LOW: 'Soil temp low',
    supp_at_SOIL_TEMP_HIGH: 'Soil temp high',
    supp_at_NDVI_DROP: 'NDVI drop',
    supp_at_EVI_ANOMALY: 'EVI anomaly',
    supp_at_METRIC_ANOMALY: 'Metric anomaly',
    supp_at_DISEASE_DETECTION: 'Disease detection',
    supp_at_PEST_OUTBREAK: 'Pest outbreak',
    supp_at_SENSOR_OFFLINE: 'Sensor offline',
    supp_at_LOW_BATTERY: 'Low battery',
    supp_at_GATEWAY_DISCONNECTED: 'Gateway disconnected',
    month_1:'Jan',month_2:'Feb',month_3:'Mar',month_4:'Apr',
    month_5:'May',month_6:'Jun',month_7:'Jul',month_8:'Aug',
    month_9:'Sep',month_10:'Oct',month_11:'Nov',month_12:'Dec',
  };
  const t = (key) => {
    const v = tRaw(key);
    // If t() returns the key unchanged or empty string, use fallback
    if (!v || v === key) return FALLBACKS[key] ?? key;
    return v;
  };
  const [rules, setRules]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState(null);
  const [success, setSuccess]   = useState(null);
  const [editRule, setEditRule] = useState(null);
  const [isNew, setIsNew]       = useState(false);

  // Stable ref to avoid stale closure without re-triggering effects
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  const fetchRules = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/api/v1/alert-suppression/`, { params: { user_id: userIdRef.current } });
      setRules(res.data);
    } catch {
      setError('Could not load rules');
    } finally {
      setLoading(false);
    }
  };

  // Run once on mount only
  useEffect(() => {
    fetchRules();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const flash = msg => { setSuccess(msg); setTimeout(() => setSuccess(null), 3000); };

  const handleNew  = () => { setEditRule({ ...EMPTY_RULE }); setIsNew(true);  setError(null); setSuccess(null); };
  const handleEdit = rule => { setEditRule({ ...rule });     setIsNew(false); setError(null); setSuccess(null); };
  const handleCancel = () => setEditRule(null);

  const handleSave = async () => {
    if (!editRule.name.trim()) { setError(t('supp_err_name_required')); return; }
    setSaving(true); setError(null);
    try {
      if (isNew) {
        await api.post(`/api/v1/alert-suppression/`, editRule, { params: { user_id: userId } });
      } else {
        await api.patch(`/api/v1/alert-suppression/${editRule.id}`, editRule, { params: { user_id: userId } });
      }
      await fetchRules();
      setEditRule(null);
      flash(isNew ? t('supp_success_created') : t('supp_success_updated'));
    } catch { setError(t('supp_err_save')); }
    finally { setSaving(false); }
  };

  const handleDelete = async id => {
    if (!window.confirm(t('supp_delete_confirm'))) return;
    try {
      await api.delete(`/api/v1/alert-suppression/${id}`, { params: { user_id: userId } });
      await fetchRules();
      flash(t('supp_success_deleted'));
    } catch { setError(t('supp_err_delete')); }
  };

  const handleToggle = async id => {
    try {
      await api.post(`/api/v1/alert-suppression/${id}/toggle`, {}, { params: { user_id: userId } });
      await fetchRules();
    } catch { setError(t('supp_err_save')); }
  };

  const setF = (key, val) => setEditRule(r => ({ ...r, [key]: val }));

  const uniqueCrops = [...new Set(fields.map(f => f.crop_type).filter(Boolean))];

  // ── MONTHS for selects ────────────────────────────────────────────────────
  const MONTHS_OPTIONS = Array.from({ length: 12 }, (_, i) => ({
    value: i + 1,
    label: t(`month_${i + 1}`),
  }));

  // ── List view ─────────────────────────────────────────────────────────────
  const renderList = () => (
    <div>
      <div style={S.listHeader}>
        <div>
          <div style={S.listTitle}>{t('supp_page_title')}</div>
          <div style={S.listSub}>{t('supp_page_subtitle')}</div>
        </div>
        <button onClick={handleNew} style={S.btnPrimary}>{t('supp_add_btn')}</button>
      </div>

      {loading && <div style={S.muted}>{t('loading')}</div>}

      {!loading && rules.length === 0 && (
        <div style={S.emptyState}>
          <div style={S.emptyIcon}>🔕</div>
          <div style={S.emptyTitle}>{t('supp_empty_title')}</div>
          <div style={S.emptySub}>{t('supp_empty_sub')}</div>
          <button onClick={handleNew} style={{ ...S.btnPrimary, marginTop: 16 }}>
            {t('supp_empty_cta')}
          </button>
        </div>
      )}

      {rules.map(rule => (
        <div key={rule.id} style={{ ...S.ruleCard, ...(rule.is_active ? {} : S.ruleCardOff) }}>
          <div style={S.ruleCardTop}>
            <div style={S.ruleCardLeft}>
              <div style={S.ruleCardName}>
                {rule.name}
                <StatusBadge active={rule.is_active} t={t} />
              </div>
              {rule.description && <div style={S.ruleCardDesc}>{rule.description}</div>}
              <div style={S.ruleCardMeta}>
                <span>📍 {fmtScope(rule, fields, locations, t)}</span>
                <span style={S.metaDot}>·</span>
                <span>📅 {fmtSeason(rule, t)}</span>
                <span style={S.metaDot}>·</span>
                <span>🔕 {fmtAlertTypes(rule.alert_types, t)}</span>
                {rule.arm_after_harvest && (
                  <>
                    <span style={S.metaDot}>·</span>
                    <span style={S.harvestTag}>🌾 {t('supp_after_harvest_tag')}</span>
                  </>
                )}
              </div>
            </div>
            <div style={S.ruleCardActions}>
              <Toggle checked={rule.is_active} onChange={() => handleToggle(rule.id)} />
              <button onClick={() => handleEdit(rule)} style={S.btnSecondary}>{t('supp_edit_btn')}</button>
              <button onClick={() => handleDelete(rule.id)} style={S.btnDanger}>{t('supp_delete_btn')}</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  // ── Editor view ───────────────────────────────────────────────────────────
  const renderEditor = () => (
    <div style={S.editorWrap}>
      <div style={S.editorHeader}>
        <button onClick={handleCancel} style={S.btnBack}>←</button>
        <div style={S.editorTitle}>
          {isNew ? t('supp_save_new') : editRule.name}
        </div>
      </div>

      {/* General */}
      <Section title={t('supp_sec_basic')} icon="📋" hint={t('supp_sec_basic_hint') || undefined}>
        <FormRow label={t('supp_field_name')}>
          <input
            style={S.input}
            value={editRule.name}
            onChange={e => setF('name', e.target.value)}
            placeholder={t('supp_field_name_ph')}
          />
        </FormRow>
        <FormRow label={t('supp_field_desc')}>
          <textarea
            style={{ ...S.input, minHeight: 60, resize: 'vertical' }}
            value={editRule.description || ''}
            onChange={e => setF('description', e.target.value)}
            placeholder={t('supp_field_desc_ph')}
          />
        </FormRow>
        <FormRow label={t('supp_field_active')}>
          <Toggle checked={editRule.is_active} onChange={v => setF('is_active', v)} />
        </FormRow>
      </Section>

      {/* Scope */}
      <Section title={t('supp_sec_scope')} icon="📍" hint={t('supp_sec_scope_hint')}>
        <FormRow label={t('supp_field_fields')}>
          <MultiSelect
            options={fields.map(f => ({
              value: f.id,
              label: f.label + (f.crop_type ? ` (${f.crop_type})` : ''),
            }))}
            selected={editRule.field_ids || []}
            onChange={v => setF('field_ids', v)}
            placeholder={t('supp_field_fields_ph')}
          />
        </FormRow>
        <FormRow label={t('supp_field_crops')}>
          <MultiSelect
            options={uniqueCrops.map(c => ({ value: c, label: c }))}
            selected={editRule.crop_types || []}
            onChange={v => setF('crop_types', v)}
            placeholder={t('supp_field_crops_ph')}
          />
        </FormRow>
        <FormRow label={t('supp_field_locations')}>
          <MultiSelect
            options={locations.map(l => ({ value: l.id, label: l.label }))}
            selected={editRule.location_ids || []}
            onChange={v => setF('location_ids', v)}
            placeholder={t('supp_field_locations_ph')}
          />
        </FormRow>
      </Section>

      {/* Alert types */}
      <Section title={t('supp_sec_alert_types')} icon="🔕" hint={t('supp_sec_alert_types_hint')}>
        <AlertTypePicker
          selected={editRule.alert_types || []}
          onChange={v => setF('alert_types', v)}
          t={t}
        />
      </Section>

      {/* Seasonal window */}
      <Section title={t('supp_sec_season')} icon="📅" hint={t('supp_sec_season_hint')}>
        <div style={S.seasonRow}>
          {/* Start */}
          <div style={S.seasonHalf}>
            <label style={S.label}>{t('supp_field_season_start')}</label>
            <div style={S.seasonInputs}>
              <select
                style={{ ...S.select, width: 120 }}
                value={editRule.season_month_from || ''}
                onChange={e => setF('season_month_from', e.target.value ? +e.target.value : null)}
              >
                <option value="">{t('supp_field_season_month')}</option>
                {MONTHS_OPTIONS.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
              <input
                type="number" min={1} max={31}
                style={{ ...S.input, width: 60 }}
                value={editRule.season_day_from || ''}
                onChange={e => setF('season_day_from', e.target.value ? +e.target.value : null)}
                placeholder={t('supp_field_season_day')}
              />
            </div>
          </div>
          <div style={S.seasonArrow}>→</div>
          {/* End */}
          <div style={S.seasonHalf}>
            <label style={S.label}>{t('supp_field_season_end')}</label>
            <div style={S.seasonInputs}>
              <select
                style={{ ...S.select, width: 120 }}
                value={editRule.season_month_to || ''}
                onChange={e => setF('season_month_to', e.target.value ? +e.target.value : null)}
              >
                <option value="">{t('supp_field_season_month')}</option>
                {MONTHS_OPTIONS.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
              <input
                type="number" min={1} max={31}
                style={{ ...S.input, width: 60 }}
                value={editRule.season_day_to || ''}
                onChange={e => setF('season_day_to', e.target.value ? +e.target.value : null)}
                placeholder={t('supp_field_season_day')}
              />
            </div>
          </div>
        </div>
        {editRule.season_month_from && editRule.season_month_to && (
          <div style={S.seasonPreview}>
            {_callOrConcat(t('supp_field_season_preview'), fmtSeason(editRule, t))}
            {editRule.season_month_from > editRule.season_month_to && (
              <span style={S.seasonWrapNote}> {t('supp_field_season_wraps')}</span>
            )}
          </div>
        )}
      </Section>

      {/* After-harvest trigger */}
      <Section title={t('supp_sec_harvest')} icon="🌾" hint={t('supp_sec_harvest_hint')}>
        <FormRow label={t('supp_field_harvest_toggle')}>
          <Toggle checked={editRule.arm_after_harvest} onChange={v => setF('arm_after_harvest', v)} />
        </FormRow>
        {editRule.arm_after_harvest && (
          <div style={S.infoBox}>{t('supp_field_harvest_info')}</div>
        )}
      </Section>

      {/* Validity */}
      <Section title={t('supp_sec_validity')} icon="⏱">
        <div style={S.dateRow}>
          <FormRow label={t('supp_field_valid_from')}>
            <input
              type="datetime-local" style={S.input}
              value={editRule.valid_from ? editRule.valid_from.slice(0, 16) : ''}
              onChange={e => setF('valid_from', e.target.value || null)}
            />
          </FormRow>
          <FormRow label={t('supp_field_valid_until')}>
            <input
              type="datetime-local" style={S.input}
              value={editRule.valid_until ? editRule.valid_until.slice(0, 16) : ''}
              onChange={e => setF('valid_until', e.target.value || null)}
            />
          </FormRow>
        </div>
      </Section>

      {error && <div style={S.statusError}>{error}</div>}
      <div style={S.saveBar}>
        <button onClick={handleCancel} style={S.btnSecondary} disabled={saving}>
          {t('supp_cancel')}
        </button>
        <button onClick={handleSave} style={S.btnPrimary} disabled={saving}>
          {saving ? t('supp_saving') : isNew ? t('supp_save_new') : t('supp_save_edit')}
        </button>
      </div>
    </div>
  );

  // ── root render ───────────────────────────────────────────────────────────
  return (
    <div style={S.root}>
      {success && <div style={S.statusSuccess}>✓ {success}</div>}
      {!editRule && error && <div style={S.statusError}>{error}</div>}
      {editRule ? renderEditor() : renderList()}
    </div>
  );
};

// ── styles ───────────────────────────────────────────────────────────────────
const S = {
  root: { fontFamily: 'inherit', color: 'var(--color-accent-chernozem, #2d2116)' },

  listHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: 20, gap: 12, flexWrap: 'wrap',
  },
  listTitle: { fontSize: 14, fontWeight: 900, color: 'var(--color-accent-chernozem, #2d2116)', marginBottom: 2 },
  listSub:   { fontSize: 12, color: '#7b6f61' },

  emptyState: { padding: '48px 0', textAlign: 'center', color: '#9e8f7e' },
  emptyIcon:  { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: 800, marginBottom: 6, color: '#5a4e42' },
  emptySub:   { fontSize: 13, lineHeight: 1.6 },

  ruleCard: {
    border: '1px solid rgba(216,201,170,0.85)', borderRadius: 10,
    marginBottom: 12, padding: '14px 16px', background: '#fff',
  },
  ruleCardOff: { opacity: 0.55 },
  ruleCardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' },
  ruleCardLeft: { flex: 1, minWidth: 0 },
  ruleCardName: { fontSize: 14, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 },
  ruleCardDesc: { fontSize: 12, color: '#7b6f61', marginBottom: 6 },
  ruleCardMeta: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 12, color: '#7b6f61' },
  metaDot:  { color: '#c9b89a' },
  harvestTag: {
    background: '#fffbe6', border: '1px solid #f4d06f',
    borderRadius: 10, padding: '1px 8px', fontSize: 11, color: '#7a4d00', fontWeight: 700,
  },
  ruleCardActions: { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },

  editorWrap:   {},
  editorHeader: {
    display: 'flex', alignItems: 'center', gap: 14,
    marginBottom: 24, paddingBottom: 16,
    borderBottom: '1px solid var(--color-accent-soil, #d8c9aa)',
  },
  editorTitle: { fontSize: 20, fontWeight: 900, color: 'var(--color-accent-chernozem, #2d2116)' },

  section: { marginBottom: 20, border: '1px solid rgba(216,201,170,0.7)', borderRadius: 10, overflow: 'hidden' },
  sectionHead: {
    display: 'flex', alignItems: 'flex-start', gap: 10,
    padding: '12px 16px',
    background: 'var(--color-bg-magnolia, #faf7f2)',
    borderBottom: '1px solid rgba(216,201,170,0.5)',
  },
  sectionIcon:  { fontSize: 18, lineHeight: '22px', flexShrink: 0 },
  sectionTitle: { fontSize: 14, fontWeight: 900, color: 'var(--color-accent-chernozem, #2d2116)' },
  sectionHint:  { fontSize: 12, color: '#7b6f61', marginTop: 2, lineHeight: 1.4 },
  sectionBody:  { padding: '14px 16px' },

  formRow: { display: 'grid', gridTemplateColumns: '160px 1fr', gap: 12, alignItems: 'start', marginBottom: 12 },
  formRowRight: { minWidth: 0 },
  label: { fontSize: 13, fontWeight: 700, color: '#5a4e42', paddingTop: 7 },

  input: {
    width: '100%', padding: '7px 10px',
    border: '1px solid var(--color-accent-soil, #d8c9aa)', borderRadius: 7,
    fontSize: 13, fontFamily: 'inherit', color: 'var(--color-accent-chernozem, #2d2116)',
    background: '#fff', boxSizing: 'border-box', outline: 'none',
  },
  select: {
    padding: '7px 10px', border: '1px solid var(--color-accent-soil, #d8c9aa)',
    borderRadius: 7, fontSize: 13, fontFamily: 'inherit',
    color: 'var(--color-accent-chernozem, #2d2116)', background: '#fff',
    outline: 'none', cursor: 'pointer',
  },
  multiSelectBox: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '6px 10px', border: '1px solid var(--color-accent-soil, #d8c9aa)',
    borderRadius: 7, background: '#fff', cursor: 'pointer', minHeight: 36, gap: 8,
  },
  multiSelectBoxOpen: {
    borderColor: 'var(--color-green-primary, #4a7c3f)',
    boxShadow: '0 0 0 2px rgba(74,124,63,0.12)',
  },
  caret: { fontSize: 10, color: '#aaa', flexShrink: 0 },
  dropdown: {
    position: 'absolute', zIndex: 100, top: '100%', left: 0, right: 0, marginTop: 2,
    background: '#fff', border: '1px solid var(--color-accent-soil, #d8c9aa)',
    borderRadius: 7, boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
    maxHeight: 220, overflowY: 'auto', padding: 6,
  },
  dropdownItem: {
    display: 'flex', alignItems: 'center', padding: '6px 8px',
    borderRadius: 5, fontSize: 13, cursor: 'pointer', userSelect: 'none',
  },
  chipRow: { display: 'flex', flexWrap: 'wrap', gap: 4, flex: 1 },
  chip: {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '2px 8px', borderRadius: 12,
    background: 'rgba(74,124,63,0.12)', border: '1px solid rgba(74,124,63,0.25)',
    fontSize: 11, fontWeight: 700, color: 'var(--color-green-primary, #4a7c3f)',
  },
  chipX: {
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: 13, lineHeight: 1, padding: 0, color: 'inherit', opacity: 0.6,
  },

  atGroup: { marginBottom: 10 },
  atGroupLabel: {
    fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em',
    color: '#9e8f7e', marginBottom: 6, paddingLeft: 2,
  },
  atGroupItems: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 2 },
  atItem: { display: 'flex', alignItems: 'center', padding: '5px 8px', borderRadius: 5, fontSize: 13, cursor: 'pointer', userSelect: 'none' },

  seasonRow:    { display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' },
  seasonHalf:   { flex: 1, minWidth: 200 },
  seasonInputs: { display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 },
  seasonArrow:  { fontSize: 18, color: '#9e8f7e', paddingBottom: 8 },
  seasonPreview: {
    marginTop: 10, padding: '8px 12px', background: '#f5f0e8',
    borderRadius: 7, fontSize: 12, color: '#5a4e42', fontWeight: 700,
  },
  seasonWrapNote: { fontWeight: 400, color: '#9e8f7e' },
  dateRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },

  infoBox: {
    marginTop: 10, padding: '10px 12px',
    background: '#e8f4fd', border: '1px solid #90caf9',
    borderRadius: 8, fontSize: 12, lineHeight: 1.5, color: '#0d47a1',
  },

  saveBar: {
    display: 'flex', justifyContent: 'flex-end', gap: 10,
    paddingTop: 20, marginTop: 8, borderTop: '1px solid rgba(216,201,170,0.5)',
  },

  btnPrimary: {
    padding: '8px 18px', background: 'var(--color-green-signal, #5a9e4a)',
    color: '#fff', border: 'none', borderRadius: 8,
    fontSize: 13, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer',
  },
  btnSecondary: {
    padding: '7px 14px', background: '#fff',
    color: 'var(--color-accent-chernozem, #2d2116)',
    border: '1px solid var(--color-accent-soil, #d8c9aa)',
    borderRadius: 8, fontSize: 13, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer',
  },
  btnDanger: {
    padding: '7px 14px', background: '#fff', color: '#b71c1c',
    border: '1px solid #ef9a9a', borderRadius: 8,
    fontSize: 13, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer',
  },
  btnBack: {
    padding: '7px 12px', background: '#fff',
    color: 'var(--color-accent-chernozem, #2d2116)',
    border: '1px solid var(--color-accent-soil, #d8c9aa)',
    borderRadius: 8, fontSize: 13, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer',
  },

  statusSuccess: {
    padding: '10px 14px', background: '#e8f5e9', border: '1px solid #a5d6a7',
    borderRadius: 8, fontSize: 13, fontWeight: 700, color: '#2e7d32', marginBottom: 16,
  },
  statusError: {
    padding: '10px 14px', background: '#fce4ec', border: '1px solid #f48fb1',
    borderRadius: 8, fontSize: 13, fontWeight: 700, color: '#b71c1c', marginBottom: 16,
  },
  muted: { color: '#9e8f7e', fontSize: 13 },

  switch: {
    position: 'relative', display: 'inline-block',
    width: 50, height: 28, borderRadius: 999,
    background: '#d8c9aa', border: '1px solid #c7b58f',
    transition: 'background 0.15s, border-color 0.15s', flexShrink: 0,
  },
  switchOn: { background: 'var(--color-green-signal, #5a9e4a)', borderColor: 'var(--color-green-primary, #4a7c3f)' },
  switchDisabled: { opacity: 0.5 },
  switchInput: { position: 'absolute', opacity: 0, pointerEvents: 'none' },
  knob: {
    position: 'absolute', top: 3, left: 3, width: 20, height: 20,
    borderRadius: '50%', background: '#fff',
    boxShadow: '0 1px 4px rgba(0,0,0,0.25)', transition: 'transform 0.15s', pointerEvents: 'none',
  },

  badge: {
    display: 'inline-block', padding: '2px 10px', borderRadius: 12,
    fontSize: 10, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase',
  },
  badgeActive: {
    background: 'rgba(74,124,63,0.12)', color: 'var(--color-green-primary, #4a7c3f)',
    border: '1px solid rgba(74,124,63,0.25)',
  },
  badgeOff: { background: '#f5f0e8', color: '#9e8f7e', border: '1px solid #d8c9aa' },
};

export default AlertSuppressionPanel;