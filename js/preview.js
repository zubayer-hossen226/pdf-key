/* Z Key — preview.js
   Renders each output page on a <canvas> using the exact same slot
   composition (Renderer.computeSlotRects / fitContain) that export-pdf.js
   uses, so what the student sees here matches the final PDF. Pages are
   built lazily, one at a time, as the student swipes/scrolls — never all
   at once. */

const Preview = (() => {
  let canvas, ctx, labelEl, prevBtn, nextBtn, wrap;
  let touchStartX = null;

  function init() {
    canvas = Utils.$('#preview-canvas');
    ctx = canvas.getContext('2d');
    labelEl = Utils.$('#preview-page-label');
    prevBtn = Utils.$('#preview-prev');
    nextBtn = Utils.$('#preview-next');
    wrap = Utils.$('#preview-canvas-wrap');

    prevBtn.addEventListener('click', () => goTo(AppState.get().previewIndex - 1));
    nextBtn.addEventListener('click', () => goTo(AppState.get().previewIndex + 1));

    wrap.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
    wrap.addEventListener('touchend', (e) => {
      if (touchStartX == null) return;
      const dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) > 40) {
        goTo(AppState.get().previewIndex + (dx < 0 ? 1 : -1));
      }
      touchStartX = null;
    });
  }

  function build() {
    const state = AppState.get();
    const layout = Layouts.getLayout(state.layoutId);
    const active = AppState.activeSlides();
    const outputPages = Layouts.computeOutputPages(active, layout);
    AppState.set({ outputPages, previewIndex: 0 });
    goTo(0);
  }

  async function goTo(index) {
    const state = AppState.get();
    const total = state.outputPages.length;
    const clamped = Utils.clamp(index, 0, total - 1);
    AppState.set({ previewIndex: clamped });

    prevBtn.disabled = clamped === 0;
    nextBtn.disabled = clamped === total - 1;
    labelEl.textContent = `Page ${clamped + 1} of ${total}`;

    await renderPage(clamped);
  }

  async function renderPage(index) {
    const state = AppState.get();
    const layout = Layouts.getLayout(state.layoutId);
    const pageSize = Utils.pageSizeForOrientation(layout.orientation);
    const slots = state.outputPages[index];
    const rects = Renderer.computeSlotRects(layout, pageSize.width, pageSize.height);

    // Render at a comfortable screen resolution (not print DPI — this is
    // just a visual preview).
    const displayScale = 2.2;
    canvas.width = Math.round(pageSize.width * displayScale);
    canvas.height = Math.round(pageSize.height * displayScale);

    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(displayScale, displayScale);

    for (let i = 0; i < slots.length; i += 1) {
      const slide = slots[i];
      const slot = rects[i];
      if (!slide) continue; // empty slot — leave blank, per spec

      if (slide.kind === 'blank') {
        if (state.borderOn) {
          ctx.strokeStyle = '#d7d7e0';
          ctx.lineWidth = 1;
          ctx.strokeRect(slot.x + 2.5, slot.y + 2.5, slot.width - 5, slot.height - 5);
        }
        continue; // blank slide = empty (optionally bordered) rectangle
      }

      // source slide
      // eslint-disable-next-line no-await-in-loop
      const dataUrl = await Thumbnails.render(slide.pageIndex, 640).catch(() => null);
      if (!dataUrl) continue;

      // eslint-disable-next-line no-await-in-loop
      const img = await loadImage(dataUrl);
      // img is already cropped to its content box (see thumbnails.js), so
      // its natural width/height already reflect the correct aspect ratio.
      const fitted = Renderer.fitContain(
        { x: slot.x + 2, y: slot.y + 2, width: slot.width - 4, height: slot.height - 4 },
        img.width / img.height
      );

      if (state.colorMode === 'bw') {
        const temp = document.createElement('canvas');
        temp.width = Math.max(1, Math.round(fitted.width * 2));
        temp.height = Math.max(1, Math.round(fitted.height * 2));
        const tctx = temp.getContext('2d', { alpha: false });
        tctx.fillStyle = '#ffffff';
        tctx.fillRect(0, 0, temp.width, temp.height);
        tctx.drawImage(img, 0, 0, temp.width, temp.height);
        ColorMode.applyDocumentGrayscale(tctx, temp.width, temp.height);
        ctx.drawImage(temp, fitted.x, fitted.y, fitted.width, fitted.height);
        temp.width = 0;
        temp.height = 0;
      } else {
        ctx.drawImage(img, fitted.x, fitted.y, fitted.width, fitted.height);
      }

      // Border hugs the ACTUAL visible slide (fitted rect), not the whole
      // grid cell — matches export-pdf.js exactly, no dead space inside it.
      if (state.borderOn) {
        const pad = 1.5;
        ctx.strokeStyle = '#c7c7cf';
        ctx.lineWidth = 1;
        ctx.strokeRect(fitted.x - pad + 0.5, fitted.y - pad + 0.5, fitted.width + pad * 2 - 1, fitted.height + pad * 2 - 1);
      }
    }

    ctx.restore();
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  return { init, build, goTo };
})();
