/**
 * AddLocationModal.jsx
 * Simple modal for creating a new UserLocation.
 * POSTs to /api/v1/user/locations with { user_id, label }.
 *
 * Props:
 *   userId   {number}
 *   onClose  {() => void}
 *   onSaved  {(newLocation) => void}
 */
import React, { useState } from 'react';
import api from '../api/client';

const AddLocationModal = ({ userId, onClose, onSaved }) => {
  const [label, setLabel]   = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState(null);

  const handleSave = async () => {
    if (!label.trim()) { setError('Please enter a location name.'); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await api.post('/api/v1/user/locations', { user_id: userId, label: label.trim() });
      onSaved(res.data);
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to create location.');
      setSaving(false);
    }
  };

  const handleKey = (e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onClose(); };

  return (
    <div style={styles.backdrop} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <span style={styles.title}>Add Location</span>
          <button style={styles.closeBtn} onClick={onClose}>×</button>
        </div>

        <div style={styles.body}>
          <label style={styles.fieldLabel}>Location name</label>
          <input
            autoFocus
            style={styles.input}
            placeholder="e.g. North Field — Debrecen"
            value={label}
            onChange={e => setLabel(e.target.value)}
            onKeyDown={handleKey}
            disabled={saving}
          />
          {error && <div style={styles.error}>{error}</div>}
        </div>

        <div style={styles.footer}>
          <button style={styles.cancelBtn} onClick={onClose} disabled={saving}>Cancel</button>
          <button style={styles.saveBtn} onClick={handleSave} disabled={saving || !label.trim()}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};

const styles = {
  backdrop: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    background: 'var(--color-bg-magnolia, #fff)',
    borderRadius: 14,
    width: 360,
    boxShadow: '0 8px 32px rgba(0,0,0,0.22)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '16px 20px',
    borderBottom: '1px solid var(--color-accent-soil, #c8a96e)',
  },
  title: { fontWeight: 700, fontSize: 15 },
  closeBtn: {
    background: 'none', border: 'none',
    fontSize: 22, lineHeight: 1, cursor: 'pointer', opacity: 0.5,
    padding: '0 4px',
  },
  body: { padding: '20px 20px 12px' },
  fieldLabel: { display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, opacity: 0.7 },
  input: {
    width: '100%',
    padding: '9px 12px',
    borderRadius: 8,
    border: '1px solid var(--color-accent-soil, #c8a96e)',
    fontSize: 14,
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    outline: 'none',
  },
  error: { marginTop: 8, fontSize: 12, color: '#c0392b' },
  footer: {
    display: 'flex', justifyContent: 'flex-end', gap: 8,
    padding: '12px 20px 18px',
  },
  cancelBtn: {
    padding: '8px 16px', borderRadius: 8, border: '1px solid var(--color-accent-soil, #c8a96e)',
    background: 'transparent', cursor: 'pointer', fontSize: 13,
  },
  saveBtn: {
    padding: '8px 20px', borderRadius: 8, border: 'none',
    background: 'var(--color-accent-soil, #7a5c2e)',
    color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 13,
    opacity: 1,
    transition: 'opacity 0.15s',
  },
};

export default AddLocationModal;