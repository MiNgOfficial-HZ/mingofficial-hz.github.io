/* ============================================================
   MiNgHZ 的小站 · app.js
   云端同步版：读取 GitHub minghz-db/db.json；
   所有写入经 Cloudflare Worker 代理（/api/msg, /api/admin），
   页面不携带 GitHub Token / 管理密码等任何密钥
   ============================================================ */
(function () {
  'use strict';

  /* ---------- 云端配置 ---------- */
  var WORKER = 'https://minghz-api.mingsite.workers.dev';
  var RAW_URL = 'https://raw.githubusercontent.com/MiNgOfficial-HZ/minghz-db/main/db.json';
  var CACHE_KEY = 'minghz.site.cache.v2';
  var THEME_KEY = 'minghz.theme';

  /* ---------- 登录状态（账号密码会话，12 小时有效） ---------- */
  var isAdmin = false;

  function syncAdminUI() {
    document.body.classList.toggle('admin-mode', isAdmin);
    var fab = $('#fab'); if (fab) fab.style.display = isAdmin ? '' : 'none';
    var btn = $('#adminBtn'); if (btn) btn.textContent = isAdmin ? '🔓 退出管理' : '🔐 管理';
    var ub = $('#userBtn');
    if (ub) {
      ub.textContent = myUser ? '😊' : '👤';
      ub.setAttribute('aria-label', myUser ? '我的账户（' + (myUser.nick || '') + '）' : '登录 / 注册');
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

  function saveUserSession(s) {
    mySession = s || '';
    try { if (s) localStorage.setItem(USER_LS, s); else localStorage.removeItem(USER_LS); } catch (e) {}
  }
  function hasEditRight() { return !!myUser && (myUser.role === 'owner' || myUser.role === 'admin' || myUser.role === 'edit'); }
  function hasPanelRight() { return !!myUser && (myUser.role === 'owner' || myUser.role === 'admin'); }
  function refreshAdminState() {
    isAdmin = hasEditRight();
    syncAdminUI();
  }

  function logoutUser() {
    saveUserSession('');
    myUser = null;
    refreshAdminState();
    renderAll();
    toast('已退出登录', 'info');
  }

  function openLoginModal() {
    $('#modalTitle').textContent = '🔐 登录';
    $('#modalBody').innerHTML =
      '<div class="field"><label>账号</label><input id="loginUser" type="text" maxlength="40" autocomplete="username" placeholder="你的账号（由站长发放）" /></div>' +
      '<div class="field"><label>密码</label><input id="loginPw" type="password" maxlength="64" autocomplete="current-password" placeholder="登录密码" /></div>' +
      '<p class="field-hint">账号由站长发放；登录后按权限显示「可编辑」或「仅查看」界面。</p>';
    $('#modalFoot').innerHTML =
      '<button class="btn btn-ghost" type="button" data-action="close-modal">关闭</button>' +
      '<button class="btn btn-primary" type="button" data-action="submit-login">登录</button>';
    $('#modalBackdrop').hidden = false;
    document.body.style.overflow = 'hidden';
    var u = $('#loginUser'); if (u) u.focus();
  }

  function submitLogin() {
    var username = ((($('#loginUser') || {}).value) || '').trim();
    var pw = ((($('#loginPw') || {}).value) || '');
    if (!username || !pw) { toast('请输入账号和密码', 'error'); return; }
    apiPost('/api/auth/login', { username: username, password: pw }).then(function (res) {
      if (res.ok) completeLogin(res.json);
      else toast(res.json.error || '登录失败', 'error');
    });
  }

  function completeLogin(res) {
    saveUserSession(res.session);
    myUser = res.user;
    refreshAdminState();
    closeModal();
    renderAll();
    toast('欢迎回来，' + (res.user.nick || '朋友') + ' 👋');
  }

  function openMineModal() {
    if (!myUser) { openLoginModal(); return; }
    var roleCls = myUser.role === 'owner' ? 'owner' : (myUser.role === 'admin' ? 'admin' : (myUser.role === 'edit' ? 'edit' : ''));
    var roleLabel = myUser.role === 'owner' ? '站长' : (myUser.role === 'admin' ? '管理员' : (myUser.role === 'edit' ? '可编辑' : '仅查看'));
    $('#modalTitle').textContent = '👤 我的账户';
    $('#modalBody').innerHTML =
      '<div class="mine-card">' +
        '<div class="pu-avatar" style="width:46px;height:46px;font-size:1.1rem">' + esc((myUser.nick || '友')[0]) + '</div>' +
        '<div><div class="pu-name">' + esc(myUser.nick) + '</div>' +
        '<div class="pu-sub">账号：' + esc(myUser.un || '') + '</div>' +
        '<div class="pu-role ' + roleCls + '">' + roleLabel + '</div></div>' +
      '</div>' +
      '<div class="mine-actions">' +
        '<button class="btn btn-soft btn-block" type="button" data-action="open-pw">' + (myUser.hasPw ? '修改密码' : '设置密码') + '</button>' +
        (hasPanelRight() ? '<button class="btn btn-soft btn-block" type="button" data-action="open-panel">🛡️ 管理面板（用户）</button>' : '') +
        '<button class="btn btn-ghost btn-block" type="button" data-action="logout-user">退出登录</button>' +
      '</div>';
    $('#modalFoot').innerHTML = '<button class="btn btn-ghost" type="button" data-action="close-modal">关闭</button>';
    $('#modalBackdrop').hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function openPwModal() {
    var fields = [];
    if (myUser && myUser.hasPw) {
      fields.push({ key: 'current', label: '原密码', type: 'password', required: true, max: 64, placeholder: '当前登录密码' });
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
        apiPost('/api/auth/password', { session: mySession, current: v.current || '', password: v.password }).then(function (res) {
          if (res.ok) { myUser.hasPw = true; toast('密码已保存 🔑'); closeModal(); }
          else { toast(res.json.error || '保存失败，请重试', 'error'); }
        });
        return false;
      }
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
      var rows = (res.json.users || []).map(function (u) {
        var rc = u.role === 'owner' ? 'owner' : (u.role === 'admin' ? 'admin' : (u.role === 'edit' ? 'edit' : ''));
        var rl = u.role === 'owner' ? '站长' : (u.role === 'admin' ? '管理员' : (u.role === 'edit' ? '可编辑' : '仅查看'));
        var acts = '';
        if (myUser && myUser.role === 'owner' && u.role !== 'owner') {
          acts = '<button class="act-btn" type="button" data-action="panel-role" data-id="' + u.id + '" data-role="' + (u.role === 'admin' ? 'view' : 'admin') + '">' + (u.role === 'admin' ? '取消管理' : '设为管理') + '</button>';
          if (u.role !== 'admin') {
            acts += '<button class="act-btn" type="button" data-action="panel-role" data-id="' + u.id + '" data-role="' + (u.role === 'edit' ? 'view' : 'edit') + '">' + (u.role === 'edit' ? '改仅查看' : '改可编辑') + '</button>';
          }
          acts += '<button class="act-btn" type="button" data-action="panel-resetpw" data-id="' + u.id + '">重置密码</button>' +
                  '<button class="act-btn danger" type="button" data-action="panel-del" data-id="' + u.id + '">删</button>';
        }
        return '<div class="panel-user">' +
          '<div class="pu-avatar">' + esc((u.nick || '友')[0]) + '</div>' +
          '<div class="pu-meta">' +
            '<div class="pu-name">' + esc(u.nick) + ' <span class="pu-role ' + rc + '">' + rl + '</span></div>' +
            '<div class="pu-sub">账号：' + esc(u.un || '') + (u.hasPw ? ' · 已设密码' : ' · 未设密码') + '</div>' +
            '<div class="pu-sub">创建 ' + esc(u.c || '-') + (u.l ? ' · 最近登录 ' + esc(u.l) : '') + '</div>' +
          '</div>' + acts + '</div>';
      }).join('');
      $('#modalBody').innerHTML = (rows || '<p class="confirm-text">还没有任何账号</p>') +
        '<p class="panel-tip">提示：在此创建账号并设置权限（可编辑 / 仅查看）；「设为管理」可授权新管理员。账号密码请私下发给访客。</p>';
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
        { key: 'role', label: '访问权限', type: 'select', options: ['edit', 'view'], value: 'view', hint: '可编辑：可增删改内容；仅查看：只读' }
      ],
      onSubmit: function (v) {
        if (String(v.password).length < 6) { toast('密码至少 6 位', 'error'); return false; }
        if (v.password !== v.password2) { toast('两次输入的密码不一致', 'error'); return false; }
        apiPost('/api/users/create', { session: mySession, username: v.username.trim(), nick: v.nick.trim(), password: v.password, role: v.role }).then(function (res) {
          if (res.ok) { toast('账号已创建 ✔ 请把「账号+密码」私下发给对方'); closeModal(); openPanelModal(); }
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
      if (res.ok) { toast('已更新 ✔'); openPanelModal(); }
      else { toast(res.json.error || '操作失败', 'error'); }
    });
  }

  function restoreUser() {
    if (!mySession) { refreshAdminState(); return; }
    apiPost('/api/auth/me', { session: mySession }).then(function (res) {
      if (res.ok) { myUser = res.json.user; }
      else { saveUserSession(''); myUser = null; }
      refreshAdminState();
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
  var S = { moments: [], travels: [], tech: [], studies: [], friends: [], messages: [] };
  var cloudOk = false;
  var pendingOp = null;

  function seed() {
    return {
      moments: [
        { id: uid(), emoji: '🌅', text: '傍晚在江边走了很久，风把一整天的疲惫都吹跑了。', time: nowStamp() }
      ],
      travels: [],
      tech: [],
      studies: [],
      friends: [],
      messages: []
    };
  }

  function normalize(data) {
    var out = { moments: [], travels: [], tech: [], studies: [], friends: [], messages: [] };
    Object.keys(out).forEach(function (k) {
      if (data && Array.isArray(data[k])) out[k] = data[k];
    });
    return out;
  }

  function readCache() {
    try { var raw = localStorage.getItem(CACHE_KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  function writeCache() {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(S)); } catch (e) {}
  }

  function setSync(state, text) {
    var chip = $('#syncChip');
    if (!chip) return;
    chip.className = 'sync-chip ' + state;
    chip.textContent = text;
  }

  function cloudFetch() {
    return fetch(RAW_URL + '?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
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
    restoreUser();
    syncAdminUI();
    setSync('syncing', '🔄 同步中…');
    cloudFetch().then(function (data) {
      S = normalize(data);
      cloudOk = true;
      writeCache();
      setSync('cloud', '☁️ 已同步');
      renderAll();
    }).catch(function () {
      var cached = readCache();
      if (cached) {
        S = normalize(cached);
        setSync('offline', '⚠️ 离线（本地缓存）');
        toast('云端暂不可达，当前展示本地缓存数据', 'info');
        renderAll();
      } else {
        S = seed();
        renderAll();
        setSync('offline', '⚠️ 离线（本地）');
        toast('云端暂不可达，已进入离线模式', 'info');
      }
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
      ['📚', S.studies.length, '篇指南'],
      ['🔗', S.friends.length, '位友人']
    ];
    $('#heroStats').innerHTML = chips.map(function (c) {
      return '<span class="stat-chip">' + c[0] + ' <span class="stat-num">' + c[1] + '</span> ' + c[2] + '</span>';
    }).join('');
  }

  function actionsHTML(kind, id) {
    if (!isAdmin) return '';
    return '<div class="item-actions">' +
      '<button class="act-btn" type="button" data-action="edit-' + kind + '" data-id="' + id + '" aria-label="编辑">✎</button>' +
      '<button class="act-btn danger" type="button" data-action="del-' + kind + '" data-id="' + id + '" aria-label="删除">✕</button>' +
      '</div>';
  }

  function renderMoments() {
    var list = $('#momentList');
    if (!S.moments.length) { list.innerHTML = emptyHTML('还没有说说，点右下角 <b>＋</b> 写下第一条 ✨'); return; }
    list.innerHTML = sortDesc(S.moments, 'time').map(function (m, i) {
      return '<article class="moment reveal" style="--rd:' + Math.min(i * 70, 350) + 'ms" data-id="' + m.id + '">' +
        '<div class="moment-dot">' + esc(m.emoji || '💬') + '</div>' +
        '<div class="moment-card card">' +
          '<div class="moment-head"><time class="moment-time">' + esc(m.time) + '</time>' + actionsHTML('moment', m.id) + '</div>' +
          '<p class="moment-text">' + esc(m.text) + '</p>' +
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
          (isAdmin ? '<div class="t-actions">' +
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
    var cover = '<button class="tg-cover" type="button" data-action="open-img" data-url="' + esc(imgs[0]) + '"><img src="' + esc(imgs[0]) + '" alt="' + esc(title) + '" loading="lazy" /></button>';
    var thumbs = imgs.slice(1, 6).map(function (u) {
      return '<button class="tg-thumb" type="button" data-action="open-img" data-url="' + esc(u) + '"><img src="' + esc(u) + '" alt="' + esc(title) + '" loading="lazy" /></button>';
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
          '<div class="tech-head"><span class="badge">' + esc(t.category || '其他') + '</span><time>' + esc(t.date) + '</time>' + actionsHTML('tech', t.id) + '</div>' +
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

  function renderStudies() {
    var list = $('#studyList');
    if (!list) return;
    if (!S.studies.length) { list.innerHTML = emptyHTML('还没有任何指南，点右上角 <b>＋</b> 添加第一篇教程/焚诀 ✍️'); return; }
    list.innerHTML = sortDesc(S.studies, 'date').map(function (t, i) {
      var pct2 = '';
      return '<article class="tech-item reveal" style="--rd:' + Math.min(i * 70, 350) + 'ms" data-id="' + t.id + '">' +
        '<div class="tech-dot">📚</div>' +
        '<div class="tech-card card">' +
          '<div class="tech-head"><span class="badge">' + esc(t.category || '指南') + '</span><time>' + esc(t.date) + '</time>' + actionsHTML('study', t.id) + '</div>' +
          '<h3 class="tech-name">' + esc(t.title) + '</h3>' +
          galleryHTML(t.imgs, t.title) +
          '<p class="tech-text">' + esc(t.text) + '</p>' +
          (t.content ? '<button class="read-more" type="button" data-action="read-item" data-kind="study" data-id="' + t.id + '">阅读全文 →</button>' : '') +
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
        (isAdmin ? '<div class="item-actions">' +
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
      return '<article class="msg-item card reveal" data-id="' + m.id + '">' +
        '<div class="m-avatar">' + esc(initial) + '</div>' +
        '<div class="m-body">' +
          '<div class="m-head"><span class="m-name">' + esc(m.name) + '</span><time>' + esc(m.time) + '</time>' +
          (isAdmin ? '<button class="act-btn danger" type="button" data-action="del-msg" data-id="' + m.id + '" aria-label="删除">✕</button>' : '') + '</div>' +
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
    renderStudies();
    renderFriends();
    renderMessages();
    bindReveal();
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

  /* ---------- 轻量 Markdown 渲染（先转义后转换，安全无忧） ---------- */
  var MD_FENCE = String.fromCharCode(96, 96, 96);
  function mdInline(s) {
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img src="$2" alt="$1" loading="lazy" />');
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    return s;
  }
  function mdBlock(block) {
    var lines = block.split('\n');
    var out = [];
    var list = null;
    var para = [];
    function flushPara() { if (para.length) { out.push('<p>' + mdInline(para.join(' ')) + '</p>'); para = []; } }
    function flushList() { if (list) { out.push('<ul>' + list.map(function (li) { return '<li>' + mdInline(li) + '</li>'; }).join('') + '</ul>'); list = null; } }
    for (var i = 0; i < lines.length; i++) {
      var t = lines[i].trim();
      if (!t) { flushPara(); flushList(); continue; }
      if (/^#{1,4}\s/.test(t)) { flushPara(); flushList(); var hv = Math.min(4, t.match(/^#+/)[0].length); out.push('<h' + hv + '>' + mdInline(t.replace(/^#+\s+/, '')) + '</h' + hv + '>'); continue; }
      if (/^(-{3,}|\*{3,})$/.test(t)) { flushPara(); flushList(); out.push('<hr/>'); continue; }
      if (/^>\s?/.test(t)) { flushPara(); flushList(); out.push('<blockquote>' + mdInline(t.replace(/^>\s?/, '')) + '</blockquote>'); continue; }
      if (/^[-*+]\s/.test(t)) { flushPara(); if (!list) list = []; list.push(t.replace(/^[-*+]\s/, '')); continue; }
      if (/^\d+[.)]\s/.test(t)) { flushPara(); if (!list) list = []; list.push(t.replace(/^\d+[.)]\s/, '')); continue; }
      flushList(); para.push(t);
    }
    flushPara(); flushList();
    return out.join('');
  }
  function mdToHtml(src) {
    var h = String(src || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    var segs = h.split(MD_FENCE);
    var out = [];
    for (var i = 0; i < segs.length; i++) {
      if (i % 2 === 1) { out.push('<pre><code>' + segs[i].replace(/^[^\n]*\n/, '') + '</code></pre>'); }
      else { out.push(mdBlock(segs[i])); }
    }
    return out.join('');
  }
  /* ---------- 弹窗系统 ---------- */
  var currentFields = [];
  var currentSubmit = null;
  var pendingConfirm = null;

  function fieldHTML(f) {
    var v = f.value != null ? f.value : '';
    var label = '<label for="f_' + f.key + '">' + esc(f.label) + (f.required ? ' <i style="color:var(--danger);font-style:normal">*</i>' : '') + '</label>';
    var inner;
    if (f.type === 'markdown') {
      inner = '<div class="md-box">' +
        '<div class="md-tabs"><button type="button" class="m-tab on" data-action="md-tab-edit">✏️ 编辑</button><button type="button" class="m-tab" data-action="md-tab-prev">👁️ 预览</button></div>' +
        '<textarea class="md-input" id="f_' + f.key + '" name="' + f.key + '" rows="14" maxlength="50000" placeholder="' + esc(f.placeholder || '') + '">' + esc(v) + '</textarea>' +
        '<div class="md-preview md-body" hidden></div>' +
        '</div>' +
        '<p class="field-hint">支持 Markdown：# 标题 · **加粗** · *斜体* · 代码 · - 列表 · &gt; 引用 · [链接](url) · ![](图片) · 三个反引号包裹代码块</p>';
    } else if (f.type === 'imgs') {
      inner = '<div class="img-picker">' +
        '<div class="img-list" id="imgList"></div>' +
        '<label class="img-add" for="imgFileInput" id="imgAddLabel">＋ 添加图片</label>' +
        '<input id="imgFileInput" type="file" accept="image/png,image/jpeg,image/webp" multiple hidden />' +
        '</div>' +
        '<p class="field-hint">单张 ≤ 2MB，支持 JPG / PNG / WebP，自动压缩；最多 6 张</p>';
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
    if (mode === 'prev') { px.innerHTML = mdToHtml(tx.value); px.hidden = false; tx.hidden = true; }
    else { px.hidden = true; tx.hidden = false; }
  }

  var READER_KINDS = { travel: 'travels', tech: 'tech', study: 'studies' };
  function openReader(kind, id) {
    var arr = S[READER_KINDS[kind]] || [];
    var item = null;
    for (var i = 0; i < arr.length; i++) { if (arr[i].id === id) { item = arr[i]; break; } }
    if (!item) return;
    var meta = '';
    if (kind === 'travel') meta = esc(item.location || '') + (item.date ? ' · ' + esc(item.date) : '');
    else meta = esc(item.category || '') + (item.date ? ' · ' + esc(item.date) : '');
    $('#readerMeta').textContent = meta;
    $('#readerTitle').textContent = item.title || '';
    $('#readerBody').innerHTML = mdToHtml(item.content || item.text || item.summary || '暂无内容');
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
    openModal({
      title: item ? '编辑说说' : '写一条说说',
      submitText: item ? '保存修改' : '发布 ✨',
      fields: [
        { key: 'text', label: '说点什么', type: 'textarea', required: true, max: 200, rows: 4, placeholder: '此刻的心情、灵感、碎碎念…' },
        { key: 'emoji', label: '配一个表情', max: 4, placeholder: '🍀', hint: '单个 emoji，选填' }
      ],
      onSubmit: function (v) {
        if (item) {
          adminMutate('moment.edit', { id: item.id, text: v.text.trim(), emoji: v.emoji.trim() }, '说说已更新 ✨');
        } else {
          adminMutate('moment.add', { id: uid(), text: v.text.trim(), emoji: v.emoji.trim(), time: nowStamp() }, '发布成功 ✨');
        }
        return true;
      }
    });
  }

  function openTravelModal(item) {
    openModal({
      title: item ? '编辑游记' : '添加游记',
      submitText: item ? '保存修改' : '添加 ✨',
      fields: [
        { key: 'title', label: '标题', required: true, max: 40, placeholder: '如：杭州 · 西湖散记' },
        { key: 'date', label: '日期', type: 'date', required: true, value: item ? item.date : dateStr(0) },
        { key: 'location', label: '地点', max: 30, placeholder: '如：浙江 · 杭州' },
        { key: 'emoji', label: '封面表情', max: 4, placeholder: '🌊' },
        { key: 'summary', label: '摘要', type: 'textarea', required: true, max: 160, rows: 3, placeholder: '用两三句话记录这趟旅程…' },
        { key: 'content', label: '正文（Markdown 长文）', type: 'markdown', max: 50000, rows: 14, placeholder: '# 早上六点的湖边\n\n**正文从这里开始**……' },
        { key: 'tags', label: '标签', max: 60, placeholder: '江南, 慢游', hint: '用逗号分隔' }
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

  function renderImgList() {
    var list = $('#imgList');
    if (!list) return;
    list.innerHTML = pendingModalImgs.map(function (u) {
      return '<div class="img-thumb"><img src="' + esc(u) + '" alt="图片" loading="lazy" /><button class="img-rm" type="button" data-action="img-remove" data-url="' + esc(u) + '" aria-label="移除">✕</button></div>';
    }).join('');
    var lbl = $('#imgAddLabel');
    if (lbl) lbl.style.display = pendingModalImgs.length >= 6 ? 'none' : '';
  }

  function compressImage(file, cb) {
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var maxW = 1280;
        var scale = Math.min(1, maxW / (img.width || 1280));
        var c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * scale));
        c.height = Math.max(1, Math.round(img.height * scale));
        var ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, c.width, c.height);
        var isPng = file.type === 'image/png';
        var dataUrl = isPng ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.82);
        if (isPng && dataUrl.length > 2600000) dataUrl = c.toDataURL('image/jpeg', 0.8);
        cb(dataUrl.split(',')[1], isPng ? 'png' : 'jpg');
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function wireImgPicker() {
    var input = $('#imgFileInput');
    if (!input) return;
    input.addEventListener('change', function () {
      var files = Array.prototype.slice.call(input.files || []);
      input.value = '';
      if (!files.length) return;
      var remaining = 6 - pendingModalImgs.length;
      files = files.slice(0, Math.max(0, remaining));
      if (!files.length) { toast('最多 6 张图片', 'info'); return; }
      var done = 0;
      files.forEach(function (file) {
        if (file.size > 8 * 1024 * 1024) { toast('「' + file.name + '」超过 8MB，已跳过', 'error'); done++; if (done === files.length) renderImgList(); return; }
        compressImage(file, function (b64, ext) {
          apiPost('/api/upload', { name: 'upload.' + ext, data: b64, session: mySession, folder: imgFolder }).then(function (res) {
            if (res.ok && res.json.url) {
              pendingModalImgs.push(res.json.url);
              toast('图片已上传 🖼️');
            } else {
              toast(res.json.error || '上传失败', 'error');
            }
          }).finally(function () {
            done++;
            if (done === files.length) renderImgList();
          });
        });
      });
    });
    renderImgList();
  }

  function openTechModal(item) {
    imgFolder = 'tech';
    pendingModalImgs = item && Array.isArray(item.imgs) ? item.imgs.slice() : [];
    openModal({
      title: item ? '编辑体验' : '添加数码体验',
      submitText: item ? '保存修改' : '添加 ✨',
      fields: [
        { key: 'title', label: '名称', required: true, max: 40, placeholder: '如：iPhone 16 Pro 半年体验' },
        { key: 'category', label: '分类', type: 'select', options: ['手机', '电脑', '耳机', '相机', '桌面', '智能家居', '其他'], value: item ? item.category : '手机' },
        { key: 'rating', label: '评分', type: 'select', options: ['5', '4.5', '4', '3.5', '3', '2.5', '2', '1.5', '1'], value: item ? String(item.rating) : '4.5' },
        { key: 'date', label: '月份', type: 'month', required: true, value: item ? item.date : dateStr(0).slice(0, 7) },
        { key: 'text', label: '简介', type: 'textarea', required: true, max: 160, rows: 3, placeholder: '一两句话概括体验…' },
        { key: 'content', label: '正文（Markdown 长文）', type: 'markdown', max: 50000, rows: 14, placeholder: '# 为什么入手它\n\n**正文从这里开始**……' },
        { key: '_imgs', label: '图片', type: 'imgs' }
      ],
      onSubmit: function (v) {
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
    openModal({
      title: item ? '编辑指南' : '添加指南',
      submitText: item ? '保存修改' : '添加 ✍️',
      fields: [
        { key: 'title', label: '标题', required: true, max: 60, placeholder: '如：C 语言焚诀 · 燃烧你的 CPU' },
        { key: 'category', label: '类目', type: 'select', options: ['教程', '焚诀', '笔记', '杂谈'], value: item ? item.category : '教程' },
        { key: 'date', label: '月份', type: 'month', required: true, value: item ? item.date : dateStr(0).slice(0, 7) },
        { key: 'text', label: '简介', type: 'textarea', required: true, max: 160, rows: 3, placeholder: '一两句话概括这篇指南…' },
        { key: 'content', label: '正文（Markdown 长文）', type: 'markdown', max: 50000, rows: 14, placeholder: '# 第一章 · 心法总纲\n\n**正文从这里开始**……' },
        { key: '_imgs', label: '图片', type: 'imgs' }
      ],
      onSubmit: function (v) {
        var data = { title: v.title.trim(), category: v.category, date: v.date, text: v.text.trim(), content: v.content || '', imgs: pendingModalImgs.slice(0, 6) };
        if (item) {
          adminMutate('study.edit', Object.assign({ id: item.id }, data), '指南已更新 📚');
        } else {
          adminMutate('study.add', Object.assign({ id: uid() }, data), '指南已添加 📚');
        }
        return true;
      }
    });
    wireImgPicker();
  }

  function openFriendModal(item) {
    openModal({
      title: item ? '编辑友链' : '添加友链',
      submitText: item ? '保存修改' : '添加 🔗',
      fields: [
        { key: 'name', label: '站点名称', required: true, max: 30, placeholder: '如：TZ Blog' },
        { key: 'url', label: '链接', type: 'url', required: true, max: 200, placeholder: 'https://example.com' },
        { key: 'desc', label: '一句话介绍', max: 40, placeholder: '简约里藏着思考的技术博客' },
        { key: 'emoji', label: '头像表情', max: 4, placeholder: '✨' }
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
      case 'open-img': openLightbox(btn.getAttribute('data-url')); break;
      case 'open-pw': openPwModal(); break;
      case 'open-panel': openPanelModal(); break;
      case 'logout-user': logoutUser(); break;
      case 'panel-create': openCreateUserModal(); break;
      case 'panel-resetpw': openResetPwModal(id); break;
      case 'panel-role': panelAction('setRole', id, btn.getAttribute('data-role')); break;
      case 'panel-del': openConfirm({
        title: '删除这个用户？',
        message: '删除后该用户无法再登录，此操作不可撤销。',
        onOk: function () { panelAction('delete', id); }
      }); break;
      case 'md-tab-edit': mdToggleTab(btn, 'edit'); break;
      case 'md-tab-prev': mdToggleTab(btn, 'prev'); break;
      case 'read-item': openReader(btn.getAttribute('data-kind'), btn.getAttribute('data-id')); break;
      case 'qa-moment': $('#qaMenu').classList.remove('open'); openMomentModal(null); break;
      case 'qa-travel': $('#qaMenu').classList.remove('open'); openTravelModal(null); break;
      case 'qa-tech': $('#qaMenu').classList.remove('open'); openTechModal(null); break;
      case 'qa-study': $('#qaMenu').classList.remove('open'); openStudyModal(null); break;
      case 'qa-friend': $('#qaMenu').classList.remove('open'); openFriendModal(null); break;
      case 'add-moment': openMomentModal(null); break;
      case 'edit-moment': openMomentModal(find('moments')); break;
      case 'del-moment': confirmDel('moment', id, '说说'); break;
      case 'add-travel': openTravelModal(null); break;
      case 'edit-travel': openTravelModal(find('travels')); break;
      case 'del-travel': confirmDel('travel', id, '游记'); break;
      case 'add-tech': openTechModal(null); break;
      case 'edit-tech': openTechModal(find('tech')); break;
      case 'del-tech': confirmDel('tech', id, '体验'); break;
      case 'add-study': openStudyModal(null); break;
      case 'edit-study': openStudyModal(find('studies')); break;
      case 'del-study': confirmDel('study', id, '指南'); break;
      case 'add-friend': openFriendModal(null); break;
      case 'edit-friend': openFriendModal(find('friends')); break;
      case 'del-friend': confirmDel('friend', id, '友链'); break;
      case 'del-msg': confirmDel('msg', id, '留言'); break;
    }
  });

  /* ---------- 留言表单 ---------- */
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
    apiPost('/api/msg', { name: name, email: email, text: text }).then(function (res) {
      if (res.ok) {
        if (res.json.db) { S = normalize(res.json.db); writeCache(); renderAll(); }
        e.target.reset();
        toast('留言成功 🎉 已同步到云端');
      } else {
        toast(res.json.error || '发送失败，请稍后重试', 'error');
      }
    }).catch(function () {
      toast('网络异常，发送失败', 'error');
    });
  });

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
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
    $('#themeToggle').textContent = t === 'dark' ? '🌙' : '☀️';
  }

  (function initTheme() {
    var t = null;
    try { t = localStorage.getItem(THEME_KEY); } catch (e) {}
    if (!t) t = 'dark'; /* 科技风默认暗色，可随时切换 */
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
      $$('.nav-link').forEach(function (a) {
        a.classList.toggle('active', a.getAttribute('href') === '#' + en.target.id);
      });
    });
  }, { rootMargin: '-40% 0px -52% 0px' }) : null;
  ['moments', 'travel', 'tech', 'study', 'guest'].forEach(function (sec) {
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

  /* ---------- 启动 ---------- */
  boot();
})();
