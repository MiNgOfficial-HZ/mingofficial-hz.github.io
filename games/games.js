/* 桌游页：只做主题 / 菜单 / 年份这几个小动作（页面内容是静态的） */
(function () {
  'use strict';
  var THEME_KEY = 'minghz.theme';
  var $ = function (s) { return document.querySelector(s); };
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
