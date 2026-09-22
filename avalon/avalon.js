/* 阿瓦隆三级页：把 avalon-data.js 里的内容渲染成流程 / 人物卡片 / 人数表 / 术语 / FAQ */
(function () {
  'use strict';
  var A = window.AVALON;
  if (!A) return;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var campClass = function (c) { return c === 'evil' ? 'is-evil' : (c === 'item' ? 'is-item' : 'is-good'); };
  var campPill = function (c) {
    return '<span class="av-pill camp-' + esc(c) + '">' + esc(A.campName(c)) + '</span>';
  };

  /* ---------- 主题 / 菜单 / 页脚年份 ---------- */
  (function chrome() {
    var THEME_KEY = 'minghz.theme';
    function applyTheme(t) {
      document.documentElement.setAttribute('data-theme', t);
      try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
      var b = $('#themeToggle'); if (b) b.textContent = t === 'dark' ? '🌙' : '☀️';
    }
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
    var y = $('#year'); if (y) y.textContent = String(new Date().getFullYear());
    var link = document.getElementById('gfontLink');
    if (link) {
      var on = function () { if (link.media !== 'all') link.media = 'all'; };
      if (link.sheet) on(); else { link.addEventListener('load', on); setTimeout(on, 3000); }
    }
  })();

  /* ---------- 流程 ---------- */
  (function flow() {
    var el = $('#avFlow');
    if (!el) return;
    el.innerHTML = A.flow.map(function (s) {
      return '<div class="av-step reveal-step">' +
        '<div class="av-step-k">' + esc(s.k) + '</div>' +
        '<div><div class="av-step-t">' + esc(s.t) + '</div>' +
        '<div class="av-step-d">' + esc(s.d) + '</div></div></div>';
    }).join('');
  })();

  /* ---------- 人物卡片 ---------- */
  (function cards() {
    var el = $('#avRoles');
    if (!el) return;
    var order = A.order.slice().sort(function (a, b) {
      var ra = A.roles[a], rb = A.roles[b];
      var rank = function (r) { return r.camp === 'good' ? 0 : (r.camp === 'evil' ? 1 : 2); };
      return rank(ra) - rank(rb);
    });
    el.innerHTML = order.map(function (k) {
      var r = A.roles[k];
      if (!r) return '';
      return '<a class="av-card ' + campClass(r.camp) + '" href="/avalon/roles/' + esc(k) + '/">' +
        '<div class="av-card-top">' +
          '<span class="av-card-ico">' + esc(r.icon) + '</span>' +
          '<span><span class="av-card-name">' + esc(r.name) + '</span>' +
          '<span class="av-card-en">' + esc(r.en) + '</span></span>' +
        '</div>' +
        '<div>' + campPill(r.camp) + '</div>' +
        '<p class="av-card-tag">' + esc(r.tagline) + '</p>' +
        '<div class="av-card-foot"><span class="av-card-cta">他知道什么 · 怎么玩 →</span></div>' +
      '</a>';
    }).join('');
  })();

  /* ---------- 人数配置表 ---------- */
  (function table() {
    var body = $('#avTable tbody');
    if (!body) return;
    var rows = [];
    for (var n = 5; n <= 10; n++) {
      var p = A.presets[n];
      var label = function (arr, k) {
        var total = arr.filter(function (x) { return x === k; }).length;
        return A.roles[k].name + (total > 1 ? ' ×' + total : '');
      };
      var uniq = [];
      p.good.forEach(function (k) { if (uniq.indexOf(k) < 0) uniq.push(k); });
      var goodNames = uniq.map(function (k) { return label(p.good, k); }).join('、');
      var evilNames = p.evil.map(function (k) { return A.roles[k].name; }).join('、');
      var quests = A.questSize[n].map(function (size, i) {
        var two = A.failNeed(n, i + 1) === 2;
        return '<td>' + size + ' 人' + (two ? '<br /><span class="evil" style="font-size:0.7rem">需 2 张失败</span>' : '') + '</td>';
      }).join('');
      rows.push('<tr>' +
        '<td class="av-strong">' + n + ' 人</td>' +
        '<td class="good">' + p.good.length + ' 人</td>' +
        '<td class="evil">' + p.evil.length + ' 人</td>' +
        quests +
        '<td style="text-align:left"><span class="good">' + esc(goodNames) + '</span><br /><span class="evil">' + esc(evilNames) + '</span></td>' +
      '</tr>');
    }
    body.innerHTML = rows.join('');
  })();

  /* ---------- 术语 / FAQ ---------- */
  (function glossary() {
    var t = $('#avTerms');
    if (t) t.innerHTML = A.terms.map(function (x) {
      return '<div class="av-term"><b>' + esc(x.t) + '</b><p>' + esc(x.d) + '</p></div>';
    }).join('');
    var f = $('#avFaq');
    if (f) f.innerHTML = A.faq.map(function (x, i) {
      return '<details' + (i === 0 ? ' open' : '') + '><summary>' + esc(x.q) + '</summary><p>' + esc(x.a) + '</p></details>';
    }).join('');
  })();

  /* ---------- 页内导航：高亮 + 平滑滚动 ---------- */
  (function tabs() {
    var tabs = Array.prototype.slice.call(document.querySelectorAll('.av-tab'));
    if (!tabs.length) return;
    var ids = tabs.map(function (a) { return a.getAttribute('href').slice(1); });
    tabs.forEach(function (a) {
      a.addEventListener('click', function (e) {
        var target = document.getElementById(a.getAttribute('href').slice(1));
        if (!target) return;
        e.preventDefault();
        var top = target.getBoundingClientRect().top + window.pageYOffset - 96;
        window.scrollTo({ top: top, behavior: 'smooth' });
        history.replaceState(null, '', a.getAttribute('href'));
      });
    });
    var tick = function () {
      var y = window.pageYOffset + 140, best = ids[0];
      ids.forEach(function (id) {
        var el = document.getElementById(id);
        if (el && el.offsetTop <= y) best = id;
      });
      tabs.forEach(function (a) { a.classList.toggle('on', a.getAttribute('href') === '#' + best); });
    };
    window.addEventListener('scroll', tick, { passive: true });
    tick();
  })();
})();
