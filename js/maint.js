/* ============================================================
   网站维护模式 · 二级/三级页面统一检查
   在 /photo/ /about/ /games/ /avalon/ /botc/ 等页面上运行：
   · 维护中且访客不是站长 → 直接定到主页（那里会显示「维护中」）
   · 站长本人不受影响，照常浏览
   ============================================================ */
(function () {
  'use strict';
  var WORKER = 'https://api.giraffeming.online';
  var USER_LS = 'minghz.user.v1';
  var session = '';
  try { session = localStorage.getItem(USER_LS) || ''; } catch (e) {}

  var root = document.documentElement;
  var shown = false;
  function show() { if (!shown) { shown = true; root.style.visibility = ''; } }

  /* 主页自己不重定向（主页由 app.js 显示「维护中」卡片，重定向会变成无限刷新） */
  var isHome = (location.pathname === '/' || location.pathname === '/index.html');
  if (isHome) { show(); return; }

  /* 先藏一下，避免"先看到页面内容又被弹走"；最多藏 1.5 秒，超时也照常显示 */
  root.style.visibility = 'hidden';
  setTimeout(show, 1500);

  function check(json) {
    var on = !!(json && json.db && json.db.maint && json.db.maint.on);
    var isOwner = !!(json && json.user && json.user.role === 'owner');
    if (on && !isOwner) { location.replace('/'); return; }
    show();
  }

  fetch(WORKER + '/api/db', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session: session }),
    cache: 'no-store'
  }).then(function (r) { return r.json(); }).then(check).catch(show);
})();
