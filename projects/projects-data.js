/* ============================================================
   项目展示 · 数据源（纯静态，不联网；/projects/ 与首页都用这一份）
   ------------------------------------------------------------
   · 仓库列表本身来自 GitHub：https://api.github.com/users/<user>/repos
   · 这里只放「人话」的部分 —— 精选顺序、中文简介、分类、标签、站点链接
   · 想加一个项目：在 GitHub 上建好仓库，再到 meta 里补一条中文说明（可选）
   ============================================================ */
window.MINGHZ_PROJECTS = {
  user: 'MiNgOfficial-HZ',
  profile: 'https://github.com/MiNgOfficial-HZ',
  /* GitHub 接口结果在浏览器里的缓存时长（毫秒）：6 小时 */
  cacheTtlMs: 6 * 60 * 60 * 1000,

  /* 精选：按这个顺序排在「精选项目」区；不在列表里的仓库照常出现在下面 */
  featured: ['salary-cat-pet', 'LifeLedgerApp', 'mingofficial-hz.github.io'],

  /* 不想展示的仓库名（不区分大小写），例如纯测试仓库 */
  hidden: [],

  /* 「人话」说明：key 是 GitHub 上的仓库名（不区分大小写） */
  meta: {
    'salary-cat-pet': {
      emoji: '🐱',
      category: '桌面与工具',
      zh: '把一张插画拆成可动关节，逐像素抠出透明窗口，让它真的蹲在 Windows 桌面上 —— 会自己伸懒腰、被摸头会眯眼的那种。',
      tags: ['Windows 桌宠', 'Python', '像素级透明窗口'],
      site: ''
    },
    'lifeledgerapp': {
      emoji: '📒',
      category: 'App 与移动端',
      zh: '纯本地 Android 记账应用：纯 Java + 原生 XML，不依赖 Gradle，一条脚本直接打出 APK；账目只留在手机里，不联网、不上传。',
      tags: ['Android', '纯 Java', '本地优先'],
      site: ''
    },
    'mingofficial-hz.github.io': {
      emoji: '🌐',
      category: '站点与网页',
      zh: '你现在正在逛的这个站：静态页面 + Cloudflare Worker 的零密钥架构，内容数据放在私有仓库里，按角色过滤后再下发。',
      tags: ['静态站点', 'Cloudflare Workers', 'GitHub Pages'],
      site: 'https://giraffeming.online/'
    },
    'minghz.github.io': {
      emoji: '🧪',
      category: '站点与网页',
      zh: '早期的 GitHub Pages 主页仓库，现在的主站已经搬到 mingofficial-hz.github.io。',
      tags: ['GitHub Pages', '存档'],
      site: ''
    }
  },

  /* 兜底清单：GitHub 接口超了匿名额度 / 断网时用这份（字段与 GitHub API 对齐） */
  fallbackUpdatedAt: '2026-09-29',
  fallback: [
    {
      name: 'salary-cat-pet',
      html_url: 'https://github.com/MiNgOfficial-HZ/salary-cat-pet',
      description: '月薪猫桌宠 —— 从单张插画重建可动关节的 Windows 桌面宠物（逐像素透明窗口 + 状态机行为）',
      language: 'Python',
      stargazers_count: 0,
      forks_count: 0,
      topics: [],
      homepage: '',
      pushed_at: '2026-09-15T12:26:12Z',
      fork: false,
      archived: false
    },
    {
      name: 'LifeLedgerApp',
      html_url: 'https://github.com/MiNgOfficial-HZ/LifeLedgerApp',
      description: '纯本地 Android 记账应用 | 纯 Java + 原生 XML，无需 Gradle，脚本一键打包 APK',
      language: 'Java',
      stargazers_count: 0,
      forks_count: 0,
      topics: [],
      homepage: '',
      pushed_at: '2026-09-12T16:41:16Z',
      fork: false,
      archived: false
    },
    {
      name: 'mingofficial-hz.github.io',
      html_url: 'https://github.com/MiNgOfficial-HZ/mingofficial-hz.github.io',
      description: 'MiNgHZ personal site (mirror repo)',
      language: 'JavaScript',
      stargazers_count: 0,
      forks_count: 0,
      topics: [],
      homepage: 'https://giraffeming.online/',
      pushed_at: '2026-09-28T14:53:53Z',
      fork: false,
      archived: false
    },
    {
      name: 'MiNgHZ.github.io',
      html_url: 'https://github.com/MiNgOfficial-HZ/MiNgHZ.github.io',
      description: '',
      language: 'JavaScript',
      stargazers_count: 0,
      forks_count: 0,
      topics: [],
      homepage: '',
      pushed_at: '2026-09-12T16:19:18Z',
      fork: false,
      archived: false
    }
  ]
};
