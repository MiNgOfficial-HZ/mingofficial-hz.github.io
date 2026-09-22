# MiNgHZ个人站点

访问：**https://mingofficial-hz.github.io/**



## 架构（v6）

```
静态页面（GitHub Pages，零密钥）
  ├─ 游客 / 访客 / 管理员：数据由 Worker 过滤（无邮箱、无用户表）
  └─ 站长 MiNgAltair：完整数据（留言邮箱）+ 管理面板
          ↓ 数据读写经 Cloudflare Worker（凭证仅存服务端）
私有 GitHub minghz-db/db.json（内容数据 + 账号数据[PBKDF2 哈希]）
图片经 Worker /api/img 代理读取（边缘缓存一年）；新留言邮件通知已停用
```

## 首屏与上传优化（v7）

- 字体非阻塞加载：Google Fonts 以 `media="print"` 低优先级拉取，加载完再切换，首屏先用系统字体渲染
- `/api/db` 一次请求同时返回数据与当前用户；Worker 侧数据读有 15 秒边缘缓存，写操作立即失效
- 首页先渲染 localStorage 缓存再请求云端（`requestAnimationFrame` 之后），断网也能立刻看到内容
- 图片：浏览器内 `createImageBitmap` 解码 + WebP 压缩（长边 1600，约 900KB 以内）+ XHR 进度 + 单张重试；一次多张会合并成一个 commit
- 人机验证：官方 onload 回调 + 失败兜底 UI（显示原因与「重新验证」），iPad 上不再把登录按钮卡死

## 账号与权限

- 站长：MiNg
- 角色：owner（站长）> admin（管理员）> member（访客）> 游客（未登录）
- 登录限流：每 IP 每小时 12 次尝试
- 人机验证：Turnstile 令牌由 Worker 调用 siteverify 服务端校验；校验服务不可达时放行，避免连坐正常用户
- 两步验证：TOTP（SHA-1 / 6 位 / 30 秒，±30 秒容差）；密钥与恢复码哈希只存在私有仓库，页面与接口都不下发
- 管理面板仅 owner 可创建/授权/删除；admin 可查看账号列表

## 安全管理

- 页面源码零密钥；minghz-db 为私有仓库，读取经 Worker 按角色剥除邮箱/用户表
- 登录/改密/发放账号全部经Cloudflare Worker服务端校验；上传图片服务端校验真实格式
- 开启2FA后：登录要「密码 + 动态码」两步；改密也要再验一次动态码；关闭 / 重置恢复码同样需要动态码
- 所有数据变更走 git 提交历史，可回滚；内容修改需登录且具备可编辑权限

## 本地预览

    npx serve .  或直接双击 index.html（登录/管理需在线）
