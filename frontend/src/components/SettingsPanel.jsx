import { useEffect, useState } from 'react';
import { getUserProfile, updateUserProfile } from '../api/user';
import { useLang } from '../context/LanguageContext';
import AlertSuppressionPanel from './AlertSuppressionPanel';

// Fallback nav labels in case locale files don't yet have the new keys
const NAV_FALLBACK = {
  preferences: { hu: 'Általános',           en: 'Preferences',       de: 'Allgemein',     fr: 'Général' },
  alerts:      { hu: 'Riasztás-elnámítás',  en: 'Alert suppression', de: 'Meldungsunt.',  fr: 'Suppr. alertes' },
};

const SettingsPanel = ({ userId, onBack, fields = [], locations = [] }) => {
  const { t, lang, setLang } = useLang();
  const [activeNav, setActiveNav] = useState('preferences');
  const [profile, setProfile]     = useState(null);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [status, setStatus]       = useState(null);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    getUserProfile(userId)
      .then(data => { setProfile(data); setStatus(null); })
      .catch(() => setStatus({ type: 'error', text: t('settings_load_failed') || 'Load failed' }))
      .finally(() => setLoading(false));
  }, [userId, t]);

  const setEmailEnabled = async (enabled) => {
    if (!profile || saving) return;
    const previous = profile;
    setProfile({ ...profile, email_enabled: enabled });
    setSaving(true);
    setStatus(null);
    try {
      const updated = await updateUserProfile(userId, { email_enabled: enabled });
      setProfile(updated);
      setStatus({ type: 'success', text: t('settings_saved') || 'Saved.' });
    } catch {
      setProfile(previous);
      setStatus({ type: 'error', text: t('settings_save_failed') || 'Save failed.' });
    } finally {
      setSaving(false);
    }
  };

  const emailEnabled = profile?.email_enabled !== false;
  const hasEmail     = Boolean(profile?.email);

  // Nav label: use translation key, fall back to hardcoded string
  const navLabel = (id) => {
    const translated = t(`settings_nav_${id}`);
    // t() returns the key itself when missing in some implementations, or ''
    if (translated && translated !== `settings_nav_${id}`) return translated;
    return NAV_FALLBACK[id]?.[lang] || NAV_FALLBACK[id]?.en || id;
  };

  const NAV_ITEMS = ['preferences', 'alerts'];

  const headingTitle = activeNav === 'alerts'
    ? navLabel('alerts')
    : (t('settings_title') || 'Settings');

  const headingSub = activeNav === 'alerts'
    ? null
    : (profile?.email || t('settings_no_email') || '');

  return (
    <section style={styles.page}>

      {/* ── Sidebar ── */}
      <aside style={styles.sidebar}>
        <button onClick={onBack} style={styles.backButton}>
          <span style={styles.backIcon}>←</span>
          <span>{t('settings_back') || 'Back'}</span>
        </button>

        <div style={styles.sidebarTitle}>{t('settings_title') || 'Settings'}</div>

        {NAV_ITEMS.map(id => (
          <button
            key={id}
            onClick={() => setActiveNav(id)}
            style={{ ...styles.navItem, ...(activeNav === id ? styles.navItemActive : {}) }}
          >
            {navLabel(id)}
          </button>
        ))}
      </aside>

      {/* ── Main ── */}
      <main style={styles.main}>
        <div style={styles.header}>
          <div>
            <h2 style={styles.heading}>{headingTitle}</h2>
            {headingSub && <div style={styles.subheading}>{headingSub}</div>}
          </div>
        </div>

        <div style={styles.content}>

          {/* Preferences */}
          {activeNav === 'preferences' && (
            loading
              ? <div style={styles.loading}>{t('loading') || 'Loading…'}</div>
              : <>
                  <div style={styles.settingBlock}>
                    <div style={styles.settingCopy}>
                      <div style={styles.settingTitle}>{t('settings_language') || 'Language'}</div>
                      <div style={styles.settingDescription}>{t('settings_language_desc') || ''}</div>
                    </div>
                    <select value={lang} onChange={e => setLang(e.target.value)} style={styles.select}>
                      <option value="hu">HU Magyar</option>
                      <option value="en">GB English</option>
                      <option value="fr">FR Français</option>
                      <option value="de">DE Deutsch</option>
                    </select>
                  </div>

                  <div style={styles.settingBlock}>
                    <div style={styles.settingCopy}>
                      <div style={styles.settingTitle}>{t('settings_email_notifications') || 'Email notifications'}</div>
                      <div style={styles.settingDescription}>{t('settings_email_notifications_desc') || ''}</div>
                    </div>
                    <label style={{
                      ...styles.switch,
                      ...(emailEnabled && hasEmail ? styles.switchOn : {}),
                      ...(!hasEmail ? styles.switchDisabled : {}),
                    }}>
                      <input
                        type="checkbox"
                        checked={emailEnabled}
                        disabled={!hasEmail || saving}
                        onChange={e => setEmailEnabled(e.target.checked)}
                        style={styles.switchInput}
                      />
                      <span style={{ ...styles.knob, transform: emailEnabled && hasEmail ? 'translateX(22px)' : 'translateX(0)' }} />
                    </label>
                  </div>

                  {!hasEmail && (
                    <div style={styles.notice}>{t('settings_email_required') || 'Add an email address to enable notifications.'}</div>
                  )}

                  {status && (
                    <div style={{ ...styles.status, ...(status.type === 'error' ? styles.statusError : styles.statusSuccess) }}>
                      {status.text}
                    </div>
                  )}
                </>
          )}

          {/* Alert suppression */}
          {activeNav === 'alerts' && (
            <AlertSuppressionPanel
              userId={userId}
              fields={fields}
              locations={locations}
            />
          )}

        </div>
      </main>
    </section>
  );
};

const styles = {
  page: {
    minHeight: 'calc(100vh - 104px)',
    display: 'grid',
    gridTemplateColumns: '220px minmax(0, 900px)',
    gap: 28,
    alignItems: 'start',
  },
  sidebar: {
    minHeight: 'calc(100vh - 136px)',
    borderRight: '1px solid var(--color-accent-soil)',
    padding: '8px 18px 18px 0',
  },
  backButton: {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    border: '1px solid var(--color-accent-soil)', borderRadius: 8,
    background: '#fff', color: 'var(--color-accent-chernozem)',
    padding: '8px 11px', cursor: 'pointer',
    fontFamily: 'inherit', fontSize: 13, fontWeight: 800, marginBottom: 24,
  },
  backIcon: { fontSize: 16, lineHeight: 1 },
  sidebarTitle: { fontSize: 12, fontWeight: 900, color: '#7b6f61', textTransform: 'uppercase', marginBottom: 8 },
  navItem: {
    width: '100%', border: 'none', borderRadius: 6, background: 'transparent',
    padding: '8px 10px', textAlign: 'left', cursor: 'pointer',
    fontFamily: 'inherit', fontSize: 13, fontWeight: 800,
    color: 'var(--color-accent-chernozem)', marginBottom: 2,
  },
  navItemActive: { background: 'var(--color-bg-magnolia)', borderLeft: '3px solid var(--color-green-signal)', cursor: 'default' },
  main: { minWidth: 0 },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '10px 0 20px', borderBottom: '1px solid var(--color-accent-soil)',
  },
  heading: { margin: 0, fontSize: 28, lineHeight: 1.2, color: 'var(--color-accent-chernozem)' },
  subheading: { marginTop: 5, fontSize: 13, color: '#7b6f61' },
  content: { paddingTop: 22 },
  loading: { color: '#7b6f61', fontSize: 14 },
  settingBlock: {
    display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 220px',
    gap: 24, alignItems: 'center', padding: '18px 0',
    borderBottom: '1px solid rgba(216,201,170,0.85)',
  },
  settingCopy: { minWidth: 0 },
  settingTitle: { fontSize: 14, fontWeight: 900, color: 'var(--color-accent-chernozem)' },
  settingDescription: { marginTop: 6, maxWidth: 620, fontSize: 13, lineHeight: 1.5, color: '#6d6256' },
  select: {
    width: '100%', padding: '8px 10px', borderRadius: 8,
    border: '1px solid var(--color-accent-soil)', background: '#fff',
    color: 'var(--color-accent-chernozem)', cursor: 'pointer',
    fontSize: 13, fontWeight: 800, fontFamily: 'inherit', outline: 'none',
  },
  switch: {
    justifySelf: 'end', position: 'relative', width: 50, height: 28,
    borderRadius: 999, background: '#d8c9aa', border: '1px solid #c7b58f',
    cursor: 'pointer', transition: 'background 0.15s, border-color 0.15s',
  },
  switchOn: { background: 'var(--color-green-signal)', borderColor: 'var(--color-green-primary)' },
  switchDisabled: { opacity: 0.55, cursor: 'not-allowed' },
  switchInput: { position: 'absolute', opacity: 0, pointerEvents: 'none' },
  knob: {
    position: 'absolute', top: 3, left: 3, width: 20, height: 20,
    borderRadius: '50%', background: '#fff',
    boxShadow: '0 1px 4px rgba(0,0,0,0.25)', transition: 'transform 0.15s',
  },
  notice: {
    marginTop: 18, padding: '10px 12px', borderRadius: 8,
    background: '#fff8e1', border: '1px solid #f4d06f', color: '#7a4d00', fontSize: 13,
  },
  status: { marginTop: 16, fontSize: 13, fontWeight: 800 },
  statusSuccess: { color: 'var(--color-green-primary)' },
  statusError:   { color: 'var(--color-accent-mulberry)' },
};

export default SettingsPanel;