import { useState, useEffect } from 'react';
import Plot from 'react-plotly.js';
import { getPlotData } from '../api/plots';

const PlotViewer = ({ filename }) => {
  const [plotData, setPlotData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('heatmap');
  const [filter, setFilter] = useState('none');

  const load = async (f, m, fi) => {
    setLoading(true);
    setPlotData(null);
    try {
      const data = await getPlotData(f, m, fi);
      setPlotData({ ...data, filename: f });
    } catch {
      alert('Error loading plot');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(filename, mode, filter);
  }, [filename]);

  const safeZ = (() => {
    if (!Array.isArray(plotData?.z) || !Array.isArray(plotData.z[0])) return null;
    return plotData.z;
  })();

  const isRaw = plotData?.type === 'raw';

  return (
    <section style={styles.card}>
      <h3>{filename}</h3>

      <div style={styles.controls}>
        <select value={mode} onChange={e => setMode(e.target.value)}>
          <option value="heatmap">Heatmap</option>
          <option value="raw">Raw</option>
        </select>
        <select value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="none">No filter</option>
          <option value="ndvi">NDVI</option>
          <option value="log">Log</option>
        </select>
        <button onClick={() => load(filename, mode, filter)} style={styles.applyBtn}>
          Apply
        </button>
      </div>

      {loading ? (
        <p>Processing...</p>
      ) : !safeZ ? (
        <p style={{ color: 'red' }}>Invalid raster</p>
      ) : isRaw ? (
        <pre style={{ textAlign: 'left', fontSize: 12 }}>
          {JSON.stringify(plotData.z, null, 2)}
        </pre>
      ) : (
        <Plot
          data={[{ z: safeZ, type: 'heatmap', colorscale: 'Greens', showscale: true, zsmooth: 'best' }]}
          layout={{ width: 650, height: 550, margin: { t: 30 } }}
          config={{ responsive: true }}
        />
      )}
    </section>
  );
};

const styles = {
  card: { marginTop: 20, padding: 15, background: '#fff', borderRadius: 8 },
  controls: { display: 'flex', gap: 10, justifyContent: 'center' },
  applyBtn: { background: '#333', color: '#fff', padding: 5 },
};

export default PlotViewer;
