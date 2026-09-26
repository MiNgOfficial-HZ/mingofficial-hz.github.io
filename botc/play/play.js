/* ============================================================
   血染钟楼 · 在线工具
   · 站长（说书人）登录后建房；玩家只要房间码 + 昵称，不用账号
   · 说书人先配板（bag），再由服务端洗牌发牌；身份只下发本人
   · 说书人视角 = 魔典（全部身份 + 中毒/醉酒/保护标记 + 夜序）
   · 轮询间隔 2.2s；页面切到后台就停，回到前台立刻补一次
   ============================================================ */
(function () {
  'use strict';
  var WORKER = 'https://api.giraffeming.online';
  var USER_LS = 'minghz.user.v1';
  var THEME_KEY = 'minghz.theme';
  var ROOM_LS = 'minghz.botc.room.v1';
  var NICK_LS = 'minghz.botc.nick';
  var POLL_MS = 2200;
  var TS_KEY = '0x4AAAAAAE9nhEhZUu-NfJNS';
  var B = window.BOTC || { roles: {}, nightFirst: [], nightOther: [] };

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var roleMeta = function (k) { return (B.roles && B.roles[k]) || {}; };
  var campName = function (c) { return B.campName ? B.campName(c) : c; };

  var session = readLS(USER_LS) || '';
  var me = null;
  var view = null;
  var stored = readRoom();
  var form = {
    seats: 8, hostPlays: false, baron: false,
    code: '', nick: readLS(NICK_LS) || '',
    bag: [], bagSeats: 0, pick: { by: 0, target: 0 }, killPick: [], msgSeat: 0
  };
  var timer = null;
  var lastRev = -1;
  var busy = false;
  var qrPainted = '';
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
  function dropRoom() { stored = null; view = null; lastRev = -1; writeLS(ROOM_LS, ''); stopPoll(); }
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
    if (root) { root.appendChild(el); setTimeout(function () { el.classList.add('out'); setTimeout(function () { el.remove(); }, 280); }, 3200); }
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

  /* ---------- 登录（说书人建房用） ---------- */
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
      '<p class="field-hint">只有站长 / 管理员能当说书人建房。玩家不需要登录，输入房间码就行。</p>';
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
  function openMsg(seat, nick) {
    form.msgSeat = seat;
    $('#modalTitle').textContent = '✉️ 给 ' + seat + ' 号 · ' + nick + ' 的私密信息';
    $('#modalBody').innerHTML =
      '<div class="field"><label>只有他一个人看得到</label><textarea id="mText" class="g-input" rows="3" maxlength="600" placeholder="例如：你看到 3 号与 6 号里有一位是占卜师。"></textarea></div>' +
      '<p class="field-hint">占卜师/洗衣妇/图书管理员这类信息都可以这样单独发，别人永远看不到。</p>';
    $('#modalFoot').innerHTML =
      '<button class="btn btn-ghost" type="button" data-act="close">取消</button>' +
      '<button class="btn btn-primary" type="button" data-act="send-msg">发送</button>';
    $('#modalBackdrop').hidden = false;
    document.body.style.overflow = 'hidden';
    var t = $('#mText'); if (t) t.focus();
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
    return api('/api/botc/state', { code: stored.code, token: stored.token || '', session: session }).then(function (res) {
      busy = false;
      if (res.ok && res.json.view) {
        var v = res.json.view;
        if (v.rev !== lastRev) {
          lastRev = v.rev;
          view = v;
          syncBag(v);
          render();
        }
        return;
      }
      if (res.status === 401 && res.json && res.json.need === 'auth') {
        me = null; setSession('');
        paintUserBtn();
        dropRoom();
        toast('登录状态过期了，重新登录一次就能接着当说书人', 'error');
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

  /* 说书人本地配板（跟着服务端同步，但打字/点选时不用等网络） */
  function syncBag(v) {
    if (!stored || !stored.host || !v || !v.god) return;
    var server = (v.bag || []).slice();
    var key = function (a) { return a.slice().sort().join(','); };
    if (form.bagSeats !== v.seats || key(form.bag) !== key(server)) {
      form.bag = server;
      form.bagSeats = v.seats;
    }
  }

  /* ---------- 入口：建房 / 加入 ---------- */
  function createRoom() {
    if (!me) { toast('先登录站长账号', 'error'); openLogin(); return; }
    api('/api/botc/create', { session: session, seats: form.seats, hostPlays: form.hostPlays, nick: me.nick }).then(function (res) {
      if (res.ok && res.json.ok) {
        saveRoom({ code: res.json.code, token: res.json.token || '', host: true });
        lastRev = -1; qrPainted = '';
        form.bag = []; form.bagSeats = 0;
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
    writeLS(NICK_LS, nick);
    api('/api/botc/join', { code: code, nick: nick }).then(function (res) {
      if (res.ok && res.json.ok) {
        saveRoom({ code: code, token: res.json.token, host: false });
        lastRev = -1; qrPainted = '';
        if (res.json.view) { view = res.json.view; lastRev = view.rev; }
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
    api('/api/botc/host', body).then(function (res) {
      busy = false;
      if (res.ok && res.json.view) {
        view = res.json.view; lastRev = view.rev;
        syncBag(view);
        render();
        if (action === 'close') { dropRoom(); render(); toast('房间已关闭'); }
        return;
      }
      toast((res.json && res.json.error) || '操作失败', 'error');
      if (res.status === 404) { dropRoom(); render(); }
    });
  }
  function joinLink() { return location.origin + '/botc/play/#code=' + (stored ? stored.code : ''); }

  /* ---------- 渲染小工具 ---------- */
  var CAMPS = ['townsfolk', 'outsider', 'minion', 'demon'];
  function campClass(c) { return 'camp-' + (c || 'townsfolk'); }
  function chipClass(c) { return c || 'townsfolk'; }
  function roleChip(role) {
    var m = roleMeta(role);
    if (!m.key) return '<span class="av-pill">身份未公开</span>';
    return '<span class="av-pill ' + campClass(m.camp) + '">' + esc(m.icon || '') + ' ' + esc(m.name) + '</span>';
  }
  function aliveText(p) { return p.alive ? '<span class="tagx">💚 存活</span>' : '<span class="tagx dead">☠️ 已死亡</span>'; }
  function seatLabel(v, s) {
    var p = (v.players || []).filter(function (x) { return x.seat === s; })[0];
    return p ? (s + ' 号 · ' + p.nick) : (s + ' 号');
  }
  /* 本地配板校验（和服务端同一套规则，用来即时提示） */
  function bagSummary(v) {
    var seats = v.seats;
    var bag = form.bag || [];
    var count = { townsfolk: 0, outsider: 0, minion: 0, demon: 0 };
    bag.forEach(function (k) { var c = roleMeta(k).camp; if (count[c] != null) count[c]++; });
    var hasBaron = bag.indexOf('baron') >= 0;
    var want = B.countsFor ? B.countsFor(seats, hasBaron) : { townsfolk: 0, outsider: 0, minion: 0, demon: 0 };
    var problems = [];
    if (bag.length !== seats) problems.push('已选 <b>' + bag.length + '</b> / ' + seats + ' 个角色');
    CAMPS.forEach(function (c) {
      if (count[c] !== want[c]) problems.push(campName(c) + ' ' + count[c] + ' / 应为 ' + want[c]);
    });
    return { count: count, want: want, hasBaron: hasBaron, problems: problems, ok: problems.length === 0 };
  }
  /* 自动配板（前端版）：随机挑一份合法阵容 */
  function shuffle(a) {
    var x = a.slice();
    for (var i = x.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = x[i]; x[i] = x[j]; x[j] = t; }
    return x;
  }
  function autoBag(seats, withBaron) {
    var town = [], out = [], min = [], dem = [];
    Object.keys(B.roles).forEach(function (k) {
      var c = B.roles[k].camp;
      if (c === 'townsfolk') town.push(k);
      else if (c === 'outsider') out.push(k);
      else if (c === 'minion') min.push(k);
      else if (c === 'demon') dem.push(k);
    });
    var baron = !!withBaron && seats >= 5;
    var want = B.countsFor(seats, baron);
    var pickedMin = shuffle(min).slice(0, want.minion);
    if (baron && pickedMin.indexOf('baron') < 0) pickedMin[0] = 'baron';
    return shuffle(shuffle(town).slice(0, want.townsfolk)
      .concat(shuffle(out).slice(0, want.outsider))
      .concat(pickedMin)
      .concat(shuffle(dem).slice(0, want.demon)));
  }

  function roomCodeCard(v, isHost) {
    return '<div class="g-card">' +
      '<div class="g-roomhead">' +
        '<div><div class="g-code">' + esc(v.code) + '</div>' +
        '<div class="g-code-sub">' + (isHost ? '把房间码或二维码给身边的朋友 · 打开 /botc/play/ 输入就能入座' : '你是这个房间的玩家') + '</div></div>' +
        (isHost ? '<div class="g-qr" id="qrBox"></div>' : '') +
      '</div>' +
      (isHost ? '<div class="g-actions">' +
        '<button class="btn btn-soft btn-small" type="button" data-act="copy">🔗 复制邀请链接</button>' +
        '<button class="btn btn-soft btn-small" type="button" data-act="lock">' + (v.locked ? '🔓 解锁房间' : '🔒 锁定房间') + '</button>' +
        '<button class="btn btn-ghost btn-small" type="button" data-act="close-room">关闭房间</button>' +
      '</div>' : '') +
    '</div>';
  }
  function seatsGrid(v, isHost) {
    var taken = {};
    (v.players || []).forEach(function (p) { taken[p.seat] = p; });
    var out = [];
    for (var s = 1; s <= v.seats; s++) {
      var p = taken[s];
      var mine = p && v.me && p.seat === v.me.seat;
      if (p) {
        out.push('<div class="g-seat taken' + (mine ? ' me' : '') + (p.alive === false ? ' dead' : '') + '">' +
          '<div class="no">' + s + ' 号' + (mine ? ' · 我' : '') + '</div>' +
          '<div class="nick">' + esc(p.nick) + '</div>' +
          (p.roleName ? '<div class="role">' + roleChip(p.role) + '</div>' : '') +
          '<div class="tags">' + aliveText(p) + (p.executed ? '<span class="tagx">⚖️ 被处决</span>' : '') + '</div>' +
          (isHost ? '<button class="kick" type="button" data-act="kick" data-seat="' + s + '" aria-label="请出房间">✕</button>' : '') +
        '</div>');
      } else {
        out.push('<div class="g-seat"><div class="no">' + s + ' 号</div><div class="empty">空座 · 等朋友入座</div></div>');
      }
    }
    return '<div class="g-seats">' + out.join('') + '</div>';
  }

  function renderHome() {
    var seats = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
    var want = B.countsFor ? B.countsFor(form.seats, form.baron) : null;
    var preview = want
      ? '<div class="bt-bag-sum">这一桌：<b>' + want.townsfolk + '</b> 镇民 · <b>' + want.outsider + '</b> 外来者 · <b>' + want.minion + '</b> 爪牙 · <b>' + want.demon + '</b> 恶魔' +
        (want.outsider > (B.counts[form.seats] || {}).outsider ? '（含男爵 +2 外来者）' : '') + '</div>'
      : '';
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
        '<label class="g-check"><input type="checkbox" id="optBaron"' + (form.baron ? ' checked' : '') + ' data-act="opt-baron" /> 打算放男爵（外来者 +2、镇民 −2）</label>' +
        '<label class="g-check"><input type="checkbox" id="optPlay"' + (form.hostPlays ? ' checked' : '') + ' data-act="opt-play" /> 我也参战（说书人自己占 1 个座位）</label>' +
        preview +
        '<div class="g-actions"><button class="btn btn-primary g-btn-lg" type="button" data-act="create">🧑‍⚖️ 创建房间</button></div>';
    }
    return '<div class="g-grid2">' +
      '<div class="g-card"><h2>🧑‍⚖️ 我是说书人：开一局</h2>' +
        '<p class="g-card-sub">你当说书人：建房 → 大家入座 → 按人数配板 → 一键发牌 → 顺着夜序走 → 白天记提名与处决 → 最后判定胜负。</p>' +
        hostBox +
      '</div>' +
      '<div class="g-card"><h2>🙋 我是玩家：加入房间</h2>' +
        '<p class="g-card-sub">不用注册账号。输入房间码 + 昵称就能入座，发牌后你的手机上只会显示你自己的身份。</p>' +
        '<div class="g-field"><label>房间码</label>' +
          '<input id="jCode" class="g-input g-code-input" maxlength="4" inputmode="latin" autocomplete="off" placeholder="ABCD" value="' + esc(form.code) + '" /></div>' +
        '<div class="g-field"><label>你的昵称</label>' +
          '<input id="jNick" class="g-input" maxlength="20" autocomplete="off" placeholder="例如：阿明" value="' + esc(form.nick) + '" /></div>' +
        '<div class="g-actions"><button class="btn btn-primary g-btn-lg" type="button" data-act="join">进房间 →</button></div>' +
      '</div>' +
    '</div>' +
    '<div class="g-card"><h3>📋 说书人 30 秒上手</h3>' +
      '<ol class="bt-hint-list">' +
        '<li>登录后建房，把 <b>房间码</b> 或二维码给大家；</li>' +
        '<li>每人用自己手机打开这一页，输房间码 + 昵称入座；</li>' +
        '<li>人齐后<b>配板</b>：按人数自动给一份合法阵容，也可以自己点着换（男爵会自动 +2 外来者）；</li>' +
        '<li>点「开始发牌」—— 身份在服务端洗牌，只发到本人手机上；</li>' +
        '<li>夜晚照<b>夜序</b>一个个叫人，把中毒/醉酒/保护点一下就好；</li>' +
        '<li>白天用「提名」记票、点「处决」执行；每晚把死的人标一下；</li>' +
        '<li>结束时点「公开全部身份」复盘。</li>' +
      '</ol></div>';
  }

  function renderHostLobby(v) {
    var full = (v.players || []).length === v.seats;
    var sum = bagSummary(v);
    var groups = [
      { c: 'townsfolk', label: '镇民', list: B.townsfolk || [] },
      { c: 'outsider', label: '外来者', list: B.outsiders || [] },
      { c: 'minion', label: '爪牙', list: B.minions || [] },
      { c: 'demon', label: '恶魔', list: B.demons || [] }
    ];
    var bagHtml = groups.map(function (g) {
      return '<p class="av-eyebrow" style="margin:14px 0 0">' + esc(g.label) + ' · ' + g.list.length + ' 个</p>' +
        '<div class="bt-bag">' + g.list.map(function (k) {
          var m = roleMeta(k);
          var on = form.bag.indexOf(k) >= 0;
          return '<button type="button" class="' + chipClass(m.camp) + (on ? ' on' : '') + '" data-act="bag-toggle" data-role="' + esc(k) + '">' +
            esc(m.icon || '') + ' ' + esc(m.name) + '</button>';
        }).join('') + '</div>';
    }).join('');

    return roomCodeCard(v, true) +
      '<div class="g-card"><h3>座位 ' + (v.players || []).length + ' / ' + v.seats + '</h3>' +
        seatsGrid(v, true) +
        ((v.players || []).length === 0
          ? '<div class="g-field" style="margin-top:14px"><label>还没人入座时，可以改人数</label><div class="g-row">' +
              [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map(function (n) {
                return '<button class="av-tab' + (v.seats === n ? ' on' : '') + '" type="button" data-act="set-seats" data-n="' + n + '">' + n + ' 人</button>';
              }).join('') + '</div></div>'
          : '') +
      '</div>' +
      '<div class="g-card"><h3>🎒 配板（这一局有哪些角色）</h3>' +
        '<p class="g-card-sub">血染钟楼不是随机发牌：先选好这一桌的角色，再洗牌发给每个人。数量和阵营要对得上才能发牌。</p>' +
        '<div class="g-actions">' +
          '<button class="btn btn-soft btn-small" type="button" data-act="bag-auto" data-baron="0">🎲 随机配一份</button>' +
          '<button class="btn btn-soft btn-small" type="button" data-act="bag-auto" data-baron="1">🎲 随机 + 男爵</button>' +
          '<button class="btn btn-ghost btn-small" type="button" data-act="bag-clear">清空</button>' +
        '</div>' +
        bagHtml +
        '<div class="bt-bag-sum" style="margin-top:16px">当前：<b>' + form.bag.length + '</b> / ' + v.seats + ' 个角色 · ' +
          '镇民 <b>' + sum.count.townsfolk + '</b> · 外来者 <b>' + sum.count.outsider + '</b> · 爪牙 <b>' + sum.count.minion + '</b> · 恶魔 <b>' + sum.count.demon + '</b>' +
        '</div>' +
        (sum.problems.length
          ? '<div class="bt-bag-sum"><span class="bad">还差一点：' + sum.problems.join(' · ') + '</span></div>'
          : '<div class="bt-bag-sum"><span style="color:var(--av-good);font-weight:600">✅ 这份配板是合法的，可以发牌</span></div>') +
        '<div class="g-actions">' +
          '<button class="btn btn-primary g-btn-lg" type="button" data-act="start"' + (full && sum.ok ? '' : ' disabled') + '>' +
            '🎲 开始发牌' + (full ? (sum.ok ? '' : '（先把配板配对）') : '（还差 ' + (v.seats - (v.players || []).length) + ' 人）') +
          '</button>' +
        '</div>' +
      '</div>';
  }

  function renderGuestLobby(v) {
    return roomCodeCard(v, false) +
      '<div class="g-card"><h3>已入座 ' + (v.players || []).length + ' / ' + v.seats + '</h3>' +
        seatsGrid(v, false) +
        '<div class="g-good" style="margin-top:14px">⏳ 等说书人配板并「开始发牌」… 你的身份会在这台手机上显示。</div>' +
        '<div class="g-actions"><button class="btn btn-ghost btn-small" type="button" data-act="leave">离开房间</button></div>' +
      '</div>';
  }

  /* ---------- 说书人：夜晚（夜序向导） ---------- */
  function nightPanel(v) {
    var list = (v.night > 1) ? (B.nightOther || []) : (B.nightFirst || []);
    var step = (v.god && v.god.nightStep) || 0;
    var inPlay = {};
    (v.bag || []).forEach(function (k) { inPlay[k] = 1; });
    var items = list.map(function (x, i) {
      var special = x.key === 'minion_info' || x.key === 'demon_info';
      var here = special || inPlay[x.key];
      return '<div class="nt-item' + (special ? ' is-special' : '') + '" style="' + (i === step ? 'border-color:var(--accent);box-shadow:0 0 0 1px var(--accent) inset' : '') + (here ? '' : ';opacity:0.42') + '">' +
        '<div class="nt-k">' + ('0' + (i + 1)).slice(-2) + '</div>' +
        '<div><span class="nt-name">' + esc(x.name) + '</span>' +
        (special ? '' : (here ? ' <span class="tagx" style="color:var(--av-good);border-color:var(--av-good)">在场</span>' : ' <span class="tagx">不在场</span>')) +
        '<div class="nt-note">' + esc(x.note) + '</div></div></div>';
    }).join('');
    var cur = list[step];
    return '<div class="g-card"><div class="bt-console-head">' +
        '<h3 style="flex:1">🌙 第 ' + v.night + ' 夜 · 夜序</h3>' +
        '<span class="bt-phase night">' + (cur ? esc(cur.name) : '夜序走完') + '</span>' +
      '</div>' +
      '<p class="g-card-sub">' + (v.night > 1 ? '之后的夜晚顺序（恶魔从第 2 夜开始杀人）' : '首夜顺序：先让坏人认脸，再一个个叫醒有首夜能力的角色') + '</p>' +
      '<div class="nt-list">' + items + '</div>' +
      '<div class="g-actions">' +
        '<button class="btn btn-soft btn-small" type="button" data-act="night-prev"' + (step <= 0 ? ' disabled' : '') + '>← 上一位</button>' +
        '<button class="btn btn-primary btn-small" type="button" data-act="night-next">下一位 →</button>' +
        '<button class="btn btn-soft btn-small" type="button" data-act="to-day">☀️ 天亮（进入白天）</button>' +
      '</div>' +
      '<p class="av-hint" style="margin-top:12px">不在场的角色已经调暗 —— 只叫亮着的那些。</p>' +
    '</div>';
  }

  /* ---------- 说书人：魔典（玩家状态表） ---------- */
  function grimoire(v) {
    var rows = ((v.god && v.god.players) || []).map(function (p) {
      var marks = '';
      if (p.poisoned) marks += '<span class="tagx poison">🧪 中毒</span>';
      if (p.drunk) marks += '<span class="tagx poison">🍺 醉酒</span>';
      if (p.protected) marks += '<span class="tagx protect">🛡️ 被保护</span>';
      if (p.ghost) marks += '<span class="tagx ghost">👻 幽灵票已用</span>';
      if (p.alive === false) marks += '<span class="tagx dead">☠️ 死亡' + (p.executed ? '（处决）' : '') + '</span>';
      var msgs = (p.messages || []).length ? '<span class="tagx">✉️ 已发 ' + p.messages.length + ' 条</span>' : '';
      return '<div class="g-card" style="padding:14px 16px;margin-bottom:10px">' +
        '<div class="g-god-row" style="margin:0;border:none;background:none;padding:0">' +
          '<span class="no">' + p.seat + ' 号</span>' +
          '<span class="nick">' + esc(p.nick) + '</span>' +
          roleChip(p.role) +
        '</div>' +
        '<div class="g-row" style="margin-top:8px">' + (marks || '<span class="tagx">状态正常</span>') + msgs + '</div>' +
        '<div class="g-actions" style="margin-top:10px">' +
          '<button class="av-tab' + (p.poisoned ? ' on' : '') + '" type="button" data-act="mark" data-seat="' + p.seat + '" data-mark="poison" data-on="' + (p.poisoned ? '0' : '1') + '">🧪 中毒</button>' +
          '<button class="av-tab' + (p.drunk ? ' on' : '') + '" type="button" data-act="mark" data-seat="' + p.seat + '" data-mark="drunk" data-on="' + (p.drunk ? '0' : '1') + '">🍺 醉酒</button>' +
          '<button class="av-tab' + (p.protected ? ' on' : '') + '" type="button" data-act="mark" data-seat="' + p.seat + '" data-mark="protect" data-on="' + (p.protected ? '0' : '1') + '">🛡️ 保护</button>' +
          '<button class="av-tab' + (p.ghost ? ' on' : '') + '" type="button" data-act="mark" data-seat="' + p.seat + '" data-mark="ghost" data-on="' + (p.ghost ? '0' : '1') + '">👻 幽灵票</button>' +
          (p.alive === false
            ? '<button class="btn btn-ghost btn-small" type="button" data-act="alive" data-seat="' + p.seat + '" data-alive="1">♻️ 复活</button>'
            : '<button class="btn btn-ghost btn-small" type="button" data-act="alive" data-seat="' + p.seat + '" data-alive="0">☠️ 标记死亡</button>') +
          '<button class="btn btn-soft btn-small" type="button" data-act="msg" data-seat="' + p.seat + '">✉️ 发信息</button>' +
          (p.role ? '<a class="btn btn-ghost btn-small" href="/botc/roles/' + esc(p.role) + '/" target="_blank" rel="noopener">📖 这个角色</a>' : '') +
        '</div>' +
      '</div>';
    }).join('');
    return '<div class="g-card"><div class="bt-console-head">' +
        '<h3 style="flex:1">📖 魔典（只有你看得到）</h3>' +
        '<span class="bt-phase">存活 ' + v.alive + ' / ' + v.players.length + '</span>' +
      '</div>' +
      '<p class="g-card-sub">身份、中毒、醉酒、保护都是说书人信息，永远不会下发给玩家。点一下就能开关标记。</p>' +
      '<div style="margin-top:14px">' + rows + '</div>' +
      '<div class="g-actions">' +
        '<button class="btn btn-soft btn-small" type="button" data-act="reveal" data-on="' + (v.reveal ? '0' : '1') + '">' + (v.reveal ? '🙈 收起全部身份' : '📢 公开全部身份') + '</button>' +
        '<button class="btn btn-ghost btn-small" type="button" data-act="close-room">关闭房间</button>' +
      '</div>' +
    '</div>';
  }

  /* ---------- 说书人：夜晚结算 ---------- */
  function killPanel(v) {
    if (v.phase !== 'night') return '';
    var alive = ((v.god && v.god.players) || []).filter(function (p) { return p.alive; });
    var picks = form.killPick || [];
    return '<div class="g-card"><h3>🌙 今晚谁死了</h3>' +
      '<p class="g-card-sub">点一下今晚要死的人，再确认。记得先处理完武僧、士兵、猩红女郎这些例外，再点这个按钮。</p>' +
      '<div class="bt-nompick">' + alive.map(function (p) {
        var on = picks.indexOf(p.seat) >= 0;
        return '<button type="button" class="' + (on ? 'on' : '') + '" data-act="kill-pick" data-seat="' + p.seat + '">' +
          p.seat + ' 号 · ' + esc(p.nick) + '</button>';
      }).join('') + '</div>' +
      '<div class="g-actions">' +
        '<button class="btn btn-primary" type="button" data-act="kill-apply"' + (picks.length ? '' : ' disabled') + '>☠️ 确认今晚的死亡（' + picks.length + ' 人）</button>' +
        '<button class="btn btn-ghost btn-small" type="button" data-act="kill-clear">清空选择</button>' +
      '</div>' +
      '<p class="av-hint" style="margin-top:10px">如果今晚死的是渡鸦看守，记得单独叫醒他，让他选一名玩家并看到那个人的身份。</p>' +
    '</div>';
  }

  /* ---------- 说书人：白天（提名与处决） ---------- */
  function dayPanel(v) {
    if (v.phase !== 'day') return '';
    var alive = (v.players || []).filter(function (p) { return p.alive; });
    var day = v.day || 1;
    var today = (v.nominations || []).filter(function (n) { return n.day === day; });
    var liveCount = alive.length;
    var need = Math.floor(liveCount / 2) + 1;

    var builder = '<div class="g-card"><h3>☀️ 第 ' + day + ' 天 · 提名</h3>' +
      '<p class="g-card-sub">每个活人每天只能提名一次、也只能被提名一次；死者可以投出自己唯一的一张幽灵票。处决需要 <b>' + need + '</b> 票（存活 ' + liveCount + ' 人，过半）。</p>' +
      '<div class="g-field" style="margin-top:12px"><label>谁来提名</label><div class="bt-nompick">' +
        alive.map(function (p) {
          var used = today.some(function (n) { return n.by === p.seat; });
          return '<button type="button" class="' + (form.pick.by === p.seat ? 'on' : '') + '"' + (used ? ' disabled' : '') +
            ' data-act="pick-by" data-seat="' + p.seat + '">' + p.seat + ' 号 ' + esc(p.nick) + (used ? '（今天已提名）' : '') + '</button>';
        }).join('') + '</div></div>' +
      '<div class="g-field"><label>提名谁</label><div class="bt-nompick">' +
        alive.map(function (p) {
          var used = today.some(function (n) { return n.target === p.seat; });
          var disabled = used || form.pick.by === p.seat;
          return '<button type="button" class="' + (form.pick.target === p.seat ? 'on' : '') + '"' + (disabled ? ' disabled' : '') +
            ' data-act="pick-target" data-seat="' + p.seat + '">' + p.seat + ' 号 ' + esc(p.nick) + (used ? '（今天已被提名）' : '') + '</button>';
        }).join('') + '</div></div>' +
      '<div class="g-actions"><button class="btn btn-primary" type="button" data-act="nominate"' +
        (form.pick.by && form.pick.target && form.pick.by !== form.pick.target ? '' : ' disabled') + '>📣 提交提名</button></div>' +
    '</div>';

    var listHtml = today.length
      ? '<div class="g-card"><h3>今天的提名与投票</h3>' + today.map(function (n) {
          var idx = (v.nominations || []).indexOf(n);
          var votes = n.votes || [];
          var enough = votes.length >= need;
          return '<div style="border:1px solid var(--line);border-radius:16px;padding:14px;margin-top:14px' + (n.executed ? ';border-color:var(--av-evil)' : '') + '">' +
            '<div class="g-god-row" style="margin:0;border:none;background:none;padding:0">' +
              '<span class="nick">' + esc(seatLabel(v, n.by)) + ' 提名 ' + esc(seatLabel(v, n.target)) + '</span>' +
              '<span class="av-pill ' + (enough ? 'camp-townsfolk' : '') + '">' + votes.length + ' 票 / 需 ' + need + '</span>' +
              (n.executed ? '<span class="tagx dead">⚖️ 已处决</span>' : '') +
            '</div>' +
            '<p class="av-hint" style="margin-top:8px">点名字＝举手赞成（死者那一票用过就没了）：</p>' +
            '<div class="bt-nompick">' + (v.players || []).map(function (p) {
              var on = votes.indexOf(p.seat) >= 0;
              var ghostUsed = !p.alive && p.ghost && !on;
              return '<button type="button" class="' + (on ? 'on' : '') + '"' + (ghostUsed ? ' disabled' : '') +
                ' data-act="vote" data-index="' + idx + '" data-seat="' + p.seat + '">' +
                (p.alive ? '' : '👻 ') + p.seat + ' 号 ' + esc(p.nick) + (ghostUsed ? '（票已用）' : '') + '</button>';
            }).join('') + '</div>' +
            (n.executed ? '' : '<div class="g-actions">' +
              '<button class="btn btn-primary btn-small" type="button" data-act="execute" data-index="' + idx + '"' + (votes.length ? '' : ' disabled') + '>⚖️ 处决 ' + esc(seatLabel(v, n.target)) + '</button>' +
              '<button class="btn btn-ghost btn-small" type="button" data-act="no-execute" data-index="' + idx + '">今天不处决他</button>' +
            '</div>') +
          '</div>';
        }).join('') + '</div>'
      : '';

    return builder + listHtml +
      '<div class="g-card"><div class="g-actions" style="margin-top:0">' +
        '<button class="btn btn-soft" type="button" data-act="to-night">🌙 天黑，进入第 ' + ((v.night || 1) + 1) + ' 夜</button>' +
      '</div></div>';
  }

  /* ---------- 胜负提示 ---------- */
  function winHints(v) {
    if (!v.god || v.status === 'ended') return '';
    var ps = v.god.players || [];
    var alive = ps.filter(function (p) { return p.alive; });
    var dead = ps.filter(function (p) { return !p.alive; });
    var hints = [];
    var demonAlive = alive.some(function (p) { return p.camp === 'demon'; });
    var scarlet = alive.some(function (p) { return p.role === 'scarlet_woman'; });
    var executedSaint = dead.some(function (p) { return p.role === 'saint' && p.executed; });
    var executedToday = (v.nominations || []).some(function (n) { return n.day === (v.day || 0) && n.executed; });
    var mayorAlive = alive.some(function (p) { return p.role === 'mayor'; });

    if (!demonAlive && scarlet && alive.length >= 5) {
      hints.push({ side: 'evil', text: '恶魔死了，但场上还有猩红女郎、存活 ' + alive.length + ' 人 —— 她会接任恶魔，游戏继续（记得把她的身份改成小恶魔）。' });
    } else if (!demonAlive && scarlet) {
      hints.push({ side: 'good', text: '恶魔已死亡。猩红女郎虽然在场，但存活只剩 ' + alive.length + ' 人（不足 5 人）—— 她的能力不生效，好人获胜。' });
    } else if (!demonAlive && v.day > 0) {
      hints.push({ side: 'good', text: '恶魔已经死了 —— 好人阵营获胜。' });
    }
    if (executedSaint) hints.push({ side: 'evil', text: '圣人被处决了 —— 按规则好人阵营立刻落败。' });
    if (demonAlive && alive.length <= 2) hints.push({ side: 'evil', text: '场上只剩 ' + alive.length + ' 名玩家存活、恶魔还活着 —— 邪恶阵营获胜。' });
    if (alive.length === 3 && !executedToday && mayorAlive) hints.push({ side: 'good', text: '只剩 3 人存活、今天没有处决，而且镇长还在场 —— 好人阵营获胜。' });
    if (!hints.length) return '';
    return '<div class="g-card"><h3>⚖️ 胜负提示</h3>' +
      '<p class="g-card-sub">工具只按规则提示，最终由你说书人判定（中毒、醉酒、猩红女郎这些例外都要自己算进去）。</p>' +
      hints.map(function (h) {
        return '<div class="' + (h.side === 'evil' ? 'g-warn' : 'g-good') + '" style="margin-top:12px">' + esc(h.text) +
          '<div class="g-actions"><button class="btn ' + (h.side === 'evil' ? 'btn-soft' : 'btn-primary') + ' btn-small" type="button" data-act="winner" data-side="' + h.side + '">' +
          '判定' + (h.side === 'good' ? '好人' : '邪恶') + '获胜</button></div></div>';
      }).join('') + '</div>';
  }

  function logPanel(v) {
    return '<div class="g-card"><h3>房间日志</h3>' +
      '<div class="g-log">' + (v.log || []).slice().reverse().map(function (x) { return '<div>' + esc(x) + '</div>'; }).join('') + '</div>' +
      '<div class="g-actions">' +
        '<button class="btn btn-soft btn-small" type="button" data-act="reset">↺ 回到大厅重新配板</button>' +
        '<button class="btn btn-soft btn-small" type="button" data-act="winner" data-side="good">判定好人胜</button>' +
        '<button class="btn btn-soft btn-small" type="button" data-act="winner" data-side="evil">判定邪恶胜</button>' +
      '</div></div>';
  }

  function renderHostGame(v) {
    var ended = v.status === 'ended';
    var tonight = (v.nominations || []).filter(function (n) { return n.day === (v.day || 0); }).length;
    var head = '<div class="g-card"><div class="bt-console-head">' +
        '<h2 style="flex:1">🧑‍⚖️ 说书人面板 · 房间 ' + esc(v.code) + '</h2>' +
        '<span class="bt-phase ' + (v.phase === 'night' ? 'night' : 'day') + '">' +
          (ended ? '已结束' : (v.phase === 'night' ? '🌙 第 ' + v.night + ' 夜' : '☀️ 第 ' + v.day + ' 天')) +
        '</span>' +
        '<span class="bt-live"><span class="dot"></span>自动同步</span>' +
      '</div>' +
      '<div class="g-actions" style="margin-top:14px">' +
        '<span class="av-pill">座位 ' + v.players.length + ' / ' + v.seats + '</span>' +
        '<span class="av-pill">存活 ' + v.alive + ' / ' + v.players.length + '</span>' +
        '<span class="av-pill">今天提名 ' + tonight + '</span>' +
        (v.locked ? '<span class="av-pill">🔒 已锁定</span>' : '') +
      '</div></div>';
    var endCard = '';
    if (ended) {
      var winText = v.winner === 'good' ? '好人阵营获胜 🎉' : (v.winner === 'evil' ? '邪恶阵营获胜 🎭' : '本局结束');
      endCard = '<div class="g-card"><h2>' + esc(winText) + '</h2>' +
        (v.endNote ? '<p class="g-card-sub">' + esc(v.endNote) + '</p>' : '') +
        '<p class="g-card-sub">身份已经公开，可以复盘了：谁在什么时候说错了话、谁在最关键的那一票上撒了谎。</p></div>';
    }
    return head + endCard +
      (ended ? '' : (v.phase === 'night' ? nightPanel(v) + killPanel(v) : dayPanel(v))) +
      winHints(v) + grimoire(v) + logPanel(v);
  }

  /* ---------- 玩家：身份牌与游戏进行中 ---------- */
  function idCard(v) {
    var m = v.me || {};
    var r = roleMeta(m.role);
    if (!r.key) return '<div class="g-good">说书人还没有发身份，稍等一下～</div>';
    return '<div class="g-idcard ' + campClass(m.camp) + '" id="idCard">' +
      '<div class="av-pill" style="margin-bottom:12px">你是 ' + m.seat + ' 号 · ' + esc(m.nick) + '</div>' +
      '<div class="ico">' + esc(r.icon || '🎴') + '</div>' +
      '<div class="rname">' + esc(r.name || '') + '</div>' +
      '<div class="ren">' + esc(r.en || '') + ' · ' + esc(campName(m.camp)) +
        (B.campGroup && B.campGroup(m.camp) === 'evil' ? '（邪恶阵营）' : '（好人阵营）') + '</div>' +
      '<div class="rtag">' + esc(r.tagline || '') + '</div>' +
      '<div class="g-cover" data-hold="1">' +
        '<div class="big">🎴</div>' +
        '<div class="say">按住屏幕查看你的身份</div>' +
        '<small>松手就盖回去 · 别让旁边的人看到</small>' +
      '</div>' +
    '</div>';
  }

  function renderGuestGame(v) {
    var m = v.me || {};
    var r = roleMeta(m.role);
    var pieces = [];
    pieces.push('<div class="g-card"><h3>房间 ' + esc(v.code) + '</h3>' +
      '<p class="g-card-sub">' + (v.phase === 'night' ? '🌙 第 ' + v.night + ' 夜' : '☀️ 第 ' + v.day + ' 天') +
      ' · 存活 ' + v.alive + ' / ' + v.players.length + ' 人 · 说书人：' + esc(v.hostNick) + '</p>' +
      '<div class="g-actions"><button class="btn btn-ghost btn-small" type="button" data-act="leave">离开房间</button></div></div>');
    if (v.status === 'ended') {
      pieces.push('<div class="g-card"><h2>' + (v.winner === 'good' ? '好人阵营获胜 🎉' : (v.winner === 'evil' ? '邪恶阵营获胜 🎭' : '本局结束')) + '</h2>' +
        (v.endNote ? '<p class="g-card-sub">' + esc(v.endNote) + '</p>' : '') + '</div>');
    }
    if (r.key) {
      pieces.push('<div class="g-card"><h3>你的身份牌</h3>' + idCard(v) +
        '<p class="g-card-sub">按住卡片查看，松手就盖回去。</p>' +
        '<div class="g-actions"><a class="btn btn-soft btn-small" href="/botc/roles/' + esc(m.role) + '/">📖 这个角色的完整打法</a></div></div>');
    }
    if ((m.messages || []).length) {
      pieces.push('<div class="g-card"><h3>✉️ 说书人给你的信息</h3>' +
        '<div class="g-msgs">' + m.messages.map(function (x) {
          var t = new Date(x.t);
          var hh = ('0' + t.getHours()).slice(-2) + ':' + ('0' + t.getMinutes()).slice(-2);
          return '<div class="g-msg mine"><div class="g-msg-meta">' + hh + ' · 只有你能看到</div>' + esc(x.text) + '</div>';
        }).join('') + '</div></div>');
    }
    pieces.push('<div class="g-card"><h3>你现在的状态</h3>' +
      '<div class="g-row">' + aliveText(m) +
        (m.executed ? '<span class="tagx dead">⚖️ 被处决</span>' : '') +
        (m.alive === false ? (m.ghost ? '<span class="tagx ghost">👻 幽灵票已用过</span>' : '<span class="tagx ghost">👻 你还有一张幽灵票</span>') : '') +
        (m.butler ? '<span class="tagx">🫖 明天只能跟 ' + m.butler + ' 号一起投票</span>' : '') +
      '</div>' +
      (m.alive === false ? '<p class="g-card-sub">死亡不等于出局：你仍然可以说话、可以影响投票，只是不能再提名、也不能被提名。</p>' : '') +
    '</div>');
    pieces.push('<div class="g-card"><h3>全场座位</h3>' + seatsGrid(v, false) + '</div>');
    if ((v.nominations || []).length) {
      pieces.push('<div class="g-card"><h3>提名与投票</h3>' + v.nominations.map(function (n) {
        return '<div class="g-msg"><div class="g-msg-meta">第 ' + n.day + ' 天</div>' +
          esc(seatLabel(v, n.by)) + ' 提名 ' + esc(seatLabel(v, n.target)) + ' · 得到 <b>' + n.count + '</b> 票' +
          (n.executed ? ' · <span style="color:var(--av-evil)">已被处决</span>' : '') + '</div>';
      }).join('') + '</div>');
    }
    return pieces.join('');
  }

  /* ---------- 主渲染 ---------- */
  function render() {
    var app = $('#gApp');
    if (!app) return;
    paintUserBtn();
    var html = '';
    var v = view;
    if (!stored || !v) html = renderHome();
    else if (v.status === 'lobby') html = stored.host ? renderHostLobby(v) : renderGuestLobby(v);
    else html = stored.host ? renderHostGame(v) : renderGuestGame(v);
    qrPainted = '';
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
    else if (act === 'kick') hostAction('kick', { seat: Number(el.getAttribute('data-seat')) });
    else if (act === 'lock') hostAction('lock', { locked: !(view && view.locked) });
    else if (act === 'close-room') {
      askConfirm('关闭房间', '房间里的人会全部掉线，房间也会被回收。确定吗？', '关闭房间', function () { hostAction('close'); });
    }
    else if (act === 'copy') {
      var link = joinLink();
      var done = function () { toast('邀请链接已复制：' + link); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(done, function () { window.prompt('复制这个链接给朋友：', link); });
      else window.prompt('复制这个链接给朋友：', link);
    }
    else if (act === 'leave') {
      dropRoom(); render();
      toast('已离开房间（说书人那边还留着你的座位）', 'info');
    }
    else if (act === 'bag-toggle') {
      var k = el.getAttribute('data-role');
      var i = form.bag.indexOf(k);
      if (i >= 0) form.bag.splice(i, 1); else form.bag.push(k);
      render();
      hostAction('bag', { roles: form.bag });
    }
    else if (act === 'bag-auto') hostAction('bagAuto', { baron: el.getAttribute('data-baron') === '1' });
    else if (act === 'bag-clear') { form.bag = []; render(); hostAction('bag', { roles: [] }); }
    else if (act === 'start') {
      askConfirm('开始发牌', '身份会在服务端洗好，只发到每个人的手机上。发牌之后说书人也只能看魔典、不能改配板了。', '开始发牌', function () { hostAction('start'); });
    }
    else if (act === 'night-next') hostAction('nightStep', { step: ((view.god && view.god.nightStep) || 0) + 1 });
    else if (act === 'night-prev') hostAction('nightStep', { step: Math.max(0, ((view.god && view.god.nightStep) || 0) - 1) });
    else if (act === 'to-day') { form.killPick = []; hostAction('toDay'); }
    else if (act === 'to-night') { form.pick = { by: 0, target: 0 }; hostAction('toNight'); }
    else if (act === 'kill-pick') {
      var ks = Number(el.getAttribute('data-seat'));
      form.killPick = form.killPick || [];
      var ki = form.killPick.indexOf(ks);
      if (ki >= 0) form.killPick.splice(ki, 1); else form.killPick.push(ks);
      render();
    }
    else if (act === 'kill-clear') { form.killPick = []; render(); }
    else if (act === 'kill-apply') {
      var seats = (form.killPick || []).slice();
      if (!seats.length) return;
      askConfirm('确认今晚的死亡', '这一晚死了：' + seats.join(' 号、') + ' 号。确认后会把他们的状态改成死亡。', '确认', function () {
        form.killPick = [];
        hostAction('kill', { seats: seats });
      });
    }
    else if (act === 'mark') hostAction('mark', { seat: Number(el.getAttribute('data-seat')), mark: el.getAttribute('data-mark'), on: el.getAttribute('data-on') === '1' });
    else if (act === 'alive') hostAction('alive', { seat: Number(el.getAttribute('data-seat')), alive: el.getAttribute('data-alive') === '1' });
    else if (act === 'msg') {
      var ms = Number(el.getAttribute('data-seat'));
      var mp = (view.players || []).filter(function (p) { return p.seat === ms; })[0] || {};
      openMsg(ms, mp.nick || '');
    }
    else if (act === 'send-msg') {
      var text = String(($('#mText') || {}).value || '').trim();
      if (!text) { toast('信息不能为空', 'error'); return; }
      var seat = form.msgSeat;
      closeModal();
      hostAction('msg', { seat: seat, text: text });
    }
    else if (act === 'pick-by') { form.pick.by = Number(el.getAttribute('data-seat')); render(); }
    else if (act === 'pick-target') { form.pick.target = Number(el.getAttribute('data-seat')); render(); }
    else if (act === 'nominate') {
      var p = form.pick;
      if (!p.by || !p.target || p.by === p.target) return;
      form.pick = { by: 0, target: 0 };
      hostAction('nominate', { by: p.by, target: p.target });
    }
    else if (act === 'vote') {
      var vi = Number(el.getAttribute('data-index'));
      var vs = Number(el.getAttribute('data-seat'));
      var nom = (view.nominations || [])[vi];
      if (!nom) return;
      var votes = (nom.votes || []).slice();
      var x = votes.indexOf(vs);
      if (x >= 0) votes.splice(x, 1); else votes.push(vs);
      hostAction('votes', { index: vi, votes: votes });
    }
    else if (act === 'execute') {
      var ei = Number(el.getAttribute('data-index'));
      var en = (view.nominations || [])[ei];
      if (!en) return;
      askConfirm('执行处决', '确认处决 ' + en.target + ' 号？他今天就会被标记为死亡（身份依然不公开）。', '处决', function () {
        hostAction('execute', { index: ei, execute: true });
      });
    }
    else if (act === 'no-execute') hostAction('execute', { index: Number(el.getAttribute('data-index')), execute: false });
    else if (act === 'reveal') hostAction('reveal', { reveal: el.getAttribute('data-on') === '1' });
    else if (act === 'reset') {
      askConfirm('回到大厅', '身份会清空，配板保留，所有人留在座位上等你重新发牌。确定吗？', '回到大厅', function () { hostAction('reset'); });
    }
    else if (act === 'winner') {
      var side = el.getAttribute('data-side');
      askConfirm('判定胜负', '确认判定' + (side === 'good' ? '好人' : '邪恶') + '阵营获胜？判定后这一局结束，并会公开全部身份。', '确认判定', function () {
        hostAction('winner', { side: side, note: '' });
      });
    }
  });

  /* 复选项（checkbox 在 label 里，不能只靠 click 委托） */
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (!t || !t.getAttribute) return;
    if (t.getAttribute('data-act') === 'opt-play') { form.hostPlays = !!t.checked; render(); }
    if (t.getAttribute('data-act') === 'opt-baron') { form.baron = !!t.checked; render(); }
  });

  /* 按住查看身份（鼠标 / 触屏都支持） */
  function peekOn(el) {
    var card = el.closest ? el.closest('.g-idcard') : null;
    if (card) card.classList.add('peeked');
  }
  function peekOff() {
    $$('.g-idcard.peeked').forEach(function (c) { c.classList.remove('peeked'); });
  }
  document.addEventListener('pointerdown', function (e) {
    var el = e.target.closest ? e.target.closest('[data-hold]') : null;
    if (el) { e.preventDefault(); peekOn(el); }
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
      var c = $('#idCard'); if (c) c.classList.add('peeked');
    }
  });
  document.addEventListener('keyup', function (e) { if (e.code === 'Space') peekOff(); });
  var backdrop = $('#modalBackdrop');
  if (backdrop) backdrop.addEventListener('mousedown', function (e) { if (e.target === this) closeModal(); });
  var userBtn = $('#gUserBtn');
  if (userBtn) userBtn.addEventListener('click', function () {
    if (!me) { openLogin(); return; }
    toast('当前登录：' + (me.nick || me.username || '我') + (me.role === 'owner' ? '（站长）' : (me.role === 'admin' ? '（管理员）' : '')), 'info');
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
      if (stored) { pull(); startPoll(); }
    });
  })();
})();
