/* Z Key — state.js
   One central store for everything the app needs to know. No unrelated
   module keeps its own duplicate copy of this data — they read/write here. */

const AppState = (() => {
  const listeners = new Set();

  const state = {
    // --- source PDF ---
    fileName: null,
    fileSizeBytes: 0,
    arrayBuffer: null,      // original PDF bytes, kept for export (never mutated)
    pdfJsDoc: null,         // pdf.js document proxy (for thumbnails / metadata)
    sourcePageCount: 0,
    sourcePages: [],        // [{ pageIndex, width, height (pdf points) }]

    // --- slide sequence (source pages + blanks, in display order) ---
    // each item: { id, kind: 'source'|'blank', pageIndex (source only),
    //              removed: bool, aspect: w/h }
    slides: [],

    // --- layout / style ---
    layoutId: null,          // one of layouts.js LAYOUTS ids
    colorMode: 'color',      // 'color' | 'bw'
    borderOn: true,

    // --- preview / export ---
    outputPages: [],         // computed from slides + layout
    previewIndex: 0,

    // --- result ---
    resultBlob: null,
    resultFileName: null,
  };

  function get() {
    return state;
  }

  function set(patch) {
    Object.assign(state, patch);
    emit();
  }

  function on(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function emit() {
    listeners.forEach((fn) => fn(state));
  }

  function reset() {
    // Release memory-heavy references explicitly before clearing.
    state.fileName = null;
    state.fileSizeBytes = 0;
    state.arrayBuffer = null;
    state.pdfJsDoc = null;
    state.sourcePageCount = 0;
    state.sourcePages = [];
    state.slides = [];
    state.layoutId = null;
    state.colorMode = 'color';
    state.borderOn = true;
    state.outputPages = [];
    state.previewIndex = 0;
    state.resultBlob = null;
    state.resultFileName = null;
    emit();
  }

  // ----- derived counters -----
  function counters() {
    const total = state.slides.filter((s) => s.kind === 'source').length;
    const removed = state.slides.filter((s) => s.kind === 'source' && s.removed).length;
    const blank = state.slides.filter((s) => s.kind === 'blank' && !s.removed).length;
    const final = state.slides.filter((s) => !s.removed).length;
    return { total, removed, blank, final };
  }

  function activeSlides() {
    return state.slides.filter((s) => !s.removed);
  }

  return { get, set, on, emit, reset, counters, activeSlides };
})();
