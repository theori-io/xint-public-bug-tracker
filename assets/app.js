const DATA_URL = 'data/bugs.json';
const ITEMS_BATCH = 20;

const severityRank = {
  unknown: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

const state = {
  raw: [],
  filtered: [],
  q: '',
  sev: 'all',
  sort: 'severity_desc',
  visibleCount: ITEMS_BATCH,
};

const el = {
  cards: document.querySelector('#cards'),
  summary: document.querySelector('#results-summary'),
  error: document.querySelector('#error-message'),
  search: document.querySelector('#search-input'),
  severity: document.querySelector('#severity-select'),
  sort: document.querySelector('#sort-select'),
};

/* ── Markdown rendering ── */

marked.use({
  gfm: true,
  breaks: true,
  renderer: {
    code({ text, lang }) {
      const language = lang && hljs.getLanguage(lang) ? lang : null;
      const highlighted = language
        ? hljs.highlight(text, { language }).value
        : hljs.highlightAuto(text).value;
      const langClass = language ? ` language-${language}` : '';
      return `<pre><code class="hljs${langClass}">${highlighted}</code></pre>`;
    },
  },
});

function renderMarkdown(raw) {
  if (!raw) return '<p>No description provided.</p>';
  const html = marked.parse(raw);
  return DOMPurify.sanitize(html, { ADD_ATTR: ['class'] });
}

/* ── Helpers ── */

function formatDate(iso) {
  if (!iso) return 'Unknown date';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function sortItems(items, sortKey) {
  const out = [...items];
  out.sort((a, b) => {
    if (sortKey === 'oldest') {
      return Date.parse(a.created_at || 0) - Date.parse(b.created_at || 0);
    }
    if (sortKey === 'severity_desc') {
      const rank = (b.severity_rank ?? severityRank[b.severity] ?? 0) - (a.severity_rank ?? severityRank[a.severity] ?? 0);
      if (rank !== 0) return rank;
      return Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0);
    }
    if (sortKey === 'severity_asc') {
      const rank = (a.severity_rank ?? severityRank[a.severity] ?? 0) - (b.severity_rank ?? severityRank[b.severity] ?? 0);
      if (rank !== 0) return rank;
      return Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0);
    }
    if (sortKey === 'title_az') {
      return (a.title_display || '').localeCompare(b.title_display || '');
    }
    return Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0);
  });
  return out;
}

function applyFilters() {
  const q = state.q.trim().toLowerCase();
  const sev = state.sev;

  state.filtered = sortItems(
    state.raw.filter((item) => {
      if (sev !== 'all' && (item.severity || 'unknown') !== sev) return false;
      if (!q) return true;
      return (item.title_display || '').toLowerCase().includes(q);
    }),
    state.sort,
  );
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

/* ── Rendering ── */

function renderCards() {
  if (state.filtered.length === 0) {
    el.cards.innerHTML = '<p>No matching findings.</p>';
    el.summary.textContent = '0 findings';
    return;
  }

  const visible = state.filtered.slice(0, state.visibleCount);
  el.summary.textContent = `Showing ${visible.length} of ${state.filtered.length} findings`;

  const markup = visible
    .map((item, idx) => {
      const sev = item.severity || 'unknown';
      const sevLabel = sev.toUpperCase();
      const title = escapeHtml(item.title_display || item.title_raw || 'Untitled issue');
      const created = formatDate(item.created_at);
      const updated = formatDate(item.updated_at);
      const openedLabel = escapeHtml(`${created}`);
      const issueLink = item.html_url || '#';
      const issueNumber = item.number ? `#${item.number}` : '';

      return `
        <article class="card" data-index="${idx}">
          <button class="card-head" type="button" aria-expanded="false">
            <span class="sev sev-${sev}">${sevLabel}</span>
            <h2 class="title">${title}</h2>
            <span class="opened-date">${openedLabel}</span>
            <span class="caret" aria-hidden="true">&#8250;</span>
          </button>
          <div class="card-body" hidden>
            <div class="body-text markdown-body"></div>
            <p class="meta">
              <span>${issueNumber} opened ${created}, updated ${updated}</span>
              <a href="${issueLink}" target="_blank" rel="noopener noreferrer">View on GitHub</a>
            </p>
          </div>
        </article>
      `;
    })
    .join('');

  el.cards.innerHTML = markup + '<div id="scroll-sentinel"></div>';

  for (const card of el.cards.querySelectorAll('.card')) {
    const button = card.querySelector('.card-head');
    const body = card.querySelector('.card-body');
    const markdownDiv = card.querySelector('.markdown-body');
    const idx = Number(card.dataset.index);

    button.addEventListener('click', () => {
      const expanded = button.getAttribute('aria-expanded') === 'true';
      button.setAttribute('aria-expanded', String(!expanded));
      body.hidden = expanded;
      card.toggleAttribute('open', !expanded);

      // Lazy render markdown on first expand
      if (!expanded && !card.dataset.rendered) {
        const item = state.filtered[idx];
        markdownDiv.innerHTML = renderMarkdown(item?.body_markdown);
        card.dataset.rendered = '1';
      }
    });
  }
}

/* ── Infinite scroll ── */

let observer = null;

function setupScrollObserver() {
  if (observer) observer.disconnect();

  const sentinel = document.querySelector('#scroll-sentinel');
  if (!sentinel) return;

  if (state.visibleCount >= state.filtered.length) {
    sentinel.remove();
    return;
  }

  observer = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting) {
        state.visibleCount = Math.min(
          state.visibleCount + ITEMS_BATCH,
          state.filtered.length,
        );
        render();
      }
    },
    { rootMargin: '200px' },
  );

  observer.observe(sentinel);
}

/* ── Main render + events ── */

function render() {
  applyFilters();
  renderCards();
  setupScrollObserver();
}

function bindEvents() {
  el.search.addEventListener('input', (event) => {
    state.q = event.target.value;
    state.visibleCount = ITEMS_BATCH;
    render();
  });

  el.severity.addEventListener('change', (event) => {
    state.sev = event.target.value;
    state.visibleCount = ITEMS_BATCH;
    render();
    window.scrollTo(0, 0);
  });

  el.sort.addEventListener('change', (event) => {
    state.sort = event.target.value;
    state.visibleCount = ITEMS_BATCH;
    render();
  });
}

async function loadData() {
  const response = await fetch(DATA_URL, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to load ${DATA_URL}: ${response.status}`);
  }

  const payload = await response.json();
  state.raw = Array.isArray(payload.items) ? payload.items : [];
}

async function main() {
  bindEvents();
  el.sort.value = state.sort;

  try {
    await loadData();
    render();
  } catch (err) {
    el.error.hidden = false;
    el.error.textContent = `Unable to load bug wall data. ${err?.message || err}`;
    console.error(err);
  }
}

main();
