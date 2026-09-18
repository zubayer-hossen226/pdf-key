/* Z Key — renderer.js
   The single source of truth for "where does each slide go on the page".
   Both Preview (canvas) and Export (pdf-lib) call these same functions, so
   what the student sees in Preview is what they get in the final PDF.
   All rectangles use a top-left origin, y-down coordinate system (like
   <canvas>); export-pdf.js converts to pdf-lib's bottom-left origin. */

const Renderer = (() => {
  const PAGE_MARGIN = 24; // pt
  const CELL_GAP = 10;    // pt

  // Returns an array (length cols*rows) of {x, y, width, height} slot
  // rectangles, in reading order (left-to-right, top-to-bottom).
  function computeSlotRects(layout, pageWidth, pageHeight) {
    const { cols, rows } = layout;
    const usableW = pageWidth - PAGE_MARGIN * 2 - CELL_GAP * (cols - 1);
    const usableH = pageHeight - PAGE_MARGIN * 2 - CELL_GAP * (rows - 1);
    const cellW = usableW / cols;
    const cellH = usableH / rows;

    const rects = [];
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        rects.push({
          x: PAGE_MARGIN + c * (cellW + CELL_GAP),
          y: PAGE_MARGIN + r * (cellH + CELL_GAP),
          width: cellW,
          height: cellH,
        });
      }
    }
    return rects;
  }

  // "contain" fit: the whole image/page stays fully visible, centered,
  // never cropped or stretched — matching or narrower aspect leaves blank
  // space rather than losing content.
  function fitContain(slot, aspect) {
    const slotAspect = slot.width / slot.height;
    let w;
    let h;
    if (aspect > slotAspect) {
      w = slot.width;
      h = w / aspect;
    } else {
      h = slot.height;
      w = h * aspect;
    }
    const x = slot.x + (slot.width - w) / 2;
    const y = slot.y + (slot.height - h) / 2;
    return { x, y, width: w, height: h };
  }

  return { PAGE_MARGIN, CELL_GAP, computeSlotRects, fitContain };
})();
