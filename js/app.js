/* Z Key — app.js
   Boots the app: plays the welcome animation, registers the service
   worker, and wires every screen's buttons to the modules above. */

(function boot() {
  document.addEventListener('DOMContentLoaded', () => {
    registerServiceWorker();
    playWelcome();
    Preview.init();
    wireUpload();
    wirePages();
    wireLayout();
    wireContinue();
    wireStyle();
    wirePreview();
    wireDone();
    wireTopBar();
  });

  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('service-worker.js').catch(() => {
          /* offline support is a bonus, not a hard requirement — fail quietly */
        });
      });
    }
  }

  function playWelcome() {
    const welcome = Utils.$('#welcome-screen');
    const app = Utils.$('#app');
    setTimeout(() => {
      welcome.classList.add('fade-out');
      app.hidden = false;
      setTimeout(() => welcome.remove(), 650);
    }, 2400);
  }

  function wireUpload() {
    const input = Utils.$('#pdf-input');
    input.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) PdfImport.importFile(file);
      input.value = '';
    });

    document.addEventListener('zkey:pdf-imported', () => {
      PageManager.render();
      Router.goTo('pages');
    });
  }

  function wirePages() {
    // counters/grid render is triggered from pdf-import success + page-manager actions
  }

  function wireLayout() {
    // Layout cards render lazily when the screen is entered (see continue handler)
  }

  function wireContinue() {
    Utils.$('#btn-continue').addEventListener('click', () => {
      const current = Router.current();
      if (current === 'pages') {
        Layouts.render();
        Router.goTo('layout');
      } else if (current === 'layout') {
        Router.goTo('style');
      }
    });
  }

  function wireStyle() {
    Utils.$('#color-mode-toggle').addEventListener('click', (e) => {
      const btn = e.target.closest('.segmented-btn');
      if (!btn) return;
      Utils.$all('#color-mode-toggle .segmented-btn').forEach((b) => b.classList.toggle('active', b === btn));
      AppState.set({ colorMode: btn.dataset.value });
    });

    Utils.$('#border-toggle').addEventListener('click', (e) => {
      const btn = e.target.closest('.segmented-btn');
      if (!btn) return;
      Utils.$all('#border-toggle .segmented-btn').forEach((b) => b.classList.toggle('active', b === btn));
      AppState.set({ borderOn: btn.dataset.value === 'on' });
    });

    Utils.$('#btn-go-preview').addEventListener('click', async () => {
      Loading.show('Preparing your PDF...');
      Preview.build();
      await Utils.yieldToUI();
      Loading.hide();
      Router.goTo('preview');
    });
  }

  function wirePreview() {
    Utils.$('#btn-edit-settings').addEventListener('click', () => {
      Layouts.render();
      Router.goTo('layout');
    });

    Utils.$('#btn-generate-pdf').addEventListener('click', async () => {
      try {
        const { fileName } = await ExportPdf.generate();
        const c = AppState.counters();
        Utils.$('#done-summary').textContent = `${fileName} • ${c.final} slides`;
        Router.goTo('done');
      } catch (err) {
        Loading.hide();
        // eslint-disable-next-line no-console
        console.error('[Z Key] export error:', err);
        Utils.showError('Something went wrong while creating the PDF. Please try again.');
      }
    });
  }

  function wireDone() {
    Utils.$('#btn-download').addEventListener('click', () => {
      const state = AppState.get();
      if (!state.resultBlob) return;
      const url = URL.createObjectURL(state.resultBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = state.resultFileName || 'ZKey_Printable.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    });

    Utils.$('#btn-share').addEventListener('click', async () => {
      const state = AppState.get();
      if (!state.resultBlob) return;
      const file = new File([state.resultBlob], state.resultFileName || 'ZKey_Printable.pdf', { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: 'Z Key PDF' });
          return;
        } catch (err) {
          if (err && err.name === 'AbortError') return; // user cancelled share sheet
        }
      }
      // Fallback: sharing isn't mandatory — just download instead.
      Utils.$('#btn-download').click();
    });

    Utils.$('#btn-print').addEventListener('click', () => {
      const state = AppState.get();
      if (!state.resultBlob) return;
      const url = URL.createObjectURL(state.resultBlob);
      const win = window.open(url, '_blank');
      if (!win) {
        Utils.showError('Please allow pop-ups to print, or use Download and print from your Files app.');
        return;
      }
      // Most mobile browsers open the PDF in a viewer with its own print
      // control; try to trigger print() too for desktop browsers.
      win.addEventListener('load', () => {
        try { win.print(); } catch (e) { /* viewer handles it instead */ }
      });
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    });

    Utils.$('#btn-start-new').addEventListener('click', startNew);
  }

  function wireTopBar() {
    Utils.$('#btn-start-over').addEventListener('click', () => {
      if (confirm('Start over? Your current PDF and settings will be cleared.')) {
        startNew();
      }
    });
  }

  function startNew() {
    Thumbnails.clear();
    TrimBox.clear();
    AppState.reset();
    Utils.$('#page-grid').innerHTML = '';
    Router.goTo('upload');
  }
})();
