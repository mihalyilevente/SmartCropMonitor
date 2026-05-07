import React, { useState, useEffect } from 'react';
import { getUserFiles } from './api/fields';
import FieldPanel from './components/FieldPanel';
import FileHistory from './components/FileHistory';
import PlotViewer from './components/PlotViewer';

const Dashboard = ({ userId, onLogout }) => {
  const [files, setFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);

  useEffect(() => {
    getUserFiles(userId)
      .then(setFiles)
      .catch(() => console.error('Error loading files'));
  }, [userId]);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1>SmartCrop Dashboard</h1>
        <button onClick={onLogout} style={styles.logoutBtn}>Logout</button>
      </div>

      <div style={styles.main}>
        <FieldPanel userId={userId} />
        <FileHistory files={files} onSelect={setSelectedFile} />
      </div>

      {selectedFile && <PlotViewer filename={selectedFile} />}
    </div>
  );
};

const styles = {
  container: { padding: 20, maxWidth: 1100, margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between' },
  main: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 },
  logoutBtn: { background: 'red', color: '#fff', padding: 6 },
};

export default Dashboard;
