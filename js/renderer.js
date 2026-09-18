/* Z Key — renderer.js
   The single source of truth for "where does each slide go on the page".
   Both Preview (canvas) and Export (pdf-lib) call these same functions, so
   what the student sees in Preview is what they get in the final PDF.
   All rectangles use a top-left origin, y-down coordinate system (like
   <canvas>); export-pdf.js converts to pdf-lib's bottom-left origin. */

const Renderer = (() => {
  const PAGE_MARGIN = 16; // pt
  const CELL_GAP = 6;    // pt

  // Returns an array (length cols*rows) of {x, y, width, height} slot
  // rectangles, in reading order (left-to-right, top-to-bottom).
  //
  // When `contentAspect` is given, cells are sized to match that aspect
  // ratio as closely as the page allows — so each slide fills its cell
  // almost completely, instead of leaving dead space from a mismatched
  // fixed cell shape. Any leftover page space becomes a single, even
  // outer margin around the whole grid (the block is centered), rather
  // than extra gaps between individual slides.
  function computeSlotRects(layout, pageWidth, pageHeight, contentAspect) {
    const { cols, rows } = layout;
    const maxW = pageWidth - PAGE_MARGIN * 2 - CELL_GAP * (cols - 1);
    const maxH = pageHeight - PAGE_MARGIN * 2 - CELL_GAP * (rows - 1);

    let cellW = maxW / cols;
    let cellH = maxH / rows;

    if (contentAspect && Number.isFinite(contentAspect) && contentAspect > 0) {
      let cw = maxW / cols;
      let ch = cw / contentAspect;
      if (ch * rows + CELL_GAP * (rows - 1) > maxH) {
        // Too tall for the page at that width — constrain by height instead.
        ch = maxH / rows;
        cw = ch * contentAspect;
      }
      cellW = cw;
      cellH = ch;
    }

    const gridW = cellW * cols + CELL_GAP * (cols - 1);
    const gridH = cellH * rows + CELL_GAP * (rows - 1);
    const offsetX = PAGE_MARGIN + Math.max(0, (maxW - gridW) / 2);
    const offsetY = PAGE_MARGIN + Math.max(0, (maxH - gridH) / 2);

    const rects = [];
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        rects.push({
          x: offsetX + c * (cellW + CELL_GAP),
          y: offsetY + r * (cellH + CELL_GAP),
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
