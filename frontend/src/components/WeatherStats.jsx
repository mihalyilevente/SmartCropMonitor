const WeatherStats = ({ metrics }) => {
  if (!metrics) {
    return <div style={styles.loading}>Loading metrics...</div>;
  }

  return (
    <div style={styles.statsGrid}>
      <div style={styles.card}>
        <span style={styles.label}>Accumulated GDD (Base 10)</span>
        <span style={styles.value}>
          {metrics.gdd_base_10?.toFixed(1) || '0.0'} °C
        </span>
      </div>

      <div style={styles.card}>
        <span style={styles.label}>Water Deficit (30 Days)</span>
        <span
          style={{
            ...styles.value,
            color: 'var(--color-accent-mulberry)'
          }}
        >
          {metrics.water_deficit_30d || 0} mm
        </span>
      </div>

      <div style={styles.card}>
        <span style={styles.label}>Evapotranspiration (ET₀)</span>
        <span style={styles.value}>
          {metrics.et0 ?? 'N/A'}
        </span>
      </div>
    </div>
  );
};

const styles = {
  statsGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px', marginBottom: '20px' },
  card: { background: '#fff', padding: '15px', borderRadius: '10px', display: 'flex', flexDirection: 'column', border: '1px solid var(--color-accent-soil)' },
  label: { fontSize: '12px', color: 'var(--color-green-signal)', fontWeight: 'bold' },
  value: { fontSize: '20px', fontWeight: 'bold', marginTop: '5px' }
};

export default WeatherStats;