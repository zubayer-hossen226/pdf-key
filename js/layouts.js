/* Z Key — layouts.js
   Defines every "Slides Per Page" layout Z Key supports, renders the
   layout picker cards, and chunks the active slide sequence into output
   pages for a chosen layout. This is the single source of truth for
   layout math — preview and export both call computeOutputPages(). */

const Layouts = (() => {
  const LAYOUTS = [
    {
      id: '2',
      slidesPerPage: 2,
      orientation: 'portrait',
      cols: 1,
      rows: 2,
      title: '2 Slides',
      meta: 'Portrait • 1×2 Grid',
      desc: 'Big, easy-to-read slides — great for detailed notes.',
    },
    {
      id: '6',
      slidesPerPage: 6,
      orientation: 'landscape',
      cols: 3,
      rows: 2,
      title: '6 Slides',
      meta: 'Landscape • 3×2 Grid',
      desc: 'A balanced mix of size and paper savings.',
    },
    {
      id: '8',
      slidesPerPage: 8,
      orientation: 'portrait',
      cols: 2,
      rows: 4,
      title: '8 Slides',
      meta: 'Portrait • 2×4 Grid',
      badge: 'RECOMMENDED',
      desc: 'Max paper savings for most study PDFs.',
    },
    {
      id: '10',
      slidesPerPage: 10,
      orientation: 'portrait',
      cols: 2,
      rows: 5,
      title: '10 Slides',
      meta: 'Portrait • 2×5 Grid',
      badge: 'COMPACT',
      desc: 'Fit the most slides on a single page.',
    },
  ];

  function getLayout(id) {
    return LAYOUTS.find((l) => l.id === id) || null;
  }

  function buildPreviewGrid(layout) {
    const wrap = document.createElement('div');
    wrap.className = `layout-preview${layout.orientation === 'landscape' ? ' landscape' : ''}`;
    wrap.style.gridTemplateColumns = `repeat(${layout.cols}, 1fr)`;
    wrap.style.gridTemplateRows = `repeat(${layout.rows}, 1fr)`;
    for (let i = 0; i < layout.cols * layout.rows; i += 1) {
      const cell = document.createElement('div');
      cell.className = 'layout-preview-cell';
      wrap.appendChild(cell);
    }
    return wrap;
  }

  function render() {
    const grid = Utils.$('#layout-grid');
    if (!grid) return;
    grid.innerHTML = '';
    const state = AppState.get();

    LAYOUTS.forEach((layout) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `layout-card${state.layoutId === layout.id ? ' selected' : ''}`;
      card.dataset.id = layout.id;

      if (layout.badge) {
        const badge = document.createElement('span');
        badge.className = `layout-badge${layout.badge === 'COMPACT' ? ' compact' : ''}`;
        badge.textContent = layout.badge;
        card.appendChild(badge);
      }

      card.appendChild(buildPreviewGrid(layout));

      const info = document.createElement('div');
      info.className = 'layout-info';
      info.innerHTML = `
        <div class="layout-title">${layout.title}</div>
        <div class="layout-meta">${layout.meta}</div>
        <div class="layout-desc">${layout.desc}</div>
      `;
      card.appendChild(info);

      const mark = document.createElement('span');
      mark.className = 'layout-select-mark';
      card.appendChild(mark);

      card.addEventListener('click', () => {
        AppState.set({ layoutId: layout.id });
        render();
        if (typeof Router !== 'undefined') Router.updateBottomBar();
      });

      grid.appendChild(card);
    });
  }

  // Splits the active slide sequence into output pages of `slidesPerPage`
  // each, preserving order. The final page is padded with `null` for any
  // empty slots (never stretched to fill).
  function computeOutputPages(activeSlides, layout) {
    const pages = [];
    for (let i = 0; i < activeSlides.length; i += layout.slidesPerPage) {
      const chunk = activeSlides.slice(i, i + layout.slidesPerPage);
      while (chunk.length < layout.slidesPerPage) chunk.push(null);
      pages.push(chunk);
    }
    if (pages.length === 0) pages.push(new Array(layout.slidesPerPage).fill(null));
    return pages;
  }

  return { LAYOUTS, getLayout, render, computeOutputPages };
})();
