/* Z Key — page-manager.js
   Owns the Add/Remove Pages screen: rendering the page grid, soft-removing
   / restoring source pages, inserting blank 16:9 slides at an exact
   position, and keeping the Total/Removed/Blank/Final counters in sync. */

const PageManager = (() => {
  function insertBlankAfter(afterId) {
    const state = AppState.get();
    const slides = state.slides.slice();
    const blank = {
      id: Utils.uid('blank'),
      kind: 'blank',
      removed: false,
      aspect: 16 / 9,
    };
    if (afterId == null) {
      slides.unshift(blank);
    } else {
      const idx = slides.findIndex((s) => s.id === afterId);
      slides.splice(idx + 1, 0, blank);
    }
    AppState.set({ slides });
    render();
  }

  function removeSlide(id) {
    const state = AppState.get();
    const slides = state.slides.map((s) => (s.id === id ? { ...s, removed: true } : s));
    AppState.set({ slides });
    render();
  }

  function restoreSlide(id) {
    const state = AppState.get();
    const slides = state.slides.map((s) => (s.id === id ? { ...s, removed: false } : s));
    AppState.set({ slides });
    render();
  }

  function deleteBlank(id) {
    // Blank slides can be fully deleted (not just soft-removed) since they
    // carry no original content to restore.
    const state = AppState.get();
    const slides = state.slides.filter((s) => s.id !== id);
    AppState.set({ slides });
    render();
  }

  function updateCounters() {
    const c = AppState.counters();
    Utils.$('#count-total').textContent = c.total;
    Utils.$('#count-removed').textContent = c.removed;
    Utils.$('#count-blank').textContent = c.blank;
    Utils.$('#count-final').textContent = c.final;
  }

  function iconAdd() {
    return '+';
  }

  function buildSourceCard(slide) {
    const card = document.createElement('div');
    card.className = `page-card${slide.removed ? ' removed' : ''}`;
    card.dataset.id = slide.id;

    const thumbWrap = document.createElement('div');
    thumbWrap.className = 'page-thumb-wrap';
    card.appendChild(thumbWrap);
    Thumbnails.attachLazy(thumbWrap, slide.pageIndex, 260);

    const badge = document.createElement('div');
    badge.className = 'check-badge';
    badge.textContent = slide.removed ? '' : '✓';
    card.appendChild(badge);

    const addBtn = document.createElement('button');
    addBtn.className = 'add-slide-btn';
    addBtn.setAttribute('aria-label', 'Insert blank slide here');
    addBtn.textContent = iconAdd();
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      insertBlankAfter(slide.id);
    });
    card.appendChild(addBtn);

    const footer = document.createElement('div');
    footer.className = 'page-footer';
    const num = document.createElement('span');
    num.className = 'page-num';
    num.textContent = `Page ${slide.pageIndex + 1}`;
    footer.appendChild(num);
    if (slide.removed) {
      const tag = document.createElement('span');
      tag.className = 'page-tag removed-tag';
      tag.textContent = 'Removed';
      footer.appendChild(tag);
    }
    card.appendChild(footer);

    card.addEventListener('click', () => {
      if (slide.removed) restoreSlide(slide.id);
      else removeSlide(slide.id);
    });

    return card;
  }

  function buildBlankCard(slide) {
    const card = document.createElement('div');
    card.className = `page-card blank${slide.removed ? ' removed' : ''}`;
    card.dataset.id = slide.id;

    const thumbWrap = document.createElement('div');
    thumbWrap.className = 'page-thumb-wrap';
    thumbWrap.innerHTML = `
      <div class="blank-icon-label">
        <svg viewBox="0 0 24 24" width="26" height="26"><rect x="3" y="6" width="18" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>
        <span>Blank 16:9</span>
      </div>`;
    card.appendChild(thumbWrap);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.setAttribute('aria-label', 'Delete blank slide');
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteBlank(slide.id);
    });
    card.appendChild(removeBtn);

    const footer = document.createElement('div');
    footer.className = 'page-footer';
    const num = document.createElement('span');
    num.className = 'page-num';
    num.textContent = 'Blank';
    footer.appendChild(num);
    const tag = document.createElement('span');
    tag.className = 'page-tag';
    tag.textContent = 'Inserted';
    footer.appendChild(tag);
    card.appendChild(footer);

    return card;
  }

  function render() {
    const state = AppState.get();
    const grid = Utils.$('#page-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const frag = document.createDocumentFragment();
    state.slides.forEach((slide) => {
      const card = slide.kind === 'source' ? buildSourceCard(slide) : buildBlankCard(slide);
      frag.appendChild(card);
    });
    grid.appendChild(frag);

    updateCounters();
    if (typeof Router !== 'undefined') Router.updateBottomBar();
  }

  return { render, insertBlankAfter, removeSlide, restoreSlide, deleteBlank, updateCounters };
})();
