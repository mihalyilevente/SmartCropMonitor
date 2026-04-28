import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Plot from 'react-plotly.js';

const Dashboard = ({ userId, onLogout }) => {
  const [files, setFiles] = useState([]);
  const [newLoc, setNewLoc] = useState({ label: '', lat: '', lon: '' });

  const [plotData, setPlotData] = useState(null);
  const [loadingPlot, setLoadingPlot] = useState(false);

  const [mode, setMode] = useState("heatmap");
  const [filter, setFilter] = useState("none");

  // =========================
  // LOAD FILES
  // =========================
  const loadData = async () => {
    try {
      const res = await axios.get(
        `http://127.0.0.1:8000/user/files?user_id=${userId}`
      );
      setFiles(res.data);
    } catch (e) {
      console.error("Error loading history", e);
    }
  };

  useEffect(() => {
    loadData();
  }, [userId]);

  // =========================
  // ADD LOCATION
  // =========================
  const addLocation = async (e) => {
    e.preventDefault();
    try {
      await axios.post(
        `http://127.0.0.1:8000/api/v1/locations?user_id=${userId}`,
        newLoc
      );
      setNewLoc({ label: '', lat: '', lon: '' });
    } catch (e) {
      alert("Error adding location");
    }
  };

  // =========================
  // SYNC
  // =========================
  const triggerSync = async () => {
    await axios.post('http://127.0.0.1:8000/sync-manual');
    alert("Sync started");
  };

  // =========================
  // LOAD PLOT
  // =========================
  const loadPlot = async (filename) => {
    setLoadingPlot(true);

    try {
      const res = await axios.get(
        `http://127.0.0.1:8000/api/v1/plot-data/${filename}`,
        {
          params: {
            mode,
            filter
          }
        }
      );

      setPlotData({
        ...res.data,
        filename
      });

    } catch (e) {
      console.error(e);
      alert("Error loading plot");
    } finally {
      setLoadingPlot(false);
    }
  };

  // =========================
  // SAFE DATA CHECK
  // =========================
  const safeZ = (() => {
    if (!plotData?.z) return null;
    if (!Array.isArray(plotData.z)) return null;
    if (!Array.isArray(plotData.z[0])) return null;
    return plotData.z;
  })();

  const isRaw = plotData?.type === "raw";

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1>SmartCrop Dashboard</h1>
        <button onClick={onLogout} style={styles.logoutBtn}>
          Logout
        </button>
      </div>

      <div style={styles.main}>

        {/* LEFT */}
        <section style={styles.card}>
          <h3>Add Field</h3>

          <form onSubmit={addLocation} style={styles.form}>
            <input
              placeholder="Name"
              value={newLoc.label}
              onChange={e => setNewLoc({ ...newLoc, label: e.target.value })}
              style={styles.input}
            />
            <input
              placeholder="Lat"
              type="number"
              step="0.0001"
              value={newLoc.lat}
              onChange={e => setNewLoc({ ...newLoc, lat: e.target.value })}
              style={styles.input}
            />
            <input
              placeholder="Lon"
              type="number"
              step="0.0001"
              value={newLoc.lon}
              onChange={e => setNewLoc({ ...newLoc, lon: e.target.value })}
              style={styles.input}
            />

            <button type="submit" style={styles.addBtn}>
              Save
            </button>
          </form>

          <button onClick={triggerSync} style={styles.syncBtn}>
            Sync Sentinel
          </button>
        </section>

        {/* RIGHT */}
        <section style={styles.card}>
          <h3>Files</h3>

          <div style={styles.list}>
            {files.map(f => (
              <div key={f.id} style={styles.fileItem}>
                <strong>{f.location}</strong>
                <code>{f.filename}</code>

                <button
                  onClick={() => loadPlot(f.filename)}
                  style={styles.plotBtn}
                >
                  Analyze
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ================= PLOT ================= */}
      {(plotData || loadingPlot) && (
        <section style={styles.cardFull}>

          <h3>{plotData?.filename}</h3>

          {/* CONTROLS */}
          <div style={styles.controls}>

            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="heatmap">Heatmap</option>
              <option value="raw">Raw</option>
            </select>

            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="none">No filter</option>
              <option value="ndvi">NDVI</option>
              <option value="log">Log</option>
            </select>

            <button
              onClick={() => loadPlot(plotData.filename)}
              style={styles.applyBtn}
            >
              Apply
            </button>
          </div>

          {/* RENDER */}
          {loadingPlot ? (
            <p>Processing...</p>
          ) : !safeZ ? (
            <p style={{ color: 'red' }}>Invalid raster</p>
          ) : isRaw ? (
            <pre style={{ textAlign: 'left', fontSize: 12 }}>
              {JSON.stringify(plotData.z, null, 2)}
            </pre>
          ) : (
            <Plot
              data={[
                {
                  z: safeZ,
                  type: 'heatmap',
                  colorscale: 'Greens',
                  showscale: true,
                  zsmooth: 'best'
                }
              ]}
              layout={{
                width: 650,
                height: 550,
                margin: { t: 30 }
              }}
              config={{ responsive: true }}
            />
          )}
        </section>
      )}
    </div>
  );
};

const styles = {
  container: { padding: 20, maxWidth: 1100, margin: "0 auto" },
  header: { display: "flex", justifyContent: "space-between" },
  main: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 },
  card: { padding: 15, background: "#fff", borderRadius: 8 },
  cardFull: { marginTop: 20, padding: 15, background: "#fff", borderRadius: 8 },
  form: { display: "flex", flexDirection: "column", gap: 10 },
  input: { padding: 10, border: "1px solid #ddd" },
  addBtn: { background: "#4caf50", color: "#fff", padding: 10 },
  syncBtn: { marginTop: 10, background: "#2196f3", color: "#fff", padding: 10 },
  list: { marginTop: 10 },
  fileItem: { marginBottom: 10, display: "flex", flexDirection: "column", gap: 5 },
  plotBtn: { background: "#ff9800", color: "#fff", padding: 5 },
  controls: { display: "flex", gap: 10, justifyContent: "center" },
  applyBtn: { background: "#333", color: "#fff", padding: 5 },
  logoutBtn: { background: "red", color: "#fff", padding: 6 }
};

export default Dashboard;