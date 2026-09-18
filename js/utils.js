/* Z Key — utils.js
   Small, dependency-free helpers shared across modules. */

const Utils = (() => {
  function uid(prefix = 'id') {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function $(sel, root = document) {
    return root.querySelector(sel);
  }

  function $all(sel, root = document) {
    return Array.from(root.querySelectorAll(sel));
  }

  function formatBytes(bytes) {
    if (!bytes && bytes !== 0) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let n = bytes;
    while (n >= 1024 && i < units.length - 1) {
      n /= 1024;
      i += 1;
    }
    return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
  }

  // Yield control back to the browser so the UI thread doesn't freeze during
  // long sequential loops (thumbnail generation, PDF export, etc).
  function yieldToUI() {
    return new Promise((resolve) => {
      if ('requestIdleCallback' in window) {
        requestIdleCallback(() => resolve(), { timeout: 50 });
      } else {
        setTimeout(resolve, 0);
      }
    });
  }

  function revokeIfObjectUrl(url) {
    if (url && url.startsWith('blob:')) {
      try { URL.revokeObjectURL(url); } catch (e) { /* noop */ }
    }
  }

  // A4 in PDF points (1pt = 1/72in). 595.28 x 841.89.
  const A4 = { width: 595.28, height: 841.89 };

  function pageSizeForOrientation(orientation) {
    return orientation === 'landscape'
      ? { width: A4.height, height: A4.width }
      : { width: A4.width, height: A4.height };
  }

  function showError(message) {
    const toast = document.getElementById('error-toast');
    const text = document.getElementById('error-toast-text');
    if (!toast || !text) { alert(message); return; }
    text.textContent = message;
    toast.hidden = false;
    clearTimeout(showError._t);
    showError._t = setTimeout(() => { toast.hidden = true; }, 6000);
  }

  document.addEventListener('DOMContentLoaded', () => {
    const closeBtn = document.getElementById('error-toast-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        document.getElementById('error-toast').hidden = true;
      });
    }
  });

  return { uid, clamp, $, $all, formatBytes, yieldToUI, revokeIfObjectUrl, A4, pageSizeForOrientation, showError };
})();
