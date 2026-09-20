/* 关于页：主题切换 + 移动端菜单 + 年份（与主站共用同一个主题偏好） */
(function () {
  'use strict';
  var THEME_KEY = 'minghz.theme';
  var root = document.documentElement;

  function applyTheme(t) {
    root.setAttribute('data-theme', t);
    try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
    var btn = document.getElementById('themeToggle');
    if (btn) btn.textContent = t === 'dark' ? '🌙' : '☀️';
  }

  var saved = null;
  try { saved = localStorage.getItem(THEME_KEY); } catch (e) {}
  applyTheme(saved || 'light');

  /* 字体非阻塞加载：加载完再启用，首屏先用系统字体 */
  var fontLink = document.getElementById('gfontLink');
  if (fontLink) {
    var enableFonts = function () { if (fontLink.media !== 'all') fontLink.media = 'all'; };
    if (fontLink.sheet) enableFonts();
    else {
      fontLink.addEventListener('load', enableFonts);
      setTimeout(enableFonts, 3000);
    }
  }

  var themeBtn = document.getElementById('themeToggle');
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      applyTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    });
  }

  var menuToggle = document.getElementById('menuToggle');
  var mainNav = document.getElementById('mainNav');
  if (menuToggle && mainNav) {
    menuToggle.addEventListener('click', function () {
      var open = mainNav.classList.toggle('open');
      menuToggle.setAttribute('aria-expanded', String(open));
      menuToggle.textContent = open ? '✕' : '☰';
    });
  }

  var year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
})();
