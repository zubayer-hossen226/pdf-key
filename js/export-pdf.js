/* Z Key — export-pdf.js
   Builds the final, brand-new PDF with pdf-lib. The original PDF is never
   modified. Output pages are built one at a time (sequential, with UI
   yields), and color-mode pages are embedded as vector/text (no
   rasterization) via pdf-lib's embedPdf — only black & white mode
   rasterizes, and only the pages that are actually used. */

const ExportPdf = (() => {
  async function generate() {
    const state = AppState.get();
    const PDFLib = await VendorLoader.ensurePdfLib();
    const { PDFDocument, rgb } = PDFLib;

    const layout = Layouts.getLayout(state.layoutId);
    const pageSize = Utils.pageSizeForOrientation(layout.orientation);
    const outputPages = state.outputPages.length
      ? state.outputPages
      : Layouts.computeOutputPages(AppState.activeSlides(), layout);

    Loading.show('Creating your printable PDF...');

    const outDoc = await PDFDocument.create();
    outDoc.setTitle(`Z Key — ${state.fileName || 'Printable Notes'}`);
    outDoc.setProducer('Z Key');
    outDoc.setCreator('Z Key (zkey app)');

    // Collect the unique source page indices actually used, so we only
    // embed/rasterize each source page once no matter how it's referenced.
    const neededIndices = Array.from(new Set(
      outputPages.flat().filter(Boolean).filter((s) => s.kind === 'source').map((s) => s.pageIndex)
    )).sort((a, b) => a - b);

    const embeddedByPageIndex = new Map();

    if (state.colorMode === 'color') {
      Loading.update('Embedding original slides...', 5);
      if (neededIndices.length > 0) {
        const srcDoc = await PDFDocument.load(state.arrayBuffer);
        const srcPages = srcDoc.getPages();
        for (let i = 0; i < neededIndices.length; i += 1) {
          const pageIndex = neededIndices[i];
          // eslint-disable-next-line no-await-in-loop
          const boundingBox = await TrimBox.getBoundingBoxPt(pageIndex);
          // eslint-disable-next-line no-await-in-loop
          const embedded = await outDoc.embedPage(srcPages[pageIndex], boundingBox);
          embeddedByPageIndex.set(pageIndex, embedded);
          if (i % 5 === 0) {
            Loading.update(`Embedding original slides... (${i + 1}/${neededIndices.length})`, 5 + (i / neededIndices.length) * 40);
            // eslint-disable-next-line no-await-in-loop
            await Utils.yieldToUI();
          }
        }
      }
    } else {
      // Black & white: rasterize only what's needed, sized to how big it
      // will actually print at this layout's slot dimensions.
      const rects = Renderer.computeSlotRects(layout, pageSize.width, pageSize.height);
      const approxSlot = rects[0];
      for (let i = 0; i < neededIndices.length; i += 1) {
        const pageIndex = neededIndices[i];
        Loading.update(`Processing slide ${i + 1} of ${neededIndices.length}...`, 5 + (i / neededIndices.length) * 45);
        // eslint-disable-next-line no-await-in-loop
        const { pngBytes, aspect } = await ColorMode.rasterizeGrayscalePng(pageIndex, approxSlot.width, approxSlot.height);
        // eslint-disable-next-line no-await-in-loop
        const pngImage = await outDoc.embedPng(pngBytes);
        embeddedByPageIndex.set(pageIndex, { image: pngImage, aspect });
        if (i % 3 === 0) {
          // eslint-disable-next-line no-await-in-loop
          await Utils.yieldToUI();
        }
      }
    }

    const rects = Renderer.computeSlotRects(layout, pageSize.width, pageSize.height);

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

        let fitted;
        if (state.colorMode === 'color') {
          const embedded = embeddedByPageIndex.get(slide.pageIndex);
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
          const entry = embeddedByPageIndex.get(slide.pageIndex);
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
          const pad = 1.5;
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
