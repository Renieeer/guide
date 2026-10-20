// Full-screen loading screen for every page (loaded synchronously in <head>
// so it exists before the page paints). Navy + DepEd seal to match the
// landing page; the row of dots mirrors the referral case pipeline
// (Interview -> ... -> Case Closing) so it reads as "this system" rather than
// a generic spinner. It only appears when the connection is slow (the browser
// reports 2G/3G/data-saver, or the page is still loading after ~1.5 s), so
// fast loads never see it, and it says so when the connection is slow.

// Laravel rejects POST/PUT/DELETE requests that don't carry the page's CSRF
// token (419). Every page renders it in <meta name="csrf-token"> and loads
// this file first, so patch fetch() once here to send it on same-origin
// requests instead of editing every fetch() call site.
(function () {
    var originalFetch = window.fetch;
    if (typeof originalFetch !== 'function') return;

    window.fetch = function (input, init) {
        var meta = document.querySelector('meta[name="csrf-token"]');
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        var sameOrigin = new URL(url, window.location.href).origin === window.location.origin;
        if (meta && sameOrigin) {
            init = Object.assign({}, init);
            var headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
            if (!headers.has('X-CSRF-TOKEN')) headers.set('X-CSRF-TOKEN', meta.getAttribute('content'));
            init.headers = headers;
        }
        return originalFetch.call(this, input, init);
    };
})();

(function () {
    var src = document.currentScript && document.currentScript.src;
    var base = src ? src.replace(/\/js\/[^/]+\.js(?:[?#].*)?$/, '') : '';
    var STAGES = 7;

    var css = [
        '#gmsLoader{position:fixed;inset:0;width:100%;height:100vh;height:100dvh;box-sizing:border-box;overflow:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);z-index:2147483000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;',
        'background:radial-gradient(circle at 70% 15%,#1b4f94 0,#0d2b5a 45%,#08193a 100%);color:#fff;font-family:"DM Sans","Segoe UI",system-ui,sans-serif;',
        'opacity:1;transition:opacity .4s ease,visibility .4s}',
        '#gmsLoader.gms-done{opacity:0!important;visibility:hidden;pointer-events:none}',
        '#gmsLoader .gms-seal{position:relative;width:120px;height:120px;display:grid;place-items:center}',
        '#gmsLoader .gms-seal img{width:84px;height:84px;border-radius:50%;object-fit:cover;background:#fff;box-shadow:0 0 0 4px rgba(255,255,255,.12);animation:gmsPulse 1.8s ease-in-out infinite}',
        '#gmsLoader .gms-ring{position:absolute;inset:0;border-radius:50%;border:3px solid rgba(255,255,255,.12);border-top-color:#6fa8ff;border-right-color:#6fa8ff;animation:gmsSpin 1.1s linear infinite}',
        '#gmsLoader .gms-ring.two{inset:9px;border-color:rgba(255,255,255,.08);border-bottom-color:#fff;animation-duration:1.7s;animation-direction:reverse}',
        '#gmsLoader .gms-title{font-family:"Playfair Display",Georgia,serif;font-size:30px;font-weight:700;letter-spacing:.02em;margin:0}',
        '#gmsLoader .gms-sub{font-size:11px;letter-spacing:.22em;text-transform:uppercase;opacity:.7;margin-top:-14px;text-align:center;max-width:calc(100% - 32px);box-sizing:border-box}',
        '#gmsLoader .gms-stages{display:flex;align-items:center;gap:0}',
        '#gmsLoader .gms-stages i{width:12px;height:12px;border-radius:50%;background:rgba(255,255,255,.18);animation:gmsStage 2.1s ease-in-out infinite}',
        '#gmsLoader .gms-stages b{width:18px;height:2px;background:rgba(255,255,255,.18)}',
        '#gmsLoader .gms-msg{font-size:13px;min-height:18px;opacity:.85;text-align:center;padding:0 24px;transition:opacity .3s}',
        '#gmsLoader .gms-msg.slow{color:#ffd88a;opacity:1}',
        '@keyframes gmsFadeIn{to{opacity:1}}',
        '@keyframes gmsSpin{to{transform:rotate(360deg)}}',
        '@keyframes gmsPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.07)}}',
        '@keyframes gmsStage{0%,100%{background:rgba(255,255,255,.18);transform:scale(1)}20%,45%{background:#6fa8ff;transform:scale(1.35)}}',
        '@media (max-width:480px){#gmsLoader{gap:18px}#gmsLoader .gms-seal{width:96px;height:96px}#gmsLoader .gms-seal img{width:66px;height:66px}#gmsLoader .gms-title{font-size:24px}#gmsLoader .gms-sub{font-size:9.5px;letter-spacing:.16em;margin-top:-10px;padding:0 12px}#gmsLoader .gms-stages i{width:9px;height:9px}#gmsLoader .gms-stages b{width:11px}#gmsLoader .gms-msg{font-size:12px}}',
        '@media (max-width:340px){#gmsLoader .gms-stages b{width:7px}#gmsLoader .gms-sub{letter-spacing:.1em}}',
        '@media (max-height:480px) and (orientation:landscape){#gmsLoader{gap:10px}#gmsLoader .gms-seal{width:72px;height:72px}#gmsLoader .gms-seal img{width:50px;height:50px}#gmsLoader .gms-title{font-size:20px}#gmsLoader .gms-sub{margin-top:-6px}}',
        '@media (prefers-reduced-motion:reduce){#gmsLoader .gms-ring,#gmsLoader .gms-seal img,#gmsLoader .gms-stages i{animation-duration:4s}}'
    ].join('');

    var style = document.createElement('style');
    style.id = 'gmsLoaderStyle';
    style.textContent = css;

    var dots = '';
    for (var i = 0; i < STAGES; i++) {
        dots += (i ? '<b></b>' : '') + '<i style="animation-delay:' + (i * 0.3).toFixed(1) + 's"></i>';
    }

    var el = document.createElement('div');
    el.id = 'gmsLoader';
    el.className = 'gms-done'; // hidden until the connection proves slow
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.innerHTML =
        '<div class="gms-seal"><span class="gms-ring"></span><span class="gms-ring two"></span>' +
        '<img src="' + base + '/img/deped-seal.jpg" alt=""></div>' +
        '<h1 class="gms-title">EGuide</h1>' +
        '<div class="gms-sub">Academic Guidance &middot; School Management</div>' +
        '<div class="gms-stages">' + dots + '</div>' +
        '<div class="gms-msg" id="gmsLoaderMsg">Loading&hellip;</div>';

    document.documentElement.appendChild(style);
    document.documentElement.appendChild(el);

    var SLOW_AFTER = 1500;  // ms of loading before we call it a slow connection
    var MIN_VISIBLE = 600;  // once shown, stay long enough not to flicker
    var armTimer = null, hideTimer = null, slowTimer = null, failTimer = null, shownAt = 0;
    var msg = el.querySelector('#gmsLoaderMsg');

    // Browsers that expose the Network Information API (Edge/Chrome/Android)
    // tell us up front; everywhere else the SLOW_AFTER timer is the signal.
    function slowConnection() {
        var c = navigator.connection;
        return !!(c && (c.saveData || /(^|-)2g$|3g/.test(c.effectiveType || '') || c.rtt >= 800));
    }
    function setSlow() {
        msg.textContent = 'Slow connection detected - still loading, please wait...';
        msg.className = 'gms-msg slow';
    }
    function show() {
        clearTimeout(hideTimer);
        shownAt = Date.now();
        el.classList.remove('gms-done');
        msg.textContent = 'Loading...';
        msg.className = 'gms-msg';
        clearTimeout(slowTimer);
        clearTimeout(failTimer);
        if (slowConnection()) setSlow(); else slowTimer = setTimeout(setSlow, 3000);
        failTimer = setTimeout(hideNow, 30000); // never trap the user behind it
    }
    function hideNow() {
        clearTimeout(armTimer);
        clearTimeout(slowTimer);
        clearTimeout(failTimer);
        el.classList.add('gms-done');
    }
    function hide() {
        clearTimeout(armTimer); // finished before it ever counted as slow: never shown
        if (!shownAt || el.classList.contains('gms-done')) { shownAt = 0; return; }
        var wait = MIN_VISIBLE - (Date.now() - shownAt);
        clearTimeout(hideTimer);
        if (wait > 0) hideTimer = setTimeout(hideNow, wait); else hideNow();
        shownAt = 0;
    }
    // Start counting: show now on a known-slow connection, else only if
    // loading is still going after SLOW_AFTER.
    function arm() {
        clearTimeout(armTimer);
        shownAt = 0;
        if (slowConnection()) show(); else armTimer = setTimeout(show, SLOW_AFTER);
    }

    arm();
    if (document.readyState === 'complete') hide();
    else window.addEventListener('load', hide);

    // Back/forward cache restores a page without re-running load.
    window.addEventListener('pageshow', function (e) { if (e.persisted) hideNow(); });

    // Show again while moving to another page of the system.
    document.addEventListener('click', function (e) {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        var a = e.target.closest && e.target.closest('a[href]');
        if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
        var href = a.getAttribute('href') || '';
        if (!href || href.charAt(0) === '#' || /^(javascript|mailto|tel):/i.test(href)) return;
        if (a.origin !== location.origin) return;
        if (a.pathname === location.pathname && a.search === location.search) return;
        arm();
    });
})();
