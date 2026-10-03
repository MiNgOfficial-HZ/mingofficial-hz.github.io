(function () {
  'use strict';
  function escape(s) { return String(s || '').replace(/[&<>"']/g, function (c) { return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
  function imageMarkdown(name, url) { return '![' + String(name || '图片').replace(/[\[\]\r\n\\]/g, '') + '](' + url + ')'; }
  function html() {
    return '<details class="md-media"><summary>图床 <span>选图、粘贴或拖入正文</span></summary>' +
      '<div class="md-media-tools"><button type="button" class="btn btn-soft btn-small" data-md-action="choose">上传图片</button>' +
      '<button type="button" class="btn btn-ghost btn-small" data-md-action="refresh">我的图片</button>' +
      '<input class="md-media-file" type="file" accept="image/png,image/jpeg,image/webp,image/heic,image/heif" multiple hidden>' +
      '<span class="field-hint">自动压缩 · 图片链接可重复使用</span></div>' +
      '<div class="md-upload-status" role="status" aria-live="polite"></div><div class="md-media-list"></div></details>';
  }
  function wire(root, ctx) {
    root.querySelectorAll('.md-box').forEach(function (box) {
      var tx = box.querySelector('.md-input'), px = box.querySelector('.md-preview');
      var panel = box.querySelector('.md-media'), list = box.querySelector('.md-media-list');
      var input = box.querySelector('.md-media-file'), status = box.querySelector('.md-upload-status');
      var state = { selection: 0, end: 0, pending: [], images: [], loaded: false, loading: false };
      box._mdState = state; box._mdCtx = ctx;
      function remember() {
        state.selection = tx.selectionStart; state.end = tx.selectionEnd;
        var line = tx.value.slice(0, state.selection).split('\n').length;
        box.querySelector('.md-position').textContent = '第 ' + line + ' 行';
      }
      ['input','keyup','click','select','blur'].forEach(function (event) { tx.addEventListener(event, remember); });
      px.addEventListener('scroll', function () {
        if (px.hidden || Math.abs(px.scrollTop - (box._mdPreviewTop || 0)) < 1) return;
        var anchor = previewAnchor(px);
        if (anchor) {
          px.dataset.activeLine = String(anchor.line);
          box.querySelector('.md-position').textContent = '第 ' + anchor.line + ' 行';
        }
      }, { passive: true });
      remember();
      function insert(text) {
        if (!px.hidden) toggle(box.querySelector('[data-action="md-tab-edit"]'), 'edit');
        tx.focus(); tx.setSelectionRange(state.selection, state.end);
        if (tx.value.length - (state.end - state.selection) + text.length > tx.maxLength) { ctx.toast('正文已达到字数上限', 'info'); return false; }
        tx.setRangeText(text, state.selection, state.end, 'end'); remember();
        tx.dispatchEvent(new Event('input', { bubbles: true })); return true;
      }
      function paintStatus() {
        status.innerHTML = state.pending.map(function (it) {
          return '<div class="md-upload-row"><span>' + escape(it.name) + ' · ' +
            (it.error ? escape(it.error) : it.progress) + '</span>' +
            (it.error ? '<button type="button" data-md-action="retry" data-upload-id="' + it.id + '">重试</button><button type="button" data-md-action="cancel" data-upload-id="' + it.id + '">取消</button>' : '') + '</div>';
        }).join('');
      }
      function paintLibrary() {
        list.innerHTML = state.images.length ? state.images.map(function (it, i) {
          return '<article class="md-media-card"><img src="' + escape(it.url) + '" alt="' + escape(it.label || '图床图片') + '" loading="lazy">' +
            '<div class="md-media-meta">' + escape(it.createdAt ? new Date(it.createdAt).toLocaleDateString('zh-CN') : '刚刚上传') + '</div>' +
            '<div class="md-media-actions"><button type="button" data-md-action="insert" data-image-index="' + i + '">插入</button>' +
            '<button type="button" data-md-action="link" data-image-index="' + i + '">链接</button>' +
            '<button type="button" data-md-action="markdown" data-image-index="' + i + '">Markdown</button></div></article>';
        }).join('') : '<p class="field-hint">图片库还是空的。上传后的图片会保存在这里。</p>';
      }
      function loadLibrary() {
        if (state.loading) return;
        state.loading = true; list.textContent = '正在读取图片库…';
        ctx.list().then(function (res) {
          if (!res.ok) throw new Error(res.json.error || '读取失败，请重试');
          var known = state.images;
          state.images = (res.json.images || []).concat(known.filter(function (x) { return !(res.json.images || []).some(function (y) { return y.url === x.url; }); }));
          state.loaded = true; paintLibrary();
        }).catch(function (err) { list.textContent = err.message; }).finally(function () { state.loading = false; });
      }
      function replaceToken(it, text) {
        var at = tx.value.indexOf(it.token);
        if (at < 0) return false;
        var start = tx.selectionStart, end = tx.selectionEnd, scroll = tx.scrollTop;
        tx.setRangeText(text, at, at + it.token.length, 'preserve');
        var delta = text.length - it.token.length;
        tx.setSelectionRange(start > at ? Math.max(at + text.length, start + delta) : start, end > at ? Math.max(at + text.length, end + delta) : end);
        tx.scrollTop = scroll; remember(); tx.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      }
      async function run(it) {
        it.error = ''; it.progress = '压缩中…'; paintStatus();
        try {
          var compressed = it.compressed || await ctx.compress(it.file); it.compressed = compressed;
          it.progress = '上传中…'; paintStatus();
          var res = await ctx.upload({ data: compressed.data, name: it.name }, function (pct) {
            it.progress = '上传中 ' + pct + '%'; paintStatus();
          });
          if (!res.ok || !res.json.url) throw new Error(res.json.error || '上传失败，请重试');
          var asset = { url: res.json.url, name: res.json.name, label: it.name, createdAt: Date.now() };
          if (!state.images.some(function (x) { return x.url === asset.url; })) state.images.unshift(asset);
          if (document.contains(tx)) {
            var markdown = imageMarkdown(it.name, asset.url);
            var inserted = tx.value.length - it.token.length + markdown.length <= tx.maxLength && replaceToken(it, markdown);
            if (!inserted) replaceToken(it, '');
            ctx.toast(inserted ? '图片已上传并插入正文' : '图片已上传，可在图床中重新插入');
            if (!px.hidden) renderPreview(box);
          }
          state.pending = state.pending.filter(function (x) { return x !== it; });
          paintStatus(); paintLibrary();
        } catch (err) { it.error = err.message || '上传失败，请重试'; paintStatus(); }
      }
      async function queue(files) {
        panel.open = true;
        var chosen = Array.from(files || []).slice(0, 6);
        if (files.length > 6) ctx.toast('一次最多上传 6 张图片', 'info');
        for (var file of chosen) {
          if (!/^image\//i.test(file.type) && !/\.(png|jpe?g|webp|heic|heif)$/i.test(file.name)) { ctx.toast('请选择图片文件', 'info'); continue; }
          var id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
          var it = { id: id, file: file, name: file.name || '图片', token: '![图片上传中](minghz-upload:' + id + ')', progress: '等待上传…' };
          if (!insert('\n' + it.token + '\n')) continue;
          state.pending.push(it); paintStatus();
        }
        // 新增占位后立即锁住保存，上传顺序与正文插入顺序保持一致。
        for (var pending of state.pending.slice()) { if (!pending.started) { pending.started = true; await run(pending); } }
      }
      panel.addEventListener('toggle', function () { if (panel.open && !state.loaded) loadLibrary(); });
      input.addEventListener('change', function () { var files = Array.from(input.files || []); input.value = ''; queue(files); });
      box.addEventListener('paste', function (event) {
        var files = event.clipboardData && event.clipboardData.files;
        if (files && files.length) { event.preventDefault(); queue(files); }
      });
      box.addEventListener('dragover', function (event) {
        if (event.dataTransfer && Array.from(event.dataTransfer.types).includes('Files')) { event.preventDefault(); box.classList.add('md-dragging'); }
      });
      box.addEventListener('dragleave', function () { box.classList.remove('md-dragging'); });
      box.addEventListener('drop', function (event) {
        box.classList.remove('md-dragging');
        if (event.dataTransfer && event.dataTransfer.files.length) { event.preventDefault(); queue(event.dataTransfer.files); }
      });
      box.addEventListener('click', function (event) {
        var btn = event.target.closest('[data-md-action]'); if (!btn) return;
        var action = btn.dataset.mdAction, it = state.pending.find(function (x) { return x.id === btn.dataset.uploadId; });
        if (action === 'choose') input.click();
        if (action === 'refresh') loadLibrary();
        if (action === 'retry' && it && it.error) run(it);
        if (action === 'cancel' && it && it.error) { replaceToken(it, ''); state.pending = state.pending.filter(function (x) { return x !== it; }); paintStatus(); }
        var asset = state.images[Number(btn.dataset.imageIndex)];
        if (!asset) return;
        if (action === 'insert') insert('\n' + imageMarkdown(asset.label || '图片', asset.url) + '\n');
        if (action === 'link' || action === 'markdown') {
          var text = action === 'link' ? asset.url : imageMarkdown(asset.label || '图片', asset.url);
          navigator.clipboard.writeText(text).then(function () { ctx.toast('已复制'); }).catch(function () { ctx.toast('复制失败，请使用「插入」按钮', 'info'); });
        }
      });
    });
  }
  function renderPreview(box) {
    var tx = box.querySelector('.md-input'), px = box.querySelector('.md-preview'), ctx = box._mdCtx;
    px.innerHTML = ctx.render(tx.value, true);
    // 编辑器里的图片立即加载，避免视口外的懒加载图片改变目标位置。
    px.querySelectorAll('img').forEach(function (img) { img.loading = 'eager'; });
    ctx.math(px);
  }
  function stopTracking(box) { if (box._mdStop) { box._mdStop(); box._mdStop = null; } }
  function previewAnchor(px) {
    var viewport = px.getBoundingClientRect(), baseline = viewport.top + 18;
    var nodes = Array.from(px.querySelectorAll('[data-source-line]')).filter(function (node) {
      return !node.querySelector('[data-source-line]') ||
        (node.tagName === 'SPAN' && node.dataset.sourceLine === node.dataset.sourceEnd);
    });
    var selected = null, distance = Infinity;
    nodes.forEach(function (node) {
      Array.from(node.getClientRects()).forEach(function (rect) {
        if (!rect.height || rect.bottom <= baseline || rect.top >= viewport.bottom) return;
        var delta = Math.max(0, rect.top - baseline);
        if (delta < distance) {
          distance = delta;
          selected = { line: Number(node.dataset.sourceLine), offset: Math.max(14, rect.top - viewport.top) };
          var x = rect.left + 1, y = Math.min(rect.bottom - 1, viewport.bottom - 2, Math.max(baseline, rect.top) + rect.height / 2);
          var caret = document.caretPositionFromPoint ? document.caretPositionFromPoint(x, y) : null;
          var range = !caret && document.caretRangeFromPoint ? document.caretRangeFromPoint(x, y) : null;
          var textNode = caret ? caret.offsetNode : range && range.startContainer;
          var textOffset = caret ? caret.offset : range && range.startOffset;
          if (textNode && textNode.nodeType === 3 && node.contains(textNode)) {
            var prefix = document.createRange(); prefix.setStart(node, 0); prefix.setEnd(textNode, textOffset);
            selected.fragment = textNode.nodeValue; selected.textOffset = textOffset;
            selected.progress = prefix.toString().length / Math.max(1, node.textContent.length);
          }
        }
      });
    });
    if (!selected && nodes.length) {
      var last = nodes[nodes.length - 1];
      selected = { line: Number(last.dataset.sourceEnd || last.dataset.sourceLine), offset: 18 };
    }
    return selected;
  }
  function lineStart(text, line) {
    var at = 0;
    for (var n = 1; n < line; n++) {
      var next = text.indexOf('\n', at);
      if (next < 0) return text.length;
      at = next + 1;
    }
    return at;
  }
  function sourcePosition(text, anchor) {
    var start = lineStart(text, anchor.line), end = text.indexOf('\n', start);
    var source = text.slice(start, end < 0 ? text.length : end);
    if (!anchor.fragment) return start;
    var desired = source.length * anchor.progress - anchor.textOffset, best = -1, distance = Infinity;
    for (var at = source.indexOf(anchor.fragment); at >= 0; at = source.indexOf(anchor.fragment, at + 1)) {
      var delta = Math.abs(at - desired);
      if (delta < distance) { best = at; distance = delta; }
    }
    return best < 0 ? start : start + best + anchor.textOffset;
  }
  function previewCaretRect(tx, target) {
    var line = tx.value.slice(0, tx.selectionStart).split('\n').length;
    if (Number(target.dataset.sourceLine) !== line) return target.getBoundingClientRect();
    var start = lineStart(tx.value, line), end = tx.value.indexOf('\n', start);
    var source = tx.value.slice(start, end < 0 ? tx.value.length : end);
    var caret = tx.selectionStart - start, from = 0, node;
    var walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
    while ((node = walker.nextNode())) {
      if (!node.nodeValue || node.parentElement.closest('.math-pending,.math-inline,.math-display')) continue;
      var at = source.indexOf(node.nodeValue, from);
      if (at < 0) continue;
      var last = at + node.nodeValue.length;
      if (caret >= at && caret <= last) {
        var range = document.createRange(), offset = Math.min(caret - at, node.nodeValue.length - 1);
        range.setStart(node, Math.max(0, offset)); range.setEnd(node, Math.min(node.nodeValue.length, offset + 1));
        var rect = range.getBoundingClientRect();
        if (rect.height) return rect;
      }
      from = last;
    }
    return target.getBoundingClientRect();
  }
  function sourceScroll(tx, at, offset) {
    // 用相同宽度和字体量出源码位置，长行换行时也能正确定位。
    var computed = getComputedStyle(tx), mirror = document.createElement('div');
    ['fontFamily','fontSize','fontWeight','fontStyle','lineHeight','letterSpacing','wordSpacing',
      'tabSize','paddingTop','paddingRight','paddingBottom','paddingLeft','textIndent'].forEach(function (key) { mirror.style[key] = computed[key]; });
    Object.assign(mirror.style, {
      position: 'fixed', left: '-100000px', top: '0', visibility: 'hidden',
      pointerEvents: 'none', width: tx.clientWidth + 'px', boxSizing: 'border-box',
      whiteSpace: tx.wrap === 'off' ? 'pre' : 'pre-wrap', overflowWrap: 'break-word', border: '0'
    });
    mirror.setAttribute('aria-hidden', 'true');
    mirror.appendChild(document.createTextNode(tx.value.slice(0, at)));
    var marker = document.createElement('span'); marker.textContent = '\u200b';
    mirror.appendChild(marker);
    mirror.appendChild(document.createTextNode(tx.value.slice(at) || '\u200b'));
    document.body.appendChild(mirror);
    var top = marker.getBoundingClientRect().top - mirror.getBoundingClientRect().top;
    mirror.remove();
    return Math.max(0, top - offset);
  }
  function toggle(btn, mode) {
    var box = btn.closest('.md-box'), tx = box.querySelector('.md-input'), px = box.querySelector('.md-preview');
    if (mode === 'edit' && px.hidden) { tx.focus({ preventScroll: true }); return; }
    if (mode === 'prev' && !px.hidden) return;
    var anchor = mode === 'edit' && Math.abs(px.scrollTop - (box._mdPreviewTop || 0)) >= 1 ? previewAnchor(px) : null;
    stopTracking(box);
    box.querySelectorAll('.m-tab').forEach(function (tab) { tab.classList.toggle('on', tab === btn); });
    if (mode === 'edit') {
      px.hidden = true; tx.hidden = false;
      var start = anchor ? sourcePosition(tx.value, anchor) : (box._mdStart || 0);
      tx.focus({ preventScroll: true }); tx.setSelectionRange(start, anchor ? start : (box._mdEnd || 0));
      tx.scrollTop = anchor ? sourceScroll(tx, start, anchor.offset) : (box._mdScroll || 0);
      tx.dispatchEvent(new Event('select', { bubbles: true }));
      return;
    }
    box._mdStart = tx.selectionStart; box._mdEnd = tx.selectionEnd; box._mdScroll = tx.scrollTop;
    var line = tx.value.slice(0, tx.selectionStart).split('\n').length;
    var height = Math.max(300, tx.getBoundingClientRect().height);
    px.style.height = height + 'px'; px.style.paddingBottom = (height - 42) + 'px';
    renderPreview(box); px.hidden = false; tx.hidden = true;
    px.dataset.activeLine = String(line);
    var nodes = Array.from(px.querySelectorAll('[data-source-line]'));
    var matches = nodes.filter(function (node) { return +node.dataset.sourceLine <= line && +(node.dataset.sourceEnd || node.dataset.sourceLine) >= line; });
    var target = matches.filter(function (node) {
      return +node.dataset.sourceLine === line && +(node.dataset.sourceEnd || node.dataset.sourceLine) === line &&
        !node.matches('.math-pending,.math-inline,.math-display');
    }).pop() || matches.pop();
    if (!target) target = nodes.find(function (node) { return +node.dataset.sourceLine >= line; }) || nodes[nodes.length - 1];
    if (target) target.classList.add('md-current-line');
    var tracking = true, frame = 0;
    function align() {
      if (!tracking || !target || px.hidden) return;
      px.scrollTop += previewCaretRect(tx, target).top - px.getBoundingClientRect().top - 18;
      box._mdPreviewTop = px.scrollTop;
    }
    function schedule() { cancelAnimationFrame(frame); frame = requestAnimationFrame(align); }
    function stop() { tracking = false; cancelAnimationFrame(frame); if (observer) observer.disconnect(); px.removeEventListener('wheel', stop); px.removeEventListener('touchstart', stop); px.removeEventListener('pointerdown', stop); px.removeEventListener('keydown', stop); }
    var observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    if (observer) Array.from(px.children).forEach(function (node) { observer.observe(node); });
    px.querySelectorAll('img').forEach(function (img) { img.addEventListener('load', schedule, { once: true }); img.addEventListener('error', schedule, { once: true }); });
    ['wheel','touchstart','pointerdown','keydown'].forEach(function (event) { px.addEventListener(event, stop, { passive: true }); });
    box._mdStop = stop; align(); schedule();
  }
  function busy(root) {
    return Array.from(root.querySelectorAll('.md-box')).some(function (box) { return !!(box._mdState && box._mdState.pending.length); });
  }
  function destroy(root) { root.querySelectorAll('.md-box').forEach(stopTracking); }
  window.MingEditor = { html: html, wire: wire, toggle: toggle, busy: busy, destroy: destroy };
})();
