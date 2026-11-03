(function () {
  var d = document, root = d.documentElement;
  var still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  root.classList.add('js');
  // i18n: non-English pages set data-base="/xx" on <html> and window.I18N with the strings below
  var base = root.dataset.base || '', L = window.I18N || {}, rtl = root.dir === 'rtl';
  function t(k, def, v) {
    var s = L[k] || def;
    for (var x in v || {}) s = s.split('{' + x + '}').join(v[x]);
    return s;
  }

  // thumbnails: shimmer until loaded (load events don't bubble, so listen in the capture phase)
  function done(img) { var t = img.closest && img.closest('.thumb'); if (t) t.classList.add('ld'); }
  d.addEventListener('load', function (e) { if (e.target.tagName === 'IMG') done(e.target); }, true);
  d.addEventListener('error', function (e) { if (e.target.tagName === 'IMG') done(e.target); }, true);
  d.querySelectorAll('.thumb img').forEach(function (img) { if (img.complete) done(img); });

  // rows below the fold fade up as they scroll in
  if ('IntersectionObserver' in window && !still) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.remove('pre'); e.target.classList.add('in'); io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -6% 0px' });
    d.querySelectorAll('main .row').forEach(function (r) {
      if (r.getBoundingClientRect().top > innerHeight) { r.classList.add('pre'); io.observe(r); }
    });
  }

  // rail arrows (pointer devices only; hidden by CSS on touch)
  d.querySelectorAll('.row .rail:not(.rail-studio)').forEach(function (rail) {
    var head = rail.parentNode.querySelector('.row-head');
    if (!head) return;
    var nav = d.createElement('div'); nav.className = 'rail-nav';
    var use = function (n) { return '<svg class="i" aria-hidden="true"><use href="/assets/icons.svg#' + n + '"/></svg>'; };
    nav.innerHTML = '<button type="button" aria-label="' + t('row.scroll_left', 'Scroll left') + '">' + use('left') + '</button><button type="button" aria-label="' + t('row.scroll_right', 'Scroll right') + '">' + use('right') + '</button>';
    var b = nav.querySelectorAll('button');
    // RTL: scrollLeft runs from 0 to negative values, and the first button points to the (right-hand) start
    function upd() { var x = Math.abs(rail.scrollLeft); b[0].disabled = x < 4; b[1].disabled = x + rail.clientWidth > rail.scrollWidth - 4; }
    [-1, 1].forEach(function (dir, i) {
      b[i].addEventListener('click', function () { rail.scrollBy({ left: (rtl ? -dir : dir) * rail.clientWidth * 0.85, behavior: still ? 'auto' : 'smooth' }); });
    });
    var tick = 0;
    rail.addEventListener('scroll', function () { if (!tick) tick = requestAnimationFrame(function () { tick = 0; upd(); }); }, { passive: true });
    head.appendChild(nav); upd();
  });

  // menu: drawer on small screens, collapse to an icon rail on desktop
  var menu = d.getElementById('menu'), side = d.getElementById('side'), scrim = d.getElementById('scrim');
  var wide = matchMedia('(min-width: 1024px)');
  function drawer(open) {
    root.classList.toggle('drawer', open);
    menu.setAttribute('aria-expanded', open);
    if (open) { var a = side.querySelector('a'); if (a) a.focus(); } else menu.focus();
  }
  if (menu && side) {
    if (wide.matches) menu.setAttribute('aria-expanded', root.dataset.side !== 'mini');
    menu.addEventListener('click', function () {
      if (wide.matches) {
        var mini = root.dataset.side !== 'mini';
        if (mini) root.dataset.side = 'mini'; else delete root.dataset.side;
        menu.setAttribute('aria-expanded', !mini);
        try { if (mini) localStorage.setItem('side', 'mini'); else localStorage.removeItem('side'); } catch (e) {}
      } else drawer(!root.classList.contains('drawer'));
    });
    scrim.addEventListener('click', function () { drawer(false); });
    d.addEventListener('keydown', function (e) { if (e.key === 'Escape' && root.classList.contains('drawer')) drawer(false); });
    wide.addEventListener('change', function () { if (root.classList.contains('drawer')) drawer(false); menu.setAttribute('aria-expanded', wide.matches ? root.dataset.side !== 'mini' : false); });
  }

  // theme toggle
  var tb = d.getElementById('theme');
  if (tb) tb.addEventListener('click', function () {
    var dark = root.dataset.theme !== 'light';                 // dark is the default
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('theme', root.dataset.theme); } catch (e) {}
  });

  // search index (loaded lazily)
  var idx = null, loading = null;
  function load() {
    if (idx) return Promise.resolve(idx);
    if (!loading) loading = fetch(base + '/search-index.json').then(function (r) { return r.json(); }).then(function (j) {
      idx = j.map(function (g) { return { t: g[0], s: g[1], i: g[2], e: g[3], b: base && g[4] ? base : '', k: norm(g[0]) }; });
      return idx;
    });
    return loading;
  }
  function norm(s) { return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' '); }
  function find(q, n) {
    var words = norm(q).split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    var out = [];
    for (var i = 0; i < idx.length; i++) {
      var g = idx[i], score = 0, ok = true;
      for (var w = 0; w < words.length; w++) {
        var p = g.k.indexOf(words[w]);
        if (p < 0) { ok = false; break; }
        score += p === 0 ? 3 : (g.k.charAt(p - 1) === ' ' ? 2 : 1);
      }
      if (ok) out.push([score, i, g]);
    }
    out.sort(function (a, b) { return b[0] - a[0] || a[1] - b[1]; });
    return out.slice(0, n).map(function (x) { return x[2]; });
  }
  function esc(s) { return s.replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  var q = d.getElementById('q'), box = d.getElementById('suggest');
  if (q && box) {
    var sel = -1;
    q.addEventListener('focus', load, { once: true });
    q.addEventListener('input', function () {
      var v = q.value.trim();
      if (v.length < 2) { box.hidden = true; return; }
      load().then(function () {
        var r = find(v, 7);
        sel = -1;
        if (!r.length) { box.innerHTML = '<a class="all" href="' + base + '/search/?q=' + encodeURIComponent(v) + '">' + t('search.none_all', 'No games found - see all results') + '</a>'; box.hidden = false; return; }
        box.innerHTML = r.map(function (g) {
          return '<a role="option" href="' + g.b + '/game/' + g.s + '/"><img src="' + esc(g.i) + '" alt="" width="56" height="42" loading="lazy">' + esc(g.t) + '</a>';
        }).join('') + '<a class="all" href="' + base + '/search/?q=' + encodeURIComponent(v) + '">' + t('search.all', 'See all results →') + '</a>';
        box.hidden = false;
      });
    });
    q.addEventListener('keydown', function (e) {
      var items = box.querySelectorAll('a');
      if (box.hidden || !items.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items.forEach(function (a, i) { a.setAttribute('aria-selected', i === sel); });
      } else if (e.key === 'Enter' && sel >= 0) { e.preventDefault(); location.href = items[sel].href; }
      else if (e.key === 'Escape') box.hidden = true;
    });
    d.addEventListener('click', function (e) { if (!e.target.closest('.search')) box.hidden = true; });
  }

  // search results page
  var results = d.getElementById('results');
  if (results) {
    var term = new URLSearchParams(location.search).get('q') || '';
    if (q) q.value = term;
    if (term) load().then(function () {
      var r = find(term, 96);
      d.getElementById('sr-title').textContent = t('search.results_for', 'Results for “{q}”', { q: term });
      d.getElementById('sr-count').textContent = r.length ? (r.length === 96 ? t('search.count_more', '{n}+ games found', { n: r.length }) : t('search.count', '{n} games found', { n: r.length })) : t('search.none', 'No games found. Try a shorter word, like “car” or “ball”.');
      results.innerHTML = r.map(function (g) {
        return '<a class="card" href="' + g.b + '/game/' + g.s + '/"><span class="thumb"><img src="' + esc(g.i) + '" alt="' + esc(g.t) + '" width="400" height="300" loading="lazy"></span><span class="name">' + esc(g.t) + '</span></a>';
      }).join('');
    });
  }

  // "read more" for long intros on phones
  var lh = d.querySelector('.list-head'), it = lh && lh.querySelector('.intro:not(.small)');
  if (it && it.scrollHeight > it.clientHeight + 4) {
    var b = d.createElement('button');
    b.type = 'button'; b.className = 'more-txt'; b.textContent = t('list.read_more', 'Read more');
    b.addEventListener('click', function () { var o = lh.classList.toggle('open'); b.textContent = o ? t('list.show_less', 'Show less') : t('list.read_more', 'Read more'); });
    it.after(b);
  }

  // click-to-play
  var stage = d.getElementById('stage');
  if (stage) {
    var playBtn = d.getElementById('play'), fsBtn = d.getElementById('fs'), exitBtn = d.getElementById('exit');
    var small = function () { return Math.min(innerWidth, innerHeight) < 600 || (matchMedia('(pointer:coarse)').matches && innerWidth < 900); };
    function start() {
      if (stage.classList.contains('on')) return;
      var f = d.createElement('iframe');
      f.src = stage.dataset.src;
      f.title = stage.dataset.title;
      f.allow = 'autoplay; fullscreen *; gamepad *; accelerometer; gyroscope; clipboard-write';
      f.setAttribute('allowfullscreen', '');
      // keep the game inside our page: no pop-ups, no new tabs, no navigating our page away
      if (stage.dataset.sandbox !== 'off') f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-pointer-lock allow-orientation-lock allow-forms allow-modals allow-presentation');
      f.setAttribute('scrolling', 'no');
      stage.appendChild(f);
      stage.classList.add('on');
      if (small()) theater(true);
      f.focus();
    }
    function theater(on) {
      stage.classList.toggle('theater', on);
      d.body.classList.toggle('lock', on);
      exitBtn.hidden = !on;
    }
    function fullscreen() {
      start();
      var el = stage, req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (req && !small()) {
        try {
          var pr = req.call(el);
          if (pr && pr.catch) pr.catch(function () {});
          // blocked, denied or never granted: fall back to the in-page theater mode
          setTimeout(function () { if (!(d.fullscreenElement || d.webkitFullscreenElement)) theater(true); }, 700);
          return;
        } catch (e) {}
      }
      theater(true);
    }
    playBtn.addEventListener('click', start);
    fsBtn.addEventListener('click', fullscreen);
    exitBtn.addEventListener('click', function () { theater(false); });
    d.addEventListener('keydown', function (e) { if (e.key === 'Escape' && stage.classList.contains('theater')) theater(false); });
  }

  // language picker: remember an explicit choice; suggest (never redirect) a matching language
  var langs = [].slice.call(d.querySelectorAll('.lang-menu a[hreflang]'));
  langs.forEach(function (a) {
    a.addEventListener('click', function () { try { localStorage.setItem('lang', a.hreflang); } catch (e) {} });
  });
  d.addEventListener('click', function (e) {
    var dt = d.querySelector('details.lang[open]');
    if (dt && !dt.contains(e.target)) dt.open = false;
  });
  (function suggest() {
    if (!langs.length) return;
    var cur = (root.lang || 'en').toLowerCase(), want = [], stored = null;
    try { stored = localStorage.getItem('lang'); if (localStorage.getItem('lang-bar') === 'off') return; } catch (e) {}
    if (stored) want.push(stored); else want = (navigator.languages || [navigator.language || '']).slice(0, 3);
    var pick = null;
    want.some(function (w) {
      w = (w || '').toLowerCase();
      if (!w || w === cur || w.split('-')[0] === cur.split('-')[0]) return true;    // already on a match
      pick = langs.filter(function (a) { return a.hreflang.toLowerCase() === w; })[0] ||
             langs.filter(function (a) { return a.hreflang.toLowerCase().split('-')[0] === w.split('-')[0]; })[0] || null;
      return !!pick;
    });
    if (!pick) return;
    var bar = d.createElement('div');
    bar.className = 'lang-bar'; bar.lang = pick.hreflang; bar.dir = pick.hreflang === 'ar' ? 'rtl' : 'ltr';
    bar.innerHTML = '<span></span><a></a><button type="button"><svg class="i" aria-hidden="true"><use href="/assets/icons.svg#x"/></svg></button>';
    bar.querySelector('span').textContent = pick.dataset.s;
    var go = bar.querySelector('a'); go.href = pick.href; go.textContent = pick.dataset.go;
    go.addEventListener('click', function () { try { localStorage.setItem('lang', pick.hreflang); } catch (e) {} });
    var x = bar.querySelector('button'); x.setAttribute('aria-label', pick.dataset.x);
    x.addEventListener('click', function () { bar.remove(); try { localStorage.setItem('lang-bar', 'off'); } catch (e) {} });
    var top = d.querySelector('.top'); if (top) top.after(bar);
  })();
})();
