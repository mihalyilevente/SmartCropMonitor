import React, { useState } from 'react';
import { addLocation, triggerSync } from '../api/fields';

const FieldPanel = ({ userId }) => {
  const [loc, setLoc] = useState({ label: '', lat: '', lon: '' });

  const handleAdd = async (e) => {
    e.preventDefault();
    try {
      await addLocation(userId, loc);
      setLoc({ label: '', lat: '', lon: '' });
    } catch {
      alert('Error adding location');
    }
  };

  const handleSync = async () => {
    try {
      await triggerSync();
      alert('Sync started');
    } catch {
      alert('Error starting sync');
    }
  };

  return (
    <section style={styles.card}>
      <h3>Add Field</h3>
      <form onSubmit={handleAdd} style={styles.form}>
        <input
          placeholder="Name"
          value={loc.label}
          onChange={e => setLoc({ ...loc, label: e.target.value })}
          style={styles.input}
        />
        <input
          placeholder="Lat"
          type="number"
          step="0.0001"
          value={loc.lat}
          onChange={e => setLoc({ ...loc, lat: e.target.value })}
          style={styles.input}
        />
        <input
          placeholder="Lon"
          type="number"
          step="0.0001"
          value={loc.lon}
          onChange={e => setLoc({ ...loc, lon: e.target.value })}
          style={styles.input}
        />
        <button type="submit" style={styles.addBtn}>Save</button>
      </form>
      <button onClick={handleSync} style={styles.syncBtn}>Sync Sentinel</button>
    </section>
  );
};

const styles = {
  card: { padding: 15, background: '#fff', borderRadius: 8 },
  form: { display: 'flex', flexDirection: 'column', gap: 10 },
  input: { padding: 10, border: '1px solid #ddd' },
  addBtn: { background: '#4caf50', color: '#fff', padding: 10 },
  syncBtn: { marginTop: 10, background: '#2196f3', color: '#fff', padding: 10 },
};

export default FieldPanel;
