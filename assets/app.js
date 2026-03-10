const DATA_URL = 'data/bugs.json';
const ITEMS_PER_PAGE = 20;

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
  paged: [],
  q: '',
  sev: 'all',
  sort: 'newest',
  page: 1,
};

const el = {
  cards: document.querySelector('#cards'),
  pagination: document.querySelector('#pagination'),
  summary: document.querySelector('#results-summary'),
  error: document.querySelector('#error-message'),
  search: document.querySelector('#search-input'),
  severity: document.querySelector('#severity-select'),
  sort: document.querySelector('#sort-select'),
};

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

  const totalPages = Math.max(1, Math.ceil(state.filtered.length / ITEMS_PER_PAGE));
  if (state.page > totalPages) state.page = totalPages;
  if (state.page < 1) state.page = 1;

  const start = (state.page - 1) * ITEMS_PER_PAGE;
  state.paged = state.filtered.slice(start, start + ITEMS_PER_PAGE);
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderCards() {
  if (state.filtered.length === 0) {
    el.cards.innerHTML = '<p>No matching findings.</p>';
    el.summary.textContent = '0 findings';
    el.pagination.innerHTML = '';
    return;
  }

  const startIndex = (state.page - 1) * ITEMS_PER_PAGE + 1;
  const endIndex = startIndex + state.paged.length - 1;
  el.summary.textContent = `${state.filtered.length} findings • showing ${startIndex}-${endIndex}`;

  const markup = state.paged
    .map((item) => {
      const sev = item.severity || 'unknown';
      const sevLabel = sev.toUpperCase();
      const title = escapeHtml(item.title_display || item.title_raw || 'Untitled issue');
      const body = escapeHtml(item.body_markdown || 'No description provided.');
      const created = formatDate(item.created_at);
      const updated = formatDate(item.updated_at);
      const issueLink = item.html_url || '#';
      const issueNumber = item.number ? `#${item.number}` : '';

      return `
        <article class="card">
          <button class="card-head" type="button" aria-expanded="false">
            <span class="sev sev-${sev}">${sevLabel}</span>
            <h2 class="title">${title}</h2>
            <span class="caret" aria-hidden="true">&#8250;</span>
          </button>
          <div class="card-body" hidden>
            <pre class="body-text">${body}</pre>
            <p class="meta">
              <span>${issueNumber} opened ${created}, updated ${updated}</span>
              <a href="${issueLink}" target="_blank" rel="noopener noreferrer">View on GitHub</a>
            </p>
          </div>
        </article>
      `;
    })
    .join('');

  el.cards.innerHTML = markup;

  for (const card of el.cards.querySelectorAll('.card')) {
    const button = card.querySelector('.card-head');
    const body = card.querySelector('.card-body');
    button.addEventListener('click', () => {
      const expanded = button.getAttribute('aria-expanded') === 'true';
      button.setAttribute('aria-expanded', String(!expanded));
      body.hidden = expanded;
      card.toggleAttribute('open', !expanded);
    });
  }
}

function renderPagination() {
  if (state.filtered.length === 0) {
    el.pagination.innerHTML = '';
    return;
  }

  const totalPages = Math.max(1, Math.ceil(state.filtered.length / ITEMS_PER_PAGE));
  if (totalPages === 1) {
    el.pagination.innerHTML = '';
    return;
  }

  const pages = [];
  pages.push(`<button type="button" data-page="${state.page - 1}" ${state.page === 1 ? 'disabled' : ''}>Prev</button>`);

  for (let page = 1; page <= totalPages; page += 1) {
    const current = page === state.page ? 'aria-current="page"' : '';
    pages.push(`<button type="button" data-page="${page}" ${current}>${page}</button>`);
  }

  pages.push(`<button type="button" data-page="${state.page + 1}" ${state.page === totalPages ? 'disabled' : ''}>Next</button>`);

  el.pagination.innerHTML = pages.join('');

  for (const btn of el.pagination.querySelectorAll('button[data-page]')) {
    btn.addEventListener('click', () => {
      const next = Number(btn.getAttribute('data-page'));
      if (!Number.isFinite(next)) return;
      state.page = next;
      render();
    });
  }
}

function render() {
  applyFilters();
  renderCards();
  renderPagination();
}

function bindEvents() {
  el.search.addEventListener('input', (event) => {
    state.q = event.target.value;
    state.page = 1;
    render();
  });

  el.severity.addEventListener('change', (event) => {
    state.sev = event.target.value;
    state.page = 1;
    render();
  });

  el.sort.addEventListener('change', (event) => {
    state.sort = event.target.value;
    state.page = 1;
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
