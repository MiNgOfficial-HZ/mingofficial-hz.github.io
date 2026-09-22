/* 阿瓦隆四级页：单个角色的详情（他知道什么 / 不知道什么 / 能力 / 提倡的玩法 / 常见误区）
   页面本体是 9 个极薄的 index.html，共用这一份渲染器 + avalon-data.js 的数据 */
(function () {
  'use strict';
  var A = window.AVALON;
  if (!A) return;
  var key = document.body.getAttribute('data-role') || '';
  var r = A.roles[key];
  var app = document.getElementById('roleApp');
  if (!r || !app) return;

  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var campName = A.campName(r.camp);
  var list = function (arr) { return '<ul>' + (arr || []).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>'; };
  var idx = A.order.indexOf(key);
  var prev = A.roles[A.order[(idx - 1 + A.order.length) % A.order.length]];
  var next = A.roles[A.order[(idx + 1) % A.order.length]];

  var plays = (r.plays || []).map(function (p, i) {
    return '<div class="play-item"><div class="play-no">' + (i + 1 < 10 ? '0' : '') + (i + 1) + '</div>' +
      '<div><div class="play-t">' + esc(p.t) + '</div><div class="play-d">' + esc(p.d) + '</div></div></div>';
  }).join('');

  var traps = (r.traps || []).map(function (t) {
    return '<div class="trap-item"><span>⚠️</span><span>' + esc(t) + '</span></div>';
  }).join('');

  var relates = (r.relates || []).map(function (x) {
    var rr = A.roles[x.key];
    if (!rr) return '';
    return '<a class="relate-chip" href="/avalon/roles/' + esc(rr.key) + '/">' +
      esc(rr.icon) + ' <b>' + esc(rr.name) + '</b> <span class="note">' + esc(x.note) + '</span></a>';
  }).join('');

  app.innerHTML =
    '<section class="role-head"><div class="container">' +
      '<p class="av-crumbs"><a href="/#home">首页</a> › <a href="/#friends">MiNg 和他的朋友们</a> › ' +
      '<a href="/avalon/">阿瓦隆</a> › <b>' + esc(r.name) + '</b></p>' +
      '<div class="role-hd">' +
        '<span class="role-ico">' + esc(r.icon) + '</span>' +
        '<div><div class="role-name">' + esc(r.name) + '</div>' +
        '<div class="role-en">' + esc(r.en) + '</div></div>' +
        '<span class="av-pill camp-' + esc(r.camp) + '" style="margin-left:auto">' + esc(campName) + '</span>' +
      '</div>' +
      '<p class="role-tag">' + esc(r.tagline) + '</p>' +
      (r.oneLine ? '<p class="av-sub" style="margin-top:8px">' + esc(r.oneLine) + '</p>' : '') +
    '</div></section>' +

    '<section class="av-band"><div class="container">' +
      '<p class="av-eyebrow">WHAT YOU SEE · 视野</p>' +
      '<h2 class="av-h2">他知道什么，不知道什么</h2>' +
      '<div class="role-cols" style="margin-top:18px">' +
        '<div class="role-box knows"><h3>✅ 他知道</h3>' + list(r.knows) + '</div>' +
        '<div class="role-box unknown"><h3 style="color:var(--muted)">❌ 他不知道</h3>' + list(r.unknown) + '</div>' +
      '</div>' +
      (r.ability && r.ability.length
        ? '<div class="role-box ability" style="margin-top:16px"><h3>✦ 他的能力</h3>' + list(r.ability) + '</div>'
        : '') +
    '</div></section>' +

    '<section class="av-band av-band-alt"><div class="container">' +
      '<p class="av-eyebrow">HOW TO PLAY · 玩法</p>' +
      '<h2 class="av-h2">提倡这样玩</h2>' +
      '<p class="av-sub">同一个角色在不同桌上有很多种打法，下面是相对通用、也最容易被队友接住的几条。</p>' +
      '<div class="play-list">' + plays + '</div>' +
      (traps ? '<h3 style="margin-top:26px;font-size:1rem">🚫 常见的翻车方式</h3><div class="trap-list">' + traps + '</div>' : '') +
      (r.tip ? '<div class="tip-box"><b>一句话记住它：</b>' + esc(r.tip) + '</div>' : '') +
      (relates ? '<h3 style="margin-top:24px;font-size:1rem">🔗 和谁关系最大</h3><div class="relate-row">' + relates + '</div>' : '') +
    '</div></section>' +

    '<section class="av-band"><div class="container">' +
      '<div class="role-cols">' +
        '<a class="av-launch-card" href="/avalon/roles/' + esc(prev.key) + '/"><div class="av-card-en">上一个角色</div>' +
          '<h3>' + esc(prev.icon) + ' ' + esc(prev.name) + '</h3><p class="g-card-sub">' + esc(prev.tagline) + '</p></a>' +
        '<a class="av-launch-card" href="/avalon/roles/' + esc(next.key) + '/"><div class="av-card-en">下一个角色</div>' +
          '<h3>' + esc(next.icon) + ' ' + esc(next.name) + '</h3><p class="g-card-sub">' + esc(next.tagline) + '</p></a>' +
      '</div>' +
      '<div class="av-head-actions">' +
        '<a class="btn btn-soft" href="/avalon/#roles">← 回到全部人物</a>' +
        '<a class="btn btn-primary" href="/avalon/play/">🎲 开一局试试</a>' +
      '</div>' +
    '</div></section>';

  document.title = r.name + ' ' + r.en + ' · 阿瓦隆人物 · MiNgHZ';

  /* 主题 / 菜单 / 年份（与站内其它页面一致） */
  var THEME_KEY = 'minghz.theme';
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
    var b = document.getElementById('themeToggle'); if (b) b.textContent = t === 'dark' ? '🌙' : '☀️';
  }
  var initT = 'light';
  try { initT = localStorage.getItem(THEME_KEY) || 'light'; } catch (e) {}
  applyTheme(initT);
  var tb = document.getElementById('themeToggle');
  if (tb) tb.addEventListener('click', function () {
    applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  });
  var mt = document.getElementById('menuToggle'), nav = document.getElementById('mainNav');
  if (mt && nav) mt.addEventListener('click', function () {
    var open = nav.classList.toggle('open');
    mt.setAttribute('aria-expanded', String(open));
    mt.textContent = open ? '✕' : '☰';
  });
  var y = document.getElementById('year'); if (y) y.textContent = String(new Date().getFullYear());
  var link = document.getElementById('gfontLink');
  if (link) {
    var on = function () { if (link.media !== 'all') link.media = 'all'; };
    if (link.sheet) on(); else { link.addEventListener('load', on); setTimeout(on, 3000); }
  }
})();
