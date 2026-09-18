/* Z Key — vendor-loader.js
   Loads pdf.js and pdf-lib from a CDN on demand (pinned versions), so the
   app shell itself stays tiny. The service worker caches these scripts
   after the first successful load, so the app keeps working offline. */

const VendorLoader = (() => {
  const PDFJS_VERSION = '3.11.174';
  const PDFLIB_VERSION = '1.17.1';

  const PDFJS_URL = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.js`;
  const PDFJS_WORKER_URL = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`;
  const PDFLIB_URL = `https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/${PDFLIB_VERSION}/pdf-lib.min.js`;

  let pdfjsPromise = null;
  let pdflibPromise = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        if (existing.dataset.loaded === 'true') return resolve();
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)));
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = () => { script.dataset.loaded = 'true'; resolve(); };
      script.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(script);
    });
  }

  function ensurePdfJs() {
    if (!pdfjsPromise) {
      pdfjsPromise = loadScript(PDFJS_URL).then(() => {
        if (!window.pdfjsLib) throw new Error('pdf.js failed to initialize');
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
        return window.pdfjsLib;
      });
    }
    return pdfjsPromise;
  }

  function ensurePdfLib() {
    if (!pdflibPromise) {
      pdflibPromise = loadScript(PDFLIB_URL).then(() => {
        if (!window.PDFLib) throw new Error('pdf-lib failed to initialize');
        return window.PDFLib;
      });
    }
    return pdflibPromise;
  }

  return { ensurePdfJs, ensurePdfLib };
})();
