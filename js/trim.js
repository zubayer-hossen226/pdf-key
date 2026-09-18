/* Z Key — trim.js
   Many scanned/handwritten-note PDFs have a solid black (or white) border
   around the actual content. This module renders a small low-resolution
   copy of each page once, detects where the real content starts/ends
   (by comparing pixels against the page's own background color), and
   caches that as a fractional bounding box (0..1 of page width/height).
   Thumbnails, Preview and the final export all use this same box, so a
   slide is cropped identically everywhere — clean content, no wasted
   whitespace or black margins, without ever cropping into real content. */

const TrimBox = (() => {
  const cache = new Map(); // pageIndex -> { left, top, right, bottom } (fractions, 0..1)
  const inFlight = new Map();
  const DETECT_WIDTH = 200; // small + fast, just enough to find edges reliably
  const BG_TOLERANCE = 26; // per-channel-ish color distance to count as "background"
  const MIN_CONTENT_ROW_PX = 2; // ignore single stray pixels/noise
  const PADDING_FRAC = 0.003; // hug the content tightly — no extra margin beyond its own edge

  function colorDistance(r1, g1, b1, r2, g2, b2) {
    return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
  }

  function sampleCornerAverage(data, width, height) {
    // Average a small patch at each of the 4 corners, then average those —
    // robust to a stray icon/watermark sitting in just one corner.
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

    const minRowContent = Math.max(MIN_CONTENT_ROW_PX, Math.floor(width * 0.01));
    const minColContent = Math.max(MIN_CONTENT_ROW_PX, Math.floor(height * 0.01));

    outerTop:
    for (let y = 0; y < height; y += 1) {
      let count = 0;
      for (let x = 0; x < width; x += 1) {
        if (!isBg(x, y)) count += 1;
        if (count >= minRowContent) { top = y; break outerTop; }
      }
      if (y === height - 1) top = 0; // nothing found — bail to full page
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

    let leftFrac = left / width - PADDING_FRAC;
    let topFrac = top / height - PADDING_FRAC;
    let rightFrac = (right + 1) / width + PADDING_FRAC;
    let bottomFrac = (bottom + 1) / height + PADDING_FRAC;

    leftFrac = Utils.clamp(leftFrac, 0, 1);
    topFrac = Utils.clamp(topFrac, 0, 1);
    rightFrac = Utils.clamp(rightFrac, 0, 1);
    bottomFrac = Utils.clamp(bottomFrac, 0, 1);

    return { left: leftFrac, top: topFrac, right: rightFrac, bottom: bottomFrac };
  }

  async function detect(pageIndex) {
    if (cache.has(pageIndex)) return cache.get(pageIndex);
    if (inFlight.has(pageIndex)) return inFlight.get(pageIndex);

    const promise = (async () => {
      const state = AppState.get();
      const doc = state.pdfJsDoc;
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
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        box = computeContentBox(imageData);
      } catch (e) {
        box = { left: 0, top: 0, right: 1, bottom: 1 }; // fail safe: no crop
      }

      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();

      cache.set(pageIndex, box);
      return box;
    })();

    inFlight.set(pageIndex, promise);
    try {
      return await promise;
    } finally {
      inFlight.delete(pageIndex);
    }
  }

  // The cropped region's aspect ratio, in real page proportions (not pixels).
  async function getAspect(pageIndex) {
    const box = await detect(pageIndex);
    const state = AppState.get();
    const sp = state.sourcePages[pageIndex];
    const pageAspect = sp.width / sp.height;
    const w = box.right - box.left;
    const h = box.bottom - box.top;
    return pageAspect * (w / h);
  }

  // The cropped region as a pdf-lib style bounding box, in PDF points, using
  // pdf-lib's bottom-left origin (for PDFDocument#embedPage).
  async function getBoundingBoxPt(pageIndex) {
    const box = await detect(pageIndex);
    const state = AppState.get();
    const sp = state.sourcePages[pageIndex];
    return {
      left: box.left * sp.width,
      right: box.right * sp.width,
      bottom: sp.height * (1 - box.bottom),
      top: sp.height * (1 - box.top),
    };
  }

  function clear() {
    cache.clear();
    inFlight.clear();
  }

  return { detect, getAspect, getBoundingBoxPt, clear };
})();
