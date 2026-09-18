/* Z Key — pdf-import.js
   Reads the uploaded PDF(s)' metadata (page count + page dimensions)
   without rendering every page at full resolution. Nothing here ever
   leaves the device — we only ever read the Files the browser gave us.
   Supports selecting multiple PDFs at once (e.g. 3-4 class PDFs for one
   chapter) — they're merged into a single slide sequence, in filename
   order, so the final layout treats them as one continuous deck. */

const PdfImport = (() => {
  const MAX_SAFE_BYTES = 200 * 1024 * 1024; // 200MB hard stop per file

  function isPdfFile(file) {
    return (file.type && file.type === 'application/pdf') || /\.pdf$/i.test(file.name);
  }

  async function importFiles(fileList) {
    const files = Array.from(fileList || []).filter(isPdfFile);
    if (files.length === 0) {
      Utils.showError('Please choose one or more PDF files.');
      return;
    }

    // Natural sort by filename so "Class 2" comes before "Class 10".
    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

    Loading.show(files.length > 1 ? `Loading ${files.length} PDFs...` : 'Loading your PDF...');

    const pdfjsLib = await VendorLoader.ensurePdfJs();
    const newDocs = [];

    for (let f = 0; f < files.length; f += 1) {
      const file = files[f];

      if (file.size > MAX_SAFE_BYTES) {
        Utils.showError(`"${file.name}" is too large for this browser/device to process safely.`);
        // eslint-disable-next-line no-continue
        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      const arrayBuffer = await file.arrayBuffer();
      const bufferForExport = arrayBuffer.slice(0);
      const bufferForReading = arrayBuffer.slice(0);

      let doc;
      try {
        // eslint-disable-next-line no-await-in-loop
        doc = await pdfjsLib.getDocument({ data: bufferForReading }).promise;
      } catch (err) {
        handleImportError(err, file.name);
        // eslint-disable-next-line no-continue
        continue;
      }

      if (doc.numPages === 0) {
        Utils.showError(`"${file.name}" appears to be empty — skipped.`);
        // eslint-disable-next-line no-continue
        continue;
      }

      const pages = [];
      for (let i = 1; i <= doc.numPages; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        const page = await doc.getPage(i);
        const viewport = page.getViewport({ scale: 1 });
        pages.push({ width: viewport.width, height: viewport.height });
        page.cleanup();

        if (i % 25 === 0) {
          const label = files.length > 1 ? `Reading ${file.name}...` : 'Reading pages...';
          Loading.update(`${label} (${i}/${doc.numPages})`, 5 + ((f + i / doc.numPages) / files.length) * 25);
          // eslint-disable-next-line no-await-in-loop
          await Utils.yieldToUI();
        }
      }

      newDocs.push({
        fileName: file.name,
        fileSizeBytes: file.size,
        arrayBuffer: bufferForExport,
        pdfJsDoc: doc,
        pageCount: doc.numPages,
        pages,
      });
    }

    if (newDocs.length === 0) {
      Loading.hide();
      return;
    }

    const slides = [];
    newDocs.forEach((docMeta, docIndex) => {
      for (let pageIndex = 0; pageIndex < docMeta.pageCount; pageIndex += 1) {
        slides.push({
          id: Utils.uid('src'),
          kind: 'source',
          docIndex,
          pageIndex,
          removed: false,
        });
      }
    });

    AppState.set({ sourceDocs: newDocs, slides });

    Loading.hide();
    document.dispatchEvent(new CustomEvent('zkey:pdf-imported'));
  }

  function handleImportError(err, fileName) {
    const name = (err && err.name) || '';
    const message = (err && err.message) || '';
    const label = fileName ? `"${fileName}"` : 'This PDF';

    if (name === 'PasswordException' || /password/i.test(message)) {
      Utils.showError(`${label} appears to be password protected.`);
    } else if (name === 'InvalidPDFException' || /invalid pdf/i.test(message)) {
      Utils.showError(`Unable to open ${label}. It may be corrupted.`);
    } else {
      Utils.showError(`Unable to open ${label}.`);
    }
    // eslint-disable-next-line no-console
    console.error('[Z Key] PDF import error:', fileName, err);
  }

  return { importFiles };
})();
