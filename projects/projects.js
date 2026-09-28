/* ============================================================
   项目展示页 /projects/
   · 数据来自 GitHub 公开接口（只读），浏览器缓存 6 小时
   · 接口不可用（匿名额度用完 / 断网）时用 projects-data.js 里的兜底清单
   · 白名单式的「人话」说明放在 projects-data.js，不碰接口也不改代码逻辑
   ============================================================ */
(function () {
  'use strict';

  var CFG = window.MINGHZ_PROJECTS || {};
  var USER = CFG.user || 'MiNgOfficial-HZ';
  var API = 'https://api.github.com/users/' + encodeURIComponent(USER) + '/repos?per_page=100&sort=pushed&direction=desc';
  var LS_KEY = 'minghz.gh.repos.v1';
  var THEME_KEY = 'minghz.theme';

  var state = {
    repos: [],       // 已归一化的项目
    source: '',      // 'live' | 'cache' | 'fallback'
    updatedAt: 0,    // 数据时间（毫秒）
    q: '',
    cat: 'all',
    lang: 'all',
    sort: 'pushed',
    showFork: false
  };

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ---------- 主题 / 菜单 / 字体 / 年份（与其它页面一致） ---------- */
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
    var b = $('#themeToggle');
    if (b) b.textContent = t === 'dark' ? '🌙' : '☀️';
  }
  (function themeBoot() {
    var t = 'light';
    try { t = localStorage.getItem(THEME_KEY) || 'light'; } catch (e) {}
    applyTheme(t);
    var tb = $('#themeToggle');
    if (tb) tb.addEventListener('click', function () {
      applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    });
    var mt = $('#menuToggle'), nav = $('#mainNav');
    if (mt && nav) mt.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      mt.setAttribute('aria-expanded', String(open));
      mt.textContent = open ? '✕' : '☰';
    });
    var fontLink = $('#gfontLink');
    if (fontLink) {
      var enableFonts = function () { if (fontLink.media !== 'all') fontLink.media = 'all'; };
      if (fontLink.sheet) enableFonts();
      else { fontLink.addEventListener('load', enableFonts); setTimeout(enableFonts, 3000); }
    }
    var year = $('#year');
    if (year) year.textContent = new Date().getFullYear();
  })();

  /* ---------- 小工具 ---------- */
  function lower(s) { return String(s || '').toLowerCase(); }
  function metaOf(name) { return (CFG.meta && CFG.meta[lower(name)]) || {}; }

  function rel(iso) {
    if (!iso) return '未知';
    var t = new Date(iso).getTime();
    if (!t) return '未知';
    var d = Date.now() - t;
    if (d < 0) d = 0;
    var min = Math.floor(d / 60000);
    if (min < 1) return '刚刚';
    if (min < 60) return min + ' 分钟前';
    var hr = Math.floor(min / 60);
    if (hr < 24) return hr + ' 小时前';
    var day = Math.floor(hr / 24);
    if (day < 30) return day + ' 天前';
    var mon = Math.floor(day / 30);
    if (mon < 12) return mon + ' 个月前';
    return Math.floor(mon / 12) + ' 年前';
  }
  function fmtDate(ms) {
    var d = new Date(ms);
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  var LANG_COLOR = {
    JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572A5', Java: '#b07219',
    HTML: '#e34c26', CSS: '#563d7c', SCSS: '#c6538c', C: '#555555', 'C++': '#f34b7d',
    'C#': '#178600', Go: '#00ADD8', Rust: '#dea584', Shell: '#89e051', Ruby: '#701516',
    PHP: '#4F5D95', Swift: '#F05138', Kotlin: '#A97BFF', Vue: '#41b883', Lua: '#000080',
    Dart: '#00B4AB', Jupyter: '#DA5B0B', 'Jupyter Notebook': '#DA5B0B', MATLAB: '#e16737',
    Assembly: '#6E4C13', PowerShell: '#012456', Batchfile: '#C1F12E'
  };
  function langColor(l) { return LANG_COLOR[l] || '#8b8b93'; }

  /* ---------- 归一化 ---------- */
  function normalize(r) {
    var m = metaOf(r.name);
    return {
      name: r.name || '',
      url: r.html_url || ('https://github.com/' + USER + '/' + r.name),
      ghDesc: (r.description || '').replace(/\s+-\s+Contribute to .*$/i, '').trim(),
      zh: m.zh || '',
      emoji: m.emoji || '📦',
      category: m.category || '其他',
      tags: (m.tags || []).slice(0, 4),
      site: m.site || r.homepage || '',
      lang: r.language || '',
      stars: r.stargazers_count || 0,
      forks: r.forks_count || 0,
      updatedIso: r.pushed_at || r.updated_at || '',
      updated: r.pushed_at ? new Date(r.pushed_at).getTime() : 0,
      fork: !!r.fork,
      archived: !!r.archived,
      topics: r.topics || []
    };
  }

  function visible(list) {
    var hidden = (CFG.hidden || []).map(lower);
    return list.filter(function (r) { return hidden.indexOf(lower(r.name)) < 0; }).map(normalize);
  }

  /* ---------- 状态行 ---------- */
  function renderStatus() {
    var el = $('#projStats');
    if (!el) return;
    var n = state.repos.length;
    var langs = {};
    state.repos.forEach(function (r) { if (r.lang) langs[r.lang] = 1; });
    var latest = state.repos.reduce(function (a, r) { return Math.max(a, r.updated || 0); }, 0);
    var tag, tip;
    if (state.source === 'live') { tag = '<span class="live">● 已同步 GitHub</span>'; }
    else if (state.source === 'cache') { tag = '<span class="cached">● 本地缓存</span>'; }
    else { tag = '<span class="cached">● 最近一次清单</span>'; }
    tip = state.updatedAt ? '数据时间 ' + fmtDate(state.updatedAt) : '';
    el.innerHTML = tag +
      '<span class="dot">·</span><span>公开仓库 <b>' + n + '</b></span>' +
      '<span class="dot">·</span><span>语言 <b>' + Object.keys(langs).length + '</b> 种</span>' +
      (latest ? '<span class="dot">·</span><span>最近更新 <b>' + rel(new Date(latest).toISOString()) + '</b></span>' : '') +
      (tip ? '<span class="dot">·</span><span>' + esc(tip) + '</span>' : '');
  }

  function note(msg) {
    var el = $('#projNote');
    if (!el) return;
    if (!msg) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    el.innerHTML = msg;
  }

  /* ---------- 筛选 chips ---------- */
  function renderChips() {
    /* 计数只算「这会儿能看到的」：归档的不算，Fork 看开关 */
    var pool = state.repos.filter(function (r) {
      if (r.archived) return false;
      if (r.fork && !state.showFork) return false;
      return true;
    });
    var cats = {}, langs = {};
    pool.forEach(function (r) {
      cats[r.category] = (cats[r.category] || 0) + 1;
      var l = r.lang || '其他';
      langs[l] = (langs[l] || 0) + 1;
    });

    var catHtml = ['<button class="proj-chip' + (state.cat === 'all' ? ' on' : '') + '" type="button" data-cat="all">全部 <span class="cnt">' + pool.length + '</span></button>'];
    Object.keys(cats).sort(function (a, b) { return cats[b] - cats[a]; }).forEach(function (c) {
      catHtml.push('<button class="proj-chip' + (state.cat === c ? ' on' : '') + '" type="button" data-cat="' + esc(c) + '">' +
        esc(c) + ' <span class="cnt">' + cats[c] + '</span></button>');
    });
    var hasFork = state.repos.some(function (r) { return r.fork && !r.archived; });
    if (hasFork) {
      catHtml.push('<button class="proj-chip fork-toggle' + (state.showFork ? ' on' : '') + '" type="button" data-fork="1">🍴 ' +
        (state.showFork ? '已显示 Fork' : '含 Fork 项目') + '</button>');
    }
    var catsEl = $('#projCats');
    if (catsEl) catsEl.innerHTML = catHtml.join('');

    var langHtml = ['<button class="proj-chip' + (state.lang === 'all' ? ' on' : '') + '" type="button" data-lang="all">全部语言</button>'];
    Object.keys(langs).sort(function (a, b) { return langs[b] - langs[a]; }).forEach(function (l) {
      langHtml.push('<button class="proj-chip' + (state.lang === l ? ' on' : '') + '" type="button" data-lang="' + esc(l) + '">' +
        '<i class="proj-lang-dot" style="background:' + langColor(l === '其他' ? '' : l) + '"></i>' + esc(l) +
        ' <span class="cnt">' + langs[l] + '</span></button>');
    });
    var langsEl = $('#projLangs');
    if (langsEl) langsEl.innerHTML = langHtml.join('');
  }

  /* ---------- 卡片 ---------- */
  function badges(r, featured) {
    var out = [];
    if (featured) out.push('<span class="proj-badge star">⭐ 精选</span>');
    if (r.archived) out.push('<span class="proj-badge archived">📦 已归档</span>');
    if (r.fork) out.push('<span class="proj-badge fork">🍴 Fork</span>');
    return out.length ? '<div class="proj-badges">' + out.join('') + '</div>' : '';
  }

  function cardHtml(r, i, featured) {
    var desc = r.zh || r.ghDesc;
    var links = ['<a class="primary" href="' + esc(r.url) + '" target="_blank" rel="noopener noreferrer">打开仓库 ↗</a>'];
    if (r.site) links.push('<a href="' + esc(r.site) + '" target="_blank" rel="noopener noreferrer">在线预览 ↗</a>');
    var tags = r.tags.length
      ? '<div class="proj-tags">' + r.tags.map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join('') + '</div>'
      : '';
    var meta = ['<span class="mlang"><i class="proj-lang-dot" style="background:' + langColor(r.lang) + '"></i>' + esc(r.lang || '未标注语言') + '</span>'];
    if (r.stars > 0) meta.push('<span>★ ' + r.stars + '</span>');
    if (r.forks > 0) meta.push('<span>🍴 ' + r.forks + '</span>');
    meta.push('<span>更新于 ' + esc(rel(r.updatedIso)) + '</span>');

    return '<article class="proj-card' + (featured ? ' is-featured' : '') + '" style="--rd:' + Math.min(i * 60, 360) + 'ms">' +
      '<div class="proj-card-top">' +
        '<span class="proj-emoji" aria-hidden="true">' + esc(r.emoji) + '</span>' +
        '<div class="proj-headline">' +
          '<p class="proj-name"><a href="' + esc(r.url) + '" target="_blank" rel="noopener noreferrer">' + esc(r.name) + '</a></p>' +
          badges(r, featured) +
        '</div>' +
      '</div>' +
      (desc ? '<p class="proj-desc' + (r.zh ? '' : ' en') + '">' + esc(desc) + '</p>' : '') +
      tags +
      '<div class="proj-meta">' + meta.join('') + '</div>' +
      '<div class="proj-links">' + links.join('') + '</div>' +
    '</article>';
  }

  /* ---------- 渲染 ---------- */
  function filtered() {
    var q = lower(state.q.trim());
    var list = state.repos.filter(function (r) {
      if (r.archived) return false;
      if (r.fork && !state.showFork) return false;
      if (state.cat !== 'all' && r.category !== state.cat) return false;
      if (state.lang !== 'all' && (r.lang || '其他') !== state.lang) return false;
      if (!q) return true;
      var hay = [r.name, r.zh, r.ghDesc, r.lang, r.category, (r.tags || []).join(' '), (r.topics || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
    if (state.sort === 'stars') list.sort(function (a, b) { return b.stars - a.stars || b.updated - a.updated; });
    else if (state.sort === 'name') list.sort(function (a, b) { return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1; });
    else list.sort(function (a, b) { return b.updated - a.updated; });
    return list;
  }

  function featuredList() {
    var order = CFG.featured || [];
    var out = [];
    order.forEach(function (name) {
      var hit = state.repos.filter(function (r) { return lower(r.name) === lower(name); })[0];
      if (hit && !hit.archived && (!hit.fork || state.showFork)) out.push(hit);
    });
    return out;
  }

  function render() {
    var list = filtered();
    var feat = featuredList();
    var filtering = !!(state.q.trim() || state.cat !== 'all' || state.lang !== 'all');

    var wrap = $('#projFeaturedWrap');
    if (wrap) {
      var showFeat = !filtering && feat.length > 0;
      wrap.hidden = !showFeat;
      if (showFeat) $('#projFeatured').innerHTML = feat.map(function (r, i) { return cardHtml(r, i, true); }).join('');
    }

    var grid = $('#projGrid');
    if (grid) grid.innerHTML = list.map(function (r, i) { return cardHtml(r, i, false); }).join('');

    var empty = $('#projEmpty');
    if (empty) empty.hidden = list.length > 0;

    var sub = $('#projAllSub');
    if (sub) {
      sub.textContent = filtering
        ? '筛出 ' + list.length + ' 个（共 ' + state.repos.length + ' 个公开仓库）'
        : '按最近更新排；点卡片上的按钮去 GitHub 看代码。';
    }

    renderChips();
    renderStatus();
  }

  /* ---------- 数据：缓存 → 网络 → 兜底 ---------- */
  function setRepos(rawList, source, updatedAt) {
    state.repos = visible(rawList || []);
    state.source = source;
    state.updatedAt = updatedAt || Date.now();
    render();
  }

  function readCache() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (!obj || !obj.repos || !obj.repos.length) return null;
      return obj;
    } catch (e) { return null; }
  }
  function writeCache(list) {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ t: Date.now(), repos: list })); } catch (e) {}
  }

  function useFallback(reasonHtml) {
    var fb = CFG.fallback || [];
    var when = CFG.fallbackUpdatedAt ? new Date(CFG.fallbackUpdatedAt + 'T00:00:00') : new Date();
    setRepos(fb, 'fallback', when.getTime());
    if (reasonHtml) note(reasonHtml);
  }

  function load(force) {
    var cache = readCache();
    var ttl = CFG.cacheTtlMs || 6 * 60 * 60 * 1000;
    if (cache && !force) {
      setRepos(cache.repos, 'cache', cache.t);
      if (Date.now() - cache.t < ttl) return;   // 缓存还新鲜，就不打扰 GitHub
    } else if (!cache && !force) {
      var grid = $('#projGrid');
      if (grid) grid.innerHTML = '<p class="proj-loading">正在从 GitHub 读取项目…</p>';
    }

    var btn = $('#projRefresh');
    if (btn) { btn.disabled = true; btn.textContent = '↻ 读取中…'; }

    fetch(API, { headers: { 'Accept': 'application/vnd.github+json' }, cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) {
          var reset = res.headers.get('x-ratelimit-reset');
          var e = new Error('HTTP ' + res.status);
          e.status = res.status;
          e.reset = reset ? parseInt(reset, 10) * 1000 : 0;
          throw e;
        }
        return res.json();
      })
      .then(function (list) {
        if (!Array.isArray(list)) throw new Error('bad payload');
        writeCache(list);
        setRepos(list, 'live', Date.now());
        note('');
      })
      .catch(function (err) {
        var msg;
        if (err && (err.status === 403 || err.status === 429)) {
          msg = 'GitHub 的匿名调用额度暂时用完了（同一个出口 IP 每小时 60 次）。下面先显示<b>最近一次抓到的清单</b>，额度大约在 <b>' +
            (err.reset ? fmtDate(err.reset) : '一小时内') + '</b> 恢复。';
        } else {
          msg = '这会儿读不到 GitHub（可能断网或被浏览器拦下了），下面先显示<b>最近一次抓到的清单</b>。';
        }
        if (cache) { setRepos(cache.repos, 'cache', cache.t); note(msg + ' 这张缓存的时间是 ' + fmtDate(cache.t) + '。'); }
        else { useFallback(msg + ' 这份清单的时间是 ' + esc(CFG.fallbackUpdatedAt || '—') + '。'); }
      })
      .then(function () {
        if (btn) { btn.disabled = false; btn.textContent = '↻ 刷新'; }
      });
  }

  /* ---------- 事件 ---------- */
  function bind() {
    var search = $('#projSearch');
    if (search) {
      var timer = null;
      search.addEventListener('input', function () {
        clearTimeout(timer);
        timer = setTimeout(function () { state.q = search.value || ''; render(); }, 120);
      });
    }
    var sort = $('#projSort');
    if (sort) sort.addEventListener('change', function () { state.sort = sort.value; render(); });

    var btn = $('#projRefresh');
    if (btn) btn.addEventListener('click', function () { load(true); });

    var cats = $('#projCats');
    if (cats) cats.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button') : null;
      if (!b) return;
      if (b.hasAttribute('data-fork')) { state.showFork = !state.showFork; }
      else if (b.hasAttribute('data-cat')) { state.cat = b.getAttribute('data-cat'); }
      else return;
      render();
    });
    var langs = $('#projLangs');
    if (langs) langs.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button') : null;
      if (!b || !b.hasAttribute('data-lang')) return;
      state.lang = b.getAttribute('data-lang');
      render();
    });

    document.addEventListener('keydown', function (e) {
      var tag = (e.target && e.target.tagName) || '';
      var typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if (e.key === '/' && !typing) { e.preventDefault(); if (search) search.focus(); }
      if (e.key === 'Escape' && typing && e.target === search && search.value) {
        search.value = ''; state.q = ''; render();
      }
    });
  }

  /* ---------- 启动 ---------- */
  bind();
  load(false);
})();
