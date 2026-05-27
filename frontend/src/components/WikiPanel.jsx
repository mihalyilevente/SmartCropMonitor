import { useState, useEffect, useRef, useMemo } from 'react';
import { useLang } from '../context/LanguageContext';

// ─────────────────────────────────────────────────────────────────────────────
// IMAGE GLOB
// ─────────────────────────────────────────────────────────────────────────────
const IMAGE_MODULES = import.meta.glob(
  '../content/**/images/*',
  { eager: true }
);

function buildImageMap(articleId) {
  const prefix = `../content/${articleId}/images/`;
  const map = {};
  for (const [fullPath, mod] of Object.entries(IMAGE_MODULES)) {
    if (fullPath.startsWith(prefix)) {
      const filename = fullPath.slice(prefix.length);
      map[`./images/${filename}`] = mod.default;
      map[`images/${filename}`]   = mod.default;
    }
  }
  return map;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTENT REGISTRY
// ─────────────────────────────────────────────────────────────────────────────

// Все языковые файлы, которые Vite должен знать на этапе билда
const MD_MODULES = import.meta.glob(
  '../content/**/*.md',
  { as: 'raw' }
);

async function loadArticle(articleId, lang) {
  const tryLang = async (l) => {
    const key = `../content/${articleId}/${l}.md`;
    const loader = MD_MODULES[key];
    if (!loader) return null;
    try { return await loader(); }
    catch { return null; }
  };

  if (lang !== 'en') {
    const result = await tryLang(lang);
    if (result) return result;
  }
  const result = await tryLang('en');
  if (result) return result;

  throw new Error(`No markdown found for ${articleId}`);
}

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
// MARKDOWN → HTML RENDERER
// ─────────────────────────────────────────────────────────────────────────────
function renderMarkdown(md, imageMap = {}) {
  if (!md) return '';

  let html = md
    // ── images → <figure> ───────────────────────
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => {
      const resolved = imageMap[src] || imageMap[src.replace(/^\.\//, '')] || src;
      const caption  = alt ? `<figcaption>${alt}</figcaption>` : '';
      return `<figure class="wiki-figure"><img src="${resolved}" alt="${alt}" loading="lazy"/>${caption}</figure>`;
    })
    // ── tables ────────────────────────────────────────────────────────────
    .replace(/^\|(.+)\|\s*\n\|[-| :]+\|\s*\n((?:\|.+\|\s*\n?)*)/gm, (_, head, body) => {
      const th = head.split('|').filter(Boolean).map(c =>
        `<th>${c.trim()}</th>`).join('');
      const rows = body.trim().split('\n').map(row =>
        '<tr>' + row.split('|').filter(Boolean).map(c =>
          `<td>${c.trim()}</td>`).join('') + '</tr>').join('');
      return `<div class="wiki-table-wrap"><table><thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table></div>`;
    })
    // ── headings ──────────────────────────────────────────────────────────
    .replace(/^#{4} (.+)$/gm, '<h4>$1</h4>')
    .replace(/^#{3} (.+)$/gm, '<h3>$1</h3>')
    .replace(/^#{2} (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm,    '<h1>$1</h1>')
    // ── hr ────────────────────────────────────────────────────────────────
    .replace(/^-{3,}$/gm, '<hr/>')
    // ── unordered list items ──────────────────────────────────────────────
    .replace(/^[-*] (.+)$/gm,  '<li>$1</li>')
    // ── ordered list items ────────────────────────────────────────────────
    .replace(/^\d+\. (.+)$/gm, '<oli>$1</oli>')
    // ── bold italic ───────────────────────────────────────────────────────
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    // ── bold ──────────────────────────────────────────────────────────────
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // ── italic * ──────────────────────────────────────────────────────────
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // ── italic _  ───────────────────────────────────
    .replace(/(?<![a-zA-Z0-9])_(.+?)_(?![a-zA-Z0-9])/g, '<em>$1</em>')
    // ── inline code ───────────────────────────────────────────────────────
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n\n+/g, '\n\n');

  html = html.replace(/(<li>.*?<\/li>\n?)+/gs, m => `<ul>${m}</ul>`);
  html = html.replace(/(<oli>.*?<\/oli>\n?)+/gs, m =>
    `<ol>${m.replace(/<\/?oli>/g, tag => tag === '<oli>' ? '<li>' : '</li>')}</ol>`);

  html = html.split('\n\n').map(block => {
    block = block.trim();
    if (!block) return '';
    if (/^<(h[1-4]|ul|ol|table|hr|li|figure|div)/.test(block)) return block;
    return `<p>${block}</p>`;
  }).join('\n');

  return html;
}

// ─────────────────────────────────────────────────────────────────────────────
// INLINE CSS —
// ─────────────────────────────────────────────────────────────────────────────
const WIKI_CSS = `
  .wiki-article-content .wiki-figure {
    margin: 16px 0;
    max-width: 100%;
    overflow: hidden;
  }
  .wiki-article-content .wiki-figure img {
    display: block;
    max-width: 100%;
    width: 100%;
    height: auto;
    border-radius: 8px;
    border: 1px solid #ede7df;
    object-fit: contain;
  }
  .wiki-article-content .wiki-figure figcaption {
    font-size: 11px;
    color: #aaa;
    margin-top: 5px;
    font-style: italic;
  }

  .wiki-article-content .wiki-table-wrap {
    overflow-x: auto;
    margin: 12px 0 16px;
    border-radius: 8px;
    border: 1px solid #ede7df;
  }
  .wiki-article-content table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    min-width: 400px;
  }
  .wiki-article-content th {
    background: var(--color-bg-champagne, #f8f4ee);
    font-weight: 700;
    padding: 8px 10px;
    text-align: left;
    border-bottom: 2px solid var(--color-accent-soil, #c5a87a);
    color: var(--color-accent-chernozem, #3d2b1a);
    white-space: nowrap;
  }
  .wiki-article-content td {
    padding: 7px 10px;
    border-bottom: 1px solid #f0ebe3;
    color: #444;
    vertical-align: top;
  }
  .wiki-article-content tr:last-child td { border-bottom: none; }
  .wiki-article-content tr:nth-child(even) td { background: #fafaf8; }

  .wiki-article-content h1 {
    font-size: 22px; font-weight: 800;
    color: var(--color-accent-chernozem, #3d2b1a);
    margin: 0 0 14px; padding-bottom: 8px;
    border-bottom: 2px solid var(--color-accent-soil, #c5a87a);
  }
  .wiki-article-content h2 {
    font-size: 17px; font-weight: 700;
    color: var(--color-accent-chernozem, #3d2b1a);
    margin: 26px 0 8px; padding-bottom: 4px;
    border-bottom: 1px solid #ede7df;
  }
  .wiki-article-content h3 {
    font-size: 14px; font-weight: 700;
    color: #555; margin: 18px 0 6px;
  }
  .wiki-article-content h4 {
    font-size: 12px; font-weight: 700; color: #888;
    margin: 14px 0 4px;
    text-transform: uppercase; letter-spacing: 0.05em;
  }
  .wiki-article-content p   { margin: 0 0 10px; }
  .wiki-article-content ul,
  .wiki-article-content ol  { margin: 0 0 10px; padding-left: 22px; }
  .wiki-article-content li  { margin-bottom: 4px; }
  .wiki-article-content hr  { border: none; border-top: 1px solid #ede7df; margin: 22px 0; }
  .wiki-article-content code {
    background: #f5f0ea; border-radius: 4px;
    padding: 1px 5px; font-size: 12px; font-family: monospace;
  }
  .wiki-article-content strong { font-weight: 700; color: #222; }
  .wiki-article-content em     { font-style: italic; }

  @keyframes wiki-pulse {
    0%, 100% { opacity: 0.3; transform: scale(0.9); }
    50%       { opacity: 1;   transform: scale(1.1); }
  }
`;

function useInjectWikiCss() {
  useEffect(() => {
    const id = 'wiki-panel-styles';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = WIKI_CSS;
    document.head.appendChild(style);
    return () => { /* оставляем — переиспользуется */ };
  }, []);
}

// ─────────────────────────────────────────────────────────────────────────────
// ARTICLE READER
// ─────────────────────────────────────────────────────────────────────────────
const ArticleReader = ({ articleId, onClose, bookmarks, onToggleBookmark }) => {
  const { t, lang } = useLang();
  const [content,  setContent]  = useState('');
  const [imageMap, setImageMap] = useState({});
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(false);
  const topRef = useRef(null);

  const article      = ARTICLES.find(a => a.id === articleId);
  const isBookmarked = bookmarks.includes(articleId);

  useEffect(() => {
    setLoading(true);
    setError(false);
    setContent('');
    setImageMap({});

    loadArticle(articleId, lang)
      .then(md => {
        setContent(md);
        setImageMap(buildImageMap(articleId));
        setLoading(false);
      })
      .catch(() => { setError(true); setLoading(false); });

    topRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [articleId, lang]);

  const html = useMemo(() => renderMarkdown(content, imageMap), [content, imageMap]);

  return (
    <div style={styles.reader}>
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
  useInjectWikiCss();

  const [search,            setSearch]           = useState('');
  const [activeCategory,    setCategory]         = useState('all');
  const [openArticleId,     setOpenArticle]      = useState(null);
  const [showBookmarksOnly, setShowBookmarksOnly] = useState(false);
  const [bookmarks, setBookmarks] = useState(() => {
    try { return JSON.parse(localStorage.getItem('wiki_bookmarks') || '[]'); }
    catch { return []; }
  });

  const toggleBookmark = (id) => {
    setBookmarks(prev => {
      const next = prev.includes(id) ? prev.filter(b => b !== id) : [...prev, id];
      localStorage.setItem('wiki_bookmarks', JSON.stringify(next));
      return next;
    });
  };

  const categories = useMemo(() => {
    const cats = [...new Set(ARTICLES.map(a => a.category))];
    return ['all', ...cats];
  }, []);

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
      <div style={styles.wikiHero}>
        <div style={{ fontSize: 32 }}>📚</div>
        <div>
          <div style={styles.wikiTitle}>{t('wiki_title')}</div>
          <div style={styles.wikiSubtitle}>{t('wiki_subtitle')}</div>
        </div>
      </div>

      <div style={styles.controlsBar}>
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
        <button
          style={{ ...styles.filterChip, ...(showBookmarksOnly ? styles.filterChipActive : {}) }}
          onClick={() => setShowBookmarksOnly(v => !v)}
        >
          ★ {t('wiki_bookmarks')} {bookmarks.length > 0 && `(${bookmarks.length})`}
        </button>
      </div>

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

      <div style={styles.resultsCount}>
        {filtered.length === 0
          ? t('wiki_no_results')
          : t('wiki_results_count', filtered.length)}
      </div>

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
// STYLES
// ─────────────────────────────────────────────────────────────────────────────
const styles = {
  wiki: { maxWidth: 960, margin: '0 auto' },
  wikiHero: {
    display: 'flex', alignItems: 'center', gap: 16,
    background: 'var(--color-bg-magnolia)',
    border: '1px solid var(--color-accent-soil)',
    borderRadius: 14, padding: '20px 24px', marginBottom: 16,
  },
  wikiTitle: {
    fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22,
    color: 'var(--color-accent-chernozem)', lineHeight: 1.2,
  },
  wikiSubtitle: { fontSize: 13, color: '#888', marginTop: 3 },
  controlsBar: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' },
  searchWrap: {
    display: 'flex', alignItems: 'center', flex: 1, minWidth: 200,
    background: '#fff', border: '1px solid var(--color-accent-soil)',
    borderRadius: 8, padding: '0 10px', gap: 6,
  },
  searchIcon: { fontSize: 14, opacity: 0.5 },
  searchInput: {
    flex: 1, border: 'none', outline: 'none', fontSize: 13,
    padding: '8px 4px', fontFamily: 'inherit', background: 'transparent',
  },
  clearBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#aaa', padding: '2px 4px' },
  filterChip: {
    background: '#f0ebe3', border: '1px solid var(--color-accent-soil)',
    borderRadius: 20, padding: '7px 14px', fontSize: 12, fontWeight: 700,
    cursor: 'pointer', color: 'var(--color-accent-chernozem)', fontFamily: 'inherit',
    transition: 'all 0.15s', whiteSpace: 'nowrap',
  },
  filterChipActive: { background: '#f5c842', border: '1px solid #d4a800', color: '#3d2e00' },
  catBar: { display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  catPill: {
    background: '#f0ebe3', border: '1px solid var(--color-accent-soil)',
    borderRadius: 20, padding: '5px 14px', fontSize: 12, fontWeight: 600,
    cursor: 'pointer', color: 'var(--color-accent-chernozem)', fontFamily: 'inherit',
    transition: 'all 0.15s', textTransform: 'capitalize',
  },
  catPillActive: { background: 'var(--color-accent-chernozem)', border: '1px solid var(--color-accent-chernozem)', color: '#fff' },
  resultsCount: { fontSize: 11, color: '#aaa', marginBottom: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 },
  card: {
    background: '#fff', border: '1px solid var(--color-accent-soil)',
    borderRadius: 12, padding: '16px', cursor: 'pointer',
    transition: 'box-shadow 0.15s, transform 0.1s',
    display: 'flex', flexDirection: 'column', gap: 8, outline: 'none',
  },
  cardHeader: { display: 'flex', alignItems: 'flex-start', gap: 10 },
  cardIcon: { fontSize: 26, lineHeight: 1, flexShrink: 0 },
  cardTitle: { fontWeight: 700, fontSize: 14, color: 'var(--color-accent-chernozem)', lineHeight: 1.3 },
  cardCat: { fontSize: 10, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 2 },
  cardBookmark: { background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#f5c842', padding: 0, lineHeight: 1, flexShrink: 0 },
  cardTags: { display: 'flex', flexWrap: 'wrap', gap: 4 },
  tag: { fontSize: 10, background: '#f0ebe3', color: '#888', borderRadius: 10, padding: '2px 7px', fontWeight: 600 },
  cardArrow: { fontSize: 11, color: 'var(--color-accent-chernozem)', fontWeight: 700, marginTop: 'auto', opacity: 0.7 },
  emptyState: { textAlign: 'center', padding: '50px 0', color: '#bbb', fontSize: 14 },

  reader: { maxWidth: 860, margin: '0 auto' },
  readerToolbar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    background: 'var(--color-bg-magnolia)', border: '1px solid var(--color-accent-soil)',
    borderRadius: 10, padding: '10px 16px', marginBottom: 16, flexWrap: 'wrap', gap: 8,
  },
  backBtn: {
    background: 'none', border: '1px solid var(--color-accent-soil)',
    borderRadius: 6, padding: '6px 14px', fontSize: 13, fontWeight: 700,
    cursor: 'pointer', color: 'var(--color-accent-chernozem)', fontFamily: 'inherit',
  },
  categoryBadge: {
    background: '#f0ebe3', border: '1px solid var(--color-accent-soil)',
    borderRadius: 20, padding: '4px 12px', fontSize: 11, fontWeight: 700,
    color: '#888', textTransform: 'capitalize',
  },
  bookmarkBtn: {
    background: '#f0ebe3', border: '1px solid var(--color-accent-soil)',
    borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 700,
    cursor: 'pointer', color: 'var(--color-accent-chernozem)', fontFamily: 'inherit',
  },
  bookmarkBtnActive: { background: '#f5c842', border: '1px solid #d4a800', color: '#3d2e00' },

  // ФИX: overflow:hidden гарантирует что дочерние элементы не вылезут
  articleBody: {
    background: '#fff', border: '1px solid var(--color-accent-soil)',
    borderRadius: 12, padding: '28px 32px', minHeight: 300,
    overflow: 'hidden',          // ← КЛЮЧЕВОЙ ФИX
  },
  articleLoading: {
    display: 'flex', alignItems: 'center', gap: 10, color: '#aaa',
    fontSize: 13, padding: '40px 0', justifyContent: 'center',
  },
  spinnerDot: {
    width: 12, height: 12, borderRadius: '50%',
    background: 'var(--color-accent-chernozem)',
    animation: 'wiki-pulse 1s ease-in-out infinite', opacity: 0.5,
  },
  articleError: { color: '#c62828', background: '#fce4ec', borderRadius: 8, padding: '12px 16px', fontSize: 13 },
  mdContent: { fontSize: 14, lineHeight: 1.75, color: '#333', fontFamily: 'inherit' },
};

export default WikiPanel;