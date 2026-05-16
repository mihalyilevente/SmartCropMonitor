
const FileHistory = ({ files, onSelect }) => (
  <section style={styles.card}>
    <h3>Files</h3>
    <div style={styles.list}>
      {files.map(f => (
        <div key={f.id} style={styles.fileItem}>
          <strong>{f.location}</strong>
          <code>{f.filename}</code>
          <button onClick={() => onSelect(f.filename)} style={styles.plotBtn}>
            Analyze
          </button>
        </div>
      ))}
    </div>
  </section>
);

const styles = {
  card: { padding: 15, background: '#fff', borderRadius: 8 },
  list: { marginTop: 10 },
  fileItem: { marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 5 },
  plotBtn: { background: '#ff9800', color: '#fff', padding: 5 },
};

export default FileHistory;
