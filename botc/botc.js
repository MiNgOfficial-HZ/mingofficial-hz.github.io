/* 血染钟楼三级页：把 botc-data.js 里的内容渲染成流程 / 角色卡片 / 配板表 / 夜序 / 术语 / FAQ */
(function () {
  'use strict';
  var B = window.BOTC;
  if (!B) return;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var campPill = function (c) {
    return '<span class="av-pill camp-' + esc(c) + '">' + esc(B.campName(c)) + '</span>';
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
    var el = $('#btFlow');
    if (!el) return;
    el.innerHTML = B.flow.map(function (s) {
      return '<div class="av-step reveal-step">' +
        '<div class="av-step-k">' + esc(s.k) + '</div>' +
        '<div><div class="av-step-t">' + esc(s.t) + '</div>' +
        '<div class="av-step-d">' + esc(s.d) + '</div></div></div>';
    }).join('');
  })();

  /* ---------- 角色卡片（镇民 → 外来者 → 爪牙 → 恶魔） ---------- */
  (function cards() {
    var el = $('#btRoles');
    if (!el) return;
    var groups = [
      { title: '镇民 · Townsfolk', list: B.townsfolk },
      { title: '外来者 · Outsider', list: B.outsiders },
      { title: '爪牙 · Minion', list: B.minions },
      { title: '恶魔 · Demon', list: B.demons }
    ];
    el.innerHTML = groups.map(function (g) {
      return '<div class="bt-group" style="grid-column:1/-1;margin-top:8px">' +
        '<p class="av-eyebrow" style="margin:0">' + esc(g.title) + ' · ' + g.list.length + ' 个</p></div>' +
        g.list.map(function (k) {
          var r = B.roles[k];
          if (!r) return '';
          return '<a class="av-card is-' + esc(r.camp) + '" href="/botc/roles/' + esc(k) + '/">' +
            '<div class="av-card-top">' +
              '<span class="av-card-ico">' + esc(r.icon) + '</span>' +
              '<span><span class="av-card-name">' + esc(r.name) + '</span>' +
              '<span class="av-card-en">' + esc(r.en) + '</span></span>' +
            '</div>' +
            '<div>' + campPill(r.camp) + '</div>' +
            '<p class="av-card-tag">' + esc(r.tagline) + '</p>' +
            '<div class="av-card-foot"><span class="av-card-cta">官方能力 · 怎么玩 →</span></div>' +
          '</a>';
        }).join('');
    }).join('');
  })();

  /* ---------- 配板表 ---------- */
  (function table() {
    var body = $('#btTable tbody');
    if (!body) return;
    var rows = [];
    for (var n = 5; n <= 15; n++) {
      var c = B.counts[n];
      var bc = B.countsFor(n, true);
      rows.push('<tr>' +
        '<td class="av-strong">' + n + ' 人</td>' +
        '<td>' + c.townsfolk + '</td>' +
        '<td>' + c.outsider + '</td>' +
        '<td>' + c.minion + '</td>' +
        '<td>' + c.demon + '</td>' +
        '<td class="av-strong">' + (c.townsfolk + c.outsider + c.minion + c.demon) + '</td>' +
        '<td style="text-align:left;font-size:0.8rem;color:var(--muted)">' +
          '镇民 ' + bc.townsfolk + ' · 外来者 <b style="color:var(--av-item)">' + bc.outsider + '</b>' +
        '</td>' +
      '</tr>');
    }
    body.innerHTML = rows.join('');
  })();

  /* ---------- 夜晚顺序 ---------- */
  (function nights() {
    var el = $('#btNights');
    if (!el) return;
    var list = function (arr) {
      return '<div class="nt-list">' + arr.map(function (x, i) {
        var special = x.key === 'minion_info' || x.key === 'demon_info';
        var link = B.roles[x.key] ? '<a class="nt-name" href="/botc/roles/' + esc(x.key) + '/">' + esc(x.name) + '</a>' : '<span class="nt-name">' + esc(x.name) + '</span>';
        return '<div class="nt-item' + (special ? ' is-special' : '') + '">' +
          '<div class="nt-k">' + ('0' + (i + 1)).slice(-2) + '</div>' +
          '<div>' + link + '<div class="nt-note">' + esc(x.note) + '</div></div>' +
        '</div>';
      }).join('') + '</div>';
    };
    var idle = B.noNight.map(function (k) { return B.roles[k] ? B.roles[k].icon + ' ' + B.roles[k].name : k; });
    el.innerHTML =
      '<div class="bt-night"><h3>🌙 首夜（第 1 晚）</h3>' +
        '<p class="bt-night-sub">先让坏人认脸，再按顺序把有首夜能力的角色一个个叫醒。第一夜没有人会死。</p>' +
        list(B.nightFirst) + '</div>' +
      '<div class="bt-night"><h3>🌘 之后的每个夜晚</h3>' +
        '<p class="bt-night-sub">恶魔从第 2 夜开始杀人；如果被恶魔杀的人里有渡鸦看守，他会在当晚被单独叫醒。</p>' +
        list(B.nightOther) +
        '<p class="av-hint" style="margin-top:14px">全程不需要在夜里睁眼的角色：' + esc(idle.join('、')) + '。</p>' +
      '</div>';
  })();

  /* ---------- 术语 / FAQ ---------- */
  (function glossary() {
    var t = $('#btTerms');
    if (t) t.innerHTML = B.terms.map(function (x) {
      return '<div class="av-term"><b>' + esc(x.t) + '</b><p>' + esc(x.d) + '</p></div>';
    }).join('');
    var f = $('#btFaq');
    if (f) f.innerHTML = B.faq.map(function (x, i) {
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
