/* 桌游页：主题 / 菜单 / 年份 + 「帮我选一个」小玩点 */
(function () {
  'use strict';
  var THEME_KEY = 'minghz.theme';
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  /* ---------- 主题 / 菜单 / 年份 ---------- */
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

  /* 官方图万一没加载出来（被删/被墙），退回一个 emoji，别留一块破图 */
  $$('.bg-plate img').forEach(function (img) {
    var fallback = function () {
      img.hidden = true;
      var plate = img.closest('.bg-plate');
      if (plate) plate.classList.add('no-art');
    };
    if (img.complete && img.naturalWidth === 0) fallback();
    img.addEventListener('error', fallback);
  });

  /* ---------- 帮我选一个 ---------- */
  var LINES = {
    avalon: [
      '就它了：阿瓦隆 —— 人还没来齐的时候，半小时一局刚刚好。',
      '阿瓦隆 —— 先来一局热热嗓子，看看谁最会装好人。',
      '阿瓦隆 —— 这次记得盯住那个话最少的人。'
    ],
    botc: [
      '就它了：血染钟楼 —— 人多、时间够，就让说书人陪你们熬一晚。',
      '血染钟楼 —— 今晚谁也别想早睡，记得死了也要接着说话。',
      '血染钟楼 —— 反正中毒了也不会有人告诉你。'
    ]
  };
  var last = '';
  var btn = $('#bgPick');
  var note = $('#bgPickNote');
  if (btn) btn.addEventListener('click', function () {
    var keys = Object.keys(LINES).filter(function (k) { return k !== last; });
    var key = keys[Math.floor(Math.random() * keys.length)];
    last = key;
    $$('.bg-game').forEach(function (c) {
      var on = c.id === 'game-' + key;
      c.classList.toggle('picked', on);
      if (on) {
        c.classList.remove('pop');
        void c.offsetWidth;              /* 重新触发动画 */
        c.classList.add('pop');
      } else {
        c.classList.remove('pop');
      }
    });
    var pool = LINES[key];
    if (note) note.textContent = pool[Math.floor(Math.random() * pool.length)];
    var card = $('#game-' + key);
    if (card && card.getBoundingClientRect().top < 0) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
})();
