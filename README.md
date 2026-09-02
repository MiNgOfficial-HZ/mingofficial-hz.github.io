# MiNgHZ 的小站

> 一半是生活，一半是热爱。 · 参考风格：tzblog.tech（简洁、卡片式、温暖色调）

访问：**https://mingofficial-hz.github.io/**

## 功能模块

| 模块 | 说明 |
| --- | --- |
| 💬 说说墙 | 时间线展示短动态，右下角 **＋** 随时新增；每条可编辑 / 删除 |
| 🧳 旅行日志 | 卡片网格展示游记（标题、日期、封面表情、地点、摘要、标签），可增删改 |
| 📷 数码生活 | 时间线展示数码产品体验与评分（星级），可增删改 |
| 🍵 留言 & 友链 | 访客留言表单（姓名 / 邮箱 / 内容，带校验与反馈），友链卡片可增删改 |

## 云端同步架构（v3 · Cloudflare Worker 代理）

```
游客留言 ──▶ POST /api/msg（限流+校验）──▶ GitHub minghz-db/db.json ──▶ 邮件通知 126 邮箱
站长操作 ──▶ 密码在 Worker 校验 ──▶ 12h HMAC 会话 ──▶ 白名单操作 ──▶ 写 GitHub
所有人打开页面 ──▶ raw.githubusercontent.com 直读最新 db.json（全站一致）
```

- **写入口**：Cloudflare Worker（minghz-api.mingsite.workers.dev）
- **🔒 安全**：页面源码零密钥 —— GitHub Token、管理密码、会话密钥全部只存在于 Worker 服务端（加密凭证）；未授权操作一律 401
- **防刷**：游客留言限流（每 IP 每小时 5 条）；密码尝试限流（每 IP 每小时 10 次）
- **数据**：公开仓库 [MiNgOfficial-HZ/minghz-db](https://github.com/MiNgOfficial-HZ/minghz-db) 的 db.json，每次修改一条 git 提交，可回滚
- **邮件**：私有仓库 minghz-notify 的 GitHub Action 扫描新留言并通过 SMTP 通知站长
- **离线**：LocalStorage 仅作缓存；云端不可达时展示缓存并自动重试

## 权限与管理模式

- **游客**：只读 + 留言（留言云端同步并邮件通知站长）
- **站长**：点击顶部「🔐 管理」→ 输入管理密码（校验在 Worker 服务端）→ 解锁 12 小时，可增删改全部内容
- 游客模式下：右下角 ＋、各区块添加按钮、每条内容的编辑/删除按钮均不显示

## 技术说明

- 纯静态 HTML/CSS/JS + Cloudflare Worker（免费额度即可），无框架无构建
- 字体 Google Fonts 内联引入；响应式；深浅主题；Toast 反馈；删除确认
- 页面左上角状态灯：☁️ 已同步 / 🔄 同步中 / ⚠️ 离线

## 本地预览

    npx serve .  或直接双击 index.html（管理模式需 https 网络环境）