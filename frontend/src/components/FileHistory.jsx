import { useLang } from '../context/LanguageContext';

const FileHistory = ({ files, onSelect }) => {
  const { t } = useLang();
  return (
    <section style={styles.card}>
      <h3>{t('fh_title')}</h3>
      <div style={styles.list}>
        {files.map(f => (
          <div key={f.id} style={styles.fileItem}>
            <strong>{f.location}</strong>
            <code>{f.filename}</code>
            <button onClick={() => onSelect(f.filename)} style={styles.plotBtn}>
              {t('fh_analyze')}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
};

const styles = {
  card:     { padding: 15, background: '#fff', borderRadius: 8 },
  list:     { marginTop: 10 },
  fileItem: { marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 5 },
  plotBtn:  { background: '#ff9800', color: '#fff', padding: 5 },
};

export default FileHistory;