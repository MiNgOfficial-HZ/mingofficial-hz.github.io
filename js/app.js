/* ============================================================
   MiNgHZ 的小站 · app.js
   纯原生 JS · LocalStorage 模拟后端 · 零依赖
   ============================================================ */
(function () {
  'use strict';

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
  var toStamp = function (d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  };
  var nowStamp = function () { return toStamp(new Date()); };
  var daysAgo = function (n) { var d = new Date(); d.setDate(d.getDate() - n); return d; };
  var daysAgoStamp = function (n, h, m) { var d = daysAgo(n); d.setHours(h == null ? 12 : h, m == null ? 0 : m, 0, 0); return toStamp(d); };
  var daysAgoDate = function (n) { var d = daysAgo(n); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  var sortDesc = function (list, key) {
    return list.slice().sort(function (a, b) { return String(a[key]) > String(b[key]) ? -1 : 1; });
  };
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  /* ---------- Toast 反馈 ---------- */
  function toast(msg, type) {
    type = type || 'success';
    var icons = { success: '✅', error: '⚠️', info: '💡' };
    var el = document.createElement('div');
    el.className = 'toast ' + type;
    el.innerHTML = '<span>' + (icons[type] || '💡') + '</span><span>' + esc(msg) + '</span>';
    $('#toastRoot').appendChild(el);
    setTimeout(function () { el.classList.add('out'); setTimeout(function () { el.remove(); }, 280); }, 2600);
  }

  /* ---------- 数据（LocalStorage 模拟后端） ---------- */
  var KEY = 'minghz.site.v1';
  var THEME_KEY = 'minghz.theme';

  function seed() {
    return {
      moments: [
        { id: uid(), emoji: '🎉', text: '小站上线啦！从今天起，把生活里的小碎片都捡起来。', time: daysAgoStamp(0, 21, 14) },
        { id: uid(), emoji: '🌅', text: '傍晚在江边走了很久，风把一整天的疲惫都吹跑了。', time: daysAgoStamp(1, 19, 32) },
        { id: uid(), emoji: '📖', text: '读完《夜晚的潜水艇》，像做了一场漫长的梦。', time: daysAgoStamp(3, 23, 5) },
        { id: uid(), emoji: '🪴', text: '把阳台的绿萝重新挪了位置，春天好像住进了房间。', time: daysAgoStamp(5, 10, 22) },
        { id: uid(), emoji: '💻', text: '给新电脑装好了环境，一切准备就绪，开工！', time: daysAgoStamp(7, 14, 47) },
        { id: uid(), emoji: '🌧️', text: '雨后的空气里有青草的味道，想带相机出门。', time: daysAgoStamp(10, 8, 15) }
      ],
      travels: [
        { id: uid(), title: '杭州 · 西湖散记', date: daysAgoDate(20), location: '浙江 · 杭州', emoji: '🌊', grad: 1, tags: ['江南', '慢游'], summary: '五月初的西湖，柳浪闻莺。沿着苏堤走了一整天，风是软的，水是绿的，连脚步都不舍得快。' },
        { id: uid(), title: '重庆 · 山城夜行', date: daysAgoDate(46), location: '重庆', emoji: '🏙️', grad: 4, tags: ['美食', '夜景'], summary: '洪崖洞的灯火和火锅的辣意一样浓烈。轻轨穿楼而过，这座城市有种奇妙的魔幻感。' },
        { id: uid(), title: '大理 · 洱海骑行', date: daysAgoDate(120), location: '云南 · 大理', emoji: '🚲', grad: 6, tags: ['骑行', '治愈'], summary: '环洱海骑行 120 公里，走走停停。天很蓝，海很宽，心很静。' },
        { id: uid(), title: '京都 · 红叶季', date: daysAgoDate(180), location: '日本 · 京都', emoji: '🍁', grad: 2, tags: ['红叶', '温泉'], summary: '被枫叶染红的寺庙，一步一景。晚上泡进温泉里，看月亮慢慢升起。' }
      ],
      tech: [
        { id: uid(), title: 'iPhone 16 Pro 半年体验', category: '手机', rating: 4.5, date: daysAgoDate(90).slice(0, 7), text: '影像系统是真惊喜，长焦微距随手出片；续航中规中矩，信号还是一般。整体瑕不掩瑜。' },
        { id: uid(), title: 'SONY WH-1000XM5', category: '耳机', rating: 5, date: daysAgoDate(150).slice(0, 7), text: '降噪天花板，戴上就是另一个世界。续航也够顶，通勤路上的幸福感直接拉满。' },
        { id: uid(), title: '机械键盘：客制化初体验', category: '桌面', rating: 4, date: daysAgoDate(168).slice(0, 7), text: '用的是 75 配列 + 线性轴体，打字声像雨点落在木板上。唯一的缺点是：会忍不住多打几行字。' },
        { id: uid(), title: '富士 X-T30 II 扫街', category: '相机', rating: 4.5, date: daysAgoDate(210).slice(0, 7), text: '直出色彩玄学名不虚传，胶片模拟让后期都省了。小巧轻便，适合挂在脖子上从早走到晚。' }
      ],
      friends: [
        { id: uid(), name: 'TZ Blog', url: 'https://tzblog.tech', desc: '简约里藏着思考的技术博客', emoji: '✨' },
        { id: uid(), name: '阮一峰的网络日志', url: 'https://www.ruanyifeng.com/blog/', desc: '每周五更新的科技爱好者周刊', emoji: '📮' },
        { id: uid(), name: '酷壳 CoolShell', url: 'https://coolshell.cn', desc: '左手技术，右手人生', emoji: '🎯' }
      ],
      messages: [
        { id: uid(), name: '小鹿', email: 'lu@example.com', text: '首页的橙色好温暖！已经常驻啦，期待更多旅行故事 ✨', time: daysAgoStamp(4, 16, 40) },
        { id: uid(), name: '阿哲', email: 'az@example.com', text: '说说墙的设计很治愈，感觉像在翻一本心情手账。', time: daysAgoStamp(6, 22, 3) }
      ]
    };
  }

  var S = { moments: [], travels: [], tech: [], friends: [], messages: [] };

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(S));
    } catch (e) {
      toast('保存失败：浏览器存储不可用', 'error');
    }
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) {
        S = seed();
        save();
        return;
      }
      var data = JSON.parse(raw);
      Object.keys(S).forEach(function (k) {
        if (Array.isArray(data[k])) S[k] = data[k];
      });
    } catch (e) {
      try { localStorage.removeItem(KEY); } catch (e2) {}
      S = seed();
      save();
      toast('本地数据读取异常，已恢复为示例内容', 'info');
    }
  }

  /* ---------- 渲染 ---------- */
  function emptyHTML(msg) { return '<div class="empty">' + msg + '</div>'; }

  function renderStats() {
    var chips = [
      ['💬', S.moments.length, '条说说'],
      ['🧳', S.travels.length, '段旅程'],
      ['📷', S.tech.length, '件数码'],
      ['🔗', S.friends.length, '位友人']
    ];
    $('#heroStats').innerHTML = chips.map(function (c) {
      return '<span class="stat-chip">' + c[0] + ' <span class="stat-num">' + c[1] + '</span> ' + c[2] + '</span>';
    }).join('');
  }

  function actionsHTML(kind, id) {
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
          '<div class="t-actions">' +
            '<button class="act-btn" type="button" data-action="edit-travel" data-id="' + t.id + '" aria-label="编辑">✎</button>' +
            '<button class="act-btn danger" type="button" data-action="del-travel" data-id="' + t.id + '" aria-label="删除">✕</button>' +
          '</div>' +
        '</div>' +
        '<div class="t-body">' +
          '<h3 class="t-title">' + esc(t.title) + '</h3>' +
          '<p class="t-summary">' + esc(t.summary) + '</p>' +
          (tags ? '<div class="t-tags">' + tags + '</div>' : '') +
        '</div>' +
      '</article>';
    }).join('');
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
          '<p class="tech-text">' + esc(t.text) + '</p>' +
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
        '<div class="item-actions">' +
          '<button class="act-btn" type="button" data-action="edit-friend" data-id="' + f.id + '" aria-label="编辑">✎</button>' +
          '<button class="act-btn danger" type="button" data-action="del-friend" data-id="' + f.id + '" aria-label="删除">✕</button>' +
        '</div>' +
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
          '<button class="act-btn danger" type="button" data-action="del-msg" data-id="' + m.id + '" aria-label="删除">✕</button></div>' +
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
    renderFriends();
    renderMessages();
    bindReveal();
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

  /* ---------- 弹窗系统 ---------- */
  var currentFields = [];
  var currentSubmit = null;
  var pendingConfirm = null;

  function fieldHTML(f) {
    var v = f.value != null ? f.value : '';
    var label = '<label for="f_' + f.key + '">' + esc(f.label) + (f.required ? ' <i style="color:var(--danger);font-style:normal">*</i>' : '') + '</label>';
    var inner;
    if (f.type === 'textarea') {
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

  function validateField(f, v) {
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
      values[el.name] = el.value;
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
      save();
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

  /* ---------- 各模块的编辑弹窗 ---------- */
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
          item.text = v.text.trim();
          item.emoji = v.emoji.trim();
          toast('说说已更新 ✨');
        } else {
          S.moments.push({ id: uid(), text: v.text.trim(), emoji: v.emoji.trim(), time: nowStamp() });
          toast('发布成功 ✨');
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
        { key: 'date', label: '日期', type: 'date', required: true, value: item ? item.date : daysAgoDate(0) },
        { key: 'location', label: '地点', max: 30, placeholder: '如：浙江 · 杭州' },
        { key: 'emoji', label: '封面表情', max: 4, placeholder: '🌊' },
        { key: 'summary', label: '摘要', type: 'textarea', required: true, max: 160, rows: 3, placeholder: '用两三句话记录这趟旅程…' },
        { key: 'tags', label: '标签', max: 60, placeholder: '江南, 慢游', hint: '用逗号分隔' }
      ],
      onSubmit: function (v) {
        var tags = v.tags.split(/[,，、]/).map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 5);
        if (item) {
          Object.assign(item, { title: v.title.trim(), date: v.date, location: v.location.trim(), emoji: v.emoji.trim(), grad: item.grad != null ? item.grad : Math.floor(Math.random() * 8), summary: v.summary.trim(), tags: tags });
          toast('游记已更新 🧳');
        } else {
          S.travels.push({ id: uid(), title: v.title.trim(), date: v.date, location: v.location.trim(), emoji: v.emoji.trim() || '🌏', grad: Math.floor(Math.random() * 8), summary: v.summary.trim(), tags: tags });
          toast('游记已添加 🧳');
        }
        return true;
      }
    });
  }

  function openTechModal(item) {
    openModal({
      title: item ? '编辑体验' : '添加数码体验',
      submitText: item ? '保存修改' : '添加 ✨',
      fields: [
        { key: 'title', label: '名称', required: true, max: 40, placeholder: '如：iPhone 16 Pro 半年体验' },
        { key: 'category', label: '分类', type: 'select', options: ['手机', '电脑', '耳机', '相机', '桌面', '智能家居', '其他'], value: item ? item.category : '手机' },
        { key: 'rating', label: '评分', type: 'select', options: ['5', '4.5', '4', '3.5', '3', '2.5', '2', '1.5', '1'], value: item ? String(item.rating) : '4.5' },
        { key: 'date', label: '月份', type: 'month', required: true, value: item ? item.date : daysAgoDate(0).slice(0, 7) },
        { key: 'text', label: '体验感受', type: 'textarea', required: true, max: 500, rows: 4, placeholder: '真实的使用感受，优缺点都可以说…' }
      ],
      onSubmit: function (v) {
        var data = { title: v.title.trim(), category: v.category, rating: Number(v.rating), date: v.date, text: v.text.trim() };
        if (item) { Object.assign(item, data); toast('体验已更新 📷'); }
        else { S.tech.push(Object.assign({ id: uid() }, data)); toast('体验已添加 📷'); }
        return true;
      }
    });
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
        if (item) { Object.assign(item, data); toast('友链已更新 🔗'); }
        else { S.friends.push(Object.assign({ id: uid() }, data)); toast('友链已添加 🔗'); }
        return true;
      }
    });
  }

  /* ---------- 删除 ---------- */
  function confirmDel(kind, id, label) {
    openConfirm({
      title: '删除这条' + label + '？',
      message: '删除后无法恢复哦（仅影响本浏览器的本地数据）。',
      onOk: function () {
        S[kind] = S[kind].filter(function (x) { return x.id !== id; });
        save();
        renderAll();
        toast('已删除' + label, 'info');
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
      case 'add-moment': openMomentModal(null); break;
      case 'edit-moment': openMomentModal(find('moments')); break;
      case 'del-moment': confirmDel('moments', id, '说说'); break;
      case 'add-travel': openTravelModal(null); break;
      case 'edit-travel': openTravelModal(find('travels')); break;
      case 'del-travel': confirmDel('travels', id, '游记'); break;
      case 'add-tech': openTechModal(null); break;
      case 'edit-tech': openTechModal(find('tech')); break;
      case 'del-tech': confirmDel('tech', id, '体验'); break;
      case 'add-friend': openFriendModal(null); break;
      case 'edit-friend': openFriendModal(find('friends')); break;
      case 'del-friend': confirmDel('friends', id, '友链'); break;
      case 'del-msg': confirmDel('messages', id, '留言'); break;
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
    S.messages.push({ id: uid(), name: name, email: email, text: text, time: nowStamp() });
    save();
    renderAll();
    e.target.reset();
    toast('留言成功 🎉 谢谢你的到访');
  });

  /* ---------- 主题 ---------- */
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
    $('#themeToggle').textContent = t === 'dark' ? '🌙' : '☀️';
  }

  (function initTheme() {
    var t = null;
    try { t = localStorage.getItem(THEME_KEY); } catch (e) {}
    if (!t) t = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
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
  ['moments', 'travel', 'tech', 'guest'].forEach(function (sec) {
    var el = document.getElementById(sec);
    if (el && spyIO) spyIO.observe(el);
  });

  /* ---------- 弹窗交互 ---------- */
  $('#modalBackdrop').addEventListener('click', function (e) {
    if (e.target === this) closeModal();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !$('#modalBackdrop').hidden) closeModal();
  });
  $('#modalBody').addEventListener('input', function (e) {
    if (e.target.classList) e.target.classList.remove('invalid');
  });

  /* ---------- 页脚年份 & FAB ---------- */
  $('#year').textContent = new Date().getFullYear();
  $('#fab').addEventListener('click', function () { openMomentModal(null); });

  /* ---------- 启动 ---------- */
  load();
  renderAll();
})();
