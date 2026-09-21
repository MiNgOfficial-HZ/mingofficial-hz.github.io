/* ============================================================
   摄影空间（三级页面）：读 /api/db 里的 photos，站长可增删改
   · 作品：作品名 + 拍摄地点 + 拍摄时间 + 多张照片 + 可选说明
   · 图片在浏览器里统一压到 1080p（长边 ≤1920、短边 ≤1080）再上传
   ============================================================ */
(function () {
  'use strict';

  var WORKER = 'https://api.giraffeming.online';
  var USER_LS = 'minghz.user.v1';
  var THEME_KEY = 'minghz.theme';
  var IMG_LONG = 1920, IMG_SHORT = 1080, IMG_TARGET = 1.4 * 1024 * 1024;

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var uid = function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); };

  var session = (function () { try { return localStorage.getItem(USER_LS) || ''; } catch (e) { return ''; } })();
  var me = null;
  var needMe = false;
  var works = [];
  var editing = null;
  var pendingImgs = [];
  var uploads = [];
  var viewer = { list: [], i: 0, imgs: [], j: 0 };
  var tsToken = '';
  var tsState = 'idle';

  function isOwner() { return !!me && me.role === 'owner'; }
  /* 服务端下发的头像字段叫 av，这里统一成 avatar */
  function setMe(u) {
    me = u || null;
    if (me) me.avatar = me.avatar || me.av || '';
    return me;
  }
  function mediaUrl(u) {
    u = String(u == null ? '' : u);
    var raw = 'https://raw.githubusercontent.com/MiNgOfficial-HZ/minghz-db/main/uploads/';
    if (u.indexOf(raw) === 0) return WORKER + '/api/img?p=' + encodeURIComponent(u.slice(raw.length));
    return u;
  }
  function apiPost(path, body) {
    return fetch(WORKER + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    }).then(function (r) {
      return r.json().then(function (j) { return { ok: r.ok, status: r.status, json: j }; })
        .catch(function () { return { ok: false, status: r.status, json: {} }; });
    });
  }
  function toast(msg, type) {
    type = type || 'success';
    var icons = { success: '✅', error: '⚠️', info: '💡' };
    var el = document.createElement('div');
    el.className = 'toast ' + type;
    el.innerHTML = '<span>' + (icons[type] || '💡') + '</span><span>' + esc(msg) + '</span>';
    $('#toastRoot').appendChild(el);
    setTimeout(function () { el.classList.add('out'); setTimeout(function () { el.remove(); }, 280); }, 2800);
  }

  /* ---------- 主题 / 菜单 / 字体（与主站一致） ---------- */
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
    var b = $('#themeToggle'); if (b) b.textContent = t === 'dark' ? '🌙' : '☀️';
  }
  (function initChrome() {
    var t = null;
    try { t = localStorage.getItem(THEME_KEY); } catch (e) {}
    applyTheme(t || 'light');
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

  /* ---------- 数据 ---------- */
  function render() {
    var grid = $('#photoGrid'), empty = $('#photoEmpty');
    $('#photoCount').textContent = works.length ? works.length + ' 组作品' : '';
    $('#addPhotoBtn').hidden = !isOwner();
    $('#photoUserBtn').textContent = me ? ((me.avatar && !/^https?:/i.test(me.avatar) ? me.avatar : '😊') + ' 我的账户') : '👤 登录';
    if (!works.length) { grid.innerHTML = ''; empty.hidden = false; return; }
    empty.hidden = true;
    grid.innerHTML = works.map(function (w) {
      var cover = (w.imgs && w.imgs[0]) ? mediaUrl(w.imgs[0]) : '';
      var acts = isOwner()
        ? '<div class="work-acts">' +
            '<button type="button" data-act="edit" data-id="' + esc(w.id) + '" aria-label="编辑">✎</button>' +
            '<button type="button" data-act="del" data-id="' + esc(w.id) + '" aria-label="删除">✕</button>' +
          '</div>'
        : '';
      return '<article class="work" data-id="' + esc(w.id) + '" data-act="open">' +
        (cover ? '<img class="work-cover" src="' + esc(cover) + '" alt="' + esc(w.title) + '" loading="lazy" decoding="async" />' : '<div class="work-cover"></div>') +
        (w.imgs && w.imgs.length > 1 ? '<span class="work-badge">' + w.imgs.length + ' 张</span>' : '') +
        acts +
        '<div class="work-body">' +
          '<div class="work-title">' + esc(w.title || '未命名') + '</div>' +
          '<div class="work-meta">' +
            (w.location ? '<span>📍 ' + esc(w.location) + '</span>' : '') +
            (w.date ? '<span class="dot">·</span><span>🗓 ' + esc(w.date) + '</span>' : '') +
          '</div>' +
        '</div></article>';
    }).join('');
  }

  function load() {
    return apiPost('/api/db', { session: session }).then(function (res) {
      if (!res.ok || !res.json.db) throw new Error((res.json && res.json.error) || '读取失败');
      works = (res.json.db.photos || []).slice().sort(function (a, b) {
        return String(b.date || b.time || '') > String(a.date || a.time || '') ? 1 : -1;
      });
      if ('user' in res.json) setMe(res.json.user);
      else needMe = true;          /* 旧版 Worker 才会走到这里 */
    });
  }
  function restoreMe() {
    if (!session) { me = null; render(); return Promise.resolve(); }
    return apiPost('/api/auth/me', { session: session }).then(function (res) {
      if (res.ok) setMe(res.json.user);
      else { setMe(null); session = ''; try { localStorage.removeItem(USER_LS); } catch (e) {} }
      render();
    }).catch(function () { render(); });
  }
  function saveSession(s) {
    session = s || '';
    try { if (s) localStorage.setItem(USER_LS, s); else localStorage.removeItem(USER_LS); } catch (e) {}
  }

  /* ---------- 图片：统一压到 1080p 再上传 ---------- */
  var WEBP_OK = null;
  function canWebp() {
    if (WEBP_OK !== null) return WEBP_OK;
    try {
      var c = document.createElement('canvas'); c.width = c.height = 1;
      WEBP_OK = c.toDataURL('image/webp').indexOf('data:image/webp') === 0;
    } catch (e) { WEBP_OK = false; }
    return WEBP_OK;
  }
  function decode(file) {
    return new Promise(function (resolve, reject) {
      var fallback = function () {
        var url = URL.createObjectURL(file), img = new Image();
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
        } catch (e) {}
      }
      fallback();
    });
  }
  function blobToB64(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { var s = String(r.result || ''); resolve(s.slice(s.indexOf(',') + 1)); };
      r.onerror = function () { reject(new Error('read')); };
      r.readAsDataURL(blob);
    });
  }
  function toBlob(canvas, type, q) {
    return new Promise(function (resolve) {
      if (canvas.toBlob) canvas.toBlob(function (b) { resolve(b); }, type, q);
      else {
        try {
          var s = canvas.toDataURL(type, q), p = s.split(','), mime = (p[0].match(/:(.*?);/) || [])[1] || 'image/jpeg';
          var bin = atob(p[1] || ''), u8 = new Uint8Array(bin.length);
          for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
          resolve(new Blob([u8], { type: mime }));
        } catch (e) { resolve(null); }
      }
    });
  }
  /* 长边 ≤1920、短边 ≤1080（横竖都按这个盒子缩），再按体积微调 */
  function compress(file) {
    var src = null;
    var release = function () { if (src && src.close) { try { src.close(); } catch (e) {} } };
    return decode(file).then(function (bmp) {
      src = bmp;
      var w = bmp.width || bmp.naturalWidth || 1, h = bmp.height || bmp.naturalHeight || 1;
      var mime = canWebp() ? 'image/webp' : 'image/jpeg';
      var ext = mime === 'image/webp' ? 'webp' : 'jpg';
      var longSide = IMG_LONG, shortSide = IMG_SHORT, q = 0.85;
      var attempt = function (round) {
        var scale = Math.min(1, longSide / Math.max(w, h), shortSide / Math.min(w, h));
        var cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
        var c = document.createElement('canvas');
        c.width = cw; c.height = ch;
        var ctx = c.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        try { ctx.imageSmoothingQuality = 'high'; } catch (e) {}
        ctx.drawImage(bmp, 0, 0, cw, ch);
        return toBlob(c, mime, q).then(function (blob) {
          if (!blob) throw new Error('encode');
          if (blob.size > IMG_TARGET && round < 3) {
            q = Math.max(0.55, q - 0.12);
            longSide = Math.max(1280, Math.round(longSide * 0.85));
            shortSide = Math.max(720, Math.round(shortSide * 0.85));
            return attempt(round + 1);
          }
          return blobToB64(blob).then(function (b64) {
            return { data: b64, ext: ext, size: blob.size, w: cw, h: ch };
          });
        });
      };
      return attempt(0);
    }).then(function (out) { release(); return out; }, function (e) { release(); throw e; });
  }
  function uploadOne(payload, onProgress) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', WORKER + '/api/upload', true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.timeout = 180000;
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

  /* ---------- 作品编辑 ---------- */
  function imgListHTML() {
    var done = pendingImgs.map(function (u) {
      return '<div class="img-thumb"><img src="' + esc(mediaUrl(u)) + '" alt="照片" loading="lazy" decoding="async" />' +
        '<button class="img-rm" type="button" data-act="img-rm" data-url="' + esc(u) + '" aria-label="移除">✕</button></div>';
    }).join('');
    var busy = uploads.map(function (it) {
      var label = it.status === 'err' ? '失败' : (it.status === 'wait' ? '压缩中…' : it.pct + '%');
      return '<div class="img-thumb ' + (it.status === 'err' ? 'failed' : 'uploading') + '">' +
        '<div class="img-state">' + esc(label) + '</div>' +
        (it.status === 'err' ? '<button class="img-rm" type="button" data-act="img-retry" data-uid="' + it.id + '" aria-label="重试">↻</button>' : '') +
        '</div>';
    }).join('');
    return '<div class="img-list" id="imgList">' + done + busy + '</div>' +
      '<label class="img-add" for="imgFileInput" id="imgAddLabel">＋ 添加照片</label>' +
      '<input id="imgFileInput" type="file" accept="image/*" multiple hidden />' +
      '<p class="photo-tip">大图会自动压到 1080p（长边 ≤1920、短边 ≤1080）再上传，最多 12 张。</p>';
  }
  function renderImgList() {
    var host = $('#imgSlot');
    if (!host) return;
    host.innerHTML = imgListHTML();
    var lbl = $('#imgAddLabel');
    if (lbl) lbl.style.display = (pendingImgs.length + uploads.length) >= 12 ? 'none' : '';
  }
  function queueFiles(files) {
    if (!files || !files.length) return;
    var room = 12 - pendingImgs.length - uploads.length;
    if (room <= 0) { toast('最多 12 张照片', 'info'); return; }
    var list = Array.prototype.slice.call(files).slice(0, room);
    var chain = Promise.resolve();
    list.forEach(function (file) {
      chain = chain.then(function () {
        var item = { id: uid(), name: file.name || 'photo', pct: 0, status: 'wait', data: '', ext: 'jpg' };
        uploads.push(item);
        renderImgList();
        return compress(file).then(function (res) {
          item.data = res.data; item.ext = res.ext; item.status = 'up';
          renderImgList();
          return uploadOne({ name: 'photo.' + res.ext, data: res.data, session: session, folder: 'photo' }, function (p) {
            item.pct = p; renderImgList();
          });
        }).then(function (r) {
          if (r.ok && r.json.url) {
            uploads = uploads.filter(function (x) { return x !== item; });
            pendingImgs.push(r.json.url);
          } else {
            item.status = 'err';
            toast('「' + item.name + '」上传失败：' + ((r.json && r.json.error) || ('HTTP ' + r.status)), 'error');
          }
          renderImgList();
        }).catch(function (e) {
          item.status = 'err';
          toast('「' + item.name + '」' + ((e && e.message === 'decode') ? '格式不支持（可能是 HEIC），请先转成 JPG' : (e && e.message) || '上传失败'), 'error');
          renderImgList();
        });
      });
    });
  }
  function openEditor(item) {
    editing = item || null;
    pendingImgs = item && Array.isArray(item.imgs) ? item.imgs.slice() : [];
    uploads = [];
    var today = new Date();
    var pad = function (n) { return String(n).padStart(2, '0'); };
    var todayStr = today.getFullYear() + '-' + pad(today.getMonth() + 1) + '-' + pad(today.getDate());
    $('#modalTitle').textContent = item ? '编辑作品' : '添加作品';
    $('#modalBody').innerHTML =
      '<div class="photo-form">' +
        '<div class="field"><label>作品名 *</label><input id="wTitle" maxlength="60" placeholder="如：西湖的清晨" value="' + esc(item ? item.title : '') + '" /></div>' +
        '<div class="row2">' +
          '<div class="field"><label>拍摄地点</label><input id="wLoc" maxlength="60" placeholder="如：浙江 · 杭州" value="' + esc(item ? (item.location || '') : '') + '" /></div>' +
          '<div class="field"><label>拍摄时间</label><input id="wDate" type="date" value="' + esc(item ? (item.date || '') : todayStr) + '" /></div>' +
        '</div>' +
        '<div class="field"><label>照片 *</label><div id="imgSlot">' + imgListHTML() + '</div></div>' +
        '<div class="field"><label>想说的话（可选）</label><textarea id="wNote" rows="3" maxlength="300" placeholder="这张照片背后的故事…">' + esc(item ? (item.note || '') : '') + '</textarea></div>' +
      '</div>';
    $('#modalFoot').innerHTML =
      '<button class="btn btn-ghost" type="button" data-act="close">取消</button>' +
      '<button class="btn btn-primary" type="button" data-act="save">' + (item ? '保存修改' : '添加 ✨') + '</button>';
    $('#modalBackdrop').hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeEditor() {
    $('#modalBackdrop').hidden = true;
    document.body.style.overflow = '';
    editing = null;
    pendingImgs = [];
    uploads = [];
  }
  /* 列表每次重绘都会重建 <input type=file>，所以用委托监听 */
  document.addEventListener('change', function (e) {
    var el = e.target;
    if (!el || el.id !== 'imgFileInput') return;
    /* 注意：先拷成数组再清空 input.value —— FileList 是「活的」，清空后就没内容了 */
    var f = Array.prototype.slice.call(el.files || []);
    el.value = '';
    queueFiles(f);
  });
  function saveEditor() {
    if (!isOwner()) { toast('只有站长能编辑摄影空间', 'error'); return; }
    if (uploads.length) { toast('还有照片在上传，稍等一下～', 'info'); return; }
    var title = String(($('#wTitle') || {}).value || '').trim();
    if (!title) { toast('给这组作品起个名字吧', 'error'); $('#wTitle').focus(); return; }
    if (!pendingImgs.length) { toast('至少上传一张照片', 'error'); return; }
    var item = {
      id: editing ? editing.id : uid(),
      title: title,
      location: String(($('#wLoc') || {}).value || '').trim(),
      date: String(($('#wDate') || {}).value || ''),
      note: String(($('#wNote') || {}).value || '').trim(),
      imgs: pendingImgs.slice(0, 12)
    };
    var action = editing ? 'photo.edit' : 'photo.add';
    apiPost('/api/admin', { op: 'mutate', session: session, action: action, item: item }).then(function (res) {
      if (res.status === 401 || res.status === 403) { toast('登录状态已失效或权限不足，请重新登录', 'error'); return; }
      if (!res.ok || !res.json.ok) { toast((res.json && res.json.error) || '保存失败', 'error'); return; }
      works = (res.json.db.photos || []).slice().sort(function (a, b) {
        return String(b.date || b.time || '') > String(a.date || a.time || '') ? 1 : -1;
      });
      toast(editing ? '作品已更新 📷' : '作品已添加 📷');
      closeEditor();
      render();
    }).catch(function () { toast('网络异常，保存失败', 'error'); });
  }
  function delWork(id) {
    var w = works.filter(function (x) { return x.id === id; })[0];
    if (!w) return;
    $('#modalTitle').textContent = '删除这组作品？';
    $('#modalBody').innerHTML = '<p class="confirm-text">「' + esc(w.title) + '」和它的 ' + (w.imgs || []).length + ' 张照片都会被删除，不可撤销。</p>';
    $('#modalFoot').innerHTML =
      '<button class="btn btn-ghost" type="button" data-act="close">先别删</button>' +
      '<button class="btn btn-danger" type="button" data-act="del-ok" data-id="' + esc(id) + '">确认删除</button>';
    $('#modalBackdrop').hidden = false;
    document.body.style.overflow = 'hidden';
  }

  /* ---------- 大图查看 ---------- */
  function openViewer(id) {
    var w = works.filter(function (x) { return x.id === id; })[0];
    if (!w) return;
    viewer.list = works.slice();
    viewer.i = viewer.list.indexOf(w);
    showWork(viewer.i);
    $('#pv').hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function showWork(i) {
    var w = viewer.list[i];
    if (!w) return;
    viewer.i = i;
    viewer.imgs = (w.imgs || []).map(mediaUrl);
    viewer.j = 0;
    paintViewer();
  }
  function paintViewer() {
    var w = viewer.list[viewer.i];
    $('#pvTitle').textContent = w.title || '未命名';
    $('#pvMeta').textContent = [w.location ? '📍 ' + w.location : '', w.date || ''].filter(Boolean).join(' · ');
    $('#pvNote').textContent = w.note || '';
    $('#pvStage').innerHTML = viewer.imgs[viewer.j]
      ? '<img src="' + esc(viewer.imgs[viewer.j]) + '" alt="' + esc(w.title) + '" />'
      : '<p class="confirm-text">这组作品暂时没有照片</p>';
    $('#pvThumbs').innerHTML = viewer.imgs.map(function (u, k) {
      return '<img src="' + esc(u) + '" alt="" data-act="pv-thumb" data-k="' + k + '" class="' + (k === viewer.j ? 'on' : '') + '" loading="lazy" />';
    }).join('');
  }
  function closeViewer() {
    $('#pv').hidden = true;
    document.body.style.overflow = '';
  }
  function stepViewer(d) {
    if (!viewer.imgs.length) return;
    var n = viewer.j + d;
    if (n < 0) n = viewer.imgs.length - 1;
    if (n >= viewer.imgs.length) n = 0;
    viewer.j = n;
    paintViewer();
  }
  function stepWork(d) {
    if (!viewer.list.length) return;
    var n = viewer.i + d;
    if (n < 0) n = viewer.list.length - 1;
    if (n >= viewer.list.length) n = 0;
    showWork(n);
  }

  /* ---------- 人机验证（与主站同一套兜底逻辑） ---------- */
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
        /* 10 秒还没拿到令牌就当「慢」：不再拦着登录，交给服务端判断 */
        setTimeout(function () {
          if (tsState !== 'ok') {
            tsState = 'slow';
            if (!slot.querySelector('.ts-fallback')) {
              var tip = document.createElement('div');
              tip.className = 'ts-fallback';
              tip.textContent = '人机验证加载较慢 —— 可以直接点「登录」，服务端会再校验一次。也可以点下面的按钮重试。';
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

  /* ---------- 登录 ---------- */
  function openLogin() {
    $('#modalTitle').textContent = '🔐 登录';
    $('#modalBody').innerHTML =
      '<div class="field"><label>账号</label><input id="lUser" maxlength="40" autocomplete="username" /></div>' +
      '<div class="field"><label>密码</label><input id="lPw" type="password" maxlength="64" autocomplete="current-password" /></div>' +
      (TS_KEY ? '<div class="ts-slot" id="tsSlot"></div>' : '') +
      '<p class="field-hint">账号由站长发放；只有站长能在摄影空间里增删改作品。</p>';
    $('#modalFoot').innerHTML =
      '<button class="btn btn-ghost" type="button" data-act="close">取消</button>' +
      '<button class="btn btn-primary" type="button" data-act="login">登录</button>';
    $('#modalBackdrop').hidden = false;
    document.body.style.overflow = 'hidden';
    tsToken = ''; tsState = 'idle';
    mountTs();
    var u = $('#lUser'); if (u) u.focus();
  }
  function doLogin() {
    var un = String(($('#lUser') || {}).value || '').trim();
    var pw = String(($('#lPw') || {}).value || '');
    if (!un || !pw) { toast('请输入账号和密码', 'error'); return; }
    if (!tsOk()) { toast('请先完成人机验证（可点「重新验证」重试）', 'error'); return; }
    apiPost('/api/auth/login', { username: un, password: pw, turnstile: tsToken }).then(function (res) {
      if (res.ok && res.json.ok) {
        saveSession(res.json.session);
        me = res.json.user;
        closeEditor();
        toast('欢迎回来，' + (me.nick || '朋友') + ' 👋');
        render();
        if (!isOwner()) toast('你不是站长，摄影空间只能浏览～', 'info');
        return;
      }
      if (res.ok && res.json.need2fa) { askCode(res.json.ticket); return; }
      toast((res.json && res.json.error) || '登录失败', 'error');
    }).catch(function () { toast('网络异常，登录失败', 'error'); });
  }
  function askCode(ticket) {
    $('#modalTitle').textContent = '🔐 两步验证';
    $('#modalBody').innerHTML = '<div class="field"><label>动态码 / 恢复码</label><input id="lCode" maxlength="12" placeholder="6 位数字，或 XXXXX-XXXXX" /></div>';
    $('#modalFoot').innerHTML =
      '<button class="btn btn-ghost" type="button" data-act="close">取消</button>' +
      '<button class="btn btn-primary" type="button" data-act="code" data-ticket="' + esc(ticket) + '">验证并登录</button>';
    var c = $('#lCode'); if (c) c.focus();
  }

  /* ---------- 事件 ---------- */
  document.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!el) return;
    var act = el.getAttribute('data-act');
    var id = el.getAttribute('data-id');
    if (act === 'open') {
      if (e.target.closest('.work-acts')) return;
      openViewer(el.getAttribute('data-id'));
    } else if (act === 'edit') { e.stopPropagation(); openEditor(works.filter(function (w) { return w.id === id; })[0]); }
    else if (act === 'del') { e.stopPropagation(); delWork(id); }
    else if (act === 'del-ok') {
      apiPost('/api/admin', { op: 'mutate', session: session, action: 'photo.del', item: { id: id } }).then(function (res) {
        if (res.ok && res.json.ok) {
          works = res.json.db.photos || [];
          toast('已删除');
          closeEditor();
          render();
        } else toast((res.json && res.json.error) || '删除失败', 'error');
      });
    } else if (act === 'img-rm') {
      var u = el.getAttribute('data-url');
      pendingImgs = pendingImgs.filter(function (x) { return x !== u; });
      renderImgList();
    } else if (act === 'save') saveEditor();
    else if (act === 'close') closeEditor();
    else if (act === 'pv-thumb') { viewer.j = Number(el.getAttribute('data-k')) || 0; paintViewer(); }
    else if (act === 'ts-retry') { var s = $('#tsSlot'); if (s) { s.innerHTML = ''; delete s.dataset.tsId; } mountTs(); }
    else if (act === 'login') doLogin();
    else if (act === 'code') {
      var t = el.getAttribute('data-ticket'), c = String(($('#lCode') || {}).value || '').trim();
      if (!c) { toast('请输入动态码或恢复码', 'error'); return; }
      apiPost('/api/auth/login', { ticket: t, code: c }).then(function (res) {
        if (res.ok && res.json.ok) {
          saveSession(res.json.session); me = res.json.user;
          closeEditor(); toast('欢迎回来，' + (me.nick || '朋友') + ' 👋'); render();
        } else toast((res.json && res.json.error) || '验证失败', 'error');
      });
    }
  });
  $('#photoUserBtn').addEventListener('click', function () {
    if (!me) { openLogin(); return; }
    toast('当前登录：' + me.nick + (isOwner() ? '（站长）' : ''), 'info');
    if (!isOwner()) return;
    $('#addPhotoBtn').hidden = false;
  });
  $('#addPhotoBtn').addEventListener('click', function () { openEditor(null); });
  $('#modalBackdrop').addEventListener('mousedown', function (e) { if (e.target === this) closeEditor(); });
  $('#pv').addEventListener('click', function (e) {
    if (e.target === this || e.target.closest('.pv-close')) closeViewer();
  });
  $('.pv-prev').addEventListener('click', function (e) { e.stopPropagation(); stepViewer(-1); });
  $('.pv-next').addEventListener('click', function (e) { e.stopPropagation(); stepViewer(1); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { if (!$('#pv').hidden) closeViewer(); else if (!$('#modalBackdrop').hidden) closeEditor(); }
    if ($('#pv').hidden) return;
    if (e.key === 'ArrowLeft') stepViewer(-1);
    if (e.key === 'ArrowRight') stepViewer(1);
    if (e.key === 'ArrowUp') stepWork(-1);
    if (e.key === 'ArrowDown') stepWork(1);
  });

  /* ---------- 启动 ---------- */
  load().then(function () {
    if (needMe && !me) return restoreMe();
  }).then(function () {
    render();
  }).catch(function () {
    render();
    toast('云端数据读取失败，请刷新重试', 'error');
  });
})();
