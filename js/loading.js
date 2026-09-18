/* Z Key — loading.js
   Controls the full-screen bouncing-circle loading overlay used during
   PDF import, thumbnail generation, preview building and export. */

const Loading = (() => {
  let overlay, messageEl, track, fill, percentEl;

  function init() {
    overlay = document.getElementById('loading-overlay');
    messageEl = document.getElementById('loading-message');
    track = document.getElementById('loading-progress-track');
    fill = document.getElementById('loading-progress-fill');
    percentEl = document.getElementById('loading-percent');
  }

  function show(message) {
    if (!overlay) init();
    messageEl.textContent = message || 'Preparing your PDF...';
    track.hidden = true;
    percentEl.hidden = true;
    fill.style.width = '0%';
    overlay.hidden = false;
  }

  function update(message, percent) {
    if (!overlay) init();
    if (message) messageEl.textContent = message;
    if (typeof percent === 'number') {
      track.hidden = false;
      percentEl.hidden = false;
      const p = Utils.clamp(Math.round(percent), 0, 100);
      fill.style.width = `${p}%`;
      percentEl.textContent = `${p}%`;
    }
  }

  function hide() {
    if (!overlay) init();
    overlay.hidden = true;
  }

  return { show, update, hide };
})();
