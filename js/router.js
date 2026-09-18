/* Z Key — router.js
   Simple forward-flowing screen router (upload → pages → layout → style →
   preview → done) plus the fixed bottom "Continue" bar shown on the two
   screens (pages, layout) that need it. */

const Router = (() => {
  const ORDER = ['upload', 'pages', 'layout', 'style', 'preview', 'done'];
  let current = 'upload';

  const bottomBar = () => Utils.$('#bottom-bar');
  const continueBtn = () => Utils.$('#btn-continue');
  const startOverBtn = () => Utils.$('#btn-start-over');

  function goTo(screenName) {
    current = screenName;
    Utils.$all('.screen').forEach((el) => {
      el.classList.toggle('active', el.dataset.screen === screenName);
    });
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
    updateBottomBar();
    startOverBtn().hidden = screenName === 'upload';
  }

  function updateBottomBar() {
    const bar = bottomBar();
    const btn = continueBtn();

    if (current === 'pages') {
      bar.hidden = false;
      const c = AppState.counters();
      btn.disabled = c.final === 0;
      btn.textContent = 'Continue';
    } else if (current === 'layout') {
      bar.hidden = false;
      btn.disabled = !AppState.get().layoutId;
      btn.textContent = 'Continue';
    } else {
      bar.hidden = true;
    }
  }

  function current_() {
    return current;
  }

  return { goTo, updateBottomBar, current: current_, ORDER };
})();
