import { useState } from 'react';
import api from '../api/client';
import { useLang } from '../context/LanguageContext';

const AddLocationModal = ({ userId, onClose, onSaved }) => {
  const { t } = useLang();
  const [label, setLabel]   = useState('');
  const [lat,   setLat]     = useState('');
  const [lon,   setLon]     = useState('');
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState(null);

  const validate = () => {
    if (!label.trim())          return t('err_name_required');
    const latN = parseFloat(lat);
    const lonN = parseFloat(lon);
    if (isNaN(latN) || latN < -90  || latN > 90)  return t('err_lat_invalid');
    if (isNaN(lonN) || lonN < -180 || lonN > 180) return t('err_lon_invalid');
    return null;
  };

  const handleSave = async () => {
    const err = validate();
    if (err) { setError(err); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await api.post(
        '/api/v1/locations',
        { label: label.trim(), lat: parseFloat(lat), lon: parseFloat(lon) },
        { params: { user_id: userId } }
      );
      onSaved(res.data);
    } catch (e) {
      setError(e?.response?.data?.detail || t('err_save_failed'));
      setSaving(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter')  handleSave();
    if (e.key === 'Escape') onClose();
  };

  return (
    <div style={s.backdrop} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={s.modal}>
        <div style={s.header}>
          <span style={s.title}>{t('modal_title_add')}</span>
          <button style={s.closeBtn} onClick={onClose}>×</button>
        </div>

        <div style={s.body}>
          <Field label={t('field_location_name')} required>
            <input
              autoFocus style={s.input}
              placeholder={t('placeholder_name')}
              value={label} onChange={e => setLabel(e.target.value)}
              onKeyDown={handleKey} disabled={saving}
            />
          </Field>

          <div style={s.row}>
            <Field label={t('field_lat')} required style={{ flex: 1 }}>
              <input
                style={s.input} type="number" step="any"
                placeholder={t('placeholder_lat')}
                value={lat} onChange={e => setLat(e.target.value)}
                onKeyDown={handleKey} disabled={saving}
              />
            </Field>
            <Field label={t('field_lon')} required style={{ flex: 1 }}>
              <input
                style={s.input} type="number" step="any"
                placeholder={t('placeholder_lon')}
                value={lon} onChange={e => setLon(e.target.value)}
                onKeyDown={handleKey} disabled={saving}
              />
            </Field>
          </div>

          <p style={s.hint}>{t('maps_hint')}</p>
          {error && <div style={s.error}>{error}</div>}
        </div>

        <div style={s.footer}>
          <button style={s.cancelBtn} onClick={onClose} disabled={saving}>{t('cancel')}</button>
          <button
            style={{ ...s.saveBtn, opacity: saving || !label.trim() ? 0.5 : 1 }}
            onClick={handleSave} disabled={saving || !label.trim()}
          >
            {saving ? t('saving') : t('save')}
          </button>
        </div>
      </div>
    </div>
  );
};

const Field = ({ label, required, children, style }) => (
  <div style={{ marginBottom: 14, ...style }}>
    <label style={s.fieldLabel}>
      {label}{required && <span style={{ color: '#c0392b' }}> *</span>}
    </label>
    {children}
  </div>
);

const s = {
  backdrop:   { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal:      { background: 'var(--color-bg-magnolia, #fff)', borderRadius: 14, width: 400, boxShadow: '0 8px 32px rgba(0,0,0,0.22)', overflow: 'hidden' },
  header:     { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--color-accent-soil, #c8a96e)' },
  title:      { fontWeight: 700, fontSize: 15 },
  closeBtn:   { background: 'none', border: 'none', fontSize: 22, lineHeight: 1, cursor: 'pointer', opacity: 0.5, padding: '0 4px' },
  body:       { padding: '20px 20px 4px' },
  row:        { display: 'flex', gap: 12 },
  fieldLabel: { display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 5, opacity: 0.7 },
  input:      { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--color-accent-soil, #c8a96e)', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' },
  hint:       { fontSize: 11, opacity: 0.5, margin: '0 0 12px' },
  error:      { marginTop: 4, marginBottom: 12, fontSize: 12, color: '#c0392b' },
  footer:     { display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 20px 18px' },
  cancelBtn:  { padding: '8px 16px', borderRadius: 8, border: '1px solid var(--color-accent-soil, #c8a96e)', background: 'transparent', cursor: 'pointer', fontSize: 13 },
  saveBtn:    { padding: '8px 20px', borderRadius: 8, border: 'none', background: 'var(--color-accent-soil, #7a5c2e)', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 13, transition: 'opacity 0.15s' },
};

export default AddLocationModal;