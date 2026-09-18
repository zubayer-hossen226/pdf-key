/* Z Key — pdf-import.js
   Reads the uploaded PDF's metadata (page count + page dimensions) without
   rendering every page at full resolution. Nothing here ever leaves the
   device — we only ever read the File the browser gave us. */

const PdfImport = (() => {
  const MAX_SAFE_BYTES = 200 * 1024 * 1024; // 200MB hard stop, friendly error beyond this

  async function importFile(file) {
    if (!file) return;

    if (file.type && file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      Utils.showError('Please choose a PDF file.');
      return;
    }

    if (file.size > MAX_SAFE_BYTES) {
      Utils.showError('This file is too large for this browser/device to process safely.');
      return;
    }

    Loading.show('Loading your PDF...');

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfjsLib = await VendorLoader.ensurePdfJs();

      // Keep a pristine, untouched copy of the bytes for later export —
      // pdf.js detaches/transfers the buffer it's given, so we clone it.
      const bufferForExport = arrayBuffer.slice(0);
      const bufferForReading = arrayBuffer.slice(0);

      let doc;
      try {
        doc = await pdfjsLib.getDocument({ data: bufferForReading }).promise;
      } catch (err) {
        handleImportError(err);
        Loading.hide();
        return;
      }

      if (doc.numPages === 0) {
        Utils.showError('This PDF appears to be empty.');
        Loading.hide();
        return;
      }

      Loading.update('Reading pages...', 5);

      const sourcePages = [];
      const slides = [];
      const batchSize = 25;

      for (let i = 1; i <= doc.numPages; i += 1) {
        const page = await doc.getPage(i);
        const viewport = page.getViewport({ scale: 1 });
        sourcePages.push({ pageIndex: i - 1, width: viewport.width, height: viewport.height });
        slides.push({
          id: Utils.uid('src'),
          kind: 'source',
          pageIndex: i - 1,
          removed: false,
          aspect: viewport.width / viewport.height,
        });
        // page.cleanup() releases any render resources pdf.js may have cached.
        page.cleanup();

        if (i % batchSize === 0) {
          Loading.update(`Reading pages... (${i}/${doc.numPages})`, 5 + (i / doc.numPages) * 20);
          await Utils.yieldToUI();
        }
      }

      AppState.set({
        fileName: file.name,
        fileSizeBytes: file.size,
        arrayBuffer: bufferForExport,
        pdfJsDoc: doc,
        sourcePageCount: doc.numPages,
        sourcePages,
        slides,
      });

      Loading.hide();
      document.dispatchEvent(new CustomEvent('zkey:pdf-imported'));
    } catch (err) {
      handleImportError(err);
      Loading.hide();
    }
  }

  function handleImportError(err) {
    const name = (err && err.name) || '';
    const message = (err && err.message) || '';

    if (name === 'PasswordException' || /password/i.test(message)) {
      Utils.showError('This PDF appears to be password protected.');
    } else if (name === 'InvalidPDFException' || /invalid pdf/i.test(message)) {
      Utils.showError('Unable to open this PDF. It may be corrupted.');
    } else {
      Utils.showError('Unable to open this PDF.');
    }
    // eslint-disable-next-line no-console
    console.error('[Z Key] PDF import error:', err);
  }

  return { importFile };
})();
