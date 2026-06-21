(function () {
  // Site is a classic multi-page app (full reload on every nav), so a plain
  // click feels like a hard flash-cut. Fade the outgoing page out before the
  // browser navigates, fade the incoming page in once parsed — cheap illusion
  // of a smooth transition without an SPA router.
  var style = document.createElement('style');
  style.textContent =
    'html{background:#1a0b2e}' +
    'body{opacity:0;transition:opacity .22s ease}' +
    'body.page-ready{opacity:1}';
  document.head.appendChild(style);

  // DOMContentLoaded fires as soon as HTML parsing is done — it does NOT wait
  // for the backdrop photo to finish decoding. Revealing right away made the
  // photo visibly pop in late on a cold/slow load. Wait for it first (capped
  // so a broken/slow network never blocks the reveal forever).
  function waitForBgImage() {
    return new Promise(function (resolve) {
      var img = new Image();
      var done = false;
      function finish() { if (!done) { done = true; resolve(); } }
      img.onload = finish;
      img.onerror = finish;
      img.src = '/assets/download.jpeg';
      if (img.complete) finish();
      setTimeout(finish, 600);
    });
  }

  function reveal() {
    waitForBgImage().then(function () {
      requestAnimationFrame(function () {
        document.body.classList.add('page-ready');
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', reveal);
  } else {
    reveal();
  }

  // Back/forward cache restores the DOM as-is (still opacity:0 if the page
  // was navigated away from mid-fade) — force it visible again.
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) document.body.classList.add('page-ready');
  });

  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    var link = e.target.closest && e.target.closest('a[href]');
    if (!link) return;

    // Sidebar nav-items inside the dashboard shell (admin/knowledge) are
    // swapped in-place by layout.js's own router — don't full-reload those.
    if (link.classList.contains('nav-item')) return;

    var href = link.getAttribute('href');
    if (!href || href.startsWith('#') || link.target === '_blank' || link.hasAttribute('download')) return;

    var url;
    try {
      url = new URL(link.href, location.href);
    } catch (err) {
      return;
    }
    if (url.origin !== location.origin) return;

    e.preventDefault();
    document.body.classList.remove('page-ready');
    setTimeout(function () {
      window.location.href = link.href;
    }, 180);
  }, true);
})();
