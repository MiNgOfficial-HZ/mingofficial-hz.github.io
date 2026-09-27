/* ============================================================
   长颈鹿彩蛋（只在第一次打开主页时播一次）
   一只长颈鹿带着大象、斑马、狮子从右侧走到最左侧，走完就散场。
   · 纯 CSS 动画 + 内联 SVG，不加载任何图片，不给首屏添堵
   · 只在 / 或 /index.html 的 #home 开场跑，且只跑一次
   · 想再看一遍：在网址后面加 ?giraffe=1，或控制台执行 mhzGiraffe()
   ============================================================ */
(function () {
  'use strict';

  var SEEN_KEY = 'minghz.giraffe.seen.v1';
  var path = location.pathname;
  if (path !== '/' && path !== '/index.html') return;

  var force = /[?&]giraffe=1(?:&|$)/.test(location.search);
  var hash = (location.hash || '').replace(/^#/, '');
  if (!force && hash && hash !== 'home') return;

  var seen = false;
  try { seen = !!localStorage.getItem(SEEN_KEY); } catch (e) { /* 隐私模式下没有 localStorage，照常播 */ }
  if (seen && !force) return;

  try {
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  } catch (e) {}

  /* 每只动物一个 viewBox，统一用 currentColor 画身体、用 --bg 抠出斑点 / 条纹 / 脸 */
  var SOFT = 'var(--bg)';
  var ANIMALS = [
    {
      cls: 'gp-giraffe',
      delay: 0,
      svg:
        '<svg viewBox="0 0 150 120" width="150" height="120" role="presentation">' +
          '<rect x="34" y="76" width="9" height="42" rx="4.5"/>' +
          '<rect x="50" y="76" width="9" height="42" rx="4.5"/>' +
          '<rect x="96" y="76" width="9" height="42" rx="4.5"/>' +
          '<rect x="112" y="76" width="9" height="42" rx="4.5"/>' +
          '<path d="M36 60 L22 84" stroke="currentColor" stroke-width="3" stroke-linecap="round" fill="none"/>' +
          '<circle cx="21" cy="88" r="4.5"/>' +
          '<ellipse cx="76" cy="72" rx="42" ry="24"/>' +
          '<path d="M104 58 L128 16 L140 22 L116 64 Z"/>' +
          '<rect x="129" y="4" width="3.4" height="9" rx="1.7"/>' +
          '<rect x="137" y="3" width="3.4" height="10" rx="1.7"/>' +
          '<circle cx="130.7" cy="3.6" r="2.6"/><circle cx="138.7" cy="2.6" r="2.6"/>' +
          '<ellipse cx="126" cy="12" rx="6" ry="3.4" transform="rotate(-32 126 12)"/>' +
          '<ellipse cx="136" cy="18" rx="13.5" ry="9" transform="rotate(-18 136 18)"/>' +
          '<circle cx="142" cy="15" r="1.8" fill="' + SOFT + '"/>' +
          '<circle cx="66" cy="64" r="5" fill="' + SOFT + '"/>' +
          '<circle cx="86" cy="76" r="4.6" fill="' + SOFT + '"/>' +
          '<circle cx="74" cy="86" r="3.8" fill="' + SOFT + '"/>' +
          '<circle cx="109" cy="52" r="3.4" fill="' + SOFT + '"/>' +
          '<circle cx="119" cy="38" r="3" fill="' + SOFT + '"/>' +
          '<circle cx="129" cy="27" r="2.6" fill="' + SOFT + '"/>' +
        '</svg>'
    },
    {
      cls: 'gp-elephant',
      delay: 0.5,
      svg:
        '<svg viewBox="0 0 150 110" width="150" height="110" role="presentation">' +
          '<rect x="50" y="72" width="14" height="34" rx="7"/>' +
          '<rect x="68" y="74" width="14" height="32" rx="7"/>' +
          '<rect x="98" y="72" width="14" height="34" rx="7"/>' +
          '<rect x="114" y="74" width="14" height="32" rx="7"/>' +
          '<ellipse cx="84" cy="60" rx="42" ry="26"/>' +
          '<path d="M27 58 Q8 74 17 94 Q21 103 30 98" stroke="currentColor" stroke-width="11" stroke-linecap="round" fill="none"/>' +
          '<circle cx="38" cy="50" r="23"/>' +
          '<ellipse cx="48" cy="46" rx="15" ry="17"/>' +
          '<circle cx="31" cy="42" r="2.6" fill="' + SOFT + '"/>' +
        '</svg>'
    },
    {
      cls: 'gp-zebra',
      delay: 1,
      svg:
        '<svg viewBox="0 0 150 110" width="150" height="110" role="presentation">' +
          '<rect x="40" y="70" width="9" height="40" rx="4.5"/>' +
          '<rect x="55" y="70" width="9" height="40" rx="4.5"/>' +
          '<rect x="96" y="70" width="9" height="40" rx="4.5"/>' +
          '<rect x="111" y="70" width="9" height="40" rx="4.5"/>' +
          '<path d="M42 52 L28 78" stroke="currentColor" stroke-width="3" stroke-linecap="round" fill="none"/>' +
          '<circle cx="27" cy="82" r="4.5"/>' +
          '<ellipse cx="78" cy="64" rx="40" ry="22"/>' +
          '<path d="M104 52 L122 18 L134 24 L114 58 Z"/>' +
          '<ellipse cx="132" cy="19" rx="12.5" ry="8" transform="rotate(-15 132 19)"/>' +
          '<rect x="124" y="10" width="4" height="8" rx="2" transform="rotate(-15 126 14)"/>' +
          '<circle cx="137" cy="16" r="1.8" fill="' + SOFT + '"/>' +
          '<rect x="58" y="50" width="6" height="26" rx="3" fill="' + SOFT + '" transform="rotate(8 61 63)"/>' +
          '<rect x="72" y="48" width="6" height="30" rx="3" fill="' + SOFT + '" transform="rotate(8 75 63)"/>' +
          '<rect x="86" y="50" width="6" height="26" rx="3" fill="' + SOFT + '" transform="rotate(8 89 63)"/>' +
          '<rect x="100" y="52" width="6" height="22" rx="3" fill="' + SOFT + '" transform="rotate(8 103 63)"/>' +
        '</svg>'
    },
    {
      cls: 'gp-lion',
      delay: 1.5,
      svg:
        '<svg viewBox="0 0 150 110" width="150" height="110" role="presentation">' +
          '<rect x="46" y="72" width="10" height="38" rx="5"/>' +
          '<rect x="62" y="74" width="10" height="36" rx="5"/>' +
          '<rect x="94" y="72" width="10" height="38" rx="5"/>' +
          '<rect x="110" y="74" width="10" height="36" rx="5"/>' +
          '<path d="M46 54 Q30 46 24 34" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" fill="none"/>' +
          '<circle cx="21" cy="31" r="5.5"/>' +
          '<ellipse cx="82" cy="66" rx="38" ry="22"/>' +
          '<circle cx="34" cy="52" r="25"/>' +
          '<circle cx="34" cy="52" r="14" fill="' + SOFT + '"/>' +
          '<circle cx="34" cy="52" r="9"/>' +
        '</svg>'
    }
  ];

  function start() {
    if (document.getElementById('giraffeParade')) return;
    var wrap = document.createElement('div');
    wrap.id = 'giraffeParade';
    wrap.className = 'gp-parade';
    wrap.setAttribute('aria-hidden', 'true');
    ANIMALS.forEach(function (a) {
      var el = document.createElement('div');
      el.className = 'gp-animal ' + a.cls;
      el.style.animationDelay = a.delay + 's';
      el.innerHTML = '<span class="gp-walk">' + a.svg + '</span>';
      var walk = el.firstChild;
      walk.style.animationDelay = (a.delay * 0.6) + 's';
      wrap.appendChild(el);
    });
    document.body.appendChild(wrap);
    /* 播完就拆掉，别在 DOM 里留垃圾 */
    setTimeout(function () {
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
    }, 14000);
  }

  /* 走出来之前先标记已看过：半路刷新不会又冒出来一次 */
  try { localStorage.setItem(SEEN_KEY, String(Date.now())); } catch (e) {}
  /* 控制台 / 网址参数都能重播 */
  window.mhzGiraffe = start;

  function queue() { setTimeout(start, 700); }
  if (document.readyState === 'complete') queue();
  else window.addEventListener('load', queue, { once: true });
})();
