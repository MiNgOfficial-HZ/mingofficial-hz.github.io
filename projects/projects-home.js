/* ============================================================
   个人空间里的「项目」预览（#projects 区块）
   · 纯静态渲染，不联网：数据取自 projects-data.js 的精选清单
   · 如果浏览器里已经有 /projects/ 抓到的 GitHub 缓存，就用更新的那份
   ============================================================ */
(function () {
  'use strict';

  var host = document.getElementById('projPreview');
  if (!host) return;

  var CFG = window.MINGHZ_PROJECTS || {};
  var LS_KEY = 'minghz.gh.repos.v1';

  function lower(s) { return String(s || '').toLowerCase(); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  var LANG_COLOR = {
    JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572A5', Java: '#b07219',
    HTML: '#e34c26', CSS: '#563d7c', C: '#555555', 'C++': '#f34b7d', 'C#': '#178600',
    Go: '#00ADD8', Rust: '#dea584', Shell: '#89e051', Kotlin: '#A97BFF', Swift: '#F05138'
  };

  /* 缓存 = 用户在 /projects/ 页面抓到过的真实 GitHub 数据（可选） */
  var byName = {};
  try {
    var raw = localStorage.getItem(LS_KEY);
    var obj = raw ? JSON.parse(raw) : null;
    (obj && obj.repos ? obj.repos : []).forEach(function (r) { byName[lower(r.name)] = r; });
  } catch (e) {}

  (CFG.fallback || []).forEach(function (r) {
    if (!byName[lower(r.name)]) byName[lower(r.name)] = r;
  });

  var items = [];
  (CFG.featured || []).forEach(function (name) {
    var repo = byName[lower(name)];
    if (!repo) return;
    var m = (CFG.meta && CFG.meta[lower(name)]) || {};
    items.push({
      name: repo.name,
      url: repo.html_url || ('https://github.com/' + (CFG.user || 'MiNgOfficial-HZ') + '/' + repo.name),
      desc: m.zh || (repo.description || '').replace(/\s+-\s+Contribute to .*$/i, '').trim(),
      emoji: m.emoji || '📦',
      lang: repo.language || '',
      stars: repo.stargazers_count || 0
    });
  });

  if (!items.length) { host.innerHTML = ''; return; }

  host.innerHTML = items.slice(0, 3).map(function (it, i) {
    return '<a class="proj-mini" style="--rd:' + (i * 70) + 'ms" href="' + esc(it.url) + '" target="_blank" rel="noopener noreferrer">' +
      '<span class="proj-emoji" aria-hidden="true">' + esc(it.emoji) + '</span>' +
      '<span class="proj-mini-name">' + esc(it.name) + '</span>' +
      (it.desc ? '<span class="proj-mini-desc">' + esc(it.desc) + '</span>' : '') +
      '<span class="proj-mini-meta">' +
        (it.lang ? '<span class="mlang"><i class="proj-lang-dot" style="background:' + (LANG_COLOR[it.lang] || '#8b8b93') + '"></i>' + esc(it.lang) + '</span>' : '') +
        (it.stars > 0 ? '<span>★ ' + it.stars + '</span>' : '') +
        '<span>GitHub ↗</span>' +
      '</span>' +
    '</a>';
  }).join('');
})();
