/* Z Key — state.js
   One central store for everything the app needs to know. No unrelated
   module keeps its own duplicate copy of this data — they read/write here. */

const AppState = (() => {
  const listeners = new Set();

  const state = {
    // --- source PDFs (one or more, merged in upload order) ---
    // each: { fileName, fileSizeBytes, arrayBuffer, pdfJsDoc, pageCount,
    //         pages: [{ width, height }] }  (width/height in PDF points)
    sourceDocs: [],

    // --- slide sequence (source pages + blanks, in display order) ---
    // each item: { id, kind: 'source'|'blank', docIndex, pageIndex
    //              (source only), removed: bool }
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
    state.sourceDocs = [];
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

  // ----- multi-doc helpers -----
  function pageMeta(docIndex, pageIndex) {
    const doc = state.sourceDocs[docIndex];
    return doc ? doc.pages[pageIndex] : null;
  }

  function pdfJsDocFor(docIndex) {
    const doc = state.sourceDocs[docIndex];
    return doc ? doc.pdfJsDoc : null;
  }

  function combinedFileLabel() {
    if (state.sourceDocs.length === 0) return 'Printable Notes';
    if (state.sourceDocs.length === 1) return state.sourceDocs[0].fileName;
    return `${state.sourceDocs.length} merged PDFs`;
  }

  return {
    get, set, on, emit, reset, counters, activeSlides,
    pageMeta, pdfJsDocFor, combinedFileLabel,
  };
})();
