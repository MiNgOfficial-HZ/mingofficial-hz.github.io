/* ============================================================
   阿瓦隆 · 在线开局
   · 站长登录后建房（当上帝）；玩家只要房间码 + 昵称，不用账号
   · 身份完全由服务端洗牌，前端只拿到「我自己的牌 + 我能确认谁」
   · 轮询间隔 2.2s；页面切到后台就停，回到前台立刻补一次
   ============================================================ */
(function () {
  'use strict';
  var WORKER = 'https://api.giraffeming.online';
  var USER_LS = 'minghz.user.v1';
  var THEME_KEY = 'minghz.theme';
  var ROOM_LS = 'minghz.avalon.room.v1';
  var POLL_MS = 2200;
  var A = window.AVALON || { roles: {}, presets: {} };

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  function roleMeta(k) { return (A.roles && A.roles[k]) || {}; }
  var PHASES = { night: '🌙 夜晚 · 睁眼认人', team: '🧭 组队', vote: '🗳 投票', quest: '⚔️ 出任务', result: '📋 结算' };

  var session = readLS(USER_LS) || '';
  var me = null;
  var view = null;
  var stored = readRoom();
  var form = { seats: 8, lady: true, hostPlays: false, code: '', nick: readLS('minghz.avalon.nick') || '' };
  var timer = null;
  var lastRev = -1;
  var busy = false;
  var qrPainted = '';
  var ladyResult = null;
  var tsToken = '';
  var tsState = 'idle';

  /* ---------- 小工具 ---------- */
  function readLS(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function writeLS(k, v) { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) {} }
  function readRoom() {
    try {
      var raw = localStorage.getItem(ROOM_LS);
      if (!raw) return null;
      var o = JSON.parse(raw);
      return (o && o.code) ? o : null;
    } catch (e) { return null; }
  }
  function saveRoom(o) { stored = o; try { localStorage.setItem(ROOM_LS, JSON.stringify(o)); } catch (e) {} }
  function dropRoom() { stored = null; view = null; lastRev = -1; ladyResult = null; writeLS(ROOM_LS, ''); stopPoll(); }
  function api(path, body) {
    return fetch(WORKER + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, status: r.status, json: j || {} }; });
    }).catch(function () { return { ok: false, status: 0, json: { error: '网络不太顺，等一下再试' } }; });
  }
  function toast(msg, type) {
    type = type || 'success';
    var icons = { success: '✅', error: '⚠️', info: '💡' };
    var el = document.createElement('div');
    el.className = 'toast ' + type;
    el.innerHTML = '<span>' + (icons[type] || '💡') + '</span><span>' + esc(msg) + '</span>';
    var root = $('#toastRoot');
    if (root) { root.appendChild(el); setTimeout(function () { el.classList.add('out'); setTimeout(function () { el.remove(); }, 280); }, 3000); }
  }

  /* ---------- 主题 / 菜单 / 年份 ---------- */
  (function chrome() {
    function applyTheme(t) {
      document.documentElement.setAttribute('data-theme', t);
      writeLS(THEME_KEY, t);
      var b = $('#themeToggle'); if (b) b.textContent = t === 'dark' ? '🌙' : '☀️';
    }
    applyTheme(readLS(THEME_KEY) || 'light');
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

  /* ---------- 登录（站长建房用） ---------- */
  function paintUserBtn() {
    var b = $('#gUserBtn');
    if (!b) return;
    b.textContent = me ? ((me.avatar && !/^https?:/i.test(me.avatar) ? me.avatar : '🦒') + ' ' + (me.nick || '我的账户')) : '👤 站长登录';
  }
  function setSession(s) { session = s || ''; writeLS(USER_LS, s); }
  function restoreMe() {
    if (!session) { me = null; paintUserBtn(); return Promise.resolve(); }
    return api('/api/auth/me', { session: session }).then(function (res) {
      if (res.ok && res.json.user) { me = res.json.user; }
      else { me = null; setSession(''); }
      paintUserBtn();
    });
  }
  /* ---------- 人机验证（和主站 / 摄影页同一套 key + 兜底逻辑） ---------- */
  var TS_KEY = '0x4AAAAAAE9nhEhZUu-NfJNS';
  function tsFallback(slot) {
    var badHost = location.protocol === 'file:' || !/(^|\.)giraffeming\.online$/i.test(location.hostname);
    slot.innerHTML = '<div class="ts-fallback"><b>人机验证没能加载</b><br>' +
      (badHost ? '当前地址不在验证白名单里，请用 <b>giraffeming.online</b> 打开。' : '可能是网络或浏览器设置挡住了，点下面重试。') +
      '</div><button type="button" class="btn-ts-retry" data-act="ts-retry">🔄 重新验证</button>';
  }
  function loadTs(cb) {
    if (window.turnstile && window.turnstile.render) { cb(true); return; }
    if (!window.__tsLoading) {
      window.__tsLoading = true;
      window.__tsReady = [];
      var s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=__tsOnload';
      s.async = true; s.defer = true;
      window.__tsOnload = function () {
        var q = window.__tsReady || []; window.__tsReady = null;
        q.forEach(function (fn) { try { fn(true); } catch (e) {} });
      };
      s.onerror = function () {
        window.__tsLoading = false;
        var q = window.__tsReady || []; window.__tsReady = null;
        q.forEach(function (fn) { try { fn(false); } catch (e) {} });
      };
      document.head.appendChild(s);
    }
    if (window.__tsReady) window.__tsReady.push(cb); else cb(!!window.turnstile);
  }
  function mountTs() {
    var slot = $('#tsSlot');
    if (!slot || !TS_KEY) return;
    if (slot.dataset.tsId && window.turnstile) return;
    tsState = 'pending';
    loadTs(function (ok) {
      if (!ok || !window.turnstile || !window.turnstile.render) { tsState = 'failed'; tsFallback(slot); return; }
      try {
        var dark = document.documentElement.getAttribute('data-theme') === 'dark';
        slot.dataset.tsId = window.turnstile.render(slot, {
          sitekey: TS_KEY, theme: dark ? 'dark' : 'light', language: 'zh-cn',
          appearance: 'always', retry: 'auto', 'refresh-expired': 'auto', 'refresh-timeout': 'auto',
          callback: function (t) { tsState = 'ok'; tsToken = t || ''; },
          'expired-callback': function () { tsState = 'idle'; tsToken = ''; },
          'timeout-callback': function () { tsState = 'idle'; tsToken = ''; },
          'error-callback': function () {
            tsState = 'failed'; tsToken = '';
            if (slot.dataset.tsId && window.turnstile && window.turnstile.remove) {
              try { window.turnstile.remove(slot.dataset.tsId); } catch (e) {}
            }
            delete slot.dataset.tsId;
            tsFallback(slot);
          }
        });
        /* 10 秒还没拿到令牌就当成「慢」：不再拦着登录，交给服务端判断 */
        setTimeout(function () {
          if (tsState !== 'ok') {
            tsState = 'slow';
            if (!slot.querySelector('.ts-fallback')) {
              var tip = document.createElement('div');
              tip.className = 'ts-fallback';
              tip.textContent = '人机验证加载较慢 —— 可以直接点「登录」，服务端会再校验一次。';
              slot.appendChild(tip);
              var btn = document.createElement('button');
              btn.type = 'button'; btn.className = 'btn-ts-retry'; btn.setAttribute('data-act', 'ts-retry');
              btn.textContent = '🔄 重新验证';
              slot.appendChild(btn);
            }
          }
        }, 10000);
      } catch (e) { tsState = 'failed'; tsFallback(slot); }
    });
  }
  function tsOk() {
    if (!TS_KEY) return true;
    if (tsToken) return true;
    return tsState === 'failed' || tsState === 'slow';
  }

  function openLogin() {
    $('#modalTitle').textContent = '🔐 站长登录';
    $('#modalBody').innerHTML =
      '<div class="field"><label>账号</label><input id="lUser" maxlength="40" autocomplete="username" /></div>' +
      '<div class="field"><label>密码</label><input id="lPw" type="password" maxlength="64" autocomplete="current-password" /></div>' +
      (TS_KEY ? '<div class="ts-slot" id="tsSlot"></div>' : '') +
      '<p class="field-hint">只有站长 / 管理员能建房当上帝。玩家不需要登录，直接输入房间码就行。</p>';
    $('#modalFoot').innerHTML =
      '<button class="btn btn-ghost" type="button" data-act="close">取消</button>' +
      '<button class="btn btn-primary" type="button" data-act="do-login">登录</button>';
    $('#modalBackdrop').hidden = false;
    document.body.style.overflow = 'hidden';
    tsToken = ''; tsState = 'idle';
    mountTs();
    var u = $('#lUser'); if (u) u.focus();
  }
  function closeModal() {
    $('#modalBackdrop').hidden = true;
    document.body.style.overflow = '';
  }
  /* 站内二次确认（不用浏览器原生 confirm：手机上更统一，也不会挡住页面） */
  var pendingConfirm = null;
  function askConfirm(title, text, okText, fn) {
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = '<p class="g-card-sub" style="margin-top:0">' + esc(text) + '</p>';
    $('#modalFoot').innerHTML =
      '<button class="btn btn-ghost" type="button" data-act="close">取消</button>' +
      '<button class="btn btn-primary" type="button" data-act="confirm-ok">' + esc(okText) + '</button>';
    pendingConfirm = fn;
    $('#modalBackdrop').hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function doLogin() {
    var un = String(($('#lUser') || {}).value || '').trim();
    var pw = String(($('#lPw') || {}).value || '');
    if (!un || !pw) { toast('请输入账号和密码', 'error'); return; }
    if (!tsOk()) { toast('请先完成人机验证（可点「重新验证」重试）', 'error'); return; }
    api('/api/auth/login', { username: un, password: pw, turnstile: tsToken }).then(function (res) {
      if (res.ok && res.json.ok) {
        setSession(res.json.session);
        me = res.json.user;
        paintUserBtn();
        closeModal();
        toast('欢迎回来，' + (me.nick || '站长') + ' 👋');
        render();
        return;
      }
      if (res.ok && res.json.need2fa) { askCode(res.json.ticket); return; }
      toast((res.json && res.json.error) || '登录失败', 'error');
    });
  }
  function askCode(ticket) {
    $('#modalTitle').textContent = '🔐 两步验证';
    $('#modalBody').innerHTML = '<div class="field"><label>动态码 / 恢复码</label><input id="lCode" maxlength="12" placeholder="6 位数字，或 XXXXX-XXXXX" /></div>';
    $('#modalFoot').innerHTML =
      '<button class="btn btn-ghost" type="button" data-act="close">取消</button>' +
      '<button class="btn btn-primary" type="button" data-act="code" data-ticket="' + esc(ticket) + '">验证并登录</button>';
    var c = $('#lCode'); if (c) c.focus();
  }

  /* ---------- 轮询 ---------- */
  function startPoll() {
    stopPoll();
    timer = setInterval(function () { if (!document.hidden) pull(); }, POLL_MS);
  }
  function stopPoll() { if (timer) { clearInterval(timer); timer = null; } }
  function pull() {
    if (!stored || busy) return Promise.resolve();
    busy = true;
    return api('/api/avalon/state', { code: stored.code, token: stored.token || '', session: session }).then(function (res) {
      busy = false;
      if (res.ok && res.json.view) {
        var v = res.json.view;
        if (v.rev !== lastRev) { lastRev = v.rev; view = v; render(); }
        return;
      }
      if (res.status === 401 && res.json && res.json.need === 'auth') {
        me = null; setSession('');
        paintUserBtn();
        dropRoom();
        toast('登录状态过期了，重新登录一次就能接着当房主', 'error');
        render();
        return;
      }
      if (res.status === 403 || res.status === 404) {
        dropRoom();
        toast((res.json && res.json.error) || '房间不在了', 'error');
        render();
      }
    }).catch(function () { busy = false; });
  }

  /* ---------- 入口：建房 / 加入 ---------- */
  function createRoom() {
    if (!me) { toast('先登录站长账号', 'error'); openLogin(); return; }
    api('/api/avalon/create', { session: session, seats: form.seats, lady: form.lady, hostPlays: form.hostPlays, nick: me.nick }).then(function (res) {
      if (res.ok && res.json.ok) {
        saveRoom({ code: res.json.code, token: res.json.token || '', host: true });
        lastRev = -1; qrPainted = '';
        toast('房间开好了：' + res.json.code);
        render();
        pull().then(render);
        startPoll();
      } else toast((res.json && res.json.error) || '建房失败', 'error');
    });
  }
  function joinRoom() {
    var code = String(form.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    var nick = String(form.nick || '').trim().slice(0, 20);
    if (code.length !== 4) { toast('房间码是 4 位（例如 K7QP）', 'error'); return; }
    if (!nick) { toast('先起个名字吧', 'error'); return; }
    form.code = code;
    writeLS('minghz.avalon.nick', nick);
    api('/api/avalon/join', { code: code, nick: nick }).then(function (res) {
      if (res.ok && res.json.ok) {
        saveRoom({ code: code, token: res.json.token, host: false });
        lastRev = -1; qrPainted = '';
        if (res.json.view) { view = res.json.view; lastRev = view.rev; }   /* 立刻进大厅，不用等下一次轮询 */
        toast('入座成功：' + res.json.view.me.seat + ' 号');
        render();
        startPoll();
      } else toast((res.json && res.json.error) || '进不去这个房间', 'error');
    });
  }
  function hostAction(action, extra) {
    if (!stored) return;
    var body = Object.assign({ code: stored.code, session: session, action: action }, extra || {});
    if (stored.token) body.token = stored.token;
    busy = true;
    api('/api/avalon/host', body).then(function (res) {
      busy = false;
      if (res.ok && res.json.view) {
        view = res.json.view; lastRev = view.rev; render();
        if (action === 'close') { dropRoom(); render(); toast('房间已关闭'); }
      } else {
        toast((res.json && res.json.error) || '操作失败', 'error');
        if (res.status === 404) { dropRoom(); render(); }
      }
    });
  }
  function ladyPeek(seat) {
    if (!stored) return;
    busy = true;
    api('/api/avalon/lady', { code: stored.code, token: stored.token, seat: seat }).then(function (res) {
      busy = false;
      if (res.ok && res.json.view) {
        ladyResult = res.json.looked || null;
        view = res.json.view; lastRev = view.rev;
        render();
        if (ladyResult) toast(ladyResult.nick + '（' + ladyResult.seat + ' 号）是' + (ladyResult.camp === 'evil' ? '坏人' : '好人'), 'info');
      } else toast((res.json && res.json.error) || '查验失败', 'error');
    });
  }
  function joinLink() { return location.origin + '/avalon/play/#code=' + (stored ? stored.code : ''); }

  /* ---------- 渲染 ---------- */
  function campClass(c) { return c === 'evil' ? 'camp-evil' : (c === 'item' ? 'camp-item' : 'camp-good'); }

  function questTrack(v) {
    return '<div class="g-quests">' + (v.quests || []).map(function (q) {
      var cls = q.result === 'success' ? 'win' : (q.result === 'fail' ? 'lose' : '');
      var now = (!q.result && v.status === 'playing' && Number(v.round) === q.round) ? ' now' : '';
      var st = q.result === 'success' ? '成功' : (q.result === 'fail' ? ('失败 × ' + q.fails) : '待定');
      return '<div class="g-quest ' + cls + now + '">' +
        '<div class="q">任务 ' + q.round + '</div>' +
        '<div class="sz">' + q.size + '</div>' +
        '<div class="st">' + st + '</div>' +
        '<div class="q" style="font-size:0.66rem">需 ' + q.need + ' 张</div>' +
      '</div>';
    }).join('') + '</div>';
  }
  function phaseBar(v) {
    var label = PHASES[v.phase] || v.phase;
    var score = { good: 0, evil: 0 };
    (v.quests || []).forEach(function (q) { if (q.result === 'success') score.good++; else if (q.result === 'fail') score.evil++; });
    return '<div class="g-phasebar">' +
      '<span class="av-pill">房间 ' + esc(v.code) + '</span>' +
      '<span class="ph">第 ' + (v.round || 0) + ' 轮</span>' +
      '<span class="g-dot"></span><span>' + esc(label) + '</span>' +
      '<span class="g-dot"></span><span>任务 好人 ' + score.good + ' / 坏人 ' + score.evil + '</span>' +
      (v.lady && v.lady.on ? '<span class="g-dot"></span><span>🧚 湖中仙女 ' + (v.lady.holder ? (v.lady.holder + ' 号') : '未定') + '</span>' : '') +
    '</div>';
  }

  function idCard(v) {
    var m = v.me || {};
    if (!m.role) return '';
    var r = roleMeta(m.role);
    return '<div class="g-idcard ' + campClass(m.camp) + '" id="idCard">' +
      '<div class="av-pill" style="margin-bottom:12px">你是 ' + m.seat + ' 号 · ' + esc(m.nick) + '</div>' +
      '<div class="ico">' + esc(r.icon || '🎴') + '</div>' +
      '<div class="rname">' + esc(r.name || m.roleName || m.role) + '</div>' +
      '<div class="ren">' + esc(r.en || '') + ' · ' + (m.camp === 'evil' ? '坏人阵营' : '好人阵营') + '</div>' +
      '<div class="rtag">' + esc(r.tagline || '') + '</div>' +
      '<div class="g-cover" data-hold="1">' +
        '<div class="big">🎴</div>' +
        '<div class="say">按住屏幕查看你的身份</div>' +
        '<small>松手就盖回去 · 别让旁边的人看到</small>' +
      '</div>' +
    '</div>';
  }

  function sightBox(v) {
    var m = v.me || {};
    if (!m.role) return '';
    var sees = m.sees || [], blind = m.blind || [];
    var head = '<div class="g-card"><h3>👁 你的视野</h3>';
    var body = '';
    if (sees.length) {
      body += '<p class="g-card-sub">这些是你能确认的人（只有你看到）：</p><div class="g-sight">' +
        sees.map(function (s) {
          var mark = s.as === 'evil' ? '坏人' : (s.as === 'pair' ? '梅林 或 莫甘娜' : '同伙（坏人）');
          return '<div class="g-sight-item ' + esc(s.as) + '"><div>' +
            '<div class="who">' + esc(s.nick) + '（' + s.seat + ' 号）<span class="av-pill ' + (s.as === 'evil' || s.as === 'team' ? 'camp-evil' : 'camp-item') + '" style="margin-left:8px">' + esc(mark) + '</span></div>' +
            '<div class="why">' + esc(s.why) + '</div></div></div>';
        }).join('') + '</div>';
    } else {
      body += '<div class="g-good">这一局你没有任何视野 —— 谁都可能是坏人，靠推理和投票吧。</div>';
    }
    if (blind.length) {
      body += '<details style="margin-top:14px"><summary style="cursor:pointer;font-size:0.88rem">🚫 你无法确认的人（' + blind.length + ' 位）</summary><div class="g-sight" style="margin-top:10px">' +
        blind.map(function (b) {
          return '<div class="g-sight-item blind"><div><div class="who">' + esc(b.nick) + '（' + b.seat + ' 号）</div>' +
            '<div class="why">' + esc(b.why) + '</div></div></div>';
        }).join('') + '</div></details>';
    }
    return head + body + '</div>';
  }

  function myAbilityBox(v) {
    var m = v.me || {};
    var r = roleMeta(m.role);
    if (!r.key) return '';
    return '<div class="g-card"><h3>✦ 你的能力</h3>' +
      '<ul class="role-box ability" style="border:none;background:none;padding:0">' +
      (r.ability || []).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') +
      '</ul>' +
      '<div class="g-actions">' +
        '<a class="btn btn-soft btn-small" href="/avalon/roles/' + esc(r.key) + '/">📖 看这个角色的完整打法</a>' +
      '</div></div>';
  }

  function ladyBox(v) {
    if (!v.lady || !v.lady.on || v.status !== 'playing') return '';
    if (!v.lady.mine) return '';
    var used = v.lady.used || [];
    var can = (v.players || []).filter(function (p) { return p.seat !== (v.me || {}).seat && used.indexOf(p.seat) < 0; });
    var html = '<div class="g-card"><h3>🧚 湖中仙女在你手上</h3>' +
      '<p class="g-card-sub">选一个「从来没持有过」的人查验阵营（只看好坏，看不到具体角色），查完信物会自动交给对方。</p>';
    html += '<div class="g-row" style="margin-top:12px">' +
      can.map(function (p) {
        return '<button class="btn btn-soft btn-small" type="button" data-act="lady" data-seat="' + p.seat + '">查 ' + p.seat + ' 号 · ' + esc(p.nick) + '</button>';
      }).join('') +
      '</div>';
    if (!can.length) html += '<p class="g-card-sub">没有可查的人了 —— 信物已经走完一轮。</p>';
    return html + '</div>';
  }
  /* 查验结果只留在查验者这台手机上（信物交出去之后也还看得见） */
  function ladyResultBox() {
    if (!ladyResult) return '';
    return '<div class="g-card"><h3>🧚 你查到的结果</h3>' +
      '<div class="' + (ladyResult.camp === 'evil' ? 'g-warn' : 'g-good') + '">' +
      esc(ladyResult.nick) + '（' + ladyResult.seat + ' 号）是 <b>' + (ladyResult.camp === 'evil' ? '坏人' : '好人') + '</b>' +
      '<br /><span style="font-size:0.8rem">湖中仙女已经交到对方手上了 —— 接下来由他查验下一个人。</span></div></div>';
  }

  function seatsGrid(v, isHost) {
    var taken = {};
    (v.players || []).forEach(function (p) { taken[p.seat] = p; });
    var out = [];
    for (var s = 1; s <= v.seats; s++) {
      var p = taken[s];
      var mine = p && v.me && p.seat === v.me.seat;
      if (p) {
        out.push('<div class="g-seat taken' + (mine ? ' me' : '') + '">' +
          '<div class="no">' + s + ' 号' + (mine ? ' · 我' : '') + '</div>' +
          '<div class="nick">' + esc(p.nick) + '</div>' +
          (p.roleName ? '<div class="role av-pill ' + campClass(p.camp) + '">' + esc(p.roleName) + '</div>' : '') +
          (isHost ? '<button class="kick" type="button" data-act="kick" data-seat="' + s + '" aria-label="请出房间">✕</button>' : '') +
        '</div>');
      } else {
        out.push('<div class="g-seat"><div class="no">' + s + ' 号</div><div class="empty">空座 · 等朋友入座</div></div>');
      }
    }
    return '<div class="g-seats">' + out.join('') + '</div>';
  }

  function roomCodeCard(v, isHost) {
    return '<div class="g-card">' +
      '<div class="g-roomhead">' +
        '<div><div class="g-code">' + esc(v.code) + '</div>' +
        '<div class="g-code-sub">' + (isHost ? '把房间码或二维码给身边的朋友 · 打开 /avalon/play/ 输入即可' : '你是这个房间的玩家') + '</div></div>' +
        (isHost ? '<div class="g-qr" id="qrBox"></div>' : '') +
      '</div>' +
      (isHost ? '<div class="g-actions">' +
        '<button class="btn btn-soft btn-small" type="button" data-act="copy">🔗 复制邀请链接</button>' +
        '<button class="btn btn-soft btn-small" type="button" data-act="lock">' + (v.locked ? '🔓 解锁房间' : '🔒 锁定房间') + '</button>' +
        '<button class="btn btn-ghost btn-small" type="button" data-act="close-room">关闭房间</button>' +
      '</div>' : '') +
    '</div>';
  }

  function lobbyPlayers(v) {
    return '<div class="g-card"><h3>已入座 ' + (v.players || []).length + ' / ' + v.seats + '</h3>' +
      seatsGrid(v, false) + '</div>';
  }

  function roleListChips(v) {
    var good = (v.roleList.good || []), evil = (v.roleList.evil || []);
    var name = function (k) { return (roleMeta(k).name || k); };
    return '<div class="g-rolelist">' +
      good.map(function (k) { return '<span class="g-chip good">' + esc(roleMeta(k).icon || '') + ' ' + esc(name(k)) + '</span>'; }).join('') +
      evil.map(function (k) { return '<span class="g-chip evil">' + esc(roleMeta(k).icon || '') + ' ' + esc(name(k)) + '</span>'; }).join('') +
    '</div>';
  }

  function renderHome() {
    var seats = [5, 6, 7, 8, 9, 10];
    var p = A.presets[form.seats] || { good: [], evil: [] };
    var preview = (p.good || []).concat(p.evil || []).map(function (k) {
      var m = roleMeta(k);
      return '<span class="g-chip ' + (A.evil.indexOf(k) >= 0 ? 'evil' : 'good') + '">' + esc(m.icon || '') + ' ' + esc(m.name || k) + '</span>';
    }).join('');
    var hostBox;
    if (!me) {
      hostBox = '<div class="g-warn">还没有登录站长账号 —— 建房需要站长 / 管理员身份。' +
        '<div class="g-actions"><button class="btn btn-primary btn-small" type="button" data-act="login">👤 登录</button></div></div>';
    } else {
      hostBox =
        '<div class="g-field"><label>这一桌几个人？</label><div class="g-row">' +
          seats.map(function (n) {
            return '<button class="av-tab' + (form.seats === n ? ' on' : '') + '" type="button" data-act="seats" data-n="' + n + '">' + n + ' 人</button>';
          }).join('') +
        '</div></div>' +
        '<div class="g-field"><label>本局角色（按人数自动套用推荐配置）</label>' + preview + '</div>' +
        '<label class="g-check"><input type="checkbox" id="optLady"' + (form.lady ? ' checked' : '') + ' data-act="opt-lady" /> 启用湖中仙女（多一件能验人的信物）</label>' +
        '<label class="g-check"><input type="checkbox" id="optPlay"' + (form.hostPlays ? ' checked' : '') + ' data-act="opt-play" /> 我也参战（上帝自己占 1 个座位）</label>' +
        '<div class="g-actions"><button class="btn btn-primary g-btn-lg" type="button" data-act="create">🎲 创建房间</button></div>';
    }
    return '<div class="g-grid2">' +
      '<div class="g-card"><h2>🧑‍⚖️ 我是站长：开一局</h2>' +
        '<p class="g-card-sub">你当上帝：建房 → 等大家入座 → 一键发身份 → 推进流程、记录任务成败、最后公开复盘。</p>' +
        hostBox +
      '</div>' +
      '<div class="g-card"><h2>🙋 我是玩家：加入房间</h2>' +
        '<p class="g-card-sub">不用注册账号。输入房间码 + 昵称就能入座，轮到你出牌时手机上会显示你的身份牌。</p>' +
        '<div class="g-field"><label>房间码</label>' +
          '<input id="jCode" class="g-input g-code-input" maxlength="4" inputmode="latin" autocomplete="off" placeholder="ABCD" value="' + esc(form.code) + '" /></div>' +
        '<div class="g-field"><label>你的昵称</label>' +
          '<input id="jNick" class="g-input" maxlength="20" autocomplete="off" placeholder="例如：阿明" value="' + esc(form.nick) + '" /></div>' +
        '<div class="g-actions"><button class="btn btn-primary g-btn-lg" type="button" data-act="join">进房间 →</button></div>' +
      '</div>' +
    '</div>' +
    '<div class="g-card"><h3>📋 怎么用（30 秒版）</h3>' +
      '<ol style="margin:10px 0 0 0;padding-left:20px;color:var(--muted);font-size:0.88rem;line-height:1.85">' +
        '<li>站长登录后建房，把 <b>房间码</b> 或二维码给大家；</li>' +
        '<li>每人用自己手机打开这一页，输入房间码 + 昵称入座；</li>' +
        '<li>坐满后点「开始发牌」—— 身份在服务端洗牌，只发给本人；</li>' +
        '<li>看身份请<b>按住屏幕</b>，松手自动盖回；</li>' +
        '<li>上帝在面板里推进「夜晚 → 组队 → 投票 → 任务 → 结算」，并记录每次任务结果；</li>' +
        '<li>结束后点「公开全部身份」即可复盘。</li>' +
      '</ol></div>';
  }

  function renderHostLobby(v) {
    var full = (v.players || []).length === v.seats;
    return roomCodeCard(v, true) +
      '<div class="g-card"><h3>座位 ' + (v.players || []).length + ' / ' + v.seats + '</h3>' +
        seatsGrid(v, true) +
        '<div class="g-actions">' +
          '<button class="btn btn-primary g-btn-lg" type="button" data-act="start"' + (full ? '' : ' disabled') + '>🎲 开始发牌' + (full ? '' : '（还差 ' + (v.seats - (v.players || []).length) + ' 人）') + '</button>' +
        '</div>' +
        '<p class="g-card-sub">发牌后身份只会出现在每个人的手机上；你自己是上帝，看不到也得假装看不到 😄</p>' +
      '</div>' +
      '<div class="g-card"><h3>本局配置</h3>' + roleListChips(v) +
        '<p class="g-card-sub">任务人数：' + (A.questSize[v.seats] || []).join(' / ') + '（第 1 ~ 5 轮）。第 4 轮在 7 人及以上需要 2 张失败票。</p>' +
        ((v.players || []).length === 0
          ? '<div class="g-field" style="margin-top:12px"><label>还没人入座时，可以改人数</label><div class="g-row">' +
              [5, 6, 7, 8, 9, 10].map(function (n) {
                return '<button class="av-tab' + (v.seats === n ? ' on' : '') + '" type="button" data-act="set-seats" data-n="' + n + '">' + n + ' 人</button>';
              }).join('') + '</div></div>'
          : '') +
      '</div>';
  }

  function renderGuestLobby(v) {
    return roomCodeCard(v, false) +
      '<div class="g-card"><h3>已入座 ' + (v.players || []).length + ' / ' + v.seats + '</h3>' +
        seatsGrid(v, false) +
        '<div class="g-good" style="margin-top:14px">⏳ 等房主点「开始发牌」… 你的身份会在这台手机上显示。</div>' +
        '<div class="g-actions"><button class="btn btn-ghost btn-small" type="button" data-act="leave">离开房间</button></div>' +
      '</div>';
  }

  function renderGodPanel(v) {
    var canKill = v.status === 'ended' && !v.reveal;
    var round = v.round || 1;
    /* ⚠️ 日志卡先算好再拼：直接写成 `... + ((v.god&&v.god.log)||[]).length ? A : B`
       会被 + 的优先级吃掉判定条件（前面的加号链也进了条件里），结果是整段面板被丢掉 */
    var logCard = ((v.god && v.god.log) || []).length
      ? '<div class="g-card"><h3>房间日志</h3><div class="g-log">' +
          v.god.log.slice().reverse().map(function (x) { return '<div>' + esc(x.text) + '</div>'; }).join('') +
        '</div><div class="g-actions">' +
          '<button class="btn btn-soft btn-small" type="button" data-act="reset">↺ 回到大厅重新发牌</button>' +
          '<button class="btn btn-ghost btn-small" type="button" data-act="close-room">关闭房间</button>' +
        '</div></div>'
      : '';
    return '<div class="g-card"><h2>🧑‍⚖️ 上帝面板</h2>' +
      phaseBar(v) + questTrack(v) +
      '<div class="g-actions">' +
        '<button class="btn btn-primary" type="button" data-act="next">▶ 下一步</button>' +
        Object.keys(PHASES).map(function (k) {
          return '<button class="av-tab' + (v.phase === k ? ' on' : '') + '" type="button" data-act="phase" data-phase="' + k + '">' + esc(PHASES[k]) + '</button>';
        }).join('') +
      '</div>' +
      '<h3 style="margin-top:20px">记录第 ' + round + ' 轮任务结果</h3>' +
      '<div class="g-actions">' +
        '<button class="btn btn-soft" type="button" data-act="quest" data-round="' + round + '" data-fails="0">✅ 成功（0 张失败）</button>' +
        '<button class="btn btn-soft" type="button" data-act="quest" data-round="' + round + '" data-fails="1">❌ 失败 · 1 张</button>' +
        '<button class="btn btn-soft" type="button" data-act="quest" data-round="' + round + '" data-fails="2">❌ 失败 · 2 张</button>' +
      '</div>' +
    '</div>' +
    '<div class="g-card"><h3>所有人身份（只有你能看到）</h3>' +
      (v.god && v.god.players || []).map(function (p) {
        return '<div class="g-god-row"><span class="no">' + p.seat + ' 号</span>' +
          '<span class="nick">' + esc(p.nick) + '</span>' +
          '<span class="av-pill ' + campClass(p.camp) + '">' + esc(roleMeta(p.role).icon || '') + ' ' + esc(p.roleName || '—') + '</span>' +
          (canKill ? '<button class="btn btn-ghost btn-small" type="button" data-act="assassinate" data-seat="' + p.seat + '">刺客指认</button>' : '') +
        '</div>';
      }).join('') +
      (canKill ? '<div class="g-warn" style="margin-top:12px">好人已经拿下 3 次任务 —— 现在轮到刺客指认梅林：指认对，坏人翻盘；指认错，好人获胜。点上面任意一行的「刺客指认」即可判定。</div>' : '') +
      '<div class="g-actions">' +
        '<button class="btn btn-soft btn-small" type="button" data-act="reveal" data-on="' + (v.reveal ? '0' : '1') + '">' + (v.reveal ? '🙈 收起全部身份' : '📢 公开全部身份') + '</button>' +
        '<button class="btn btn-soft btn-small" type="button" data-act="winner" data-winner="good">判定好人胜</button>' +
        '<button class="btn btn-soft btn-small" type="button" data-act="winner" data-winner="evil">判定坏人胜</button>' +
      '</div>' +
    '</div>' +
    logCard;
  }

  function renderEnded(v) {
    var win = v.winner === 'good' ? '好人阵营获胜 🎉' : (v.winner === 'evil' ? '坏人阵营获胜 🎭' : '本局结束');
    var rows = (v.players || []).map(function (p) {
      return '<div class="g-god-row"><span class="no">' + p.seat + ' 号</span>' +
        '<span class="nick">' + esc(p.nick) + '</span>' +
        (p.roleName ? '<span class="av-pill ' + campClass(p.camp) + '">' + esc(roleMeta(p.role).icon || '') + ' ' + esc(p.roleName) + '</span>' : '<span class="av-pill">身份未公开</span>') +
      '</div>';
    }).join('');
    var note = '';
    if (v.assassin) note = '<p class="g-card-sub">刺客指认了 ' + v.assassin.seat + ' 号 —— ' + (v.assassin.hit ? '正是梅林。' : '不是梅林。') + '</p>';
    if (!v.reveal) note += '<div class="g-good" style="margin-top:12px">游戏结束，但身份还没公开 —— 等房主点「公开全部身份」再复盘。</div>';
    return '<div class="g-card"><h2>' + esc(win) + '</h2>' + note + questTrack(v) + '</div>' +
      '<div class="g-card"><h3>本局身份</h3>' + rows + '</div>';
  }

  function render() {
    var app = $('#gApp');
    if (!app) return;
    paintUserBtn();
    var html = '';
    var v = view;
    if (!stored || !v) {
      html = renderHome();
    } else if (v.status === 'lobby') {
      html = stored.host ? renderHostLobby(v) : renderGuestLobby(v);
    } else {
      // 进行中 / 已结束
      var pieces = [];
      if (stored.host) pieces.push(renderGodPanel(v));
      if (v.status === 'ended') pieces.push(renderEnded(v));
      if (v.me && v.me.role) {
        pieces.push('<div class="g-card"><h3>你的身份牌</h3>' + idCard(v) +
          '<p class="g-card-sub">按住卡片查看，松手即盖回。' + (stored.host ? '（你既是上帝也是玩家）' : '') + '</p></div>');
        pieces.push(sightBox(v));
        pieces.push(myAbilityBox(v));
        pieces.push(ladyBox(v));
      }
      pieces.push(ladyResultBox());
      if (!stored.host) pieces.push('<div class="g-card"><div class="g-actions"><button class="btn btn-ghost btn-small" type="button" data-act="leave">离开房间</button></div></div>');
      html = pieces.join('');
    }
    qrPainted = '';          /* innerHTML 换过之后二维码要重画 */
    app.innerHTML = html;
    paintQr();
  }

  function paintQr() {
    var box = $('#qrBox');
    if (!box) return;
    var link = joinLink();
    if (qrPainted === link) return;
    if (!window.qrcode) {
      box.innerHTML = '<div class="g-qr-off">二维码库还没加载好，直接把房间码念给大家也行</div>';
      return;
    }
    try {
      var qr = window.qrcode(0, 'M');
      qr.addData(link);
      qr.make();
      box.innerHTML = qr.createImgTag(4, 6, '加入房间的二维码');
      var img = box.querySelector('img');
      if (img) { img.style.width = '100%'; img.style.height = '100%'; }
      qrPainted = link;
    } catch (e) {
      box.innerHTML = '<div class="g-qr-off">二维码生成失败，直接念房间码就好</div>';
    }
  }

  /* ---------- 事件 ---------- */
  document.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!el) return;
    var act = el.getAttribute('data-act');
    if (act === 'login') openLogin();
    else if (act === 'do-login') doLogin();
    else if (act === 'confirm-ok') { var fn = pendingConfirm; pendingConfirm = null; closeModal(); if (fn) fn(); }
    else if (act === 'close') closeModal();
    else if (act === 'ts-retry') { var s = $('#tsSlot'); if (s) { s.innerHTML = ''; delete s.dataset.tsId; } mountTs(); }
    else if (act === 'code') {
      var t = el.getAttribute('data-ticket'), c = String(($('#lCode') || {}).value || '').trim();
      if (!c) { toast('请输入动态码或恢复码', 'error'); return; }
      api('/api/auth/login', { ticket: t, code: c }).then(function (res) {
        if (res.ok && res.json.ok) {
          setSession(res.json.session); me = res.json.user;
          paintUserBtn(); closeModal(); render();
          toast('欢迎回来，' + (me.nick || '站长') + ' 👋');
        } else toast((res.json && res.json.error) || '验证失败', 'error');
      });
    }
    else if (act === 'seats') { form.seats = Number(el.getAttribute('data-n')) || 8; render(); }
    else if (act === 'create') createRoom();
    else if (act === 'join') {
      var jc = $('#jCode'), jn = $('#jNick');
      form.code = jc ? jc.value : form.code;
      form.nick = jn ? jn.value : form.nick;
      joinRoom();
    }
    else if (act === 'set-seats') hostAction('seats', { seats: Number(el.getAttribute('data-n')) || 8 });
    else if (act === 'start') hostAction('start');
    else if (act === 'next') hostAction('next');
    else if (act === 'phase') hostAction('phase', { phase: el.getAttribute('data-phase') });
    else if (act === 'quest') hostAction('quest', { round: Number(el.getAttribute('data-round')), fails: Number(el.getAttribute('data-fails')) });
    else if (act === 'kick') hostAction('kick', { seat: Number(el.getAttribute('data-seat')) });
    else if (act === 'lock') hostAction('lock', { locked: !(view && view.locked) });
    else if (act === 'reveal') hostAction('reveal', { reveal: el.getAttribute('data-on') === '1' });
    else if (act === 'winner') hostAction('winner', { winner: el.getAttribute('data-winner') });
    else if (act === 'assassinate') {
      var killSeat = Number(el.getAttribute('data-seat'));
      askConfirm('🗡️ 刺客指认', '确认指认 ' + killSeat + ' 号是梅林？指认结果会立刻结束这一局并公开全部身份。', '确认指认',
        function () { hostAction('assassinate', { seat: killSeat }); });
    }
    else if (act === 'reset') {
      askConfirm('↺ 回到大厅', '身份会清空，所有人留在座位上、等你重新发牌。确定吗？', '回到大厅', function () { hostAction('reset'); });
    }
    else if (act === 'close-room') {
      askConfirm('关闭房间', '房间里的人会全部掉线，房间也会被回收。确定吗？', '关闭房间', function () { hostAction('close'); });
    }
    else if (act === 'lady') ladyPeek(Number(el.getAttribute('data-seat')));
    else if (act === 'copy') {
      var link = joinLink();
      var done = function () { toast('邀请链接已复制：' + link); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(done, function () { window.prompt('复制这个链接给朋友：', link); });
      else window.prompt('复制这个链接给朋友：', link);
    }
    else if (act === 'leave') {
      dropRoom(); render();
      toast('已离开房间（房主那边还留着你的座位）', 'info');
    }
  });

  /* 按住查看身份（鼠标 / 触屏都支持） */
  function peekOnEl(el) {
    var card = el.closest ? el.closest('.g-idcard') : null;
    if (card) card.classList.add('peeked');
  }
  function peekOff() {
    $$('.g-idcard.peeked').forEach(function (c) { c.classList.remove('peeked'); });
  }
  document.addEventListener('pointerdown', function (e) {
    var el = e.target.closest ? e.target.closest('[data-hold]') : null;
    if (el) { e.preventDefault(); peekOnEl(el); }
  });
  document.addEventListener('pointerup', peekOff);
  document.addEventListener('pointercancel', peekOff);
  document.addEventListener('visibilitychange', function () {
    peekOff();
    if (!document.hidden && stored) pull();
  });
  window.addEventListener('blur', peekOff);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeModal();
    if (e.code === 'Space' && view && view.me && view.me.role) {
      e.preventDefault();
      if (e.type === 'keydown') { var c = $('#idCard'); if (c) c.classList.add('peeked'); }
    }
  });
  document.addEventListener('keyup', function (e) { if (e.code === 'Space') peekOff(); });
  $('#modalBackdrop').addEventListener('mousedown', function (e) { if (e.target === this) closeModal(); });
  var userBtn = $('#gUserBtn');
  if (userBtn) userBtn.addEventListener('click', function () {
    if (!me) { openLogin(); return; }
    toast('当前登录：' + (me.nick || me.username || '我') + (me.role === 'owner' ? '（站长）' : (me.role === 'admin' ? '（管理员）' : '')), 'info');
  });

  /* 复选项（不能只靠 click 委托，因为 checkbox 在 label 里） */
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (!t || !t.getAttribute) return;
    if (t.getAttribute('data-act') === 'opt-lady') form.lady = !!t.checked;
    if (t.getAttribute('data-act') === 'opt-play') form.hostPlays = !!t.checked;
  });

  /* ---------- 启动 ---------- */
  function codeFromHash() {
    var m = location.hash.match(/code=([A-Za-z0-9]{4})/);
    if (!m) return;
    form.code = m[1].toUpperCase();
    if (!stored) render();
  }
  window.addEventListener('hashchange', codeFromHash);
  (function boot() {
    codeFromHash();
    render();
    restoreMe().then(function () {
      render();
      if (stored) {
        pull();
        startPoll();
      }
    });
  })();
})();
