/* ============================================================
   HYPERION PORTAL — CROSS-PAGE SEARCH
   Runtime-indexed. Never goes stale: fetches the live pages,
   indexes them in the browser, caches for the session.
   ------------------------------------------------------------
   Respects hyperion_role gating (LEGACY / 1437).
   Reveals hidden tabs/sections when a result is clicked.
   ============================================================ */
(function () {
  'use strict';

  var CACHE_KEY = 'hyperion_search_index_v2';
  var CACHE_ROLE_KEY = 'hyperion_search_index_role';

  /* ---------- pages to index ---------- */
  var PAGES = [
    { file: 'mission-hq.html',            label: 'Mission HQ',            icon: '🎯', roles: 'all' },
    { file: 'fast-start-onboarding.html', label: 'Fast Start Onboarding', icon: '🚀', roles: 'all' },
    { file: 'prospecting.html',           label: 'Prospecting',           icon: '📋', roles: 'all' },
    { file: 'contact-scripts.html',       label: 'Contact Scripts',       icon: '📞', roles: 'all' },
    { file: 'objections.html',            label: 'Objections',            icon: '🛡️', roles: 'all' },
    { file: 'presentations.html',         label: 'Presentations',         icon: '🎞', roles: 'all' },
    { file: 'closing.html',               label: 'Closing / Helping Family', icon: '🤝', roles: 'experienced' },
    { file: 'identity-shift.html',        label: 'Identity Shift',        icon: '💡', roles: 'all' }
    /* call-guide.html deliberately NOT indexed: its content is a 100% duplicate
       of contact-scripts.html, so indexing it returns every script twice. */
  ];

  /* ---------- blocks worth indexing ---------- */
  var BLOCK_SEL = [
    '.card', '.obj-card', '.rm-card', '.rm-section-card', '.script-card',
    '.script-block', '.rm-script-block', '.step-item', '.warn-chip',
    '.timeline-card', '.gloss-item', '.coach-note', '.checklist-item',
    '.fn', '.line', '.rung', '.cmd-card',
    /* presentations.html */
    '.sblock', '.phrase-item', '.step-info',
    /* identity-shift.html */
    '.ti-pillar', '.ti-lang-item', '.ti-rule',
    /* contact-scripts.html */
    '.script-text', '.coach-item'
  ].join(',');

  var HEAD_SEL = 'h2,h3,h4,.obj-hdr,.script-card-title,.gloss-term,.script-label,' +
                 '.rm-card-title,.sec-title,.ti-pillar-h,.btype,.lab,strong,b';

  /* ---------- alias expansion (mirrors index.html) ---------- */
  var ALIASES = {
    tltc: 'tltc recruit close meeting business ama',
    ltc: 'long-term care ltc one-pager',
    iul: 'indexed universal life',
    fia: 'fixed index annuity',
    rila: 'registered index-linked annuity',
    bpm: 'business presentation meeting 3 buckets capped indexed fixed variable taxes quadrant stool rule 72',
    fna: 'financial needs analysis',
    emd: 'executive marketing director',
    smd: 'senior marketing director',
    gx: 'gx1 gx2 gx3',
    mlm: 'pyramid scheme multi level marketing',
    cost: 'price fee 700 all-in investment',
    hopper: 'pipeline prospect tracker'
  };

  function getRole() {
    try { return sessionStorage.getItem('hyperion_role') || 'experienced'; }
    catch (e) { return 'experienced'; }
  }

  function expandQuery(q) {
    var words = q.toLowerCase().trim().split(/\s+/).filter(Boolean);
    var out = words.slice();
    words.forEach(function (w) {
      if (ALIASES[w]) out = out.concat(ALIASES[w].split(' '));
    });
    return out.filter(function (v, i, a) { return a.indexOf(v) === i; });
  }

  function clean(s) { return (s || '').replace(/\s+/g, ' ').trim(); }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ============================================================
     INDEX BUILDING
     ============================================================ */
  var INDEX = [];
  var indexing = false;
  var indexReady = false;

  function parseDoc(html) {
    return new DOMParser().parseFromString(html, 'text/html');
  }

  /* Lost Art guide lives inside a JS string on prospecting.html —
     DOM parsing alone would miss ~41K characters of content. */
  function extractLostArt(html) {
    var m = html.match(/var LOSTART_HTML\s*=\s*"((?:[^"\\]|\\.)*)"/);
    if (!m) return null;
    try {
      return JSON.parse('"' + m[1] + '"').replace(/<\\\/script>/g, '</script>');
    } catch (e) { return null; }
  }

  function indexDocument(doc, page, extra, nested) {
    var role = getRole();
    var rows = [];

    doc.querySelectorAll(BLOCK_SEL).forEach(function (block) {
      /* role gating inside the page */
      if (role !== 'experienced') {
        if (block.closest('.exp-only')) return;
        if (block.closest('[data-roles="experienced"]')) return;
      }

      var text = clean(block.textContent);
      if (text.length < 25) return;
      if (text.length > 4000) text = text.slice(0, 4000);

      var title = '';
      var heads = block.querySelectorAll(HEAD_SEL);
      for (var hi = 0; hi < heads.length; hi++) {
        var ht = clean(heads[hi].textContent);
        if (ht.length >= 4) { title = ht; break; }
      }
      /* badges sit inside headings with no whitespace: MLM"Isn't WFG…" */
      title = title.replace(/([A-Za-z0-9])(["\u201C\u2018])/g, '$1 $2');
      if (!title || title.length < 4) title = text.slice(0, 55) + '…';
      if (title.length > 90) title = title.slice(0, 90) + '…';

      /* section context for nicer result grouping */
      var secEl = block.closest('.pg-sec, .tab, .sub-section, section');
      var section = '';
      if (secEl) {
        var sh = secEl.querySelector('h2, .sec-title, .stage-tag');
        if (sh) section = clean(sh.textContent).slice(0, 48);
      }

      rows.push({
        f: page.file, p: page.label, i: page.icon,
        t: title, x: text, s: section
      });
    });

    if (extra) rows = rows.concat(extra);

    /* Content sealed inside iframe srcdoc / <template> is invisible to a plain
       DOM sweep. presentations.html keeps its whole deck there. */
    if (!nested) {
      var embedded = [];
      doc.querySelectorAll('iframe[srcdoc]').forEach(function (fr) {
        var sd = fr.getAttribute('srcdoc');
        if (sd && sd.length > 200) embedded.push(sd);
      });
      doc.querySelectorAll('template, script[type="text/template"]').forEach(function (t) {
        var inner = t.innerHTML;
        if (inner && inner.length > 200) embedded.push(inner);
      });
      embedded.forEach(function (frag) {
        try {
          rows = rows.concat(indexDocument(parseDoc(frag), page, null, true));
        } catch (e) { /* skip malformed fragment */ }
      });
    }

    return rows;
  }

  function buildIndex(onProgress) {
    if (indexing) return Promise.resolve(INDEX);
    indexing = true;
    var role = getRole();

    /* session cache */
    try {
      if (sessionStorage.getItem(CACHE_ROLE_KEY) === role) {
        var cached = sessionStorage.getItem(CACHE_KEY);
        if (cached) {
          INDEX = JSON.parse(cached);
          indexReady = true; indexing = false;
          return Promise.resolve(INDEX);
        }
      }
    } catch (e) { /* cache unavailable, rebuild */ }

    var pages = PAGES.filter(function (p) {
      return role === 'experienced' || p.roles === 'all';
    });

    var done = 0;
    var jobs = pages.map(function (page) {
      return fetch(page.file, { credentials: 'same-origin' })
        .then(function (r) { return r.ok ? r.text() : ''; })
        .then(function (html) {
          if (!html) return [];
          var rows = indexDocument(parseDoc(html), page);

          /* pull in lazily-loaded Lost Art content */
          if (page.file === 'prospecting.html') {
            var la = extractLostArt(html);
            if (la) {
              rows = rows.concat(indexDocument(parseDoc(la), {
                file: 'prospecting.html#lostart',
                label: 'Prospecting · Lost Art',
                icon: '🚶'
              }));
            }
          }
          return rows;
        })
        .catch(function () { return []; })
        .then(function (rows) {
          done++;
          if (onProgress) onProgress(done, pages.length);
          return rows;
        });
    });

    return Promise.all(jobs).then(function (all) {
      INDEX = [].concat.apply([], all);
      indexReady = true; indexing = false;
      try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(INDEX));
        sessionStorage.setItem(CACHE_ROLE_KEY, role);
      } catch (e) { /* over quota — fine, just re-index next session */ }
      return INDEX;
    });
  }

  /* ============================================================
     SCORING
     ============================================================ */
  function score(row, words, raw) {
    var t = row.t.toLowerCase();
    var x = row.x.toLowerCase();
    var sc = 0, hits = 0;

    if (raw.length > 2) {
      if (t.indexOf(raw) !== -1) sc += 120;
      if (x.indexOf(raw) !== -1) sc += 45;
    }
    words.forEach(function (w) {
      if (w.length < 2) return;
      var inT = t.indexOf(w) !== -1;
      var inX = x.indexOf(w) !== -1;
      if (inT) { sc += 30; hits++; }
      else if (inX) { sc += 8; hits++; }
      if (inT && new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(t)) sc += 15;
    });
    if (!hits) return 0;
    if (hits < Math.min(words.length, 2)) sc -= 10;
    return sc;
  }

  function snippet(text, words, len) {
    len = len || 130;
    var low = text.toLowerCase(), pos = -1;
    for (var i = 0; i < words.length; i++) {
      var p = low.indexOf(words[i]);
      if (p !== -1 && (pos === -1 || p < pos)) pos = p;
    }
    if (pos === -1) return text.slice(0, len) + (text.length > len ? '…' : '');
    var start = Math.max(0, pos - 40);
    var end = Math.min(text.length, start + len);
    return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
  }

  function mark(text, words) {
    var out = esc(text);
    words.forEach(function (w) {
      if (w.length < 2) return;
      var re = new RegExp('(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
      out = out.replace(re, '<mark>$1</mark>');
    });
    return out;
  }

  function search(q) {
    var raw = q.toLowerCase().trim();
    var words = expandQuery(q);
    var out = [];
    for (var i = 0; i < INDEX.length; i++) {
      var s = score(INDEX[i], words, raw);
      if (s > 0) out.push({ r: INDEX[i], s: s });
    }
    out.sort(function (a, b) { return b.s - a.s; });

    /* de-dupe near-identical titles from the same page */
    var seen = {}, final = [];
    for (var j = 0; j < out.length && final.length < 40; j++) {
      var k = out[j].r.f + '|' + out[j].r.t.slice(0, 40);
      if (seen[k]) continue;
      seen[k] = 1; final.push(out[j]);
    }
    return final;
  }

  /* ============================================================
     UI
     ============================================================ */
  var elOverlay, elInput, elResults, elStatus, activeIdx = -1, lastResults = [];

  function injectStyles() {
    if (document.getElementById('hyq-styles')) return;
    var css = document.createElement('style');
    css.id = 'hyq-styles';
    css.textContent = [
      '#hyq-btn{display:inline-flex;align-items:center;gap:6px;background:rgba(201,168,76,.14);',
      'border:1px solid rgba(201,168,76,.45);color:#c9a84c;font-family:inherit;font-size:11.5px;',
      'font-weight:600;padding:5px 11px;border-radius:20px;cursor:pointer;white-space:nowrap;transition:.15s;}',
      '#hyq-btn:hover{background:rgba(201,168,76,.26);color:#e0c880;}',
      '#hyq-hopper{display:inline-flex;align-items:center;gap:6px;background:rgba(201,168,76,.14);',
      'border:1px solid rgba(201,168,76,.45);color:#c9a84c;font-family:inherit;font-size:11.5px;',
      'font-weight:600;padding:5px 11px;border-radius:20px;cursor:pointer;white-space:nowrap;',
      'text-decoration:none;transition:.15s;}',
      '#hyq-hopper:hover{background:rgba(201,168,76,.26);color:#e0c880;}',
      '#hyq-btn kbd{font-family:inherit;font-size:10px;opacity:.65;border:1px solid currentColor;',
      'border-radius:3px;padding:0 4px;margin-left:2px;}',
      '#hyq-overlay{position:fixed;inset:0;z-index:99999;display:none;background:rgba(10,18,30,.72);',
      'backdrop-filter:blur(3px);padding:8vh 16px 16px;}',
      '#hyq-overlay.open{display:block;}',
      '#hyq-box{max-width:680px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;',
      'box-shadow:0 24px 60px rgba(0,0,0,.4);border:1px solid rgba(201,168,76,.4);}',
      '#hyq-head{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid #e6e9ee;background:#1a2a42;}',
      '#hyq-head span.ic{font-size:15px;}',
      '#hyq-input{flex:1;border:none;outline:none;background:transparent;font-family:inherit;',
      'font-size:16px;color:#f7f3e9;padding:2px 0;}',
      '#hyq-input::placeholder{color:rgba(247,243,233,.42);}',
      '#hyq-esc{background:transparent;border:1px solid rgba(247,243,233,.3);color:rgba(247,243,233,.7);',
      'font-family:inherit;font-size:10.5px;border-radius:4px;padding:3px 7px;cursor:pointer;}',
      '#hyq-status{padding:9px 16px;font-size:11.5px;color:#6b7280;background:#faf9f6;border-bottom:1px solid #eef0f3;}',
      '#hyq-results{max-height:58vh;overflow-y:auto;-webkit-overflow-scrolling:touch;}',
      '.hyq-item{display:block;width:100%;text-align:left;background:none;border:none;font-family:inherit;',
      'padding:11px 16px;border-bottom:1px solid #f0f2f5;cursor:pointer;}',
      '.hyq-item:hover,.hyq-item.on{background:rgba(201,168,76,.10);}',
      '.hyq-item .pg{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#c9a84c;font-weight:700;}',
      '.hyq-item .ti{display:block;font-size:13.5px;font-weight:600;color:#1a2a42;margin:2px 0 3px;line-height:1.35;}',
      '.hyq-item .sn{display:block;font-size:11.5px;color:#5b6472;line-height:1.5;}',
      '.hyq-item mark{background:rgba(201,168,76,.35);color:inherit;padding:0 1px;border-radius:2px;}',
      '#hyq-empty{padding:26px 16px;text-align:center;color:#6b7280;font-size:13px;}',
      '@keyframes hyqPulse{0%,100%{background:rgba(201,168,76,.30);}50%{background:rgba(201,168,76,.06);}}',
      '.hyq-flash{animation:hyqPulse 1.1s ease 3;border-radius:5px;}',
      '@media(max-width:640px){#hyq-overlay{padding:0;}#hyq-box{border-radius:0;height:100%;',
      'max-width:none;display:flex;flex-direction:column;}#hyq-results{max-height:none;flex:1;}}'
    ].join('');
    document.head.appendChild(css);
  }

  function buildUI() {
    injectStyles();
    if (document.getElementById('hyq-overlay')) return;

    elOverlay = document.createElement('div');
    elOverlay.id = 'hyq-overlay';
    elOverlay.innerHTML =
      '<div id="hyq-box" role="dialog" aria-modal="true" aria-label="Search the portal">' +
      '<div id="hyq-head"><span class="ic">🔍</span>' +
      '<input id="hyq-input" type="text" autocomplete="off" spellcheck="false" ' +
      'placeholder="Search every page — scripts, objections, closes…">' +
      '<button id="hyq-esc" type="button">ESC</button></div>' +
      '<div id="hyq-status"></div><div id="hyq-results"></div></div>';
    document.body.appendChild(elOverlay);

    elInput = document.getElementById('hyq-input');
    elResults = document.getElementById('hyq-results');
    elStatus = document.getElementById('hyq-status');

    elOverlay.addEventListener('click', function (e) { if (e.target === elOverlay) close(); });
    document.getElementById('hyq-esc').addEventListener('click', close);

    var debounce;
    elInput.addEventListener('input', function () {
      clearTimeout(debounce);
      var v = this.value;
      debounce = setTimeout(function () { render(v); }, 110);
    });

    elInput.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { close(); return; }
      var items = elResults.querySelectorAll('.hyq-item');
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1, items); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1, items); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        var target = activeIdx >= 0 ? items[activeIdx] : items[0];
        if (target) target.click();
      }
    });
  }

  function move(dir, items) {
    if (!items.length) return;
    if (activeIdx >= 0 && items[activeIdx]) items[activeIdx].classList.remove('on');
    activeIdx += dir;
    if (activeIdx < 0) activeIdx = items.length - 1;
    if (activeIdx >= items.length) activeIdx = 0;
    items[activeIdx].classList.add('on');
    items[activeIdx].scrollIntoView({ block: 'nearest' });
  }

  function render(q) {
    activeIdx = -1;
    q = (q || '').trim();
    if (q.length < 2) {
      elResults.innerHTML = '';
      elStatus.textContent = indexReady
        ? 'Type at least 2 characters. ↑↓ to move, Enter to open.'
        : 'Building index…';
      return;
    }
    if (!indexReady) { elStatus.textContent = 'Building index…'; return; }

    var res = search(q);
    lastResults = res;
    var words = expandQuery(q);

    if (!res.length) {
      elResults.innerHTML = '<div id="hyq-empty">No matches for <strong>' + esc(q) + '</strong>.<br>' +
        'Try a shorter word, or an alias like <em>IUL</em>, <em>BPM</em>, <em>TLTC</em>.</div>';
      elStatus.textContent = '0 results';
      return;
    }

    elStatus.textContent = res.length + ' result' + (res.length === 1 ? '' : 's') +
      ' · ↑↓ to move, Enter to open';

    var html = res.slice(0, 30).map(function (o, i) {
      var r = o.r;
      var where = r.i + ' ' + r.p + (r.s ? ' · ' + esc(r.s) : '');
      return '<button class="hyq-item" data-i="' + i + '" type="button">' +
        '<span class="pg">' + where + '</span>' +
        '<span class="ti">' + mark(r.t, words) + '</span>' +
        '<span class="sn">' + mark(snippet(r.x, words), words) + '</span>' +
        '</button>';
    }).join('');
    elResults.innerHTML = html;

    elResults.querySelectorAll('.hyq-item').forEach(function (btn) {
      btn.addEventListener('click', function () {
        go(lastResults[parseInt(btn.getAttribute('data-i'), 10)].r, q);
      });
    });
  }

  /* ---------- navigate to a result ---------- */
  function go(row, q) {
    var file = row.f.split('#')[0];
    var here = location.pathname.split('/').pop() || 'index.html';
    var payload = encodeURIComponent(row.t.slice(0, 80)) + '|' + encodeURIComponent(q);

    if (file === here) {
      close();
      reveal(row.t, q);
    } else {
      location.href = file + '#hyq=' + payload;
    }
  }

  /* ---------- reveal hidden ancestors, scroll, flash ---------- */
  function reveal(title, q) {
    var needle = title.replace(/…$/, '').toLowerCase().slice(0, 40);
    if (!needle) return;

    var blocks = document.querySelectorAll(BLOCK_SEL);
    var hit = null;
    for (var i = 0; i < blocks.length; i++) {
      if (clean(blocks[i].textContent).toLowerCase().indexOf(needle) !== -1) { hit = blocks[i]; break; }
    }
    /* fall back to any element containing the phrase */
    if (!hit) {
      var all = document.body.querySelectorAll('h2,h3,h4,p,div,span');
      for (var j = 0; j < all.length; j++) {
        if (all[j].children.length === 0 &&
            clean(all[j].textContent).toLowerCase().indexOf(needle) !== -1) { hit = all[j]; break; }
      }
    }
    if (!hit) return;

    /* walk up and un-hide every hidden ancestor */
    var node = hit;
    while (node && node !== document.body) {
      if (node.classList) {
        ['tab', 'sub-section', 'pg-sec', 'prosp-section', 'pitch-section', 'hf-sub-section']
          .forEach(function (cls) {
            if (node.classList.contains(cls) && !node.classList.contains('active')) {
              var sibs = document.querySelectorAll('.' + cls);
              sibs.forEach(function (s) { if (s !== node) s.classList.remove('active'); });
              node.classList.add('active');
              activateNavFor(node.id);
            }
          });
      }
      if (node.style && node.style.display === 'none') node.style.display = 'block';
      var cs = window.getComputedStyle(node);
      if (cs && cs.display === 'none') node.style.display = 'block';
      node = node.parentElement;
    }

    /* Lost Art lives in an iframe — trigger its pill so it loads */
    if (!hit.offsetParent) {
      var pill = document.querySelector('[onclick*="lostart"]');
      if (pill) { try { pill.click(); } catch (e) {} }
    }

    setTimeout(function () {
      hit.scrollIntoView({ behavior: 'smooth', block: 'center' });
      hit.classList.add('hyq-flash');
      setTimeout(function () { hit.classList.remove('hyq-flash'); }, 3600);
    }, 120);
  }

  /* best-effort: light up the nav button that owns a section id */
  function activateNavFor(id) {
    if (!id) return;
    var key = id.replace(/^(tab-|sub-|pg-)/, '');
    var btns = document.querySelectorAll('button[onclick],a[onclick],.sub-tab,.pill');
    btns.forEach(function (b) {
      var oc = b.getAttribute('onclick') || '';
      if (oc.indexOf("'" + key + "'") !== -1) {
        var group = b.parentElement ? b.parentElement.children : [];
        Array.prototype.forEach.call(group, function (g) { g.classList && g.classList.remove('active'); });
        b.classList.add('active');
      }
    });
  }

  /* ---------- open / close ---------- */
  function open() {
    buildUI();
    elOverlay.classList.add('open');
    elInput.value = '';
    elResults.innerHTML = '';
    elStatus.textContent = indexReady ? 'Type at least 2 characters.' : 'Building index…';
    setTimeout(function () { elInput.focus(); }, 40);

    if (!indexReady) {
      buildIndex(function (d, t) {
        if (elStatus) elStatus.textContent = 'Building index… ' + d + '/' + t + ' pages';
      }).then(function () {
        if (elStatus) {
          elStatus.textContent = INDEX.length + ' sections ready. Type to search.';
        }
        if (elInput && elInput.value.trim().length >= 2) render(elInput.value);
      });
    }
  }

  function close() {
    if (elOverlay) elOverlay.classList.remove('open');
  }

  /* ---------- global keyboard ---------- */
  document.addEventListener('keydown', function (e) {
    var mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); open(); return; }
    /* "/" opens search unless typing in a field */
    if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || '')) &&
        !e.target.isContentEditable) {
      e.preventDefault(); open();
    }
  });

  /* ---------- mount the controls in the top bar ---------- */
  /* Page headers are not identical across the portal:
       most pages   -> #sys-topbar > .actions
       mission-hq   -> #sys-topbar > .topbar-actions
       call-guide   -> .page-top  (no actions wrapper at all)
     Find whichever exists, and build a wrapper if there isn't one. */
  function findHost() {
    var direct = document.querySelector('#sys-topbar .actions')
              || document.querySelector('#sys-topbar .topbar-actions');
    if (direct) return direct;

    var bar = document.querySelector('#sys-topbar') || document.querySelector('.page-top');
    if (!bar) return null;

    var wrap = document.getElementById('hyq-actions');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'hyq-actions';
      wrap.style.cssText = 'display:inline-flex;align-items:center;gap:8px;margin-left:auto;';
      bar.appendChild(wrap);
    }
    return wrap;
  }

  function mountButton() {
    var host = findHost();
    if (!host || document.getElementById('hyq-btn')) return;

    var search = document.createElement('button');
    search.id = 'hyq-btn';
    search.type = 'button';
    search.innerHTML = '🔍 Search <kbd>⌘K</kbd>';
    search.addEventListener('click', open);

    var hopper = document.createElement('a');
    hopper.id = 'hyq-hopper';
    hopper.href = 'https://hyperionlegacy.com/hopper-start.html';
    hopper.innerHTML = '🔀 Hopper';
    hopper.title = 'Hyperion Hopper — Pipeline';

    host.insertBefore(hopper, host.firstChild);
    host.insertBefore(search, host.firstChild);
  }

  /* ---------- handle arriving from another page ---------- */
  function handleHash() {
    var m = location.hash.match(/hyq=([^&]*)/);
    if (!m) return;
    var parts = m[1].split('|');
    var title = decodeURIComponent(parts[0] || '');
    var q = decodeURIComponent(parts[1] || '');
    history.replaceState(null, '', location.pathname + location.search);
    if (title) setTimeout(function () { reveal(title, q); }, 420);
  }

  function init() {
    mountButton();
    handleHash();
    /* warm the index quietly once the page is idle */
    if (typeof window.requestIdleCallback === 'function') {
      requestIdleCallback(function () { buildIndex(); }, { timeout: 4000 });
    } else {
      setTimeout(function () { buildIndex(); }, 2500);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }

  window.HyperionSearch = { open: open, close: close, rebuild: function () {
    try { sessionStorage.removeItem(CACHE_KEY); } catch (e) {}
    INDEX = []; indexReady = false; return buildIndex();
  } };
})();
