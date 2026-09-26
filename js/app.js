/* ============================================================
   MiNgHZ 的小站 · app.js
   云端同步版：读取 GitHub minghz-db/db.json；
   所有写入经 Cloudflare Worker 代理（/api/msg, /api/admin），
   页面不携带 GitHub Token / 管理密码等任何密钥
   ============================================================ */
(function () {
  'use strict';

  /* ---------- 云端配置 ---------- */
  var WORKER = 'https://api.giraffeming.online';
  var CACHE_KEY = 'minghz.site.cache.v3';
  var THEME_KEY = 'minghz.theme';

  /* ---------- 登录状态（账号密码会话，12 小时有效） ---------- */
  var isAdmin = false;

  function syncAdminUI() {
    document.body.classList.toggle('admin-mode', isAdmin);
    document.body.classList.toggle('can-edit', isAdmin);
    var btn = $('#adminBtn'); if (btn) btn.textContent = isAdmin ? '🔓 退出管理' : '🔐 管理';
    var ub = $('#userBtn');
    if (ub) {
      ub.textContent = myUser
        ? ((myUser.avatar && !/^https?:/i.test(myUser.avatar) ? myUser.avatar : '😊') + ' 我的账户（' + (myUser.nick || '') + '）')
        : '👤 登录 / 我的账户';
      ub.setAttribute('aria-label', myUser ? '我的账户（' + (myUser.nick || '') + '）' : '登录 / 我的账户');
    }
    var gh = $('#guestHint');
    if (gh) gh.hidden = !!myUser;
  }

  function apiPost(path, body) {
    return fetch(WORKER + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().then(function (j) {
        return { ok: r.ok, status: r.status, json: j };
      }).catch(function () {
        return { ok: false, status: r.status, json: {} };
      });
    });
  }

  /* ---------- 用户系统（邮箱验证码 / 密码 / 会话 / 管理面板） ---------- */
  var USER_LS = 'minghz.user.v1';
  var mySession = (function () { try { return localStorage.getItem(USER_LS) || ''; } catch (e) { return ''; } })();
  var myUser = null;
  /* 服务端下发的头像字段叫 av，前端统一成 avatar，避免两处命名不一致 */
  function setMyUser(u) {
    myUser = u || null;
    if (myUser && !myUser.avatar) myUser.avatar = myUser.av || '';
    return myUser;
  }

  function saveUserSession(s) {
    mySession = s || '';
    try { if (s) localStorage.setItem(USER_LS, s); else localStorage.removeItem(USER_LS); } catch (e) {}
  }
  var PERM_MAP = { moment: 'say', travel: 'travel', tech: 'tech', study: 'study', trip: 'trips', friend: 'friends', msg: 'msg', device: 'device' };
  function isOwnerUser() { return !!myUser && myUser.role === 'owner'; }
  function isAdminUser() { return !!myUser && myUser.role === 'admin'; }
  function memberCan(key) { return !!myUser && myUser.role === 'member' && !!S.perms.member[key]; }

  /* 新增内容的权限（谁能发说说 / 写指南 / 加游记…） */
  function permFor(kindRaw) {
    if (!myUser) return false;
    if (myUser.role === 'owner') return true;
    /* 个人空间（游记 / 数码 / 设备）是站长的私人地盘：管理员和普通用户只能看 */
    if (kindRaw === 'travel' || kindRaw === 'tech' || kindRaw === 'device') return false;
    if (myUser.role === 'admin') return !!S.perms.admin[PERM_MAP[kindRaw]];
    if (kindRaw === 'moment') return memberCan('canPost') || memberCan('canEdit');
    if (kindRaw === 'study') return memberCan('canGuide') || memberCan('canEdit');
    if (kindRaw === 'trip') return memberCan('canTrip') || memberCan('canEdit');
    if (kindRaw === 'msg') return memberCan('canMsg');
    return memberCan('canEdit');
  }

  /* 针对具体某一条：本人发的能改能删，其余看「可编辑全部内容」 */
  function canManage(kindRaw, item) {
    if (!myUser) return false;
    if (isOwnerUser()) return true;
    if (kindRaw === 'travel' || kindRaw === 'tech' || kindRaw === 'device') return false;
    if (isAdminUser()) return !!S.perms.admin[PERM_MAP[kindRaw]];
    var mine = !!(item && item.authorId && myUser && item.authorId === myUser.id);
    if (kindRaw === 'moment' || kindRaw === 'study' || kindRaw === 'trip') return mine || !!S.perms.member.canEdit;
    return !!S.perms.member.canEdit;
  }
  function canPostMoment() { return permFor('moment'); }
  function canCommentMoment() {
    if (!myUser) return false;
    if (isOwnerUser()) return true;
    if (isAdminUser()) return !!S.perms.admin.say;
    return memberCan('canComment') || memberCan('canEdit');
  }
  function canDelComment(item, c) {
    if (!myUser) return false;
    if (isOwnerUser()) return true;
    if (isAdminUser()) return !!S.perms.admin.say;
    if (c && c.authorId && c.authorId === myUser.id) return true;
    if (item && item.authorId && item.authorId === myUser.id) return true;   /* 自己的帖子下面可以清理跟帖 */
    return !!S.perms.member.canEdit;
  }
  function canEditAny() {
    if (!myUser) return false;
    var p = S.perms;
    if (myUser.role === 'owner') return true;
    if (myUser.role === 'admin') { var ks = Object.keys(p.admin); for (var i = 0; i < ks.length; i++) { if (p.admin[ks[i]]) return true; } return false; }
    if (myUser.role === 'member') return !!(p.member.canEdit || p.member.canPost || p.member.canGuide);
    return false;
  }
  function hasPanelRight() { return !!myUser && (myUser.role === 'owner' || myUser.role === 'admin'); }
  function isOwnerRole() { return !!myUser && myUser.role === 'owner'; }
  function refreshAdminState() {
    isAdmin = canEditAny();
    syncAdminUI();
    syncPermUI();
  }

  function logoutUser() {
    var oldSession = mySession;
    saveUserSession('');
    myUser = null;
    usersCache = null;
    pickerState.post = []; pickerState.modal = [];
    closeModal();
    refreshAdminState();
    renderAll();
    toast('已退出登录', 'info');
    /* 同时让服务端把这张令牌作废（该账号其它设备也会一起退出） */
    if (oldSession) apiPost('/api/auth/logout', { session: oldSession }).catch(function () {});
  }

  /* ---------- 两步验证（2FA）状态 ---------- */
  var pending2fa = null;          /* 第一步通过后拿到的临时票据 */
  var pendingRecoveryCodes = '';  /* 刚生成的恢复码（仅本次显示） */

  function copyText(text, okMsg) {
    var t = String(text == null ? '' : text);
    var done = function () { toast(okMsg || '已复制 ✔'); };
    var fallback = function () {
      try {
        var ta = document.createElement('textarea');
        ta.value = t;
        ta.setAttribute('readonly', 'readonly');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        done();
      } catch (e) { toast('复制失败，请手动选择复制', 'error'); }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(done, fallback);
    } else { fallback(); }
  }

  /* ---------- Cloudflare Turnstile 人机验证（留空 = 休眠，不影响任何流程） ----------
     启用步骤：① 这里填站点密钥；② 在 Worker 上设置 TURNSTILE_SECRET 环境变量。 */
  var TURNSTILE_SITEKEY = '0x4AAAAAAE9nhEhZUu-NfJNS';
  var tsTokens = { login: '', msg: '' };
  /* 每次挂载都记录状态：ok / pending / failed。失败时给「重新验证」按钮，
     而不是把登录按钮静默卡死 —— iPad Safari 上最常见的就是这种卡死。 */
  var tsState = { login: 'idle', msg: 'idle' };
  var tsSlots = { login: null, msg: null };
  var tsTimers = {};
  var TS_ALLOWED_HOST = /(^|\.)giraffeming\.online$/i;

  function tsHintText(key) {
    var hostBad = location.protocol === 'file:' || !TS_ALLOWED_HOST.test(location.hostname);
    if (hostBad) {
      return '<b>人机验证没能加载</b><br>当前地址（' + esc(location.hostname || '本地文件') +
        '）不在验证白名单里。请用 <b>https://giraffeming.online</b> 打开本站，或点下面的按钮重试。';
    }
    return '<b>人机验证没能加载</b><br>可能是网络或 Safari 的设置挡住了。点下面的按钮重试一次。';
  }

  function tsFallback(slot, key) {
    if (!slot) return;
    slot.innerHTML = '<div class="ts-fallback">' + tsHintText(key) + '</div>' +
      '<button type="button" class="btn-ts-retry" data-action="ts-retry" data-ts-key="' + key + '">🔄 重新验证</button>';
  }

  function tsClearFallback(slot) {
    if (!slot) return;
    var fb = slot.querySelector('.ts-fallback');
    if (fb) slot.innerHTML = '';
  }

  function loadTurnstile(cb) {
    if (!TURNSTILE_SITEKEY) { cb(false); return; }
    if (window.turnstile && window.turnstile.render) { cb(true); return; }
    if (!window.__tsLoading) {
      window.__tsLoading = true;
      window.__tsReady = [];
      var s = document.createElement('script');
      /* 用官方 onload 回调，比轮询靠谱：iPad 上脚本慢的时候轮询会提前放弃 */
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=__tsOnload';
      s.async = true;
      s.defer = true;
      window.__tsOnload = function () {
        var q = window.__tsReady || [];
        window.__tsReady = null;
        q.forEach(function (fn) { try { fn(); } catch (e) {} });
      };
      s.onerror = function () {
        window.__tsLoading = false;
        var q = window.__tsReady || [];
        window.__tsReady = null;
        q.forEach(function (fn) { try { fn(false); } catch (e) {} });
      };
      document.head.appendChild(s);
    }
    if (window.__tsReady) window.__tsReady.push(cb); else cb(!!window.turnstile);
  }

  function mountTurnstile(slot, key) {
    if (!TURNSTILE_SITEKEY || !slot) return;
    tsSlots[key] = slot;
    if (slot.dataset.tsId && window.turnstile) return;
    tsState[key] = 'pending';
    tsClearFallback(slot);
    loadTurnstile(function (ready) {
      if (!ready || !window.turnstile || !window.turnstile.render) {
        tsState[key] = 'failed';
        tsFallback(slot, key);
        return;
      }
      try {
        var dark = (document.documentElement.getAttribute('data-theme') || '').indexOf('dark') >= 0;
        slot.dataset.tsId = window.turnstile.render(slot, {
          sitekey: TURNSTILE_SITEKEY,
          theme: dark ? 'dark' : 'light',
          language: 'zh-cn',
          appearance: 'always',
          retry: 'auto',
          'refresh-expired': 'auto',
          'refresh-timeout': 'auto',
          callback: function (t) { tsState[key] = 'ok'; tsTokens[key] = t || ''; },
          'expired-callback': function () { tsState[key] = 'idle'; tsTokens[key] = ''; },
          'timeout-callback': function () { tsState[key] = 'idle'; tsTokens[key] = ''; },
          'error-callback': function () {
            tsState[key] = 'failed'; tsTokens[key] = '';
            if (slot.dataset.tsId && window.turnstile && window.turnstile.remove) {
              try { window.turnstile.remove(slot.dataset.tsId); } catch (e) {}
            }
            delete slot.dataset.tsId;
            tsFallback(slot, key);
          }
        });
        /* 兜底：12 秒还没拿到令牌就提示重试（不阻断提交，交给服务端判断） */
        clearTimeout(tsTimers[key]);
        tsTimers[key] = setTimeout(function () {
          if (tsState[key] !== 'ok') tsState[key] = 'slow';
        }, 12000);
      } catch (e) {
        tsState[key] = 'failed';
        tsFallback(slot, key);
      }
    });
  }

  function resetTurnstile(slot, key) {
    tsTokens[key] = '';
    tsState[key] = 'idle';
    if (slot && slot.dataset.tsId && window.turnstile && slot.querySelector('iframe')) {
      try { window.turnstile.reset(slot.dataset.tsId); return; } catch (e) {}
    }
    if (slot) { delete slot.dataset.tsId; slot.innerHTML = ''; }
  }

  /* 彻底销毁组件（弹窗重绘 / 手工重试前先 remove，避免 Turnstile 报「找不到 Widget」） */
  function tsTeardown(key) {
    var slot = document.getElementById(key === 'login' ? 'loginTs' : 'msgTs');
    var id = slot && slot.dataset.tsId;
    if (id && window.turnstile && window.turnstile.remove) {
      try { window.turnstile.remove(id); } catch (e) {}
    }
    if (slot) delete slot.dataset.tsId;
    tsTokens[key] = '';
    tsState[key] = 'idle';
  }

  /* 重新挂载（iPad 上有时要重来一次） */
  function retryTurnstile(key) {
    var slot = document.getElementById(key === 'login' ? 'loginTs' : 'msgTs') || tsSlots[key];
    if (!slot) return;
    tsTeardown(key);
    slot.innerHTML = '';
    toast('正在重新加载人机验证…', 'info');
    mountTurnstile(slot, key);
  }

  /* 真的需要令牌吗：验证挂载失败/太慢时放行提交，由服务端决定（服务端校验不可用时也会放行） */
  function tsOkToSubmit(key) {
    if (!TURNSTILE_SITEKEY) return true;
    if (tsTokens[key]) return true;
    return tsState[key] === 'failed' || tsState[key] === 'slow';
  }

  function openLoginModal() {
    pending2fa = null;
    tsTeardown('login');          /* 上一次的组件先移除，避免叠加两个 widget */
    tsTokens.login = '';
    $('#modalTitle').textContent = '🔐 登录';
    $('#modalBody').innerHTML =
      '<div class="field"><label>账号</label><input id="loginUser" type="text" maxlength="40" autocomplete="username" placeholder="你的账号（由站长发放）" /></div>' +
      '<div class="field"><label>密码</label><input id="loginPw" type="password" maxlength="64" autocomplete="current-password" placeholder="登录密码" /></div>' +
      (TURNSTILE_SITEKEY ? '<div class="ts-slot" id="loginTs"></div>' : '') +
      '<p class="field-hint">账号由站长发放；登录后按权限显示「可编辑」或「仅查看」界面。</p>';
    $('#modalFoot').innerHTML =
      '<button class="btn btn-ghost" type="button" data-action="close-modal">关闭</button>' +
      '<button class="btn btn-primary" type="button" data-action="submit-login">登录</button>';
    $('#modalBackdrop').hidden = false;
    document.body.style.overflow = 'hidden';
    mountTurnstile($('#loginTs'), 'login');
    var u = $('#loginUser'); if (u) u.focus();
  }

  /* 第二步：已开启两步验证的账号，输入验证器动态码（或恢复码） */
  function openLoginCodeStep(un) {
    $('#modalTitle').textContent = '🔐 两步验证';
    $('#modalBody').innerHTML =
      '<p class="field-hint">账号 <b>' + esc(un || '') + '</b> 已开启两步验证：请输入验证器 App 上的 6 位动态码。<br />手机不在身边时，可改用一枚恢复码。</p>' +
      '<div class="field"><label>动态码 / 恢复码</label><input id="loginCode" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="12" placeholder="6 位数字，或 XXXXX-XXXXX" /></div>';
    $('#modalFoot').innerHTML =
      '<button class="btn btn-ghost" type="button" data-action="login-back">返回</button>' +
      '<button class="btn btn-primary" type="button" data-action="submit-login">验证并登录</button>';
    $('#modalBackdrop').hidden = false;
    document.body.style.overflow = 'hidden';
    var c = $('#loginCode'); if (c) c.focus();
  }

  function submitLogin() {
    if (pending2fa) {
      var code = ((($('#loginCode') || {}).value) || '').trim();
      if (!code) { toast('请输入动态码或恢复码', 'error'); return; }
      apiPost('/api/auth/login', { ticket: pending2fa.ticket, code: code }).then(function (res) {
        if (res.ok && res.json.ok) { completeLogin(res.json); }
        else { toast(res.json.error || '验证失败', 'error'); }
      });
      return;
    }
    var username = ((($('#loginUser') || {}).value) || '').trim();
    var pw = ((($('#loginPw') || {}).value) || '');
    if (!username || !pw) { toast('请输入账号和密码', 'error'); return; }
    if (!tsOkToSubmit('login')) { toast('请先完成下方的人机验证（点「重新验证」可以重试）', 'error'); return; }
    apiPost('/api/auth/login', { username: username, password: pw, turnstile: tsTokens.login }).then(function (res) {
      if (res.ok && res.json.need2fa) {
        pending2fa = { ticket: res.json.ticket, un: res.json.un };
        openLoginCodeStep(res.json.un);
        return;
      }
      if (res.ok && res.json.ok) completeLogin(res.json);
      else {
        resetTurnstile($('#loginTs'), 'login');   /* 令牌一次性，失败后要重新验证 */
        toast(res.json.error || '登录失败', 'error');
      }
    });
  }

  function completeLogin(res) {
    pending2fa = null;
    saveUserSession(res.session);
    setMyUser(res.user);
    refreshAdminState();
    closeModal();
    renderAll();
    toast('欢迎回来，' + (res.user.nick || '朋友') + ' 👋');
    if (res.twoFactor && res.recoveryLeft === 0) toast('恢复码已用完，建议重新生成一组', 'info');
  }

  function openMineModal() {
    if (!myUser) { openLoginModal(); return; }
    var roleCls = myUser.role === 'owner' ? 'owner' : (myUser.role === 'admin' ? 'admin' : '');
    var roleLabel = myUser.role === 'owner' ? '站长' : (myUser.role === 'admin' ? '管理员' : (S.perms.member.canEdit ? '成员 · 可编辑' : '成员 · 仅查看'));
    $('#modalTitle').textContent = '👤 我的账户';
    $('#modalBody').innerHTML =
      '<div class="mine-card">' +
        avatarHTML({ nick: myUser.nick, avatar: myUser.av }, 46, 'av-md') +
        '<div><div class="pu-name">' + esc(myUser.nick) + '</div>' +
        '<div class="pu-sub">账号：' + esc(myUser.un || '') + '</div>' +
        '<div class="pu-role ' + roleCls + '">' + roleLabel + '</div></div>' +
      '</div>' +
      '<div class="av-edit">' +
        '<div class="av-edit-head">🎨 我的头像 <small>朋友、管理员、站长都可以自己设置</small></div>' +
        '<div class="av-emoji-grid">' +
          AVATAR_EMOJIS.map(function (e) {
            return '<button type="button" class="av-pick" data-action="set-avatar" data-av="' + esc(e) + '" aria-label="用 ' + esc(e) + ' 当头像">' + e + '</button>';
          }).join('') +
        '</div>' +
        '<div class="av-edit-row">' +
          '<label class="btn btn-soft btn-small" for="avFile">🖼️ 上传图片</label>' +
          '<input id="avFile" type="file" accept="image/png,image/jpeg,image/webp" hidden />' +
          '<button class="btn btn-ghost btn-small" type="button" data-action="set-avatar" data-av="">用昵称首字</button>' +
        '</div>' +
        '<p class="field-hint">头像可以是 emoji，也可以是上传的图片（自动压缩）。换头像后，你以前发的说说、跟帖、指南也会一起更新。</p>' +
      '</div>' +
      '<div class="mine-actions">' +
        '<button class="btn btn-soft btn-block" type="button" data-action="open-2fa">' + (myUser.twoFactor ? '🔐 两步验证 · 已开启' : '🔐 开启两步验证') + '</button>' +
        '<button class="btn btn-soft btn-block" type="button" data-action="open-pw">' + (myUser.hasPw ? '修改密码' : '设置密码') + '</button>' +
        (isOwnerUser() ? '<button class="btn btn-soft btn-block" type="button" data-action="open-panel">🛡️ 管理面板（发放账号 / 权限）</button>' : '') +
        '<button class="btn btn-ghost btn-block" type="button" data-action="logout-user">退出登录</button>' +
      '</div>';
    $('#modalFoot').innerHTML = '<button class="btn btn-ghost" type="button" data-action="close-modal">关闭</button>';
    $('#modalBackdrop').hidden = false;
    document.body.style.overflow = 'hidden';
    wireAvatarPicker();
  }

  var AVATAR_EMOJIS = ['😀','😎','🤓','🥳','🐯','🦒','🐣','🐧','🐼','🦊','🐳','🌊','🌏','🚀','🎧','📷','💻','📚','☕','🍜','⚡','🔥','🌙','🍀'];

  /* 保存头像：emoji / 本站图片 / 空（回到昵称首字） */
  function saveAvatar(av) {
    return apiPost('/api/auth/profile', { session: mySession, avatar: av }).then(function (res) {
      if (res.ok && res.json.user) {
        setMyUser(res.json.user);
        toast(av ? '头像已更新 🎨' : '头像已恢复成昵称首字');
        refreshAdminState();   /* 顺带刷新顶部按钮上的头像 */
        openMineModal();
      } else {
        toast((res.json && res.json.error) || '头像保存失败（可能 Worker 还没更新到新版）', 'error');
      }
    });
  }

  function wireAvatarPicker() {
    var inp = $('#avFile');
    if (!inp) return;
    inp.addEventListener('change', function () {
      var f = (inp.files || [])[0];
      inp.value = '';
      if (!f) return;
      toast('正在压缩并上传头像…', 'info');
      compressImage(f).then(function (res) {
        return uploadImage({ name: 'avatar.' + res.ext, data: res.data, session: mySession, folder: 'avatar' }, null);
      }).then(function (r) {
        if (r && r.ok && r.json.url) return saveAvatar(r.json.url);
        toast((r && r.json && r.json.error) || '头像上传失败', 'error');
      }).catch(function (e) {
        toast(e && e.message === 'decode' ? '这张图格式不支持（可能是 HEIC），换一张试试' : '头像上传失败', 'error');
      });
    });
  }

  function openPwModal() {
    var fields = [];
    if (myUser && myUser.hasPw) {
      fields.push({ key: 'current', label: '原密码', type: 'password', required: true, max: 64, placeholder: '当前登录密码' });
    }
    if (myUser && myUser.twoFactor) {
      fields.push({ key: 'code', label: '两步验证码', required: true, max: 12, placeholder: '6 位动态码或恢复码', hint: '已开启两步验证：改密需要再验证一次动态码' });
    }
    fields.push(
      { key: 'password', label: '新密码', type: 'password', required: true, max: 64, placeholder: '6-64 位' },
      { key: 'password2', label: '确认新密码', type: 'password', required: true, max: 64, placeholder: '再输一遍' }
    );
    openModal({
      title: '🔑 ' + (myUser && myUser.hasPw ? '修改密码' : '设置密码'),
      submitText: '保存',
      fields: fields,
      onSubmit: function (v) {
        if (String(v.password).length < 6) { toast('密码至少 6 位', 'error'); return false; }
        if (v.password !== v.password2) { toast('两次输入的密码不一致', 'error'); return false; }
        apiPost('/api/auth/password', { session: mySession, current: v.current || '', password: v.password, code: v.code || '' }).then(function (res) {
          if (res.ok) {
            /* 改密会让其它设备的会话失效，服务端会顺手给当前设备一张新令牌 */
            if (res.json.session) saveUserSession(res.json.session);
            if (res.json.user) setMyUser(res.json.user);
            else myUser.hasPw = true;
            toast('密码已保存 🔑'); closeModal();
          }
          else { toast(res.json.error || '保存失败，请重试', 'error'); }
        });
        return false;
      }
    });
  }

  /* ---------- 两步验证（2FA）界面 ---------- */
  /* 二维码在本地生成（内置 qrcode-generator），密钥不会被送到任何第三方服务 */
  var qrWaiting = null;
  function ensureQrLib(cb) {
    if (window.qrcode) { cb(true); return; }
    if (qrWaiting) { qrWaiting.push(cb); return; }
    qrWaiting = [cb];
    var done = function (ok) {
      var q = qrWaiting; qrWaiting = null;
      if (!q) return;
      q.forEach(function (fn) { try { fn(ok); } catch (e) {} });
    };
    var s = document.createElement('script');
    s.src = 'vendor/qrcode/qrcode.js';
    s.async = true;
    s.onload = function () { done(!!window.qrcode); };
    s.onerror = function () { done(false); };
    document.head.appendChild(s);
    setTimeout(function () { if (!window.qrcode) done(false); }, 10000);
  }
  function paintQr(uri) {
    var wrap = $('#qrWrap');
    if (!wrap) return;
    ensureQrLib(function (ok) {
      if (!ok || !window.qrcode) {
        wrap.innerHTML = '<span class="qr-loading">二维码生成失败，用下面的密钥手动添加也一样。</span>';
        return;
      }
      try {
        var qr = window.qrcode(0, 'M');
        qr.addData(uri);
        qr.make();
        wrap.innerHTML = qr.createImgTag(5, 8, '两步验证二维码');
        var img = wrap.querySelector('img');
        if (img) { img.style.width = '190px'; img.style.height = '190px'; }
      } catch (e) {
        wrap.innerHTML = '<span class="qr-loading">二维码生成失败，用下面的密钥手动添加也一样。</span>';
      }
    });
  }

  function render2faSetup(secret, uri) {
    $('#modalTitle').textContent = '🔐 开启两步验证';
    $('#modalBody').innerHTML =
      '<div class="field"><label>第 1 步 · 用验证器 App 扫码</label>' +
        '<div class="qr-wrap" id="qrWrap"><span class="qr-loading">二维码生成中…</span></div>' +
        '<p class="field-hint">支持 Google / Microsoft Authenticator、Authy、1Password、小米 / 华为等验证器 App。</p>' +
        '<p class="field-hint">二维码在你自己浏览器里生成（不上传任何第三方），密钥只在你和验证器之间。</p>' +
      '</div>' +
      '<div class="field"><label>扫不了码？手动输入这段密钥</label>' +
        '<div class="secret-row"><code id="tfSecret">' + esc(secret) + '</code>' +
        '<button class="btn btn-soft btn-small" type="button" data-action="copy-2fa-secret">复制</button></div>' +
        '<p class="field-hint">类型：基于时间（TOTP）· 6 位数字 · 30 秒刷新一次。</p>' +
      '</div>' +
      '<div class="field"><label>第 2 步 · 输入 App 上显示的 6 位动态码</label>' +
        '<input id="tfCode" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6 位数字" />' +
        '<p class="field-hint">确认之前不会生效；确认后会给你 8 枚一次性恢复码。</p>' +
      '</div>';
    $('#modalFoot').innerHTML =
      '<button class="btn btn-ghost" type="button" data-action="close-modal">稍后再弄</button>' +
      '<button class="btn btn-primary" type="button" data-action="2fa-enable">确认开启</button>';
    $('#modalBackdrop').hidden = false;
    document.body.style.overflow = 'hidden';
    paintQr(uri);
    var c = $('#tfCode'); if (c) c.focus();
  }

  function render2faCodes(codes, isRegen) {
    pendingRecoveryCodes = (codes || []).join('\n');
    $('#modalTitle').textContent = '🔑 恢复码（只显示这一次）';
    $('#modalBody').innerHTML =
      '<p class="field-hint">每枚恢复码只能用一次。手机丢失、验证器被删或换机时，用它代替动态码登录。请现在就抄下来或存进密码管理器。</p>' +
      '<div class="rc-grid">' + (codes || []).map(function (c) { return '<code>' + esc(c) + '</code>'; }).join('') + '</div>' +
      '<p class="field-hint">' + (isRegen ? '旧的恢复码已全部作废。' : '开启成功 ✔ 关掉这个窗口后就再也看不到这组码了。') + '</p>';
    $('#modalFoot').innerHTML =
      '<button class="btn btn-soft" type="button" data-action="copy-2fa-codes">复制全部</button>' +
      '<button class="btn btn-primary" type="button" data-action="close-modal">我已保存</button>';
    $('#modalBackdrop').hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function ask2faCode(title, submitText, cb) {
    openModal({
      title: title,
      submitText: submitText,
      fields: [{ key: 'code', label: '动态码 / 恢复码', required: true, max: 12, placeholder: '6 位数字，或 XXXXX-XXXXX' }],
      onSubmit: function (v) {
        cb(String(v.code || '').trim());
        return false;
      }
    });
  }

  function open2faModal() {
    if (!myUser) { openLoginModal(); return; }
    if (myUser.twoFactor) {
      $('#modalTitle').textContent = '🔐 两步验证 · 已开启';
      $('#modalBody').innerHTML =
        '<p class="field-hint">已开启 ✔ 以后登录要「密码 + 验证器动态码」两步。如果你换了手机，请先用旧设备或恢复码登录，再在这里重新开启。</p>' +
        '<div class="mine-actions">' +
          '<button class="btn btn-soft btn-block" type="button" data-action="2fa-codes">重新生成恢复码</button>' +
          '<button class="btn btn-soft btn-block" type="button" data-action="2fa-disable">关闭两步验证</button>' +
        '</div>';
      $('#modalFoot').innerHTML = '<button class="btn btn-ghost" type="button" data-action="close-modal">关闭</button>';
      $('#modalBackdrop').hidden = false;
      document.body.style.overflow = 'hidden';
      return;
    }
    apiPost('/api/users/2fa', { session: mySession, op: 'setup' }).then(function (res) {
      if (!res.ok) {
        toast(res.status === 404 ? '后台还没升级到支持两步验证的版本，请先部署新版 Worker' : (res.json.error || '暂时无法开启，请重试'), 'error');
        return;
      }
      render2faSetup(res.json.secret, res.json.uri);
    });
  }

  function openPanelModal() {
    $('#modalTitle').textContent = '🛡️ 管理面板 · 用户';
    $('#modalBody').innerHTML = '<p class="confirm-text">加载中…</p>';
    $('#modalFoot').innerHTML =
      (myUser && myUser.role === 'owner' ? '<button class="btn btn-soft" type="button" data-action="panel-create">＋ 新建账号</button>' : '') +
      '<button class="btn btn-ghost" type="button" data-action="close-modal">关闭</button>';
    $('#modalBackdrop').hidden = false;
    document.body.style.overflow = 'hidden';
    apiPost('/api/users/list', { session: mySession }).then(function (res) {
      if (!res.ok) { $('#modalBody').innerHTML = '<p class="confirm-text">' + esc(res.json.error || '加载失败') + '</p>'; return; }
      usersCache = res.json.users || [];   /* 顺手刷新「署名」选择器用的账号列表 */
      var permCache = res.json.perms || S.perms;
      var rows = (res.json.users || []).map(function (u) {
        var rc = u.role === 'owner' ? 'owner' : (u.role === 'admin' ? 'admin' : '');
        var rl = u.role === 'owner' ? '站长' : (u.role === 'admin' ? '管理员' : '朋友');
        var acts = '';
        if (myUser && myUser.role === 'owner' && u.role !== 'owner') {
          acts = '<button class="act-btn" type="button" data-action="panel-role" data-id="' + u.id + '" data-role="' + (u.role === 'admin' ? 'member' : 'admin') + '">' + (u.role === 'admin' ? '取消管理' : '设为管理') + '</button>' +
                  '<button class="act-btn" type="button" data-action="panel-resetpw" data-id="' + u.id + '">重置密码</button>' +
                  (u.twoFactor ? '<button class="act-btn" type="button" data-action="panel-reset2fa" data-id="' + u.id + '">重置两步验证</button>' : '') +
                  '<button class="act-btn danger" type="button" data-action="panel-del" data-id="' + u.id + '">删</button>';
        }
        return '<div class="panel-user">' +
          avatarHTML({ nick: u.nick, avatar: u.av }, 38, 'av-sm') +
          '<div class="pu-meta">' +
            '<div class="pu-name">' + esc(u.nick) + ' <span class="pu-role ' + rc + '">' + rl + '</span></div>' +
            '<div class="pu-sub">账号：' + esc(u.un || '') + (u.hasPw ? ' · 已设密码' : ' · 未设密码') + (u.twoFactor ? ' · 🔐 两步验证' : '') + '</div>' +
            '<div class="pu-sub">创建 ' + esc(u.c || '-') + (u.l ? ' · 最近登录 ' + esc(u.l) : '') + '</div>' +
          '</div>' + acts + '</div>';
      }).join('');
      var permBlock = '';
      if (myUser && myUser.role === 'owner') {
        var pg = function (title, items) {
          var rows2 = items.map(function (it) {
            var val = permCache;
            var parts = it[0].split('.');
            for (var i = 0; i < parts.length; i++) val = val[parts[i]];
            return '<div class="switch-row"><span>' + it[1] + '</span><label class="switch"><input type="checkbox" data-perm="' + it[0] + '"' + (val ? ' checked' : '') + ' /><span class="slider"></span></label></div>';
          }).join('');
          return '<div class="perm-group">' + title + '</div>' + rows2;
        };
        permBlock = '<div class="perm-block"><h4>🎛 权限管理（滑块即开关）</h4>' +
          pg('管理员 · 可管理板块', [['admin.say', '说说'], ['admin.travel', '游记'], ['admin.tech', '数码'], ['admin.device', '设备'], ['admin.study', '指南'], ['admin.trips', '旅行攻略'], ['admin.friends', '友链'], ['admin.msg', '留言']]) +
          pg('朋友账号（成员）· 说白了就是「能做什么」', [
            ['member.canMsg', '发留言'],
            ['member.canPost', '在说说墙发帖'],
            ['member.canComment', '跟帖（默认开）'],
            ['member.canGuide', '写指南（含自己的图片）'],
            ['member.canTrip', '写旅行攻略（含自己的图片，默认开）'],
            ['member.canEdit', '编辑全部内容（高级：能改所有人的内容）']
          ]) +
          pg('游客（未登录）', [['guest.canMsg', '允许留言']]) +
          '<button class="btn btn-soft btn-small" type="button" data-action="perms-save" style="margin-top:12px">保存权限</button>' +
          '<p class="panel-tip">默认：管理员可管理内容板块；朋友账号可留言 + 跟帖 + 写旅行攻略（共创），发帖 / 写指南需要在这里打开；朋友只能改自己发的内容。游客仅可浏览。</p></div>';
      }
      $('#modalBody').innerHTML = (rows || '<p class="confirm-text">还没有任何账号</p>') + permBlock +
        '<p class="panel-tip">账号密码请私下发给访客；「设为管理」授予管理员角色；两步验证开启后需动态码登录，忘记设备时可用「重置两步验证」兜底。</p>';
    });
  }

  function openCreateUserModal() {
    openModal({
      title: '👤 新建账号（发放给访客）',
      submitText: '创建并发放',
      fields: [
        { key: 'username', label: '账号', type: 'text', required: true, max: 40, placeholder: '如：amy 或 amy@qq.com（字母数字_-@）' },
        { key: 'nick', label: '昵称', max: 20, placeholder: '昵称（选填）' },
        { key: 'password', label: '初始密码', type: 'password', required: true, max: 64, placeholder: '6-64 位' },
        { key: 'password2', label: '确认密码', type: 'password', required: true, max: 64, placeholder: '再输一遍' },
        { key: 'role', label: '角色', type: 'select', options: ['member', 'admin'], value: 'member', hint: '成员：可留言（编辑权限在权限管理中统一配置）；管理员：按权限矩阵管理内容' }
      ],
      onSubmit: function (v) {
        if (String(v.password).length < 6) { toast('密码至少 6 位', 'error'); return false; }
        if (v.password !== v.password2) { toast('两次输入的密码不一致', 'error'); return false; }
        apiPost('/api/users/create', { session: mySession, username: v.username.trim(), nick: v.nick.trim(), password: v.password, role: v.role }).then(function (res) {
          if (res.ok) { usersCache = null; toast('账号已创建 ✔ 请把「账号+密码」私下发给对方'); closeModal(); openPanelModal(); }
          else { toast(res.json.error || '创建失败', 'error'); }
        });
        return false;
      }
    });
  }

  function openResetPwModal(id) {
    openModal({
      title: '🔑 重置密码',
      submitText: '保存',
      fields: [
        { key: 'password', label: '新密码', type: 'password', required: true, max: 64, placeholder: '6-64 位' },
        { key: 'password2', label: '确认', type: 'password', required: true, max: 64, placeholder: '再输一遍' }
      ],
      onSubmit: function (v) {
        if (String(v.password).length < 6) { toast('密码至少 6 位', 'error'); return false; }
        if (v.password !== v.password2) { toast('两次输入的密码不一致', 'error'); return false; }
        apiPost('/api/users/action', { session: mySession, op: 'resetPw', id: id, password: v.password }).then(function (res) {
          if (res.ok) { toast('密码已重置 ✔'); closeModal(); openPanelModal(); }
          else { toast(res.json.error || '操作失败', 'error'); }
        });
        return false;
      }
    });
  }

  function panelAction(op, id, role) {
    apiPost('/api/users/action', { session: mySession, op: op, id: id, role: role }).then(function (res) {
      if (res.ok) { usersCache = null; toast('已更新 ✔'); openPanelModal(); }
      else { toast(res.json.error || '操作失败', 'error'); }
    });
  }

  function restoreUser() {
    if (!mySession) { refreshAdminState(); return; }
    apiPost('/api/auth/me', { session: mySession }).then(function (res) {
      if (res.ok) { setMyUser(res.json.user); }
      else { saveUserSession(''); myUser = null; }
      refreshAdminState();
      renderAll();
    });
  }

  /* ---------- 小工具 ---------- */
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var MEDIA_PREFIX = 'https://raw.githubusercontent.com/MiNgOfficial-HZ/minghz-db/main/uploads/';
  var OLD_WORKER = 'https://minghz-api.mingsite.workers.dev';
  var mediaUrl = function (u) {
    u = String(u == null ? '' : u);
    if (u.indexOf(MEDIA_PREFIX) === 0) {
      return WORKER + '/api/img?p=' + encodeURIComponent(u.slice(MEDIA_PREFIX.length));
    }
    if (u.indexOf(OLD_WORKER) === 0) return WORKER + u.slice(OLD_WORKER.length);
    return u;
  };
  var uid = function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); };
  var pad = function (n) { return String(n).padStart(2, '0'); };
  var nowStamp = function () {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  };
  var daysAgo = function (n) { var d = new Date(); d.setDate(d.getDate() - n); return d; };
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  /* ---------- Toast ---------- */
  function toast(msg, type) {
    type = type || 'success';
    var icons = { success: '✅', error: '⚠️', info: '💡' };
    var el = document.createElement('div');
    el.className = 'toast ' + type;
    el.innerHTML = '<span>' + (icons[type] || '💡') + '</span><span>' + esc(msg) + '</span>';
    $('#toastRoot').appendChild(el);
    setTimeout(function () { el.classList.add('out'); setTimeout(function () { el.remove(); }, 280); }, 2600);
  }

  /* ---------- 数据 ---------- */
  var S = { moments: [], travels: [], tech: [], studies: [], trips: [], devices: [], friends: [], messages: [],
    perms: { admin: { say: true, travel: true, tech: true, study: true, trips: true, friends: true, msg: true, device: true },
      member: { canMsg: true, canEdit: false, canPost: false, canComment: true, canGuide: false, canTrip: true }, guest: { canMsg: false } } };
  var cloudOk = false;
  var pendingOp = null;
  var openComments = {};   /* 哪些说说展开了跟帖区（按 id 记，重渲染后不丢） */

  function seed() {
    return {
      moments: [
        { id: uid(), emoji: '🌅', text: '傍晚在江边走了很久，风把一整天的疲惫都吹跑了。', time: nowStamp() }
      ],
      travels: [],
      tech: [],
      studies: [],
      trips: [],
      devices: [],
      friends: [],
      messages: []
    };
  }

  function normalize(data) {
    var out = { moments: [], travels: [], tech: [], studies: [], trips: [], devices: [], friends: [], messages: [],
      perms: { admin: { say: true, travel: true, tech: true, study: true, trips: true, friends: true, msg: true, device: true },
        member: { canMsg: true, canEdit: false, canPost: false, canComment: true, canGuide: false, canTrip: true }, guest: { canMsg: false } } };
    Object.keys(out).forEach(function (k) {
      if (k === 'perms') return;
      if (data && Array.isArray(data[k])) out[k] = data[k];
    });
    if (data && data.perms) {
      var src = data.perms;
      ['admin', 'member', 'guest'].forEach(function (g) {
        var srcG = src[g] || {};
        Object.keys(out.perms[g]).forEach(function (k) {
          if (typeof srcG[k] === 'boolean') out.perms[g][k] = srcG[k];
        });
      });
    }
    return out;
  }

  function readCache() {
    try { var raw = localStorage.getItem(CACHE_KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  function writeCache() {
    try {
      /* 缓存永远不写留言邮箱：即使本地缓存被翻看，也不会带出访客邮箱 */
      var safe = {
        moments: S.moments,
        travels: S.travels,
        tech: S.tech,
        studies: S.studies,
        devices: S.devices,
        friends: S.friends,
        perms: S.perms,
        messages: S.messages.map(function (m) {
          var c = {};
          for (var k in m) { if (k !== 'email') c[k] = m[k]; }
          return c;
        })
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(safe));
    } catch (e) {}
  }

  function setSync(state, text) {
    var chip = $('#syncChip');
    if (!chip) return;
    chip.className = 'sync-chip ' + state;
    chip.textContent = text;
  }

  function cloudFetch() {
    var ctrl = ('AbortController' in window) ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 8000) : null;
    var finish = function () { if (timer) { clearTimeout(timer); timer = null; } };
    var opts = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session: mySession }),
      cache: 'no-store'
    };
    if (ctrl) opts.signal = ctrl.signal;
    var resp;
    return fetch(WORKER + '/api/db', opts)
      .then(function (r) { resp = r; return r.json(); })
      .then(function (j) {
        finish();
        if (!resp.ok || !j.db) throw new Error((j && j.error) || 'HTTP ' + resp.status);
        /* 新版 Worker 会顺带把「我是谁」一起返回：省掉一次 /api/auth/me 往返 */
        return { db: j.db, user: j.user, hasUser: ('user' in j) };
      })
      .catch(function (e) {
        finish();
        throw e;
      });
  }

  function adminMutate(action, item, okToast, silent) {
    pendingOp = { action: action, item: item };
    if (!silent) setSync('syncing', '🔄 同步中…');
    return apiPost('/api/admin', { op: 'mutate', session: mySession, action: action, item: item }).then(function (res) {
      if (res.status === 401 || res.status === 403) {
        logoutUser();
        throw new Error('need-login');
      }
      if (!res.ok) throw new Error((res.json && res.json.error) || ('HTTP ' + res.status));
      S = normalize(res.json.db);
      cloudOk = true;
      pendingOp = null;
      setSync('cloud', '☁️ 已同步');
      writeCache();
      renderAll();
      if (okToast && !silent) toast(okToast);
      return true;
    }).catch(function (e) {
      cloudOk = false;
      if (e.message !== 'need-login') setSync('offline', '⚠️ 同步失败');
      if (!silent) toast('操作未生效：' + e.message + '（将自动重试）', 'error');
      return false;
    });
  }

  function boot() {
    syncAdminUI();
    setSync('syncing', '🔄 同步中…');
    applyLocation(true);
    try {
      localStorage.removeItem('minghz.site.cache.v1');
      localStorage.removeItem('minghz.site.cache.v2');
    } catch (e) {}
    var cached = readCache();
    if (cached) {
      S = normalize(cached);
      renderAll();
      prefetchKatexIfNeeded(JSON.stringify(S));
    }

    /* 先让浏览器把首屏画出来，再去请求云端：首次载入感觉快很多 */
    var afterPaint = function (fn) {
      if (window.requestAnimationFrame) requestAnimationFrame(function () { setTimeout(fn, 0); });
      else setTimeout(fn, 0);
    };
    afterPaint(function () {
      cloudFetch().then(function (res) {
        S = normalize(res.db);
        if (res.hasUser) {
          setMyUser(res.user);
          if (!res.user) saveUserSession('');
          refreshAdminState();
        } else {
          restoreUser();
        }
        cloudOk = true;
        writeCache();
        setSync('cloud', '☁️ 已同步');
        renderAll();
        prefetchKatexIfNeeded(JSON.stringify(S));
      }).catch(function () {
        if (mySession) restoreUser();
        if (cached) {
          setSync('offline', '⚠️ 离线（本地缓存）');
          toast('云端暂不可达，当前展示本地缓存数据', 'info');
        } else {
          S = seed();
          renderAll();
          setSync('offline', '⚠️ 离线（本地）');
          toast('云端暂不可达，已进入离线模式', 'info');
        }
      });
    });
  }

  /* 断网/失败自动重试（每 20 秒一次） */
  setInterval(function () {
    if (pendingOp && !cloudOk) adminMutate(pendingOp.action, pendingOp.item, null, true);
  }, 20000);

  /* ---------- 渲染 ---------- */
  function emptyHTML(msg) { return '<div class="empty">' + msg + '</div>'; }

  function renderStats() {
    var chips = [
      ['💬', S.moments.length, '条说说'],
      ['🧳', S.travels.length, '段旅程'],
      ['📷', S.tech.length, '件数码'],
      ['🎧', S.devices.length, '件设备'],
      ['📚', S.studies.length, '篇指南'],
      ['🧭', S.trips.length, '篇攻略'],
      ['🔗', S.friends.length, '位友人']
    ];
    $('#heroStats').innerHTML = chips.map(function (c) {
      return '<span class="stat-chip">' + c[0] + ' <span class="stat-num">' + c[1] + '</span> ' + c[2] + '</span>';
    }).join('');
  }

  function actionsHTML(kind, item) {
    if (!canManage(kind, item)) return '';
    var id = typeof item === 'object' && item ? item.id : item;
    return '<div class="item-actions">' +
      '<button class="act-btn" type="button" data-action="edit-' + kind + '" data-id="' + id + '" aria-label="编辑">✎</button>' +
      '<button class="act-btn danger" type="button" data-action="del-' + kind + '" data-id="' + id + '" aria-label="删除">✕</button>' +
      '</div>';
  }

  /* 发帖人 / 编写人：老数据没存作者，默认就是站长本人 */
  function momentAuthor(m) { return authorName(m); }
  function itemAuthor(x) { return authorName(x); }

  /* ---------- 署名（可以多个人，像邮件收件人那样从已有账号里挑） ---------- */
  function authorsOf(x) {
    if (x && Array.isArray(x.authors) && x.authors.length) {
      return x.authors.map(function (a) {
        return { id: a.id, nick: (a.id === 'owner0' ? 'MiNgHZ' : (a.nick || '朋友')), avatar: a.avatar || '' };
      });
    }
    /* 老数据没有 authorId：只要判定成站长发的，就补上 owner0，免得被标成「朋友」 */
    var oneId = (x && x.authorId) || (isOwnerPost(x) ? 'owner0' : '');
    return [{ id: oneId, nick: authorName(x), avatar: (x && x.avatar) || '' }];
  }
  function authorsBadge(a) {
    if (a.id === 'owner0') return '<span class="m-badge">站长</span>';
    if (myUser && a.id === myUser.id) return '<span class="m-badge friend">我</span>';
    return '<span class="m-badge friend">朋友</span>';
  }
  function authorsHTML(x) {
    var list = authorsOf(x);
    return list.map(function (a, i) {
      return (i ? '<span class="ap-join">、</span>' : '') +
        '<span class="m-author">' + esc(a.nick) + authorsBadge(a) + '</span>';
    }).join('');
  }

  /* 账号列表（只有站长 / 管理员能拿到），给「作者」选择器用 */
  var usersCache = null;
  function loadUsers(cb) {
    if (usersCache) { cb(usersCache); return; }
    if (!hasPanelRight()) { cb([]); return; }
    apiPost('/api/users/list', { session: mySession }).then(function (res) {
      usersCache = (res.ok && res.json.users) ? res.json.users : [];
      cb(usersCache);
    }).catch(function () { cb([]); });
  }
  function userById(id) {
    var list = usersCache || [];
    for (var i = 0; i < list.length; i++) { if (list[i].id === id) return list[i]; }
    return null;
  }
  function apNick(u) { return u.id === 'owner0' ? 'MiNgHZ' : (u.nick || u.un || '朋友'); }

  /* prefix: 'post'（发帖框）/ 'modal'（编辑弹窗） */
  function apChipsHTML(prefix, ids) {
    return (ids || []).map(function (id) {
      var u = userById(id);
      var nm = u ? apNick(u) : '未找到的账号';
      var av = u ? (u.av || '') : '';
      var head = /^https?:\/\//i.test(av) ? '' : esc(av || nm.slice(0, 1));
      return '<span class="ap-chip" data-id="' + esc(id) + '"' + (u ? '' : ' data-missing="1"') + '>' +
        '<span class="ap-chip-av">' + head + '</span>' + esc(nm) +
        '<button type="button" class="ap-x" data-action="ap-remove" data-prefix="' + prefix + '" data-id="' + esc(id) + '" aria-label="移除">✕</button></span>';
    }).join('');
  }
  function apInnerHTML(prefix, ids) {
    return '<span class="ap-label">署名</span>' +
      '<span class="ap-chips">' + apChipsHTML(prefix, ids) + '</span>' +
      '<input class="ap-input" id="' + prefix + 'AuthorSearch" autocomplete="off" placeholder="输入昵称或账号添加…" />' +
      '<div class="ap-menu" id="' + prefix + 'AuthorMenu" hidden></div>' +
      '<span class="ap-hint">默认署名是发帖人自己；站长可以在这里挑人，选几个就联合署名几个。</span>';
  }
  function authorPickerHTML(prefix, ids) {
    return '<div class="ap" id="' + prefix + 'Authors">' + apInnerHTML(prefix, ids) + '</div>';
  }

  var pickerState = { post: [], modal: [] };

  function apRoot(prefix) { return document.getElementById(prefix + 'Authors'); }

  function apCloseMenu(prefix) {
    var m = document.getElementById(prefix + 'AuthorMenu');
    if (m) { m.hidden = true; m.innerHTML = ''; }
  }

  function apMenuHTML(prefix, q) {
    var ids = pickerState[prefix] || [];
    var ql = String(q || '').trim().toLowerCase();
    var list = (usersCache || []).filter(function (u) {
      if (ids.indexOf(u.id) >= 0) return false;
      if (!ql) return true;
      return (apNick(u) + ' ' + (u.un || '')).toLowerCase().indexOf(ql) >= 0;
    }).slice(0, 8);
    if (!list.length) return '<div class="ap-empty">没有更多账号了</div>';
    return list.map(function (u) {
      return '<button type="button" class="ap-item" data-action="ap-add" data-prefix="' + prefix + '" data-id="' + esc(u.id) + '">' +
        '<span class="ap-item-name">' + esc(apNick(u)) + '</span>' +
        '<small>' + esc(u.un || '') + (u.role === 'owner' ? ' · 站长' : (u.role === 'admin' ? ' · 管理员' : ' · 朋友')) + '</small></button>';
    }).join('');
  }

  /* 重画署名区（保留输入框里已经打了一半的搜索词） */
  function apRender(prefix, keepQuery) {
    var root = apRoot(prefix);
    if (!root) return;
    var q = keepQuery ? String((document.getElementById(prefix + 'AuthorSearch') || {}).value || '') : '';
    root.innerHTML = apInnerHTML(prefix, pickerState[prefix] || []);
    var input = document.getElementById(prefix + 'AuthorSearch');
    if (input && q) { input.value = q; apSearch(prefix, q); }
  }

  function apSearch(prefix, q) {
    var menu = document.getElementById(prefix + 'AuthorMenu');
    if (!menu) return;
    menu.innerHTML = apMenuHTML(prefix, q);
    menu.hidden = false;
  }

  function apAdd(prefix, id) {
    pickerState[prefix] = (pickerState[prefix] || []).concat([id]).slice(0, 8);
    apRender(prefix);
    var input = document.getElementById(prefix + 'AuthorSearch');
    if (input) input.focus();
  }

  function apRemove(prefix, id) {
    pickerState[prefix] = (pickerState[prefix] || []).filter(function (x) { return x !== id; });
    apRender(prefix);
  }

  function apInit(prefix, ids) {
    pickerState[prefix] = (ids || []).slice(0, 8);
    apRender(prefix);
  }

  /* 弹窗里的署名选择器：初始化 + 取当前选择 */
  function modalAuthorsInit(ids) {
    if (!isOwnerUser()) return;
    var init = (ids || []).filter(Boolean).slice(0, 8);
    pickerState.modal = init;
    apInit('modal', init);
    loadUsers(function () {
      pickerState.modal = init;
      var host = document.querySelector('#modalBody .ap');
      if (host) host.outerHTML = authorPickerHTML('modal', init);
      apInput('modal');
    });
  }
  function modalAuthorsPayload() {
    return (isOwnerUser() && pickerState.modal && pickerState.modal.length) ? pickerState.modal.slice(0, 8) : null;
  }

  function apInput(prefix) {
    var el = document.getElementById(prefix + 'AuthorSearch');
    if (!el) return;
    el.addEventListener('focus', function () { apSearch(prefix, el.value); });
    el.addEventListener('blur', function () { setTimeout(function () { apCloseMenu(prefix); }, 180); });
  }
  /* 老数据的作者判定：旧版 Worker 没写 authorId，只写了昵称「站长」 */
  function isOwnerPost(x) {
    if (!x) return false;
    if (x.authorId === 'owner0') return true;
    if (!x.authorId && (!x.author || x.author === '站长')) return true;
    return false;
  }
  /* 站长账号的昵称就叫「站长」，对外统一显示成 MiNgHZ，免得出现「站长 站长」 */
  function authorName(x) {
    if (isOwnerPost(x)) return 'MiNgHZ';
    return (x && x.author) || 'MiNgHZ';
  }

  /* 头像：emoji 或本站上传的图片；没设置就用昵称首字 */
  function avatarHTML(x, size, cls) {
    var nm = (x && (x.author || x.nick)) || authorName(x) || '友';
    var av = (x && x.avatar) || '';
    var px = size || 38;
    var style = 'width:' + px + 'px;height:' + px + 'px;font-size:' + Math.round(px * 0.46) + 'px;';
    if (/^https?:\/\//i.test(av)) {
      return '<span class="av ' + (cls || '') + '" style="' + style + '"><img src="' + esc(mediaUrl(av)) + '" alt="" loading="lazy" decoding="async" /></span>';
    }
    if (av) return '<span class="av av-emoji ' + (cls || '') + '" style="' + style + '">' + esc(av) + '</span>';
    return '<span class="av av-text ' + (cls || '') + '" style="' + style + '">' + esc(String(nm).slice(0, 1)) + '</span>';
  }

  /* 发帖 / 跟帖的来源（IP 是打码后的，完整 IP 不下发到页面） */
  function ipTag(x) {
    if (!x) return '';
    var bits = [];
    if (x.geo) bits.push(x.geo);
    if (x.ip) bits.push(x.ip);
    if (!bits.length) return '';
    return '<span class="m-ip" title="发帖 / 跟帖来源（IP 已打码）">📍 ' + esc(bits.join(' · ')) + '</span>';
  }

  /* 跟时间后缀：刚刚 / N 分钟前 / N 小时前 / N 天前（时间戳是北京时间字符串） */
  function relSuffix(stamp) {
    var m = String(stamp || '').match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    if (!m) return '';
    var t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - 8 * 3600 * 1000;   /* 北京时间 → UTC */
    var diff = Date.now() - t;
    if (diff < 0) diff = 0;
    var min = Math.floor(diff / 60000);
    var text;
    if (min < 1) text = '刚刚';
    else if (min < 60) text = min + ' 分钟前';
    else if (min < 1440) text = Math.floor(min / 60) + ' 小时前';
    else if (min < 43200) text = Math.floor(min / 1440) + ' 天前';
    else return '';
    return ' <em>· ' + text + '</em>';
  }

  function renderMoments() {
    var list = $('#momentList');
    if (!list) return;
    if (!S.moments.length) { list.innerHTML = emptyHTML('还没有说说 —— 第一条就等你来写 ✨'); return; }
    list.innerHTML = sortDesc(S.moments, 'time').map(function (m, i) {
      var first = authorsOf(m)[0];
      var cmts = Array.isArray(m.comments) ? m.comments : [];
      var cmtHtml = cmts.map(function (c) {
        return '<div class="cmt"><div class="cmt-head">' +
            avatarHTML(c, 24, 'av-sm') +
            '<span class="cmt-author">' + esc(isOwnerPost(c) ? 'MiNgHZ' : (c.author || '朋友')) + '</span>' +
            '<span class="m-time">' + esc(c.time || '') + '</span>' +
            ipTag(c) +
            (canDelComment(m, c) ? '<button class="cmt-del" type="button" data-action="del-cmt" data-id="' + m.id + '" data-cid="' + esc(c.id || '') + '" aria-label="删除跟帖">✕</button>' : '') +
          '</div><p class="cmt-text">' + esc(c.text || '') + '</p></div>';
      }).join('');
      var zone = '<div class="cmt-zone"' + (openComments[m.id] ? '' : ' hidden') + '>' +
        '<div class="cmt-list">' + (cmtHtml || '<p class="cmt-empty">还没有人跟帖，来当第一个～</p>') + '</div>' +
        (canCommentMoment()
          ? '<form class="cmt-form" data-id="' + m.id + '">' +
              '<textarea rows="1" maxlength="300" placeholder="写句跟帖…（会显示你的昵称和时间）"></textarea>' +
              '<button class="btn btn-primary btn-small" type="submit">发送</button></form>'
          : '') +
        '</div>';
      return '<article class="moment reveal" style="--rd:' + Math.min(i * 70, 350) + 'ms" data-id="' + m.id + '">' +
        '<div class="moment-dot">' + esc(m.emoji || '💬') + '</div>' +
        '<div class="moment-card card">' +
          '<div class="moment-head moment-meta">' +
            avatarHTML({ nick: first.nick, avatar: first.avatar }, 32, 'av-sm') +
            authorsHTML(m) +
            '<span class="m-time">' + esc(m.time || '') + relSuffix(m.time) + '</span>' +
            ipTag(m) +
            actionsHTML('moment', m) +
          '</div>' +
          '<p class="moment-text">' + esc(m.text) + '</p>' +
          '<div class="moment-foot">' +
            '<button class="cmt-toggle" type="button" data-action="toggle-cmt" data-id="' + m.id + '">💬 ' + (cmts.length ? cmts.length + ' 条跟帖' : '跟帖') + '</button>' +
          '</div>' +
          zone +
        '</div>' +
      '</article>';
    }).join('');
  }

  function renderTravels() {
    var grid = $('#travelGrid');
    if (!S.travels.length) { grid.innerHTML = emptyHTML('游记空空如也，点右上角 <b>＋</b> 添加第一篇 ✍️'); return; }
    grid.innerHTML = sortDesc(S.travels, 'date').map(function (t, i) {
      var tags = (t.tags || []).map(function (x) { return '<span class="tag">' + esc(x) + '</span>'; }).join('');
      return '<article class="travel-card card reveal" style="--rd:' + Math.min(i * 70, 350) + 'ms" data-id="' + t.id + '">' +
        '<div class="t-cover g' + (t.grad == null ? 0 : t.grad) + '">' +
          '<span class="t-emoji">' + esc(t.emoji || '🌏') + '</span>' +
          '<span class="t-date">' + esc(t.date) + '</span>' +
          '<span class="t-loc">📍 ' + esc(t.location || '在路上') + '</span>' +
          (permFor('travel') ? '<div class="t-actions">' +
            '<button class="act-btn" type="button" data-action="edit-travel" data-id="' + t.id + '" aria-label="编辑">✎</button>' +
            '<button class="act-btn danger" type="button" data-action="del-travel" data-id="' + t.id + '" aria-label="删除">✕</button>' +
          '</div>' : '') +
        '</div>' +
        '<div class="t-body">' +
          '<h3 class="t-title">' + esc(t.title) + '</h3>' +
          '<p class="t-summary">' + esc(t.summary) + '</p>' +
          (t.content ? '<button class="read-more" type="button" data-action="read-item" data-kind="travel" data-id="' + t.id + '">阅读全文 →</button>' : '') +
          (tags ? '<div class="t-tags">' + tags + '</div>' : '') +
        '</div>' +
      '</article>';
    }).join('');
  }

  function galleryHTML(imgs, title) {
    if (!imgs || !imgs.length) return '';
    var cover = '<button class="tg-cover" type="button" data-action="open-img" data-url="' + esc(mediaUrl(imgs[0])) + '"><img src="' + esc(mediaUrl(imgs[0])) + '" alt="' + esc(title) + '" loading="lazy" decoding="async" /></button>';
    var thumbs = imgs.slice(1, 6).map(function (u) {
      return '<button class="tg-thumb" type="button" data-action="open-img" data-url="' + esc(mediaUrl(u)) + '"><img src="' + esc(mediaUrl(u)) + '" alt="' + esc(title) + '" loading="lazy" decoding="async" /></button>';
    }).join('');
    return '<div class="tech-gallery">' + cover + thumbs + '</div>';
  }

  var CAT_EMOJI = { '手机': '📱', '电脑': '💻', '耳机': '🎧', '相机': '📷', '桌面': '⌨️', '智能家居': '🏠', '其他': '📦' };

  function renderTech() {
    var list = $('#techList');
    if (!S.tech.length) { list.innerHTML = emptyHTML('还没有数码体验，点右上角 <b>＋</b> 记录第一件玩具 🎮'); return; }
    list.innerHTML = sortDesc(S.tech, 'date').map(function (t, i) {
      var pct = (Number(t.rating) / 5 * 100).toFixed(0);
      return '<article class="tech-item reveal" style="--rd:' + Math.min(i * 70, 350) + 'ms" data-id="' + t.id + '">' +
        '<div class="tech-dot">' + (CAT_EMOJI[t.category] || '📦') + '</div>' +
        '<div class="tech-card card">' +
          '<div class="tech-head"><span class="badge">' + esc(t.category || '其他') + '</span><time>' + esc(t.date) + '</time>' + actionsHTML('tech', t) + '</div>' +
          '<h3 class="tech-name">' + esc(t.title) + '</h3>' +
          '<div class="stars" aria-label="评分 ' + esc(t.rating) + ' / 5">' +
            '<span class="stars-bg">★★★★★</span>' +
            '<span class="stars-fill" style="width:' + pct + '%">★★★★★</span>' +
          '</div>' +
          galleryHTML(t.imgs, t.title) +
          '<p class="tech-text">' + esc(t.text) + '</p>' +
          (t.content ? '<button class="read-more" type="button" data-action="read-item" data-kind="tech" data-id="' + t.id + '">阅读全文 →</button>' : '') +
        '</div>' +
      '</article>';
    }).join('');
  }

  /* 个人设备：一行两个的紧凑卡片（emoji + 产品名 + 类别） */
  function renderDevices() {
    var list = $('#deviceGrid');
    if (!list) return;
    if (!S.devices.length) { list.innerHTML = emptyHTML('还没有登记设备，点右下角 <b>＋</b> 添置第一台 🎧'); return; }
    list.innerHTML = S.devices.map(function (d, i) {
      return '<article class="device-card card reveal" style="--rd:' + Math.min(i * 60, 300) + 'ms" data-id="' + d.id + '">' +
        '<span class="device-emoji">' + esc(d.emoji || '🎧') + '</span>' +
        '<span class="device-meta">' +
          '<span class="device-cat">' + esc(d.category || '设备') + '</span>' +
          '<span class="device-name">' + esc(d.name || '') + '</span>' +
        '</span>' +
        actionsHTML('device', d) +
      '</article>';
    }).join('');
  }

  function renderStudies() {
    var list = $('#studyList');
    if (!list) return;
    if (!S.studies.length) { list.innerHTML = emptyHTML('还没有任何指南，点右上角 <b>＋</b> 添加第一篇教程/焚诀 ✍️'); return; }
    list.innerHTML = sortDesc(S.studies, 'date').map(function (t, i) {
      var pct2 = '';
      return '<article class="tech-item reveal" style="--rd:' + Math.min(i * 70, 350) + 'ms" data-id="' + t.id + '">' +
        '<div class="tech-dot">📚</div>' +
        '<div class="tech-card card">' +
          '<div class="tech-head"><span class="badge">' + esc(t.category || '指南') + '</span><time>' + esc(t.date) + '</time>' + actionsHTML('study', t) + '</div>' +
          '<h3 class="tech-name">' + esc(t.title) + '</h3>' +
          '<div class="author-chip">' + avatarHTML(t, 22, 'av-xs') + ' ✍️ 编写：<b>' + esc(authorsOf(t).map(function (a) { return a.nick; }).join('、')) + '</b>' + (t.time ? '<span class="m-time"> · ' + esc(t.time) + '</span>' : '') + '</div>' +
          galleryHTML(t.imgs, t.title) +
          '<p class="tech-text">' + esc(t.text) + '</p>' +
          (t.content ? '<button class="read-more" type="button" data-action="read-item" data-kind="study" data-id="' + t.id + '">阅读全文 →</button>' : '') +
        '</div>' +
      '</article>';
    }).join('');
  }

  /* ---------- 旅行攻略（朋友们共创，可配图） ---------- */
  var TRIP_EMOJI = { '城市漫游': '🏙️', '自然风光': '🏔️', '海岛': '🏝️', '美食': '🍜', '自驾': '🚗', '露营': '⛺', '境外': '✈️', '其他': '🧭' };

  function renderTrips() {
    var grid = $('#tripGrid');
    if (!grid) return;
    if (!S.trips.length) {
      grid.innerHTML = emptyHTML('还没有旅行攻略 —— 去过的城市、踩过的坑、舍不得分享的那家小店，都可以写在这里 🧭');
      return;
    }
    grid.innerHTML = sortDesc(S.trips, 'date').map(function (t, i) {
      var coverImg = (t.imgs && t.imgs[0]) ? '<img src="' + esc(mediaUrl(t.imgs[0])) + '" alt="' + esc(t.title) + '" loading="lazy" decoding="async" />' : '';
      var emoji = coverImg ? '' : '<span class="t-emoji">' + esc(TRIP_EMOJI[t.category] || '🧭') + '</span>';
      var facts = '';
      if (t.days) facts += '<span class="tag">📅 ' + esc(t.days) + '</span>';
      if (t.budget) facts += '<span class="tag">💰 ' + esc(t.budget) + '</span>';
      var acts = canManage('trip', t)
        ? '<div class="t-actions">' +
            '<button class="act-btn" type="button" data-action="edit-trip" data-id="' + t.id + '" aria-label="编辑">✎</button>' +
            '<button class="act-btn danger" type="button" data-action="del-trip" data-id="' + t.id + '" aria-label="删除">✕</button>' +
          '</div>'
        : '';
      return '<article class="trip-card card reveal" style="--rd:' + Math.min(i * 70, 350) + 'ms" data-id="' + t.id + '">' +
        '<div class="trip-cover">' + coverImg + emoji +
          '<span class="t-loc">📍 ' + esc(t.location || '在路上') + '</span>' +
          (t.date ? '<span class="t-date">' + esc(t.date) + '</span>' : '') +
          acts +
        '</div>' +
        '<div class="t-body">' +
          (t.category || facts ? '<div class="t-tags">' + (t.category ? '<span class="tag">' + esc(t.category) + '</span>' : '') + facts + '</div>' : '') +
          '<h3 class="t-title">' + esc(t.title) + '</h3>' +
          '<p class="t-summary">' + esc(t.text) + '</p>' +
          '<div class="author-chip">' + avatarHTML(t, 22, 'av-xs') + ' ✍️ 编写：<b>' + esc(authorsOf(t).map(function (a) { return a.nick; }).join('、')) + '</b>' + (t.time ? '<span class="m-time"> · ' + esc(t.time) + '</span>' : '') + '</div>' +
          (t.content ? '<button class="read-more" type="button" data-action="read-item" data-kind="trip" data-id="' + t.id + '">阅读全文 →</button>' : '') +
        '</div>' +
      '</article>';
    }).join('');
  }

  function renderFriends() {
    var list = $('#friendList');
    $('#friendCount').textContent = S.friends.length + ' 个';
    if (!S.friends.length) { list.innerHTML = emptyHTML('还没有友链，点右上角 <b>＋</b> 添加第一个 🤝'); return; }
    list.innerHTML = S.friends.map(function (f) {
      return '<div class="friend-row card reveal" data-id="' + f.id + '">' +
        '<a class="friend-link" href="' + esc(f.url) + '" target="_blank" rel="noopener noreferrer">' +
          '<span class="f-avatar">' + esc(f.emoji || '🌐') + '</span>' +
          '<span class="f-meta"><span class="f-name">' + esc(f.name) + '</span><span class="f-desc">' + esc(f.desc || '') + '</span></span>' +
          '<span class="f-arrow">↗</span>' +
        '</a>' +
        (canManage('friend', f) ? '<div class="item-actions">' +
          '<button class="act-btn" type="button" data-action="edit-friend" data-id="' + f.id + '" aria-label="编辑">✎</button>' +
          '<button class="act-btn danger" type="button" data-action="del-friend" data-id="' + f.id + '" aria-label="删除">✕</button>' +
        '</div>' : '') +
      '</div>';
    }).join('');
  }

  function renderMessages() {
    var list = $('#msgList');
    if (!S.messages.length) { list.innerHTML = emptyHTML('还没有留言，来抢沙发吧 🛋️'); return; }
    list.innerHTML = sortDesc(S.messages, 'time').map(function (m) {
      var initial = Array.from(m.name || '友')[0] || '友';
      var ownerMail = '';
      if (isOwnerRole() && m.email) {
        var mailSubject = encodeURIComponent('回复：' + (m.name || '访客') + ' 在 MiNgHZ 的留言');
        var mailBody = encodeURIComponent('\n\n——\n原留言：' + (m.text || ''));
      ownerMail = '<div class="m-contact"><a class="m-mailto" href="mailto:' + esc(m.email) + '?subject=' + mailSubject + '&amp;body=' + mailBody + '" title="点击后在 Outlook 中回复此留言">📧 ' + esc(m.email) + ' · 回复</a></div>';
      }
      return '<article class="msg-item card reveal" data-id="' + m.id + '">' +
        avatarHTML({ nick: m.name, author: m.name, avatar: m.avatar }, 42, 'av-md') +
        '<div class="m-body">' +
          '<div class="m-head"><span class="m-name">' + esc(m.name) + '</span><time>' + esc(m.time) + '</time>' +
          ipTag(m) +
          (canManage('msg', m) ? '<button class="act-btn danger" type="button" data-action="del-msg" data-id="' + m.id + '" aria-label="删除">✕</button>' : '') + '</div>' +
          ownerMail +
          '<p class="m-text">' + esc(m.text) + '</p>' +
        '</div>' +
      '</article>';
    }).join('');
  }

  function renderAll() {
    renderStats();
    renderMoments();
    renderTravels();
    renderTech();
    renderDevices();
    renderStudies();
    renderTrips();
    renderFriends();
    renderMessages();
    applyGuestGate();
    syncPermUI();
    bindReveal();
  }

  /* ============================================================
     权限 → 界面：按钮显示 / 发帖框 / 账号面板
     ============================================================ */
  var ADD_PERM = { 'add-moment': 'moment', 'add-travel': 'travel', 'add-tech': 'tech', 'add-device': 'device', 'add-study': 'study', 'add-trip': 'trip', 'add-friend': 'friend' };
  var QA_PERM = { 'qa-moment': 'moment', 'qa-study': 'study', 'qa-trip': 'trip', 'qa-travel': 'travel', 'qa-tech': 'tech', 'qa-device': 'device', 'qa-friend': 'friend' };

  function syncPermUI() {
    Object.keys(ADD_PERM).forEach(function (act) {
      var ok = permFor(ADD_PERM[act]);
      $$('[data-action="' + act + '"]').forEach(function (b) { b.hidden = !ok; });
    });
    var any = false;
    Object.keys(QA_PERM).forEach(function (act) {
      var ok = permFor(QA_PERM[act]);
      if (ok) any = true;
      $$('#qaMenu [data-action="' + act + '"]').forEach(function (b) { b.hidden = !ok; });
    });
    document.body.classList.toggle('can-post-any', any);
    /* 管理界面只有站长看得到（管理员 / 普通用户进个人空间只能看） */
    var acctSection = $('#account');
    if (acctSection) acctSection.hidden = !isOwnerUser();
    var acctLink = $('#accountNavLink');
    if (acctLink) acctLink.hidden = !isOwnerUser();
    document.body.classList.toggle('is-owner', isOwnerUser());
    renderComposer();
    renderAccount();
  }

  function permSummary() {
    if (!myUser) return '';
    if (isOwnerUser()) return '你是站长：所有板块都能编辑，可以发放账号、开关权限。';
    if (isAdminUser()) {
      var on = Object.keys(S.perms.admin).filter(function (k) { return S.perms.admin[k]; });
      return '你是管理员，当前可管理：' + (on.length ? on.map(function (k) { return ADMIN_PERM_LABEL[k] || k; }).join('、') : '（暂无）');
    }
    var mine = [];
    if (myUser && S.perms.member.canMsg) mine.push('留言');
    if (canCommentMoment()) mine.push('跟帖');
    if (canPostMoment()) mine.push('发说说');
    if (permFor('study')) mine.push('写指南');
    if (permFor('trip')) mine.push('写旅行攻略');
    if (S.perms.member.canEdit) mine.push('编辑全部内容');
    return '你是朋友账号，当前可以：' + (mine.length ? mine.join('、') : '浏览');
  }
  var ADMIN_PERM_LABEL = { say: '说说', travel: '游记', tech: '数码', device: '设备', study: '指南', trips: '旅行攻略', friends: '友链', msg: '留言' };

  /* 说说墙发帖框：没登录提示登录，没权限说明原因，有权限直接写 */
  function renderComposer() {
    var box = $('#momentComposer');
    if (!box) return;
    if (!myUser) {
      box.innerHTML = '<div class="card composer-locked">👋 <b>登录后就能在说说墙上发帖、跟帖</b><br />' +
        '<span class="field-hint">账号由站长私下发放，登录后每一条都会署上你的昵称和真实时间。</span>' +
        '<div style="margin-top:12px"><button class="btn btn-soft btn-small" type="button" data-action="guest-login">🔐 登录 / 我的账户</button></div></div>';
      return;
    }
    if (!canPostMoment()) {
      box.innerHTML = '<div class="card composer-locked">你现在是「' + esc(myUser.nick) + '」：可以看、可以跟帖' +
        (canCommentMoment() ? '' : '（跟帖权限也没开）') + '；发帖权限还没开，找站长开一下就行。</div>';
      return;
    }
    var paint = function () {
      box.innerHTML = '<form class="card composer" id="postForm" novalidate>' +
        '<div class="composer-head"><span class="composer-who">' + esc(myUser.nick) +
          '<small>' + (isOwnerUser() ? '你是站长：署名可以自己挑（默认就是你）' : '以这个昵称发帖 · 时间自动记录') + '</small></span></div>' +
        '<textarea id="postText" rows="3" maxlength="300" placeholder="此刻在想什么？（最多 300 字）"></textarea>' +
        (isOwnerUser() ? '<div class="composer-authors" id="postAuthors"></div>' : '') +
        '<div class="composer-row">' +
          '<input class="composer-emoji" id="postEmoji" maxlength="4" placeholder="😀" aria-label="配一个表情" />' +
          '<span class="composer-count"><b id="postCount">0</b>/0</span>' +
          '<button class="btn btn-primary btn-small" type="submit">发布 ✨</button>' +
        '</div></form>';
      var box2 = document.getElementById('postAuthors');
      if (box2) {
        if (!pickerState.post || !pickerState.post.length) pickerState.post = [myUser.id];
        box2.outerHTML = authorPickerHTML('post', pickerState.post);
        apInput('post');
      }
      var c = $('#postCount');
      if (c) c.textContent = String((($('#postText') || {}).value || '').length);
    };
    if (hasPanelRight() && !usersCache) loadUsers(function () { paint(); });
    else paint();
  }

  /* 个人空间里的「账号与权限」面板（原来的账号管理系统） */
  function renderAccount() {
    var box = $('#accountPanel');
    if (!box) return;
    /* 这一块只有站长看得到（管理员 / 普通用户进来只能看内容） */
    if (!isOwnerUser()) { box.innerHTML = ''; return; }
    var roleLabel = '站长';
    box.innerHTML = '<div class="card acct-card">' +
      '<div class="acct-head">' +
        avatarHTML({ nick: myUser.nick, avatar: myUser.av }, 44, 'av-md') +
        '<div><div class="acct-name">' + esc(myUser.nick) + ' <span class="pu-role owner">' + roleLabel + '</span></div>' +
        '<div class="acct-sub">账号：' + esc(myUser.un || '') + (myUser.twoFactor ? ' · 🔐 已开两步验证' : ' · 未开两步验证') + (myUser.l ? ' · 最近登录 ' + esc(myUser.l) : '') + '</div></div>' +
      '</div>' +
      '<div class="acct-grid">' +
        '<button class="acct-btn" type="button" data-action="open-mine">👤 我的账户 / 头像<small>头像、昵称、登录状态</small></button>' +
        '<button class="acct-btn" type="button" data-action="open-pw">🔑 ' + (myUser.hasPw ? '修改密码' : '设置密码') + '<small>建议定期更换</small></button>' +
        '<button class="acct-btn" type="button" data-action="open-2fa">' + (myUser.twoFactor ? '🔐 两步验证 · 已开启' : '🔐 开启两步验证') + '<small>密码 + 验证器动态码</small></button>' +
        '<button class="acct-btn" type="button" data-action="open-panel">🛡️ 管理面板<small>发放账号 / 权限开关 / 重置密码</small></button>' +
        '<button class="acct-btn" type="button" data-action="logout-user">🚪 退出登录<small>在公用设备上记得退出</small></button>' +
      '</div>' +
      '<p class="acct-note">你是站长：游记 / 数码 / 设备只有你能改；朋友们那扇门里的说说墙、指南、友链留言的权限，在「管理面板 → 权限管理」里随时开关。</p>' +
      '</div>';
  }

  function applyGuestGate() {
    var g = $('#guestGate'), f = $('#msgForm');
    if (!g || !f) return;
    var canPost = false;
    if (myUser) canPost = myUser.role === 'owner' || myUser.role === 'admin' || !!S.perms.member.canMsg;
    else canPost = !!S.perms.guest.canMsg;
    f.hidden = !canPost;
    g.hidden = canPost;
  }

  function sortDesc(list, key) {
    return list.slice().sort(function (a, b) { return String(a[key]) > String(b[key]) ? -1 : 1; });
  }

  /* ---------- 进场动画 ---------- */
  function bindReveal() {
    var els = $$('.reveal:not([data-bound])');
    if (!('IntersectionObserver' in window)) {
      els.forEach(function (el) { el.classList.add('revealed'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('revealed'); io.unobserve(en.target); }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -24px 0px' });
    els.forEach(function (el) { el.dataset.bound = '1'; io.observe(el); });
  }

  /* ============================================================
     视图路由：#home 主页门户 · #space 个人空间 · #friends 朋友们
     6 个板块都属于「个人空间」；#guest 会被移动到当前视图里复用（不复制 DOM）
     ============================================================ */
  var VIEWS = ['home', 'space', 'friends'];
  var VIEW_TITLES = {
    home: 'MiNg Official Website',
    space: 'MiNg 的个人空间 · MiNgHZ',
    friends: 'MiNg 和他的朋友们 · MiNgHZ'
  };
  /* 朋友们：说说墙 / 指南 / 友链留言；个人空间：账号 / 游记 / 数码 / 设备 */
  var SECTION_VIEW = {
    moments: 'friends', study: 'friends', trips: 'friends', guest: 'friends', games: 'friends',
    account: 'space', travel: 'space', tech: 'space', devices: 'space', photo: 'space'
  };
  var currentView = '';
  var mountMsgTs = null;   /* 由留言表单那一段赋值：进入视图后再挂人机验证 */

  function viewPanel(name) { return document.getElementById('view' + name.charAt(0).toUpperCase() + name.slice(1)); }

  function setView(name, opts) {
    opts = opts || {};
    if (VIEWS.indexOf(name) < 0) name = 'home';
    var changed = name !== currentView;
    currentView = name;
    document.body.setAttribute('data-view', name);
    VIEWS.forEach(function (v) {
      var el = viewPanel(v);
      if (el) el.hidden = (v !== name);
    });
    $$('.main-nav .nav-link[data-view]').forEach(function (a) {
      a.classList.toggle('active', a.getAttribute('data-view') === name);
      if (a.getAttribute('data-view') === name) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    if (VIEW_TITLES[name]) document.title = VIEW_TITLES[name];
    var sub = $('#subNav');
    if (sub) sub.hidden = name !== 'space';
    var subF = $('#subNavFriends');
    if (subF) subF.hidden = name !== 'friends';
    if (opts.scroll !== false) {
      var target = opts.anchor ? document.getElementById(opts.anchor) : null;
      var behavior = opts.instant ? 'auto' : 'smooth';
      if (target && !target.closest('[hidden]')) {
        target.scrollIntoView({ behavior: behavior, block: 'start' });
      } else {
        window.scrollTo({ top: 0, behavior: behavior });
      }
    }
    if (name !== 'home') bindReveal();
    if (mountMsgTs) setTimeout(mountMsgTs, 60);
    return changed;
  }

  function viewForHash(hash) {
    var h = String(hash || '').replace(/^#/, '');
    if (!h) return { view: 'home' };
    if (VIEWS.indexOf(h) >= 0) return { view: h };
    if (SECTION_VIEW[h]) return { view: SECTION_VIEW[h], anchor: h };
    return null;
  }

  function applyLocation(instant) {
    var loc = viewForHash(location.hash);
    if (!loc) return;
    setView(loc.view, { anchor: loc.anchor, instant: !!instant });
    if (!loc.anchor && location.hash !== '#' + loc.view && history.replaceState) {
      history.replaceState(null, '', '#' + loc.view);
    }
  }

  function goView(name, push) {
    var changed = name !== currentView;
    try {
      if (push !== false && changed) history.pushState({ view: name }, '', '#' + name);
      else if (history.replaceState) history.replaceState({ view: name }, '', '#' + name);
    } catch (e) { /* 本地 file:// 预览时 history 可能受限 */ }
    setView(name, {});
    var mt = $('#menuToggle'), nav = $('#mainNav');
    if (nav) nav.classList.remove('open');
    if (mt) { mt.textContent = '☰'; mt.setAttribute('aria-expanded', 'false'); }
  }

  window.addEventListener('popstate', function () { applyLocation(false); });
  window.addEventListener('hashchange', function () {
    var loc = viewForHash(location.hash);
    if (loc && loc.view !== currentView) applyLocation(false);
  });

  /* ============================================================
     数学公式：KaTeX 本地懒加载（页面里没公式就一个字节都不下载）
     ============================================================ */
  var KATEX_DIR = 'vendor/katex/';
  var katexWaiting = null;

  function ensureKatex(cb) {
    if (window.katex && window.katex.render) { cb(true); return; }
    if (katexWaiting) { katexWaiting.push(cb); return; }
    katexWaiting = [cb];
    var done = function (ok) {
      var q = katexWaiting; katexWaiting = null;
      if (!q) return;
      q.forEach(function (fn) { try { fn(ok); } catch (e) {} });
    };
    if (!document.getElementById('katexCss')) {
      var l = document.createElement('link');
      l.id = 'katexCss'; l.rel = 'stylesheet'; l.href = KATEX_DIR + 'katex.min.css';
      document.head.appendChild(l);
    }
    var s = document.createElement('script');
    s.src = KATEX_DIR + 'katex.min.js';
    s.async = true;
    s.onload = function () { done(true); };
    s.onerror = function () { done(false); };
    document.head.appendChild(s);
    setTimeout(function () { if (!(window.katex && window.katex.render)) done(false); }, 15000);
  }

  /* 把 .math-pending 占位节点真正渲染成公式；KaTeX 不可用时退回源码显示 */
  function hydrateMath(root) {
    if (!root || !root.querySelectorAll) return;
    var nodes = root.querySelectorAll('.math-pending');
    if (!nodes.length) return;
    var list = Array.prototype.slice.call(nodes);
    ensureKatex(function (ok) {
      list.forEach(function (n) {
        var tex = n.getAttribute('data-tex') || '';
        var display = n.getAttribute('data-display') === '1';
        if (ok && window.katex && window.katex.render && tex) {
          try {
            window.katex.render(tex, n, { displayMode: display, throwOnError: false, strict: false, trust: false });
            n.className = display ? 'math-display' : 'math-inline';
            return;
          } catch (e) { /* 渲染失败就退回源码 */ }
        }
        n.className = 'math-raw';
        n.textContent = tex;
      });
    });
  }

  /* 内容里出现公式时，空闲时先把 KaTeX 拉下来，点开文章就不用等 */
  function prefetchKatexIfNeeded(text) {
    if (!text || text.indexOf('$') < 0) return;
    var later = window.requestIdleCallback || function (fn) { setTimeout(fn, 1200); };
    later(function () { ensureKatex(function () {}); });
  }

  /* ============================================================
     轻量 Markdown 渲染（先转义后转换，安全无忧）
     · 支持 $…$ / $$…$$ / \(…\) / \[…\] 数学公式
     · 支持标题 / 粗斜体 / 删除线 / 行内代码 / 代码块 / 列表 / 引用
       / 分割线 / 链接 / 图片 / 表格 / 任务清单
     ============================================================ */
  var MD_FENCE = String.fromCharCode(96, 96, 96);
  var mathBag = [];
  var mathToken = function (i) { return '\u0001' + i + '\u0001'; };

  function protectMath(s) {
    return s.replace(/\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$([^$\n]+?)\$/g,
      function (m, blockDollar, blockBracket, inlineParen, inlineDollar) {
        var tex, display = false;
        if (blockDollar != null) { tex = blockDollar; display = true; }
        else if (blockBracket != null) { tex = blockBracket; display = true; }
        else if (inlineParen != null) { tex = inlineParen; display = false; }
        else {
          tex = inlineDollar;
          /* 单个 $ 容易和「$100 到 $200」这种价格撞车：首尾不能是空格，且不能只有数字标点 */
          if (!/^\S(?:[\s\S]*\S)?$/.test(tex)) return m;
          if (!/[\\^_{}=+\-*/<>a-zA-Z\u4e00-\u9fa5]/.test(tex)) return m;
          display = false;
        }
        if (!tex.replace(/\s/g, '')) return m;
        mathBag.push({ tex: tex, display: display });
        return mathToken(mathBag.length - 1);
      });
  }

  function mathPlaceholder(o) {
    /* o.tex 已经过一次 HTML 转义（& < >），这里只要再挡一下引号，避免把 &gt; 又转成 &amp;gt; */
    return '<span class="math-pending" data-tex="' + o.tex.replace(/"/g, '&quot;') + '" data-display="' + (o.display ? '1' : '0') + '"></span>';
  }

  function restoreMath(html) {
    if (!mathBag.length) return html;
    return html.replace(/\u0001(\d+)\u0001/g, function (m, i) {
      var o = mathBag[Number(i)];
      return o ? mathPlaceholder(o) : m;
    });
  }

  function mdInline(s) {
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, function (m, alt, url) {
      if (!/^(https?:\/\/|data:image\/(?:png|jpe?g|gif|webp);base64,)/i.test(url)) return m;
      return '<img src="' + mediaUrl(url) + '" alt="' + alt + '" loading="lazy" decoding="async" />';
    });
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (m, label, url) {
      if (!/^(https?:\/\/|mailto:)/i.test(url)) return m;
      return '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + label + '</a>';
    });
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    s = s.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
    return s;
  }

  /* 表格：必须有 |---| 分隔行才算表格，避免误伤正文里的 | 符号 */
  function mdSplitRow(row) {
    return row.replace(/^\||\|$/g, '').split('|');
  }
  function mdTable(head, rows) {
    var th = head.map(function (c) { return '<th>' + mdInline(c.trim()) + '</th>'; }).join('');
    var tb = rows.map(function (r) {
      return '<tr>' + head.map(function (_, i) { return '<td>' + mdInline((r[i] || '').trim()) + '</td>'; }).join('') + '</tr>';
    }).join('');
    return '<table><thead><tr>' + th + '</tr></thead><tbody>' + tb + '</tbody></table>';
  }

  function mdListItem(li) {
    var task = li.match(/^\[([ xX])\]\s+([\s\S]*)$/);
    if (task) {
      return '<li class="md-task"><input type="checkbox" disabled' + (task[1] === ' ' ? '' : ' checked') + ' />' + mdInline(task[2]) + '</li>';
    }
    return '<li>' + mdInline(li) + '</li>';
  }

  function mdBlock(block) {
    var lines = block.split('\n');
    var out = [];
    var list = null;
    var ordered = false;
    var para = [];
    function flushPara() { if (para.length) { out.push('<p>' + mdInline(para.join(' ')) + '</p>'); para = []; } }
    function flushList() {
      if (list) {
        var tag = ordered ? 'ol' : 'ul';
        out.push('<' + tag + '>' + list.map(mdListItem).join('') + '</' + tag + '>');
        list = null;
      }
    }
    for (var i = 0; i < lines.length; i++) {
      var t = lines[i].trim();
      if (!t) { flushPara(); flushList(); continue; }
      if (/^\|.*\|$/.test(t) && i + 1 < lines.length && /^\|[\s:|-]+\|$/.test(lines[i + 1].trim())) {
        flushPara(); flushList();
        var head = mdSplitRow(t);
        var rows = [];
        i += 2;
        while (i < lines.length && /^\|.*\|$/.test(lines[i].trim())) { rows.push(mdSplitRow(lines[i].trim())); i++; }
        i--;
        out.push(mdTable(head, rows));
        continue;
      }
      /* 标题支持到六级（之前把 5、6 级强行折成了 h4，所以 ##### / ###### 看起来「没生效」） */
      if (/^#{1,6}\s/.test(t)) { flushPara(); flushList(); var hv = Math.min(6, t.match(/^#+/)[0].length); out.push('<h' + hv + '>' + mdInline(t.replace(/^#+\s+/, '')) + '</h' + hv + '>'); continue; }
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { flushPara(); flushList(); out.push('<hr/>'); continue; }
      /* 注意：正文已经过 HTML 转义，所以引用行的 > 到了这里其实是 &gt;（原版这里漏了，引用一直没生效） */
      if (/^(?:>|&gt;)\s?/.test(t)) {
        flushPara(); flushList();
        var quote = [];
        while (i < lines.length && /^(?:>|&gt;)\s?/.test(lines[i].trim())) {
          quote.push(lines[i].trim().replace(/^(?:>|&gt;)\s?/, ''));
          i++;
        }
        i--;
        out.push('<blockquote>' + mdInline(quote.join(' ')) + '</blockquote>');
        continue;
      }
      if (/^[-*+]\s/.test(t)) { flushPara(); if (!list || ordered) { flushList(); list = []; ordered = false; } list.push(t.replace(/^[-*+]\s/, '')); continue; }
      if (/^\d+[.)]\s/.test(t)) { flushPara(); if (!list || !ordered) { flushList(); list = []; ordered = true; } list.push(t.replace(/^\d+[.)]\s/, '')); continue; }
      flushList(); para.push(t);
    }
    flushPara(); flushList();
    return out.join('');
  }

  function mdToHtml(src) {
    mathBag = [];
    var h = String(src || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    var segs = h.split(MD_FENCE);
    var out = [];
    for (var i = 0; i < segs.length; i++) {
      if (i % 2 === 1) { out.push('<pre><code>' + segs[i].replace(/^[^\n]*\n/, '') + '</code></pre>'); }
      else { out.push(restoreMath(mdBlock(protectMath(segs[i])))); }
    }
    return out.join('');
  }
  /* ---------- 弹窗系统 ---------- */
  var currentFields = [];
  var currentSubmit = null;
  var pendingConfirm = null;

  /* ---------- Markdown 速查：点一下就插到光标处 ---------- */
  /* [插入前, 插入后, 说明, 模式, 示例, 速查表里显示的写法] */
  var MD_HELP = [
    ['# ', '', '一级标题', 'line', '', '# 标题'],
    ['## ', '', '二级标题', 'line', '', '## 标题'],
    ['### ', '', '三级标题', 'line', '', '### 标题'],
    ['#### ', '', '四级标题', 'line', '', '#### 标题'],
    ['##### ', '', '五级标题', 'line', '', '##### 标题'],
    ['###### ', '', '六级标题', 'line', '', '###### 标题'],
    ['**', '**', '加粗', 'wrap', '重点', '**加粗**'],
    ['*', '*', '斜体', 'wrap', '强调', '*斜体*'],
    ['~~', '~~', '删除线', 'wrap', '划掉', '~~删除线~~'],
    ['`', '`', '行内代码', 'wrap', 'code', '`代码`'],
    ['> ', '', '引用', 'line', '', '> 引用'],
    ['- ', '', '无序列表', 'line', '', '- 列表'],
    ['1. ', '', '有序列表', 'line', '', '1. 列表'],
    ['- [ ] ', '', '任务清单', 'line', '', '- [ ] 待办'],
    ['[', '](https://)', '链接', 'wrap', '链接文字', '[文字](链接)'],
    ['![', '](图片链接)', '图片', 'wrap', '说明', '![图](链接)'],
    ['---', '', '分割线', 'block', '', '---'],
    ['$', '$', '行内公式', 'wrap', 'E=mc^2', '$公式$'],
    ['$$\n', '\n$$', '公式块（独占一行）', 'wrap', '\\int_0^1 x^2\\,dx', '$$公式$$'],
    ['| 表头 | 说明 |\n| --- | --- |\n| 内容 | 内容 |', '', '表格', 'block', '', '| 表格 |'],
    ['```\n', '\n```', '代码块', 'wrap', 'code', '```代码块```']
  ];

  function mdHelpHTML() {
    var rows = MD_HELP.map(function (it) {
      return '<button type="button" class="md-sym" data-action="md-insert" data-mode="' + it[3] + '" ' +
        'data-before="' + esc(it[0]) + '" data-after="' + esc(it[1]) + '" data-sample="' + esc(it[4] || '') + '" title="点击插入">' +
        '<code>' + esc(it[5]) + '</code><span>' + esc(it[2]) + '</span></button>';
    }).join('');
    return '<aside class="md-help" aria-label="Markdown 符号速查">' +
      '<div class="md-help-head">📖 Markdown 速查 <small>点一下插入</small></div>' +
      rows +
      '<div class="md-help-sep">公式与表格</div>' +
      '<p class="field-hint" style="padding:0 6px">公式用 KaTeX 渲染，支持 <code>$…$</code> 行内与 <code>$$…$$</code> 独占一行；表格需要 <code>| --- |</code> 分隔行。</p>' +
      '</aside>';
  }

  function mdInsert(btn) {
    var box = btn.closest ? (btn.closest('.md-wrap') || btn.closest('.md-box')) : null;
    var ta = (box || document).querySelector('.md-input');
    if (!ta) return;
    var before = btn.getAttribute('data-before') || '';
    var after = btn.getAttribute('data-after') || '';
    var sample = btn.getAttribute('data-sample') || '';
    var mode = btn.getAttribute('data-mode') || 'insert';
    var start = ta.selectionStart == null ? ta.value.length : ta.selectionStart;
    var end = ta.selectionEnd == null ? start : ta.selectionEnd;
    var val = ta.value;
    var from, to, text;
    if (mode === 'line') {
      from = to = val.lastIndexOf('\n', start - 1) + 1;
      text = before;
    } else if (mode === 'block') {
      var pfx = (start > 0 && val.charAt(start - 1) !== '\n') ? '\n' : '';
      from = start; to = end;
      text = pfx + before;
    } else {
      from = start; to = end;
      text = before + (val.slice(start, end) || sample) + after;
    }
    ta.value = val.slice(0, from) + text + val.slice(to);
    var caret = from + text.length;
    ta.focus();
    try { ta.setSelectionRange(caret, caret); } catch (e) {}
    var px = (box || document).querySelector('.md-preview');
    if (px && !px.hidden) { px.innerHTML = mdToHtml(ta.value); hydrateMath(px); }
  }

  function fieldHTML(f) {
    var v = f.value != null ? f.value : '';
    var label = '<label for="f_' + f.key + '">' + esc(f.label) + (f.required ? ' <i style="color:var(--danger);font-style:normal">*</i>' : '') + '</label>';
    var inner;
    if (f.type === 'authors') {
      if (!isOwnerUser()) return '';
      inner = authorPickerHTML('modal', pickerState.modal || []) +
        '<p class="field-hint">' + esc(f.hint || '可以选多个账号联合署名；不选就署你自己。') + '</p>';
    } else if (f.type === 'markdown') {
      inner = '<div class="md-wrap"><div class="md-box">' +
        '<div class="md-tabs"><button type="button" class="m-tab on" data-action="md-tab-edit">✏️ 编辑</button><button type="button" class="m-tab" data-action="md-tab-prev">👁️ 预览</button></div>' +
        '<textarea class="md-input" id="f_' + f.key + '" name="' + f.key + '" rows="14" maxlength="50000" placeholder="' + esc(f.placeholder || '') + '">' + esc(v) + '</textarea>' +
        '<div class="md-preview md-body" hidden></div>' +
        '</div>' + mdHelpHTML() + '</div>' +
        '<p class="field-hint">支持 Markdown 与 LaTeX 公式（KaTeX 渲染）：<code>$行内公式$</code> · <code>$$独占一行的公式$$</code>；右侧速查表点一下即可插入。</p>';
    } else if (f.type === 'imgs') {
      inner = '<div class="img-picker">' +
        '<div class="img-list" id="imgList"></div>' +
        '<label class="img-add" for="imgFileInput" id="imgAddLabel">＋ 添加图片</label>' +
        '<input id="imgFileInput" type="file" accept="image/png,image/jpeg,image/webp" multiple hidden />' +
        '</div>' +
        '<p class="field-hint">浏览器里自动压缩（长边 1600px · 优先 WebP），支持 JPG / PNG / WebP / HEIC 转码；最多 6 张，可拖拽或直接粘贴</p>';
    } else if (f.type === 'textarea') {
      inner = '<textarea id="f_' + f.key + '" name="' + f.key + '" rows="' + (f.rows || 4) + '" maxlength="' + (f.max || 500) + '" placeholder="' + esc(f.placeholder || '') + '">' + esc(v) + '</textarea>';
    } else if (f.type === 'select') {
      inner = '<select id="f_' + f.key + '" name="' + f.key + '">' + (f.options || []).map(function (o) {
        return '<option value="' + esc(o) + '"' + (String(o) === String(v) ? ' selected' : '') + '>' + esc(o) + '</option>';
      }).join('') + '</select>';
    } else {
      inner = '<input id="f_' + f.key + '" name="' + f.key + '" type="' + (f.type || 'text') + '" value="' + esc(v) + '" maxlength="' + (f.max || 200) + '" placeholder="' + esc(f.placeholder || '') + '" />';
    }
    return '<div class="field"><div>' + label + '</div>' + inner + (f.hint ? '<p class="field-hint">' + esc(f.hint) + '</p>' : '') + '</div>';
  }

  function openModal(opts) {
    currentFields = opts.fields || [];
    currentSubmit = opts.onSubmit;
    pendingConfirm = null;
    /* 带 Markdown 编辑器 / 图片选择器的弹窗放宽一些，编辑器旁边放得下速查表 */
    var wide = currentFields.some(function (f) { return f.type === 'markdown' || f.type === 'imgs'; });
    var dlg = $('#modalBackdrop .modal');
    if (dlg) dlg.classList.toggle('modal-wide', wide);
    $('#modalTitle').textContent = opts.title;
    $('#modalBody').innerHTML = currentFields.map(fieldHTML).join('');
    $('#modalFoot').innerHTML =
      '<button class="btn btn-ghost" type="button" data-action="close-modal">取消</button>' +
      '<button class="btn btn-primary" type="button" data-action="submit-modal">' + esc(opts.submitText || '保存') + '</button>';
    $('#modalBackdrop').hidden = false;
    document.body.style.overflow = 'hidden';
    var first = $('#modalBody input, #modalBody textarea, #modalBody select');
    if (first) first.focus();
  }

  function closeModal() {
    $('#modalBackdrop').hidden = true;
    document.body.style.overflow = '';
    currentSubmit = null;
    pendingConfirm = null;
  }

  function mdToggleTab(btn, mode) {
    var box = btn.closest('.md-box');
    if (!box) return;
    var tabs = box.querySelectorAll('.m-tab');
    var tx = box.querySelector('.md-input');
    var px = box.querySelector('.md-preview');
    if (!tx || !px) return;
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.remove('on');
    btn.classList.add('on');
    if (mode === 'prev') { px.innerHTML = mdToHtml(tx.value); hydrateMath(px); px.hidden = false; tx.hidden = true; }
    else { px.hidden = true; tx.hidden = false; }
  }

  var READER_KINDS = { travel: 'travels', tech: 'tech', study: 'studies', trip: 'trips' };
  function openReader(kind, id) {
    var arr = S[READER_KINDS[kind]] || [];
    var item = null;
    for (var i = 0; i < arr.length; i++) { if (arr[i].id === id) { item = arr[i]; break; } }
    if (!item) return;
    var meta = '';
    if (kind === 'travel') meta = esc(item.location || '') + (item.date ? ' · ' + esc(item.date) : '');
    else if (kind === 'trip') {
      meta = esc(item.location || '') + (item.days ? ' · ' + esc(item.days) : '') + (item.budget ? ' · 💰 ' + esc(item.budget) : '') +
        (item.date ? ' · ' + esc(item.date) : '') + ' · ✍️ 编写：' + esc(authorsOf(item).map(function (a) { return a.nick; }).join('、'));
    } else meta = esc(item.category || '') + (item.date ? ' · ' + esc(item.date) : '') + ' · ✍️ 编写：' + esc(authorsOf(item).map(function (a) { return a.nick; }).join('、'));
    $('#readerMeta').textContent = meta;
    $('#readerTitle').textContent = item.title || '';
    var body = $('#readerBody');
    body.innerHTML = mdToHtml(item.content || item.text || item.summary || '暂无内容');
    hydrateMath(body);
    $('#reader').hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeReader() {
    $('#reader').hidden = true;
    $('#readerBody').innerHTML = '';
    document.body.style.overflow = '';
  }

  function validateField(f, v) {
    if (f.key && f.key.charAt(0) === '_') return '';
    if (f.required && !String(v || '').trim()) return '请填写「' + f.label + '」';
    if ((f.type === 'email' || f.key === 'email') && v && !EMAIL_RE.test(v)) return '邮箱格式不太对哦';
    if (f.type === 'url' && v) {
      try { new URL(v); } catch (e) { return '链接格式不正确，记得带 https://'; }
    }
    return '';
  }

  function submitModal() {
    if (!currentSubmit) return;
    var values = {};
    $$('#modalBody input, #modalBody textarea, #modalBody select').forEach(function (el) {
      if (el.name && el.name.charAt(0) !== '_') values[el.name] = el.value;
    });
    var firstErr = '';
    currentFields.forEach(function (f) {
      var el = $('#modalBody [name="' + f.key + '"]');
      var err = validateField(f, values[f.key]);
      if (el) el.classList.toggle('invalid', !!err);
      if (err && !firstErr) firstErr = err;
    });
    if (firstErr) { toast(firstErr, 'error'); return; }
    if (currentSubmit(values) !== false) {
      renderAll();
      closeModal();
    }
  }

  function openConfirm(opts) {
    pendingConfirm = opts.onOk;
    $('#modalTitle').textContent = opts.title;
    $('#modalBody').innerHTML = '<p class="confirm-text">' + esc(opts.message || '此操作不可撤销，确定继续吗？') + '</p>';
    $('#modalFoot').innerHTML =
      '<button class="btn btn-ghost" type="button" data-action="close-modal">先别删</button>' +
      '<button class="btn btn-danger" type="button" data-action="confirm-ok">确认删除</button>';
    $('#modalBackdrop').hidden = false;
    document.body.style.overflow = 'hidden';
  }

  /* ---------- 各模块编辑弹窗 ---------- */
  function openMomentModal(item) {
    /* 站长发帖 / 改帖时可以挑署名（普通用户固定署自己） */
    var owner = isOwnerUser();
    var initIds = owner
      ? ((item && Array.isArray(item.authors) && item.authors.length)
          ? item.authors.map(function (a) { return a.id; })
          : (item && item.authorId ? [item.authorId] : [myUser ? myUser.id : '']))
      : [];
    var fields = [
      { key: 'text', label: '说点什么', type: 'textarea', required: true, max: 300, rows: 4, placeholder: '此刻的心情、灵感、碎碎念…', value: item ? item.text : '' },
      { key: 'emoji', label: '配一个表情', max: 4, placeholder: '🍀', hint: '单个 emoji，选填', value: item ? (item.emoji || '') : '' }
    ];
    if (owner) fields.push({ key: '_authors', label: '署名（可以选好几个）', type: 'authors' });
    openModal({
      title: item ? '编辑说说' : '写一条说说',
      submitText: item ? '保存修改' : '发布 ✨',
      fields: fields,
      onSubmit: function (v) {
        var authors = modalAuthorsPayload();
        if (item) {
          var data = { id: item.id, text: v.text.trim(), emoji: v.emoji.trim() };
          if (authors) data.authors = authors;
          adminMutate('moment.edit', data, '说说已更新 ✨');
        } else {
          var add = { id: uid(), text: v.text.trim(), emoji: v.emoji.trim(), time: nowStamp(), author: myUser ? myUser.nick : '' };
          if (authors) add.authors = authors;
          adminMutate('moment.add', add, '发布成功 ✨');
        }
        return true;
      }
    });
    if (owner) modalAuthorsInit(initIds);
  }

  function openTravelModal(item) {
    openModal({
      title: item ? '编辑游记' : '添加游记',
      submitText: item ? '保存修改' : '添加 ✨',
      fields: [
        { key: 'title', label: '标题', required: true, max: 40, placeholder: '如：杭州 · 西湖散记', value: item ? item.title : '' },
        { key: 'date', label: '日期', type: 'date', required: true, value: item ? item.date : dateStr(0) },
        { key: 'location', label: '地点', max: 30, placeholder: '如：浙江 · 杭州', value: item ? (item.location || '') : '' },
        { key: 'emoji', label: '封面表情', max: 4, placeholder: '🌊', value: item ? (item.emoji || '') : '' },
        { key: 'summary', label: '摘要', type: 'textarea', required: true, max: 160, rows: 3, placeholder: '用两三句话记录这趟旅程…', value: item ? (item.summary || '') : '' },
        { key: 'content', label: '正文（Markdown 长文）', type: 'markdown', max: 50000, rows: 14, placeholder: '# 早上六点的湖边\n\n**正文从这里开始**……', value: item ? (item.content || '') : '' },
        { key: 'tags', label: '标签', max: 60, placeholder: '江南, 慢游', hint: '用逗号分隔', value: item && Array.isArray(item.tags) ? item.tags.join(', ') : '' }
      ],
      onSubmit: function (v) {
        var tags = v.tags.split(/[,，、]/).map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 5);
        if (item) {
          adminMutate('travel.edit', { id: item.id, title: v.title.trim(), date: v.date, location: v.location.trim(), emoji: v.emoji.trim(), grad: item.grad != null ? item.grad : Math.floor(Math.random() * 8), summary: v.summary.trim(), content: v.content || '', tags: tags }, '游记已更新 🧳');
        } else {
          adminMutate('travel.add', { id: uid(), title: v.title.trim(), date: v.date, location: v.location.trim(), emoji: v.emoji.trim() || '🌏', grad: Math.floor(Math.random() * 8), summary: v.summary.trim(), content: v.content || '', tags: tags }, '游记已添加 🧳');
        }
        return true;
      }
    });
  }

  var pendingModalImgs = [];
  var imgFolder = 'tech';
  var uploadItems = [];        /* 正在上传/失败的图片（带进度，可重试） */
  var WEBP_OK = null;
  var IMG_MAX_EDGE = 1600;
  var IMG_TARGET_BYTES = 900 * 1024;

  function canEncodeWebp() {
    if (WEBP_OK !== null) return WEBP_OK;
    try {
      var c = document.createElement('canvas');
      c.width = c.height = 1;
      WEBP_OK = c.toDataURL('image/webp').indexOf('data:image/webp') === 0;
    } catch (e) { WEBP_OK = false; }
    return WEBP_OK;
  }

  function renderImgList() {
    var list = $('#imgList');
    if (!list) return;
    var done = pendingModalImgs.map(function (u) {
      return '<div class="img-thumb"><img src="' + esc(mediaUrl(u)) + '" alt="图片" loading="lazy" decoding="async" />' +
        '<button class="img-rm" type="button" data-action="img-remove" data-url="' + esc(u) + '" aria-label="移除">✕</button></div>';
    }).join('');
    var busy = uploadItems.map(function (it) {
      var failed = it.status === 'err';
      var label = failed ? '上传失败' : (it.status === 'wait' ? '压缩中…' : it.pct + '%');
      return '<div class="img-thumb ' + (failed ? 'failed' : 'uploading') + '" data-uid="' + it.id + '">' +
        '<div class="img-state">' + esc(label) + '</div>' +
        (failed
          ? '<button class="img-rm" type="button" data-action="img-retry" data-uid="' + it.id + '" aria-label="重试">↻</button>'
          : '<div class="upload-bar" style="position:absolute;left:0;right:0;bottom:0;margin:0"><i style="width:' + (it.status === 'wait' ? 5 : it.pct) + '%"></i></div>') +
        '</div>';
    }).join('');
    list.innerHTML = done + busy;
    var lbl = $('#imgAddLabel');
    if (lbl) lbl.style.display = (pendingModalImgs.length + uploadItems.length) >= 6 ? 'none' : '';
  }

  /* ---------- 图片压缩：走 WebP，长边 1600，尽量压到 900KB 以内 ---------- */
  function decodeImage(file) {
    return new Promise(function (resolve, reject) {
      var url = null;
      var fallback = function () {
        url = URL.createObjectURL(file);
        var img = new Image();
        img.onload = function () { resolve(img); };
        img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('decode')); };
        img.src = url;
      };
      if (window.createImageBitmap) {
        try {
          createImageBitmap(file, { imageOrientation: 'from-image' }).then(resolve, function () {
            createImageBitmap(file).then(resolve, fallback);
          });
          return;
        } catch (e) { /* 老 Safari 直接走 fallback */ }
      }
      fallback();
    });
  }

  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () {
        var s = String(r.result || '');
        resolve(s.slice(s.indexOf(',') + 1));
      };
      r.onerror = function () { reject(new Error('read')); };
      r.readAsDataURL(blob);
    });
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise(function (resolve) {
      if (canvas.toBlob) {
        canvas.toBlob(function (b) { resolve(b); }, type, quality);
      } else {
        try {
          var s = canvas.toDataURL(type, quality);
          resolve(dataUrlToBlob(s));
        } catch (e) { resolve(null); }
      }
    });
  }

  function dataUrlToBlob(dataUrl) {
    var parts = String(dataUrl).split(',');
    var mime = (parts[0].match(/:(.*?);/) || [])[1] || 'image/jpeg';
    var bin = atob(parts[1] || '');
    var u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return new Blob([u8], { type: mime });
  }

  function compressImage(file) {
    var src = null;
    var release = function () { if (src && src.close) { try { src.close(); } catch (e) {} } };
    return decodeImage(file).then(function (bitmap) {
      src = bitmap;
      var w = bitmap.width || bitmap.naturalWidth || 1;
      var h = bitmap.height || bitmap.naturalHeight || 1;
      var mime = canEncodeWebp() ? 'image/webp' : 'image/jpeg';
      var ext = mime === 'image/webp' ? 'webp' : 'jpg';
      var maxEdge = IMG_MAX_EDGE;
      var quality = 0.82;
      var view = { w: w, h: h };

      var attempt = function (round) {
        var scale = Math.min(1, maxEdge / Math.max(w, h));
        var cw = Math.max(1, Math.round(w * scale));
        var ch = Math.max(1, Math.round(h * scale));
        var c = document.createElement('canvas');
        c.width = cw; c.height = ch;
        var ctx = c.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        try { ctx.imageSmoothingQuality = 'high'; } catch (e) {}
        ctx.drawImage(bitmap, 0, 0, cw, ch);
        view = { w: cw, h: ch };
        return canvasToBlob(c, mime, quality).then(function (blob) {
          if (!blob) throw new Error('encode');
          if (blob.size > IMG_TARGET_BYTES && round < 3) {
            quality = Math.max(0.5, quality - 0.12);
            maxEdge = Math.max(960, Math.round(maxEdge * 0.82));
            return attempt(round + 1);
          }
          return blobToBase64(blob).then(function (b64) {
            return { data: b64, ext: ext, size: blob.size, w: view.w, h: view.h };
          });
        });
      };
      return attempt(0);
    }).then(function (out) { release(); return out; }, function (err) { release(); throw err; });
  }

  /* ---------- 上传：XHR 带进度（fetch 拿不到上传进度） ---------- */
  function uploadImage(payload, onProgress) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', WORKER + '/api/upload', true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.timeout = 120000;
      if (xhr.upload && onProgress) {
        xhr.upload.onprogress = function (e) {
          if (e.lengthComputable) onProgress(Math.max(1, Math.round(e.loaded / e.total * 100)));
        };
      }
      xhr.onload = function () {
        var j = {};
        try { j = JSON.parse(xhr.responseText || '{}'); } catch (e) {}
        resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, json: j });
      };
      xhr.onerror = function () { reject(new Error('网络中断，上传失败')); };
      xhr.ontimeout = function () { reject(new Error('上传超时，请重试')); };
      xhr.send(JSON.stringify(payload));
    });
  }

  function findUploadItem(uid) {
    for (var i = 0; i < uploadItems.length; i++) { if (uploadItems[i].id === uid) return uploadItems[i]; }
    return null;
  }

  function dropUploadItem(item) {
    uploadItems = uploadItems.filter(function (x) { return x !== item; });
  }

  function runUpload(item) {
    item.status = 'up';
    item.pct = 1;
    renderImgList();
    return uploadImage({ name: 'upload.' + item.ext, data: item.data, session: mySession, folder: imgFolder }, function (p) {
      item.pct = p;
      renderImgList();
    }).then(function (res) {
      if (res.ok && res.json.url) {
        dropUploadItem(item);
        pendingModalImgs.push(res.json.url);
        if (uploadItems.length === 0) toast('图片已上传 🖼️（已自动压缩）');
      } else {
        item.status = 'err';
        item.msg = (res.json && res.json.error) || ('HTTP ' + res.status);
        if (res.status === 401) toast('登录状态已失效，请重新登录后再上传', 'error');
        else toast('「' + item.name + '」上传失败：' + item.msg, 'error');
      }
      renderImgList();
    }).catch(function (e) {
      item.status = 'err';
      item.msg = e && e.message ? e.message : '上传失败';
      renderImgList();
      toast('「' + item.name + '」' + item.msg, 'error');
    });
  }

  function queueUploads(files) {
    if (!files || !files.length) return;
    var room = 6 - pendingModalImgs.length - uploadItems.length;
    if (room <= 0) { toast('最多 6 张图片', 'info'); return; }
    var accepted = [];
    files.forEach(function (file) {
      if (!file || (!/^image\//i.test(file.type) && !/\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(file.name || ''))) {
        toast('「' + (file && file.name || '文件') + '」不是图片，已跳过', 'error');
        return;
      }
      if (file.size > 24 * 1024 * 1024) {
        toast('「' + file.name + '」超过 24MB，已跳过', 'error');
        return;
      }
      accepted.push(file);
    });
    if (accepted.length > room) {
      toast('一次最多 6 张，多出的已忽略', 'info');
      accepted = accepted.slice(0, room);
    }
    if (!accepted.length) return;

    /* 串行压缩（省内存，iPad 上更稳），上传并行；每张都带自己的进度 */
    var chain = Promise.resolve();
    accepted.forEach(function (file) {
      chain = chain.then(function () {
        var item = { id: uid(), name: file.name || 'image', pct: 0, status: 'wait', data: '', ext: 'jpg', src: file };
        uploadItems.push(item);
        renderImgList();
        return compressImage(file).then(function (res) {
          item.data = res.data;
          item.ext = res.ext;
          return runUpload(item);
        }).catch(function (e) {
          item.status = 'err';
          item.msg = (e && e.message === 'decode') ? '图片格式不支持（可能是 HEIC），请先转成 JPG' : '压缩失败';
          renderImgList();
          toast('「' + item.name + '」' + item.msg, 'error');
        });
      });
    });
  }

  function wireImgPicker() {
    var input = $('#imgFileInput');
    if (!input) return;
    var picker = input.closest ? input.closest('.img-picker') : null;
    input.addEventListener('change', function () {
      var files = Array.prototype.slice.call(input.files || []);
      input.value = '';
      queueUploads(files);
    });
    if (picker) {
      ['dragenter', 'dragover'].forEach(function (ev) {
        picker.addEventListener(ev, function (e) { e.preventDefault(); picker.classList.add('dragging'); });
      });
      ['dragleave', 'drop'].forEach(function (ev) {
        picker.addEventListener(ev, function (e) { e.preventDefault(); picker.classList.remove('dragging'); });
      });
      picker.addEventListener('drop', function (e) {
        var dt = e.dataTransfer;
        if (dt && dt.files && dt.files.length) queueUploads(Array.prototype.slice.call(dt.files));
      });
      picker.addEventListener('paste', function (e) {
        var items = (e.clipboardData && e.clipboardData.files) || [];
        if (items.length) { e.preventDefault(); queueUploads(Array.prototype.slice.call(items)); }
      });
    }
    renderImgList();
  }

  /* 正在上传时不允许保存，避免上传完的图没进正文 */
  function uploadsBusy() {
    if (!uploadItems.length) return false;
    toast('还有图片在上传，稍等一下再保存～', 'info');
    return true;
  }

  function openTechModal(item) {
    imgFolder = 'tech';
    pendingModalImgs = item && Array.isArray(item.imgs) ? item.imgs.slice() : [];
    uploadItems = [];
    openModal({
      title: item ? '编辑体验' : '添加数码体验',
      submitText: item ? '保存修改' : '添加 ✨',
      fields: [
        { key: 'title', label: '名称', required: true, max: 40, placeholder: '如：iPhone 16 Pro 半年体验', value: item ? item.title : '' },
        { key: 'category', label: '分类', type: 'select', options: ['手机', '电脑', '耳机', '相机', '桌面', '智能家居', '其他'], value: item ? item.category : '手机' },
        { key: 'rating', label: '评分', type: 'select', options: ['5', '4.5', '4', '3.5', '3', '2.5', '2', '1.5', '1'], value: item ? String(item.rating) : '4.5' },
        { key: 'date', label: '月份', type: 'month', required: true, value: item ? item.date : dateStr(0).slice(0, 7) },
        { key: 'text', label: '简介', type: 'textarea', required: true, max: 160, rows: 3, placeholder: '一两句话概括体验…', value: item ? (item.text || '') : '' },
        { key: 'content', label: '正文（Markdown 长文）', type: 'markdown', max: 50000, rows: 14, placeholder: '# 为什么入手它\n\n**正文从这里开始**……', value: item ? (item.content || '') : '' },
        { key: '_imgs', label: '图片', type: 'imgs' }
      ],
      onSubmit: function (v) {
        if (uploadsBusy()) return false;
        var data = { title: v.title.trim(), category: v.category, rating: Number(v.rating), date: v.date, text: v.text.trim(), content: v.content || '', imgs: pendingModalImgs.slice(0, 6) };
        if (item) {
          adminMutate('tech.edit', Object.assign({ id: item.id }, data), '体验已更新 📷');
        } else {
          adminMutate('tech.add', Object.assign({ id: uid() }, data), '体验已添加 📷');
        }
        return true;
      }
    });
    wireImgPicker();
  }

  function openStudyModal(item) {
    imgFolder = 'study';
    pendingModalImgs = item && Array.isArray(item.imgs) ? item.imgs.slice() : [];
    uploadItems = [];
    var owner = isOwnerUser();
    var initIds = owner
      ? ((item && Array.isArray(item.authors) && item.authors.length)
          ? item.authors.map(function (a) { return a.id; })
          : (item && item.authorId ? [item.authorId] : [myUser ? myUser.id : '']))
      : [];
    var fields = [
      { key: 'title', label: '标题', required: true, max: 60, placeholder: '如：C 语言焚诀 · 燃烧你的 CPU', value: item ? item.title : '' },
      { key: 'category', label: '类目', type: 'select', options: ['教程', '焚诀', '笔记', '杂谈'], value: item ? item.category : '教程' },
      { key: 'date', label: '月份', type: 'month', required: true, value: item ? item.date : dateStr(0).slice(0, 7) },
      { key: 'text', label: '简介', type: 'textarea', required: true, max: 160, rows: 3, placeholder: '一两句话概括这篇指南…', value: item ? (item.text || '') : '' },
      { key: 'content', label: '正文（Markdown 长文）', type: 'markdown', max: 50000, rows: 14, placeholder: '# 第一章 · 心法总纲\n\n**正文从这里开始**……', value: item ? (item.content || '') : '' }
    ];
    if (owner) fields.push({ key: '_authors', label: '编写人（可以选好几个）', type: 'authors', hint: '从已有账号里挑；不选就署你自己。' });
    fields.push({ key: '_imgs', label: '图片', type: 'imgs' });
    openModal({
      title: item ? '编辑指南' : '添加指南',
      submitText: item ? '保存修改' : '添加 ✍️',
      fields: fields,
      onSubmit: function (v) {
        if (uploadsBusy()) return false;
        var authors = modalAuthorsPayload();
        var data = { title: v.title.trim(), category: v.category, date: v.date, text: v.text.trim(), content: v.content || '', imgs: pendingModalImgs.slice(0, 6) };
        if (authors) data.authors = authors;
        if (item) {
          adminMutate('study.edit', Object.assign({ id: item.id }, data), '指南已更新 📚');
        } else {
          adminMutate('study.add', Object.assign({ id: uid(), author: myUser ? myUser.nick : '', time: nowStamp() }, data), '指南已添加 📚');
        }
        return true;
      }
    });
    if (owner) modalAuthorsInit(initIds);
    wireImgPicker();
  }

  /* 旅行攻略编辑：朋友们都能写，能配图，署名由服务端盖章 */
  function openTripModal(item) {
    imgFolder = 'trip';
    pendingModalImgs = item && Array.isArray(item.imgs) ? item.imgs.slice() : [];
    uploadItems = [];
    var owner = isOwnerUser();
    var initIds = owner
      ? ((item && Array.isArray(item.authors) && item.authors.length)
          ? item.authors.map(function (a) { return a.id; })
          : (item && item.authorId ? [item.authorId] : [myUser ? myUser.id : '']))
      : [];
    var fields = [
      { key: 'title', label: '标题', required: true, max: 60, placeholder: '如：大理三天两晚，环海西路才是精华', value: item ? item.title : '' },
      { key: 'location', label: '目的地', required: true, max: 40, placeholder: '如：云南 · 大理', value: item ? item.location : '' },
      { key: 'category', label: '类型', type: 'select', options: ['城市漫游', '自然风光', '海岛', '美食', '自驾', '露营', '境外', '其他'], value: item ? item.category : '城市漫游' },
      { key: 'days', label: '建议天数（选填）', max: 20, placeholder: '如：3 天 2 晚 / 周末两天', value: item ? (item.days || '') : '' },
      { key: 'budget', label: '人均花费（选填）', max: 20, placeholder: '如：人均 1500（含住宿）', value: item ? (item.budget || '') : '' },
      { key: 'date', label: '去的月份', type: 'month', required: true, value: item ? item.date : dateStr(0).slice(0, 7) },
      { key: 'text', label: '一句话推荐', type: 'textarea', required: true, max: 160, rows: 3, placeholder: '值不值得去？适合谁去？', value: item ? (item.text || '') : '' },
      { key: 'content', label: '正文（Markdown 长文）', type: 'markdown', max: 50000, rows: 14, placeholder: '# 怎么去\n\n**交通 / 住宿 / 吃什么 / 踩过的坑**……', value: item ? (item.content || '') : '' }
    ];
    if (owner) fields.push({ key: '_authors', label: '编写人（可以选好几个）', type: 'authors', hint: '从已有账号里挑；不选就署你自己。' });
    fields.push({ key: '_imgs', label: '图片（最多 6 张）', type: 'imgs' });
    openModal({
      title: item ? '编辑旅行攻略' : '写一篇旅行攻略',
      submitText: item ? '保存修改' : '发布攻略 🧭',
      fields: fields,
      onSubmit: function (v) {
        if (uploadsBusy()) return false;
        var authors = modalAuthorsPayload();
        var data = {
          title: v.title.trim(), location: v.location.trim(), category: v.category,
          days: String(v.days || '').trim(), budget: String(v.budget || '').trim(),
          date: v.date, text: v.text.trim(), content: v.content || '',
          imgs: pendingModalImgs.slice(0, 6)
        };
        if (authors) data.authors = authors;
        if (item) {
          adminMutate('trip.edit', Object.assign({ id: item.id }, data), '攻略已更新 🧭');
        } else {
          adminMutate('trip.add', Object.assign({ id: uid(), author: myUser ? myUser.nick : '', time: nowStamp() }, data), '攻略已发布 🧭');
        }
        return true;
      }
    });
    if (owner) modalAuthorsInit(initIds);
    wireImgPicker();
  }

  function openFriendModal(item) {
    openModal({
      title: item ? '编辑友链' : '添加友链',
      submitText: item ? '保存修改' : '添加 🔗',
      fields: [
        { key: 'name', label: '站点名称', required: true, max: 30, placeholder: '如：TZ Blog', value: item ? item.name : '' },
        { key: 'url', label: '链接', type: 'url', required: true, max: 200, placeholder: 'https://example.com', value: item ? item.url : '' },
        { key: 'desc', label: '一句话介绍', max: 40, placeholder: '简约里藏着思考的技术博客', value: item ? (item.desc || '') : '' },
        { key: 'emoji', label: '头像表情', max: 4, placeholder: '✨', value: item ? (item.emoji || '') : '' }
      ],
      onSubmit: function (v) {
        var url = v.url.trim();
        if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
        var data = { name: v.name.trim(), url: url, desc: v.desc.trim(), emoji: v.emoji.trim() || '🌐' };
        if (item) {
          adminMutate('friend.edit', Object.assign({ id: item.id }, data), '友链已更新 🔗');
        } else {
          adminMutate('friend.add', Object.assign({ id: uid() }, data), '友链已添加 🔗');
        }
        return true;
      }
    });
  }

  /* 个人设备：只需要 emoji + 类别 + 产品名 */
  function openDeviceModal(item) {
    openModal({
      title: item ? '编辑设备' : '添加设备',
      submitText: item ? '保存修改' : '添加 🎧',
      fields: [
        { key: 'emoji', label: 'Emoji', max: 4, placeholder: '🎧', hint: '单个 emoji，选填', value: item ? (item.emoji || '') : '' },
        { key: 'category', label: '类别', max: 20, placeholder: '如：耳机 / 相机 / 键盘', value: item ? (item.category || '') : '' },
        { key: 'name', label: '产品名字', required: true, max: 60, placeholder: '如：Sony WH-1000XM5', value: item ? (item.name || '') : '' }
      ],
      onSubmit: function (v) {
        var data = {
          emoji: (v.emoji || '').trim() || '🎧',
          category: (v.category || '').trim() || '设备',
          name: (v.name || '').trim()
        };
        if (item) {
          adminMutate('device.edit', Object.assign({ id: item.id }, data), '设备已更新 🎧');
        } else {
          adminMutate('device.add', Object.assign({ id: uid() }, data), '设备已添加 🎧');
        }
        return true;
      }
    });
  }

  function dateStr(n) {
    var d = daysAgo(n);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /* ---------- 删除 ---------- */
  function confirmDel(kindRaw, id, label) {
    openConfirm({
      title: '删除这条' + label + '？',
      message: '删除后会同步到云端，所有访客都将看不到它。',
      onOk: function () {
        adminMutate(kindRaw + '.del', { id: id }, '已删除' + label);
      }
    });
  }

  /* ---------- 全局事件委托 ---------- */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('[data-action]') : null;
    if (!btn) return;
    var act = btn.getAttribute('data-action');
    var id = btn.getAttribute('data-id');
    var find = function (kind) {
      return S[kind].filter(function (x) { return x.id === id; })[0];
    };
    switch (act) {
      case 'close-modal': closeModal(); break;
      case 'submit-modal': submitModal(); break;
      case 'confirm-ok': {
        var cb = pendingConfirm;
        closeModal();
        if (cb) cb();
        break;
      }
      case 'submit-login': submitLogin(); break;
      case 'guest-login': openLoginModal(); break;
      case 'img-remove': {
        var imgUrl = btn.getAttribute('data-url');
        pendingModalImgs = pendingModalImgs.filter(function (u) { return u !== imgUrl; });
        renderImgList();
        break;
      }
      case 'img-retry': {
        var upItem = findUploadItem(btn.getAttribute('data-uid'));
        if (!upItem) break;
        if (upItem.data) { runUpload(upItem); break; }
        var srcFile = upItem.src;
        dropUploadItem(upItem);
        if (srcFile) queueUploads([srcFile]);
        renderImgList();
        break;
      }
      case 'open-img': openLightbox(btn.getAttribute('data-url')); break;
      case 'open-pw': openPwModal(); break;
      case 'open-mine': openMineModal(); break;
      case 'set-avatar': saveAvatar(btn.getAttribute('data-av') || ''); break;
      case 'open-panel': openPanelModal(); break;
      case 'logout-user': logoutUser(); break;
      case 'toggle-cmt': {
        var cmId = btn.getAttribute('data-id');
        openComments[cmId] = !openComments[cmId];
        renderMoments();
        break;
      }
      case 'del-cmt': {
        var cmId2 = btn.getAttribute('data-id');
        var cmCid = btn.getAttribute('data-cid');
        openComments[cmId2] = true;
        openConfirm({
          title: '删除这条跟帖？',
          message: '删掉后所有人都看不到这条跟帖了，此操作不可撤销。',
          onOk: function () { adminMutate('moment.delc', { id: cmId2, cid: cmCid }, '跟帖已删除'); }
        });
        break;
      }
      case 'login-back': openLoginModal(); break;
      case 'open-2fa': open2faModal(); break;
      case 'copy-2fa-secret': {
        var secEl = $('#tfSecret');
        copyText(secEl ? secEl.textContent : '', '密钥已复制 ✔');
        break;
      }
      case 'copy-2fa-codes': copyText(pendingRecoveryCodes, '恢复码已复制 ✔（请尽快妥善保存）'); break;
      case '2fa-enable': {
        var tf = ($('#tfCode') || {}).value || '';
        if (String(tf).replace(/\D/g, '').length !== 6) { toast('请输入 6 位动态码', 'error'); break; }
        apiPost('/api/users/2fa', { session: mySession, op: 'enable', code: tf.trim() }).then(function (res) {
          if (!res.ok) { toast(res.json.error || '开启失败，请重试', 'error'); return; }
          myUser.twoFactor = true;
          if (res.json.session) saveUserSession(res.json.session);   /* 换新令牌，别把自己踢下线 */
          render2faCodes(res.json.codes, false);
        });
        break;
      }
      case '2fa-disable': {
        ask2faCode('关闭两步验证', '确认关闭', function (code) {
          if (!code) { toast('请输入动态码或恢复码', 'error'); return; }
          apiPost('/api/users/2fa', { session: mySession, op: 'disable', code: code }).then(function (res) {
            if (!res.ok) { toast(res.json.error || '关闭失败', 'error'); return; }
            myUser.twoFactor = false;
            if (res.json.session) saveUserSession(res.json.session);
            toast('已关闭两步验证', 'info');
            closeModal();
            openMineModal();
          });
        });
        break;
      }
      case '2fa-codes': {
        ask2faCode('重新生成恢复码', '生成', function (code) {
          if (!code) { toast('请输入动态码或恢复码', 'error'); return; }
          apiPost('/api/users/2fa', { session: mySession, op: 'codes', code: code }).then(function (res) {
            if (!res.ok) { toast(res.json.error || '生成失败', 'error'); return; }
            render2faCodes(res.json.codes, true);
          });
        });
        break;
      }
      case 'panel-reset2fa': openConfirm({
        title: '重置该用户的两步验证？',
        message: '重置后该用户仅凭密码即可登录，之后可以自行重新开启。用于对方换手机 / 丢失验证器的情况。',
        onOk: function () {
          apiPost('/api/users/2fa', { session: mySession, op: 'reset', id: id }).then(function (res) {
            if (res.ok) { toast('已重置两步验证 ✔'); openPanelModal(); }
            else { toast(res.json.error || '操作失败', 'error'); }
          });
        }
      }); break;
      case 'panel-create': openCreateUserModal(); break;
      case 'perms-save': {
        var np = { admin: {}, member: {}, guest: {} };
        $$('#modalBody input[data-perm]').forEach(function (inp) {
          var parts = inp.getAttribute('data-perm').split('.');
          np[parts[0]][parts.slice(1).join('.')] = inp.checked;
        });
        apiPost('/api/users/setperms', { session: mySession, perms: np }).then(function (res) {
          if (res.ok) { S.perms = res.json.perms; toast('权限已保存 ✔'); openPanelModal(); renderAll(); }
          else { toast(res.json.error || '保存失败', 'error'); }
        });
        break;
      }
      case 'panel-resetpw': openResetPwModal(id); break;
      case 'panel-role': panelAction('setRole', id, btn.getAttribute('data-role')); break;
      case 'panel-del': openConfirm({
        title: '删除这个用户？',
        message: '删除后该用户无法再登录，此操作不可撤销。',
        onOk: function () { panelAction('delete', id); }
      }); break;
      case 'md-tab-edit': mdToggleTab(btn, 'edit'); break;
      case 'md-tab-prev': mdToggleTab(btn, 'prev'); break;
      case 'md-insert': mdInsert(btn); break;
      case 'ap-add': apAdd(btn.getAttribute('data-prefix'), btn.getAttribute('data-id')); break;
      case 'ap-remove': apRemove(btn.getAttribute('data-prefix'), btn.getAttribute('data-id')); break;
      case 'go-view': {
        e.preventDefault();
        goView(btn.getAttribute('data-view') || 'home');
        break;
      }
      case 'ts-retry': retryTurnstile(btn.getAttribute('data-ts-key') || 'login'); break;
      case 'read-item': openReader(btn.getAttribute('data-kind'), btn.getAttribute('data-id')); break;
      case 'qa-moment': {
        $('#qaMenu').classList.remove('open');
        if (canPostMoment()) {
          goView('friends');
          setTimeout(function () { var t = $('#postText'); if (t) t.focus(); }, 260);
        } else {
          openMomentModal(null);
        }
        break;
      }
      case 'qa-travel': $('#qaMenu').classList.remove('open'); goView('space'); openTravelModal(null); break;
      case 'qa-tech': $('#qaMenu').classList.remove('open'); goView('space'); openTechModal(null); break;
      case 'qa-device': $('#qaMenu').classList.remove('open'); goView('space'); openDeviceModal(null); break;
      case 'qa-study': $('#qaMenu').classList.remove('open'); goView('friends'); openStudyModal(null); break;
      case 'qa-trip': $('#qaMenu').classList.remove('open'); goView('friends'); openTripModal(null); break;
      case 'qa-friend': $('#qaMenu').classList.remove('open'); goView('friends'); openFriendModal(null); break;
      case 'add-moment': openMomentModal(null); break;
      case 'edit-moment': openMomentModal(find('moments')); break;
      case 'del-moment': confirmDel('moment', id, '说说'); break;
      case 'add-travel': openTravelModal(null); break;
      case 'edit-travel': openTravelModal(find('travels')); break;
      case 'del-travel': confirmDel('travel', id, '游记'); break;
      case 'add-tech': openTechModal(null); break;
      case 'edit-tech': openTechModal(find('tech')); break;
      case 'del-tech': confirmDel('tech', id, '体验'); break;
      case 'add-device': openDeviceModal(null); break;
      case 'edit-device': openDeviceModal(find('devices')); break;
      case 'del-device': confirmDel('device', id, '设备'); break;
      case 'add-study': openStudyModal(null); break;
      case 'edit-study': openStudyModal(find('studies')); break;
      case 'del-study': confirmDel('study', id, '指南'); break;
      case 'add-trip': openTripModal(null); break;
      case 'edit-trip': openTripModal(find('trips')); break;
      case 'del-trip': confirmDel('trip', id, '攻略'); break;
      case 'add-friend': openFriendModal(null); break;
      case 'edit-friend': openFriendModal(find('friends')); break;
      case 'del-friend': confirmDel('friend', id, '友链'); break;
      case 'del-msg': confirmDel('msg', id, '留言'); break;
    }
  });

  /* ---------- 留言表单 ---------- */
  /* 说说墙：发帖 + 跟帖（都走同一个 /api/admin 接口，作者与时间由服务端盖章） */
  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form) return;
    if (form.id === 'postForm') {
      e.preventDefault();
      var t = (($('#postText') || {}).value || '').trim();
      var em = (($('#postEmoji') || {}).value || '').trim();
      if (!t) { toast('写点什么再发布吧 ✍️', 'error'); return; }
      /* time / author 这里也带上：万一 Worker 还是旧版，帖子至少不会缺时间与署名；
         新版 Worker 会用服务端时间与昵称覆盖这两个字段 */
      var payload = {
        id: uid(), text: t, emoji: em,
        time: nowStamp(), author: myUser ? myUser.nick : ''
      };
      if (isOwnerUser() && pickerState.post && pickerState.post.length) payload.authors = pickerState.post.slice(0, 8);
      adminMutate('moment.add', payload, '已发布 ✨').then(function () { pickerState.post = []; });
      return;
    }
    if (form.classList && form.classList.contains('cmt-form')) {
      e.preventDefault();
      var id = form.getAttribute('data-id');
      var ta = form.querySelector('textarea');
      var v = ta ? String(ta.value || '').trim() : '';
      if (!v) { toast('跟帖内容不能为空', 'error'); return; }
      openComments[id] = true;
      adminMutate('moment.comment', { id: id, text: v }, '跟帖成功 💬').then(function (ok) {
        if (ok && ta) ta.value = '';
      });
    }
  });

  document.addEventListener('input', function (e) {
    var el = e.target;
    if (!el) return;
    if (el.id === 'postText') {
      var c = $('#postCount');
      if (c) c.textContent = String(String(el.value || '').length);
    }
    if (el.id === 'postAuthorSearch' || el.id === 'modalAuthorSearch') {
      apSearch(el.id === 'postAuthorSearch' ? 'post' : 'modal', el.value);
    }
    if (el.classList) el.classList.remove('invalid');
  });

  function markInvalid(el, msg) {
    el.classList.add('invalid');
    toast(msg, 'error');
    el.focus();
  }

  $('#msgForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var nameEl = $('#msgName'), emailEl = $('#msgEmail'), textEl = $('#msgText');
    [nameEl, emailEl, textEl].forEach(function (el) { el.classList.remove('invalid'); });
    var name = nameEl.value.trim(), email = emailEl.value.trim(), text = textEl.value.trim();
    if (!name) return markInvalid(nameEl, '请填写你的名字');
    if (!EMAIL_RE.test(email)) return markInvalid(emailEl, '邮箱格式不正确');
    if (!text) return markInvalid(textEl, '写点什么再发送吧');
    if (!tsOkToSubmit('msg')) { toast('请先完成下方的人机验证（点「重新验证」可以重试）', 'error'); return; }
    apiPost('/api/msg', { name: name, email: email, text: text, session: mySession, turnstile: tsTokens.msg }).then(function (res) {
      if (res.ok) {
        if (res.json.db) { S = normalize(res.json.db); writeCache(); renderAll(); }
        e.target.reset();
        resetTurnstile($('#msgTs'), 'msg');
        toast('留言成功 🎉 已同步到云端');
      } else {
        resetTurnstile($('#msgTs'), 'msg');
        toast(res.json.error || '发送失败，请稍后重试', 'error');
      }
    }).catch(function () {
      toast('网络异常，发送失败', 'error');
    });
  });

  /* 留言框的人机验证：表单真的可见时才挂载，避免白白加载第三方脚本 */
  (function initMsgTurnstile() {
    if (!TURNSTILE_SITEKEY) return;
    var form = $('#msgForm');
    if (!form) return;
    mountMsgTs = function () {
      if (form.hidden || form.offsetParent === null) return;
      var slot = form.querySelector('#msgTs');
      if (!slot) {
        var btn = form.querySelector('button[type="submit"]');
        slot = document.createElement('div');
        slot.className = 'ts-slot';
        slot.id = 'msgTs';
        if (btn) form.insertBefore(slot, btn); else form.appendChild(slot);
      }
      mountTurnstile(slot, 'msg');
    };
    mountMsgTs();
    document.addEventListener('click', mountMsgTs);
    window.addEventListener('orientationchange', function () { setTimeout(mountMsgTs, 300); });
  })();

  /* ---------- 顶部阅读进度条 ---------- */
  (function initProgress() {
    var bar = document.getElementById('progressBar');
    if (!bar) return;
    var ticking = false;
    function update() {
      ticking = false;
      var doc = document.documentElement;
      var max = doc.scrollHeight - window.innerHeight;
      var pct = max > 0 ? Math.min(100, (window.scrollY || doc.scrollTop) / max * 100) : 0;
      bar.style.width = pct.toFixed(2) + '%';
    }
    function onScroll() {
      if (!ticking) { ticking = true; window.requestAnimationFrame(update); }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update();
  })();

  /* ---------- 主题 ---------- */
  /* 字体：非阻塞加载完成后再启用（首屏先用系统字体，不再被 Google Fonts 拖住） */
  (function initFonts() {
    var link = document.getElementById('gfontLink');
    if (!link) return;
    var on = function () { if (link.media !== 'all') link.media = 'all'; };
    if (link.sheet) { on(); return; }
    link.addEventListener('load', on);
    link.addEventListener('error', function () { /* 拉不到就用系统字体，不阻塞 */ });
    setTimeout(on, 3000);
  })();

  /* iPad / Safari 切回前台时人机验证可能已超时：重置一次，避免「验证过了还是登不上」 */
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible') return;
    if (tsSlots.login && $('#loginTs') && !$('#modalBackdrop').hidden &&
        (tsState.login === 'failed' || tsState.login === 'slow')) {
      retryTurnstile('login');
    }
  });

  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
    $('#themeToggle').textContent = t === 'dark' ? '🌙' : '☀️';
  }

  (function initTheme() {
    var t = null;
    try { t = localStorage.getItem(THEME_KEY); } catch (e) {}
    if (!t) t = 'light'; /* Apple 设计默认浅色，可随时切换 */
    applyTheme(t);
  })();

  $('#themeToggle').addEventListener('click', function () {
    var cur = document.documentElement.getAttribute('data-theme');
    applyTheme(cur === 'dark' ? 'light' : 'dark');
  });

  /* ---------- 移动端菜单 & 滚动高亮 ---------- */
  var menuToggle = $('#menuToggle');
  menuToggle.addEventListener('click', function () {
    var open = $('#mainNav').classList.toggle('open');
    menuToggle.setAttribute('aria-expanded', String(open));
    menuToggle.textContent = open ? '✕' : '☰';
  });
  $('#mainNav').addEventListener('click', function (e) {
    if (e.target.classList.contains('nav-link')) {
      $('#mainNav').classList.remove('open');
      menuToggle.textContent = '☰';
      menuToggle.setAttribute('aria-expanded', 'false');
    }
  });

  var spyIO = ('IntersectionObserver' in window) ? new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      $$('.sub-link').forEach(function (a) {
        a.classList.toggle('on', a.getAttribute('href') === '#' + en.target.id);
      });
    });
  }, { rootMargin: '-40% 0px -52% 0px' }) : null;
  ['moments', 'study', 'trips', 'guest', 'games', 'account', 'travel', 'tech', 'devices'].forEach(function (sec) {
    var el = document.getElementById(sec);
    if (el && spyIO) spyIO.observe(el);
  });

  /* ---------- 弹窗交互 ---------- */
  $('#modalBackdrop').addEventListener('mousedown', function (e) {
    if (e.target === this) closeModal();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !$('#modalBackdrop').hidden) closeModal();
    if (e.key === 'Escape' && !$('#lightbox').hidden) closeLightbox();
    if (e.key === 'Escape' && !$('#reader').hidden) closeReader();
  });

  function openLightbox(url) {
    var lb = $('#lightbox');
    $('#lightboxImg').src = url;
    lb.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeLightbox() {
    $('#lightbox').hidden = true;
    $('#lightboxImg').src = '';
    document.body.style.overflow = '';
  }
  $('#lightbox').addEventListener('click', function () { closeLightbox(); });
  $('.lightbox-close').addEventListener('click', function () { closeLightbox(); });
  $('#reader').addEventListener('mousedown', function (e) { if (e.target === this) closeReader(); });
  $('#reader .lightbox-close').addEventListener('click', function () { closeReader(); });
  $('#modalBody').addEventListener('input', function (e) {
    if (e.target.classList) e.target.classList.remove('invalid');
  });

  /* ---------- 用户入口 ---------- */
  $('#userBtn').addEventListener('click', function () {
    if (myUser) openMineModal();
    else openLoginModal();
  });

  /* ---------- 页脚年份 & FAB 快捷新建 ---------- */
  $('#year').textContent = new Date().getFullYear();
  $('#fab').addEventListener('click', function (e) {
    e.stopPropagation();
    var m = $('#qaMenu');
    if (m) m.classList.toggle('open');
  });
  document.addEventListener('click', function (e) {
    var m = $('#qaMenu');
    if (m && m.classList.contains('open') && !e.target.closest('#qaMenu') && !e.target.closest('#fab')) {
      m.classList.remove('open');
    }
  });

  /* 调试小工具（不参与业务逻辑）：控制台里可以 __mhz.mdToHtml('$x^2$') 直接看渲染结果 */
  try {
    window.__mhz = {
      mdToHtml: mdToHtml,
      hydrateMath: hydrateMath,
      mediaUrl: mediaUrl,
      view: function () { return currentView; },
      data: function () { return S; }
    };
  } catch (e) {}

  /* ---------- 启动 ---------- */
  boot();
})();
