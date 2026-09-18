/* Z Key — color-mode.js
   COLOR mode never rasterizes — export-pdf.js embeds the original PDF page
   directly (vector/text preserved) via pdf-lib's embedPdf.
   BLACK & WHITE mode needs pixels, so this module renders just the one
   page that's needed, at a resolution sized to how big it will actually
   print (not a fixed huge size), converts it to clean grayscale, and
   returns PNG bytes ready for pdf-lib to embed. Nothing is cached beyond
   what's needed — canvases are released immediately after use. */

const ColorMode = (() => {
  const PRINT_DPI = 260; // sharper text/diagrams for print
  const MAX_PIXEL_DIM = 2400; // hard ceiling per rendered page, memory safety

  function ptToPx(pt, dpi) {
    return (pt / 72) * dpi;
  }

  function dataUrlToBytes(dataUrl) {
    const base64 = dataUrl.split(',')[1];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  // Samples the 4 corner patches of a rendered page/region to estimate its
  // background brightness — used to decide whether the page is a "dark
  // theme" slide (black/dark background, light text) that needs inverting
  // to look like a normal printable white page.
  function sampleBackgroundLuminance(data, width, height) {
    const patch = Math.max(2, Math.min(8, Math.floor(Math.min(width, height) * 0.05)));
    const corners = [
      [0, 0], [width - patch, 0], [0, height - patch], [width - patch, height - patch],
    ];
    let sum = 0;
    let count = 0;
    corners.forEach(([cx, cy]) => {
      for (let y = Math.max(0, cy); y < Math.min(height, cy + patch); y += 1) {
        for (let x = Math.max(0, cx); x < Math.min(width, cx + patch); x += 1) {
          const i = (y * width + x) * 4;
          sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          count += 1;
        }
      }
    });
    return count ? sum / count : 255;
  }

  // Converts the canvas in place to a clean, print-friendly document look:
  // grayscale, with a light contrast lift, and — if the page turns out to
  // be a dark-themed slide (dark/black background) — inverted, so the
  // printed result is always dark text on white paper, never a black page.
  function applyDocumentGrayscale(ctx, width, height) {
    const imgData = ctx.getImageData(0, 0, width, height);
    const d = imgData.data;
    const bgLuminance = sampleBackgroundLuminance(d, width, height);
    const invert = bgLuminance < 128;
    const contrast = 1.18;
    const midpoint = 128;

    for (let i = 0; i < d.length; i += 4) {
      let gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      if (invert) gray = 255 - gray;
      let adjusted = (gray - midpoint) * contrast + midpoint;
      adjusted = Utils.clamp(adjusted, 0, 255);
      d[i] = adjusted;
      d[i + 1] = adjusted;
      d[i + 2] = adjusted;
    }
    ctx.putImageData(imgData, 0, 0);
    return invert;
  }

  async function rasterizeGrayscalePng(pageIndex, slotWidthPt, slotHeightPt) {
    const state = AppState.get();
    const doc = state.pdfJsDoc;
    const box = await TrimBox.detect(pageIndex);
    const cropW = Math.max(0.02, box.right - box.left);
    const cropH = Math.max(0.02, box.bottom - box.top);

    const page = await doc.getPage(pageIndex + 1);
    const baseViewport = page.getViewport({ scale: 1 });

    let targetWidthPx = ptToPx(slotWidthPt, PRINT_DPI);
    let targetHeightPx = ptToPx(slotHeightPt, PRINT_DPI);
    const scale = Math.min(
      targetWidthPx / (cropW * baseViewport.width),
      targetHeightPx / (cropH * baseViewport.height),
      MAX_PIXEL_DIM / baseViewport.width,
      MAX_PIXEL_DIM / baseViewport.height
    );
    const viewport = page.getViewport({ scale: Math.max(scale, 0.2) });

    const fullCanvas = document.createElement('canvas');
    fullCanvas.width = Math.max(1, Math.round(viewport.width));
    fullCanvas.height = Math.max(1, Math.round(viewport.height));
    const fctx = fullCanvas.getContext('2d', { alpha: false });
    fctx.fillStyle = '#ffffff';
    fctx.fillRect(0, 0, fullCanvas.width, fullCanvas.height);
    await page.render({ canvasContext: fctx, viewport }).promise;

    const sx = Math.round(box.left * fullCanvas.width);
    const sy = Math.round(box.top * fullCanvas.height);
    const sw = Math.max(1, Math.round(cropW * fullCanvas.width));
    const sh = Math.max(1, Math.round(cropH * fullCanvas.height));

    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.drawImage(fullCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

    applyDocumentGrayscale(ctx, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL('image/png');
    const pngBytes = dataUrlToBytes(dataUrl);

    fullCanvas.width = 0;
    fullCanvas.height = 0;
    canvas.width = 0;
    canvas.height = 0;
    page.cleanup();

    return { pngBytes, width: sw, height: sh, aspect: sw / sh };
  }

  return { rasterizeGrayscalePng, applyDocumentGrayscale };
})();
