// components/WikiPanel.jsx
import { useState, useEffect, useRef, useMemo } from 'react';
import { useLang } from '../context/LanguageContext';

// ─────────────────────────────────────────────────────────────────────────────
// CONTENT REGISTRY
// ─────────────────────────────────────────────────────────────────────────────

const ARTICLE_LOADERS = {
  'diseases/downy_mildew':        () => import('../content/diseases/downy_mildew/en.md?raw').then(m => m.default),
  'fertilizers/urea':             () => import('../content/fertilizers/urea/en.md?raw').then(m => m.default),
  'guides/chisel_tillage':        () => import('../content/guides/chisel_tillage/en.md?raw').then(m => m.default),
  'pests/english_grain_aphid':    () => import('../content/pests/english_grain_aphid/en.md?raw').then(m => m.default),
};

// Article metadata — controls display order, icons, category grouping
const ARTICLES = [
  {
    id:       'diseases/downy_mildew',
    titleKey: 'wiki_art_downy_mildew',
    category: 'diseases',
    tags:     ['oomycete', 'fungicide', 'grapes', 'cucurbit'],
    icon:     '🍃',
  },
  {
    id:       'pests/english_grain_aphid',
    titleKey: 'wiki_art_english_grain_aphid',
    category: 'pests',
    tags:     ['aphid', 'cereal', 'BYDV', 'IPM'],
    icon:     '🦗',
  },
  {
    id:       'fertilizers/urea',
    titleKey: 'wiki_art_urea',
    category: 'fertilizers',
    tags:     ['nitrogen', 'fertilizer', 'volatilization'],
    icon:     '🌾',
  },
  {
    id:       'guides/chisel_tillage',
    titleKey: 'wiki_art_chisel_tillage',
    category: 'guides',
    tags:     ['tillage', 'conservation', 'soil', 'compaction'],
    icon:     '🚜',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// MINIMAL MARKDOWN → HTML RENDERER
// Handles headings, bold, italic, tables, lists, horizontal rules, code spans.
// ─────────────────────────────────────────────────────────────────────────────
function renderMarkdown(md) {
  if (!md) return '';

  let html = md
    // --- tables ---
    .replace(/^\|(.+)\|\s*\n\|[-| :]+\|\s*\n((?:\|.+\|\s*\n?)*)/gm, (_, head, body) => {
      const th = head.split('|').filter(Boolean).map(c =>
        `<th>${c.trim()}</th>`).join('');
      const rows = body.trim().split('\n').map(row =>
        '<tr>' + row.split('|').filter(Boolean).map(c =>
          `<td>${c.trim()}</td>`).join('') + '</tr>').join('');
      return `<table><thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table>`;
    })
    // --- headings ---
    .replace(/^#{4} (.+)$/gm,  '<h4>$1</h4>')
    .replace(/^#{3} (.+)$/gm,  '<h3>$1</h3>')
    .replace(/^#{2} (.+)$/gm,  '<h2>$1</h2>')
    .replace(/^# (.+)$/gm,     '<h1>$1</h1>')
    // --- hr ---
    .replace(/^-{3,}$/gm, '<hr/>')
    // --- unordered list items (wrap later) ---
    .replace(/^[-*] (.+)$/gm,  '<li>$1</li>')
    // --- numbered list items ---
    .replace(/^\d+\. (.+)$/gm, '<oli>$1</oli>')
    // --- bold italic ---
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    // --- bold ---
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // --- italic ---
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // --- italic with underscore ---
    .replace(/_(.+?)_/g, '<em>$1</em>')
    // --- inline code ---
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // --- paragraphs: blank line separates ---
    .replace(/\n\n+/g, '\n\n');

  // wrap consecutive <li> in <ul>
  html = html.replace(/(<li>.*?<\/li>\n?)+/gs, m => `<ul>${m}</ul>`);
  // wrap consecutive <oli> in <ol>
  html = html.replace(/(<oli>.*?<\/oli>\n?)+/gs, m =>
    `<ol>${m.replace(/<\/?oli>/g, match => match === '<oli>' ? '<li>' : '</li>')}</ol>`);

  // wrap bare text lines (not already wrapped) as paragraphs
  html = html.split('\n\n').map(block => {
    block = block.trim();
    if (!block) return '';
    if (/^<(h[1-4]|ul|ol|table|hr|li)/.test(block)) return block;
    return `<p>${block}</p>`;
  }).join('\n');

  return html;
}

// ─────────────────────────────────────────────────────────────────────────────
// ARTICLE READER
// ─────────────────────────────────────────────────────────────────────────────
const ArticleReader = ({ articleId, onClose, bookmarks, onToggleBookmark }) => {
  const { t } = useLang();
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);
  const topRef = useRef(null);

  const article = ARTICLES.find(a => a.id === articleId);
  const isBookmarked = bookmarks.includes(articleId);

  useEffect(() => {
    setLoading(true);
    setError(false);
    setContent('');
    const loader = ARTICLE_LOADERS[articleId];
    if (!loader) { setError(true); setLoading(false); return; }
    loader()
      .then(md => { setContent(md); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
    topRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [articleId]);

  const html = useMemo(() => renderMarkdown(content), [content]);

  return (
    <div style={styles.reader}>
      {/* ── Reader toolbar ── */}
      <div style={styles.readerToolbar}>
        <button style={styles.backBtn} onClick={onClose}>
          ← {t('wiki_back')}
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={styles.categoryBadge}>
            {t('wiki_cat_' + article?.category) || article?.category}
          </span>
          <button
            style={{ ...styles.bookmarkBtn, ...(isBookmarked ? styles.bookmarkBtnActive : {}) }}
            onClick={() => onToggleBookmark(articleId)}
            title={isBookmarked ? t('wiki_unbookmark') : t('wiki_bookmark')}
          >
            {isBookmarked ? '★' : '☆'} {isBookmarked ? t('wiki_bookmarked') : t('wiki_bookmark')}
          </button>
        </div>
      </div>

      {/* ── Article body ── */}
      <div ref={topRef} style={styles.articleBody}>
        {loading && (
          <div style={styles.articleLoading}>
            <div style={styles.spinnerDot}/>
            {t('wiki_loading_article')}
          </div>
        )}
        {error && (
          <div style={styles.articleError}>⚠️ {t('wiki_load_error')}</div>
        )}
        {!loading && !error && (
          <div
            className="wiki-article-content"
            style={styles.mdContent}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ARTICLE CARD
// ─────────────────────────────────────────────────────────────────────────────
const ArticleCard = ({ article, onOpen, isBookmarked, onToggleBookmark }) => {
  const { t } = useLang();
  return (
    <div
      style={styles.card}
      onClick={() => onOpen(article.id)}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onOpen(article.id)}
    >
      <div style={styles.cardHeader}>
        <span style={styles.cardIcon}>{article.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={styles.cardTitle}>{t(article.titleKey) || article.id}</div>
          <div style={styles.cardCat}>{t('wiki_cat_' + article.category) || article.category}</div>
        </div>
        <button
          style={styles.cardBookmark}
          onClick={e => { e.stopPropagation(); onToggleBookmark(article.id); }}
          title={isBookmarked ? t('wiki_unbookmark') : t('wiki_bookmark')}
        >
          {isBookmarked ? '★' : '☆'}
        </button>
      </div>
      <div style={styles.cardTags}>
        {article.tags.map(tag => (
          <span key={tag} style={styles.tag}>#{tag}</span>
        ))}
      </div>
      <div style={styles.cardArrow}>→ {t('wiki_read')}</div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN WIKI PANEL
// ─────────────────────────────────────────────────────────────────────────────
const WikiPanel = () => {
  const { t } = useLang();
  const [search, setSearch]           = useState('');
  const [activeCategory, setCategory] = useState('all');
  const [openArticleId, setOpenArticle] = useState(null);
  const [bookmarks, setBookmarks]     = useState(() => {
    try { return JSON.parse(localStorage.getItem('wiki_bookmarks') || '[]'); }
    catch { return []; }
  });
  const [showBookmarksOnly, setShowBookmarksOnly] = useState(false);

  const toggleBookmark = (id) => {
    setBookmarks(prev => {
      const next = prev.includes(id) ? prev.filter(b => b !== id) : [...prev, id];
      localStorage.setItem('wiki_bookmarks', JSON.stringify(next));
      return next;
    });
  };

  // unique categories
  const categories = useMemo(() => {
    const cats = [...new Set(ARTICLES.map(a => a.category))];
    return ['all', ...cats];
  }, []);

  // filtered article list
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return ARTICLES.filter(a => {
      if (showBookmarksOnly && !bookmarks.includes(a.id)) return false;
      if (activeCategory !== 'all' && a.category !== activeCategory) return false;
      if (!q) return true;
      return (
        (t(a.titleKey) || a.id).toLowerCase().includes(q) ||
        a.tags.some(tag => tag.includes(q)) ||
        a.category.includes(q)
      );
    });
  }, [search, activeCategory, showBookmarksOnly, bookmarks, t]);

  if (openArticleId) {
    return (
      <ArticleReader
        articleId={openArticleId}
        onClose={() => setOpenArticle(null)}
        bookmarks={bookmarks}
        onToggleBookmark={toggleBookmark}
      />
    );
  }

  return (
    <div style={styles.wiki}>
      {/* ── Hero header ── */}
      <div style={styles.wikiHero}>
        <div style={{ fontSize: 32 }}>📚</div>
        <div>
          <div style={styles.wikiTitle}>{t('wiki_title')}</div>
          <div style={styles.wikiSubtitle}>{t('wiki_subtitle')}</div>
        </div>
      </div>

      {/* ── Controls bar ── */}
      <div style={styles.controlsBar}>
        {/* search */}
        <div style={styles.searchWrap}>
          <span style={styles.searchIcon}>🔍</span>
          <input
            style={styles.searchInput}
            placeholder={t('wiki_search_placeholder')}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button style={styles.clearBtn} onClick={() => setSearch('')}>✕</button>
          )}
        </div>

        {/* bookmarks toggle */}
        <button
          style={{ ...styles.filterChip, ...(showBookmarksOnly ? styles.filterChipActive : {}) }}
          onClick={() => setShowBookmarksOnly(v => !v)}
        >
          ★ {t('wiki_bookmarks')} {bookmarks.length > 0 && `(${bookmarks.length})`}
        </button>
      </div>

      {/* ── Category pills ── */}
      <div style={styles.catBar}>
        {categories.map(cat => (
          <button
            key={cat}
            style={{ ...styles.catPill, ...(activeCategory === cat ? styles.catPillActive : {}) }}
            onClick={() => setCategory(cat)}
          >
            {cat === 'all' ? t('wiki_cat_all') : (t('wiki_cat_' + cat) || cat)}
          </button>
        ))}
      </div>

      {/* ── Results count ── */}
      <div style={styles.resultsCount}>
        {filtered.length === 0
          ? t('wiki_no_results')
          : t('wiki_results_count', filtered.length)}
      </div>

      {/* ── Article grid ── */}
      {filtered.length === 0 ? (
        <div style={styles.emptyState}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🔎</div>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>{t('wiki_no_results_title')}</div>
          <div style={{ fontSize: 13, color: '#aaa' }}>{t('wiki_no_results_sub')}</div>
        </div>
      ) : (
        <div style={styles.grid}>
          {filtered.map(article => (
            <ArticleCard
              key={article.id}
              article={article}
              onOpen={setOpenArticle}
              isBookmarked={bookmarks.includes(article.id)}
              onToggleBookmark={toggleBookmark}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// STYLES — matches the project's CSS variable palette
// ─────────────────────────────────────────────────────────────────────────────
const styles = {
  // ── wiki index ──────────────────────────────────────────────────────────────
  wiki: {
    maxWidth: 960,
    margin: '0 auto',
  },
  wikiHero: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    background: 'var(--color-bg-magnolia)',
    border: '1px solid var(--color-accent-soil)',
    borderRadius: 14,
    padding: '20px 24px',
    marginBottom: 16,
  },
  wikiTitle: {
    fontFamily: 'var(--font-heading)',
    fontWeight: 800,
    fontSize: 22,
    color: 'var(--color-accent-chernozem)',
    lineHeight: 1.2,
  },
  wikiSubtitle: {
    fontSize: 13,
    color: '#888',
    marginTop: 3,
  },

  // ── controls ─────────────────────────────────────────────────────────────────
  controlsBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  searchWrap: {
    display: 'flex',
    alignItems: 'center',
    flex: 1,
    minWidth: 200,
    background: '#fff',
    border: '1px solid var(--color-accent-soil)',
    borderRadius: 8,
    padding: '0 10px',
    gap: 6,
  },
  searchIcon: { fontSize: 14, opacity: 0.5 },
  searchInput: {
    flex: 1,
    border: 'none',
    outline: 'none',
    fontSize: 13,
    padding: '8px 4px',
    fontFamily: 'inherit',
    background: 'transparent',
  },
  clearBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: 13,
    color: '#aaa',
    padding: '2px 4px',
  },
  filterChip: {
    background: '#f0ebe3',
    border: '1px solid var(--color-accent-soil)',
    borderRadius: 20,
    padding: '7px 14px',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    color: 'var(--color-accent-chernozem)',
    fontFamily: 'inherit',
    transition: 'all 0.15s',
    whiteSpace: 'nowrap',
  },
  filterChipActive: {
    background: '#f5c842',
    border: '1px solid #d4a800',
    color: '#3d2e00',
  },

  // ── category bar ─────────────────────────────────────────────────────────────
  catBar: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  catPill: {
    background: '#f0ebe3',
    border: '1px solid var(--color-accent-soil)',
    borderRadius: 20,
    padding: '5px 14px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    color: 'var(--color-accent-chernozem)',
    fontFamily: 'inherit',
    transition: 'all 0.15s',
    textTransform: 'capitalize',
  },
  catPillActive: {
    background: 'var(--color-accent-chernozem)',
    border: '1px solid var(--color-accent-chernozem)',
    color: '#fff',
  },

  // ── results count ─────────────────────────────────────────────────────────────
  resultsCount: {
    fontSize: 11,
    color: '#aaa',
    marginBottom: 12,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },

  // ── article grid ─────────────────────────────────────────────────────────────
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
    gap: 14,
  },
  card: {
    background: '#fff',
    border: '1px solid var(--color-accent-soil)',
    borderRadius: 12,
    padding: '16px',
    cursor: 'pointer',
    transition: 'box-shadow 0.15s, transform 0.1s',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    outline: 'none',
    ':hover': { boxShadow: '0 4px 16px rgba(0,0,0,0.1)' },
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
  },
  cardIcon: {
    fontSize: 26,
    lineHeight: 1,
    flexShrink: 0,
  },
  cardTitle: {
    fontWeight: 700,
    fontSize: 14,
    color: 'var(--color-accent-chernozem)',
    lineHeight: 1.3,
  },
  cardCat: {
    fontSize: 10,
    color: '#aaa',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginTop: 2,
  },
  cardBookmark: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: 18,
    color: '#f5c842',
    padding: 0,
    lineHeight: 1,
    flexShrink: 0,
  },
  cardTags: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 4,
  },
  tag: {
    fontSize: 10,
    background: '#f0ebe3',
    color: '#888',
    borderRadius: 10,
    padding: '2px 7px',
    fontWeight: 600,
  },
  cardArrow: {
    fontSize: 11,
    color: 'var(--color-accent-chernozem)',
    fontWeight: 700,
    marginTop: 'auto',
    opacity: 0.7,
  },

  // ── empty state ───────────────────────────────────────────────────────────────
  emptyState: {
    textAlign: 'center',
    padding: '50px 0',
    color: '#bbb',
    fontSize: 14,
  },

  // ── article reader ─────────────────────────────────────────────────────────────
  reader: {
    maxWidth: 860,
    margin: '0 auto',
  },
  readerToolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: 'var(--color-bg-magnolia)',
    border: '1px solid var(--color-accent-soil)',
    borderRadius: 10,
    padding: '10px 16px',
    marginBottom: 16,
    flexWrap: 'wrap',
    gap: 8,
  },
  backBtn: {
    background: 'none',
    border: '1px solid var(--color-accent-soil)',
    borderRadius: 6,
    padding: '6px 14px',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    color: 'var(--color-accent-chernozem)',
    fontFamily: 'inherit',
  },
  categoryBadge: {
    background: '#f0ebe3',
    border: '1px solid var(--color-accent-soil)',
    borderRadius: 20,
    padding: '4px 12px',
    fontSize: 11,
    fontWeight: 700,
    color: '#888',
    textTransform: 'capitalize',
  },
  bookmarkBtn: {
    background: '#f0ebe3',
    border: '1px solid var(--color-accent-soil)',
    borderRadius: 6,
    padding: '6px 14px',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    color: 'var(--color-accent-chernozem)',
    fontFamily: 'inherit',
  },
  bookmarkBtnActive: {
    background: '#f5c842',
    border: '1px solid #d4a800',
    color: '#3d2e00',
  },

  // ── article content ────────────────────────────────────────────────────────────
  articleBody: {
    background: '#fff',
    border: '1px solid var(--color-accent-soil)',
    borderRadius: 12,
    padding: '28px 32px',
    minHeight: 300,
  },
  articleLoading: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    color: '#aaa',
    fontSize: 13,
    padding: '40px 0',
    justifyContent: 'center',
  },
  spinnerDot: {
    width: 12,
    height: 12,
    borderRadius: '50%',
    background: 'var(--color-accent-chernozem)',
    animation: 'pulse 1s ease-in-out infinite',
    opacity: 0.5,
  },
  articleError: {
    color: '#c62828',
    background: '#fce4ec',
    borderRadius: 8,
    padding: '12px 16px',
    fontSize: 13,
  },
  mdContent: {
    fontSize: 14,
    lineHeight: 1.75,
    color: '#333',
    fontFamily: 'inherit',
  },
};

export default WikiPanel;