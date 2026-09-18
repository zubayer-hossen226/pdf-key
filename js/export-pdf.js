/* Z Key — export-pdf.js
   Builds the final, brand-new PDF with pdf-lib. Original PDFs are never
   modified. Output pages are built one at a time (sequential, with UI
   yields). Color-mode pages are embedded as vector/text (no
   rasterization) via pdf-lib's embedPage, cropped to each document's
   uniform TrimBox — only black & white mode rasterizes, and only the
   pages that are actually used. Supports multiple merged source PDFs. */

const ExportPdf = (() => {
  function slideKey(slide) {
    return `${slide.docIndex}:${slide.pageIndex}`;
  }

  async function generate() {
    const state = AppState.get();
    const PDFLib = await VendorLoader.ensurePdfLib();
    const { PDFDocument, rgb } = PDFLib;

    const layout = Layouts.getLayout(state.layoutId);
    const pageSize = Utils.pageSizeForOrientation(layout.orientation);
    const outputPages = state.outputPages.length
      ? state.outputPages
      : Layouts.computeOutputPages(AppState.activeSlides(), layout);
    const contentAspect = await TrimBox.getRepresentativeAspect(AppState.activeSlides());

    Loading.show('Creating your printable PDF...');

    const outDoc = await PDFDocument.create();
    outDoc.setTitle(`Z Key — ${AppState.combinedFileLabel()}`);
    outDoc.setProducer('Z Key');
    outDoc.setCreator('Z Key (zkey app)');

    // Collect the unique (docIndex, pageIndex) slides actually used, so we
    // only embed/rasterize each source page once no matter how it's
    // referenced.
    const neededSlides = [];
    const seen = new Set();
    outputPages.flat().filter(Boolean).forEach((s) => {
      if (s.kind !== 'source') return;
      const k = slideKey(s);
      if (!seen.has(k)) { seen.add(k); neededSlides.push(s); }
    });
    neededSlides.sort((a, b) => (a.docIndex - b.docIndex) || (a.pageIndex - b.pageIndex));

    const embeddedByKey = new Map();

    if (state.colorMode === 'color') {
      Loading.update('Embedding original slides...', 5);
      const srcDocCache = new Map(); // docIndex -> loaded PDFLib.PDFDocument
      for (let i = 0; i < neededSlides.length; i += 1) {
        const slide = neededSlides[i];
        if (!srcDocCache.has(slide.docIndex)) {
          const docMeta = state.sourceDocs[slide.docIndex];
          // eslint-disable-next-line no-await-in-loop
          const loaded = await PDFDocument.load(docMeta.arrayBuffer);
          srcDocCache.set(slide.docIndex, loaded);
        }
        const srcDoc = srcDocCache.get(slide.docIndex);
        const srcPage = srcDoc.getPages()[slide.pageIndex];
        // eslint-disable-next-line no-await-in-loop
        const boundingBox = await TrimBox.getBoundingBoxPt(slide.docIndex, slide.pageIndex);
        // eslint-disable-next-line no-await-in-loop
        const embedded = await outDoc.embedPage(srcPage, boundingBox);
        embeddedByKey.set(slideKey(slide), embedded);

        if (i % 5 === 0) {
          Loading.update(`Embedding original slides... (${i + 1}/${neededSlides.length})`, 5 + (i / neededSlides.length) * 40);
          // eslint-disable-next-line no-await-in-loop
          await Utils.yieldToUI();
        }
      }
    } else {
      // Black & white: rasterize only what's needed, sized to how big it
      // will actually print at this layout's slot dimensions.
      const rects = Renderer.computeSlotRects(layout, pageSize.width, pageSize.height, contentAspect);
      const approxSlot = rects[0];
      for (let i = 0; i < neededSlides.length; i += 1) {
        const slide = neededSlides[i];
        Loading.update(`Processing slide ${i + 1} of ${neededSlides.length}...`, 5 + (i / neededSlides.length) * 45);
        // eslint-disable-next-line no-await-in-loop
        const { pngBytes, aspect } = await ColorMode.rasterizeGrayscalePng(slide.docIndex, slide.pageIndex, approxSlot.width, approxSlot.height);
        // eslint-disable-next-line no-await-in-loop
        const pngImage = await outDoc.embedPng(pngBytes);
        embeddedByKey.set(slideKey(slide), { image: pngImage, aspect });
        if (i % 3 === 0) {
          // eslint-disable-next-line no-await-in-loop
          await Utils.yieldToUI();
        }
      }
    }

    const rects = Renderer.computeSlotRects(layout, pageSize.width, pageSize.height, contentAspect);

    for (let p = 0; p < outputPages.length; p += 1) {
      const pctBase = state.colorMode === 'color' ? 10 : 55;
      const pctSpan = 85 - pctBase;
      Loading.update(`Creating your printable PDF... Page ${p + 1} of ${outputPages.length}`, pctBase + (p / outputPages.length) * pctSpan);

      const page = outDoc.addPage([pageSize.width, pageSize.height]);
      const slots = outputPages[p];

      for (let s = 0; s < slots.length; s += 1) {
        const slide = slots[s];
        const rect = rects[s];
        if (!slide) continue; // empty slot stays empty

        if (slide.kind === 'blank') {
          if (state.borderOn) {
            const m = 2;
            page.drawRectangle({
              x: rect.x + m,
              y: pageSize.height - (rect.y + rect.height - m),
              width: rect.width - m * 2,
              height: rect.height - m * 2,
              borderColor: rgb(0.82, 0.82, 0.86),
              borderWidth: 1,
            });
          }
          continue;
        }

        const inset = 2;
        const innerSlot = { x: rect.x + inset, y: rect.y + inset, width: rect.width - inset * 2, height: rect.height - inset * 2 };
        const key = slideKey(slide);

        let fitted;
        if (state.colorMode === 'color') {
          const embedded = embeddedByKey.get(key);
          if (!embedded) continue;
          const aspect = embedded.width / embedded.height;
          fitted = Renderer.fitContain(innerSlot, aspect);
          page.drawPage(embedded, {
            x: fitted.x,
            y: pageSize.height - (fitted.y + fitted.height),
            width: fitted.width,
            height: fitted.height,
          });
        } else {
          const entry = embeddedByKey.get(key);
          if (!entry) continue;
          fitted = Renderer.fitContain(innerSlot, entry.aspect);
          page.drawImage(entry.image, {
            x: fitted.x,
            y: pageSize.height - (fitted.y + fitted.height),
            width: fitted.width,
            height: fitted.height,
          });
        }

        // Border hugs the ACTUAL visible slide (fitted rect), not the
        // whole grid cell — no dead space inside the border line.
        if (state.borderOn && fitted) {
          const pad = 2;
          page.drawRectangle({
            x: fitted.x - pad,
            y: pageSize.height - (fitted.y + fitted.height + pad),
            width: fitted.width + pad * 2,
            height: fitted.height + pad * 2,
            borderColor: rgb(0.75, 0.75, 0.78),
            borderWidth: 1,
          });
        }
      }

      if (p % 2 === 0) {
        // eslint-disable-next-line no-await-in-loop
        await Utils.yieldToUI();
      }
    }

    Loading.update('Almost ready...', 92);
    const pdfBytes = await outDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });

    const c = AppState.counters();
    const fileName = `ZKey_Printable_${c.final}_Slides.pdf`;

    AppState.set({ resultBlob: blob, resultFileName: fileName });
    Loading.update('Done!', 100);
    await Utils.yieldToUI();
    Loading.hide();

    return { blob, fileName };
  }

  return { generate };
})();
