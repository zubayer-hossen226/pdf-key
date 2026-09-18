/* Z Key — trim.js
   Many scanned/handwritten-note PDFs have a solid black (or white) border
   around the actual content. Cropping each page independently caused a
   real problem: slightly different crop amounts per page made adjacent
   grid cells look mismatched in size, with uneven gaps and occasional
   stray hairline borders. The fix: detect a content box for a SAMPLE of
   pages per source document, then take the median box and use that SAME
   box for every page in that document. Every slide crops identically —
   rows and columns line up perfectly, and gaps stay consistent. */

const TrimBox = (() => {
  const rawCache = new Map();   // `${docIndex}:${pageIndex}` -> raw per-page box
  const rawInFlight = new Map();
  const uniformCache = new Map();   // docIndex -> uniform box
  const uniformInFlight = new Map();

  const DETECT_WIDTH = 200;
  const BG_TOLERANCE = 26;
  const MIN_CONTENT_PX = 2;
  const SAMPLE_MAX = 40;      // pages sampled per doc to compute the uniform box
  const SAFETY_SHRINK = 0.006; // shrink the final uniform box inward a touch,
  // so no leftover hairline of the original border ever peeks through.

  function colorDistance(r1, g1, b1, r2, g2, b2) {
    return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
  }

  function sampleCornerAverage(data, width, height) {
    const patch = Math.max(2, Math.min(6, Math.floor(Math.min(width, height) * 0.05)));
    const corners = [
      [0, 0], [width - patch, 0], [0, height - patch], [width - patch, height - patch],
    ];
    const sums = [0, 0, 0];
    let count = 0;
    corners.forEach(([cx, cy]) => {
      for (let y = Math.max(0, cy); y < Math.min(height, cy + patch); y += 1) {
        for (let x = Math.max(0, cx); x < Math.min(width, cx + patch); x += 1) {
          const i = (y * width + x) * 4;
          sums[0] += data[i];
          sums[1] += data[i + 1];
          sums[2] += data[i + 2];
          count += 1;
        }
      }
    });
    if (count === 0) return [255, 255, 255];
    return [sums[0] / count, sums[1] / count, sums[2] / count];
  }

  function computeContentBox(imageData) {
    const { data, width, height } = imageData;
    const [bgR, bgG, bgB] = sampleCornerAverage(data, width, height);

    const isBg = (x, y) => {
      const i = (y * width + x) * 4;
      return colorDistance(data[i], data[i + 1], data[i + 2], bgR, bgG, bgB) < BG_TOLERANCE;
    };

    let top = 0;
    let bottom = height - 1;
    let left = 0;
    let right = width - 1;

    const minRowContent = Math.max(MIN_CONTENT_PX, Math.floor(width * 0.01));
    const minColContent = Math.max(MIN_CONTENT_PX, Math.floor(height * 0.01));

    outerTop:
    for (let y = 0; y < height; y += 1) {
      let count = 0;
      for (let x = 0; x < width; x += 1) {
        if (!isBg(x, y)) count += 1;
        if (count >= minRowContent) { top = y; break outerTop; }
      }
      if (y === height - 1) top = 0;
    }

    outerBottom:
    for (let y = height - 1; y >= 0; y -= 1) {
      let count = 0;
      for (let x = 0; x < width; x += 1) {
        if (!isBg(x, y)) count += 1;
        if (count >= minRowContent) { bottom = y; break outerBottom; }
      }
      if (y === 0) bottom = height - 1;
    }

    outerLeft:
    for (let x = 0; x < width; x += 1) {
      let count = 0;
      for (let y = 0; y < height; y += 1) {
        if (!isBg(x, y)) count += 1;
        if (count >= minColContent) { left = x; break outerLeft; }
      }
      if (x === width - 1) left = 0;
    }

    outerRight:
    for (let x = width - 1; x >= 0; x -= 1) {
      let count = 0;
      for (let y = 0; y < height; y += 1) {
        if (!isBg(x, y)) count += 1;
        if (count >= minColContent) { right = x; break outerRight; }
      }
      if (x === 0) right = width - 1;
    }

    if (right <= left || bottom <= top) {
      return { left: 0, top: 0, right: 1, bottom: 1 };
    }

    return {
      left: Utils.clamp(left / width, 0, 1),
      top: Utils.clamp(top / height, 0, 1),
      right: Utils.clamp((right + 1) / width, 0, 1),
      bottom: Utils.clamp((bottom + 1) / height, 0, 1),
    };
  }

  // Raw, single-page detection (used only to build the per-document sample).
  async function detectRaw(docIndex, pageIndex) {
    const key = `${docIndex}:${pageIndex}`;
    if (rawCache.has(key)) return rawCache.get(key);
    if (rawInFlight.has(key)) return rawInFlight.get(key);

    const promise = (async () => {
      const doc = AppState.pdfJsDocFor(docIndex);
      const page = await doc.getPage(pageIndex + 1);
      const base = page.getViewport({ scale: 1 });
      const scale = DETECT_WIDTH / base.width;
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(viewport.width));
      canvas.height = Math.max(1, Math.round(viewport.height));
      const ctx = canvas.getContext('2d', { alpha: false });
      await page.render({ canvasContext: ctx, viewport }).promise;

      let box;
      try {
        box = computeContentBox(ctx.getImageData(0, 0, canvas.width, canvas.height));
      } catch (e) {
        box = { left: 0, top: 0, right: 1, bottom: 1 };
      }

      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();

      rawCache.set(key, box);
      return box;
    })();

    rawInFlight.set(key, promise);
    try {
      return await promise;
    } finally {
      rawInFlight.delete(key);
    }
  }

  function median(nums) {
    const sorted = [...nums].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function sampleIndices(count, max) {
    if (count <= max) return Array.from({ length: count }, (_, i) => i);
    const step = count / max;
    const out = [];
    for (let i = 0; i < max; i += 1) out.push(Math.floor(i * step));
    return out;
  }

  // The ONE crop box every page of this document will use.
  async function ensureUniformBox(docIndex) {
    if (uniformCache.has(docIndex)) return uniformCache.get(docIndex);
    if (uniformInFlight.has(docIndex)) return uniformInFlight.get(docIndex);

    const promise = (async () => {
      const state = AppState.get();
      const docMeta = state.sourceDocs[docIndex];
      if (!docMeta) return { left: 0, top: 0, right: 1, bottom: 1 };

      const indices = sampleIndices(docMeta.pageCount, SAMPLE_MAX);
      const boxes = [];
      for (let i = 0; i < indices.length; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        boxes.push(await detectRaw(docIndex, indices[i]));
        if (i % 4 === 0) {
          // eslint-disable-next-line no-await-in-loop
          await Utils.yieldToUI();
        }
      }

      let box = {
        left: median(boxes.map((b) => b.left)),
        top: median(boxes.map((b) => b.top)),
        right: median(boxes.map((b) => b.right)),
        bottom: median(boxes.map((b) => b.bottom)),
      };

      // Shrink inward a touch — guarantees we're safely inside the content
      // box on every page, never leaving a sliver of the original border.
      box = {
        left: Utils.clamp(box.left + SAFETY_SHRINK, 0, 1),
        top: Utils.clamp(box.top + SAFETY_SHRINK, 0, 1),
        right: Utils.clamp(box.right - SAFETY_SHRINK, 0, 1),
        bottom: Utils.clamp(box.bottom - SAFETY_SHRINK, 0, 1),
      };
      if (box.right <= box.left || box.bottom <= box.top) {
        box = { left: 0, top: 0, right: 1, bottom: 1 };
      }

      uniformCache.set(docIndex, box);
      return box;
    })();

    uniformInFlight.set(docIndex, promise);
    try {
      return await promise;
    } finally {
      uniformInFlight.delete(docIndex);
    }
  }

  // Public API — every caller (thumbnails, preview, export) uses this same
  // uniform box for a given document, regardless of which page is asked.
  async function getCropBox(docIndex) {
    return ensureUniformBox(docIndex);
  }

  async function getAspect(docIndex, pageIndex) {
    const box = await ensureUniformBox(docIndex);
    const meta = AppState.pageMeta(docIndex, pageIndex);
    const pageAspect = meta.width / meta.height;
    const w = box.right - box.left;
    const h = box.bottom - box.top;
    return pageAspect * (w / h);
  }

  // Cropped region as a pdf-lib bounding box (points, bottom-left origin).
  async function getBoundingBoxPt(docIndex, pageIndex) {
    const box = await ensureUniformBox(docIndex);
    const meta = AppState.pageMeta(docIndex, pageIndex);
    return {
      left: box.left * meta.width,
      right: box.right * meta.width,
      bottom: meta.height * (1 - box.bottom),
      top: meta.height * (1 - box.top),
    };
  }

  // Picks one representative content aspect ratio to size the whole grid
  // by — the first active source slide's document. Good enough for the
  // common single-PDF case and a reasonable default when multiple PDFs
  // with different page shapes are merged.
  async function getRepresentativeAspect(slides) {
    const firstSource = slides.find((s) => s.kind === 'source');
    if (!firstSource) return null;
    try {
      return await getAspect(firstSource.docIndex, firstSource.pageIndex);
    } catch (e) {
      return null;
    }
  }

  function clear() {
    rawCache.clear();
    rawInFlight.clear();
    uniformCache.clear();
    uniformInFlight.clear();
  }

  return {
    getCropBox, getAspect, getBoundingBoxPt, getRepresentativeAspect, clear,
  };
})();
