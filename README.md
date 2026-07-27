# CloudBrowser

运行在 Cloudflare Workers、Durable Objects 与 Browser Run 之上的临时云端浏览器控制台。

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/chatgptuk/cloudbrowser)
[![Deploy workflow](https://github.com/chatgptuk/cloudbrowser/actions/workflows/deploy.yml/badge.svg)](https://github.com/chatgptuk/cloudbrowser/actions/workflows/deploy.yml)

输入公开网址，Worker 会启动远程 Chrome、导航到目标页面，并把 Cloudflare Live View
的实时画面嵌入控制台。Durable Object 保存会话元数据、按时销毁浏览器，并在长会话中
定期重连以维持 `keep_alive`。

## 两种会话类型

| | 托管浏览器（Browser Run） | 完整浏览器环境（Containers） |
| --- | --- | --- |
| 底层 | Cloudflare Browser Run 托管的无头 Chrome | 容器里的桌面 Chromium（Xvfb + noVNC） |
| 启动 | 数秒 | 首次约一分钟（要拉起容器） |
| 操作 | Live View 实时画面 + 服务端页面工具 | 自己在画面里操作，跟本地浏览器一样 |
| 截图 / PDF / 提取正文 / 地址栏导航 | 支持 | 不支持（没有挂 CDP 自动化） |
| 画面来源 | `live.browser.run` | 同源 `/screen/<id>/`，经票据鉴权代理 |
| 成本 | Browser Run 时长 | 容器 vCPU / 内存 / 磁盘计费 |

完整环境是一个普通的桌面 Chromium，不带任何自动化补丁；它解决的是"需要真实浏览器行为
和人工操作"的场景，不是用来伪装身份。出口 IP 仍然是 Cloudflare 数据中心地址，风控严格
的站点照样会挑战。

## 功能

**会话**

- 两种会话类型：托管 Browser Run 与容器内完整桌面浏览器
- 同时运行多个云端浏览器（默认 3 个，可配置 1–10），侧栏切换、独立倒计时
- 会话内导航：地址栏直接打开新网址，支持后退 / 前进 / 刷新
- 一键延长会话，最长累计 24 小时；到期由 Durable Object alarm 强制销毁
- 超过 `keep_alive` 上限的长会话由 Durable Object 每 4 分钟自动重连保活，
  控制台关闭也不会被回收
- 页面工具：PNG 截图、A4 PDF 导出、正文与链接提取
- Browser Run 配额面板（活跃会话 / 并发上限）

**浏览器模拟**

- 设备预设（1920×1080 / 2560×1440 / 笔记本 / MacBook / iPad / iPhone / Pixel）与自定义
  尺寸、像素比、移动触摸模式
- 出口区域（15 个国家/地区）、语言、时区、网页配色、减弱动画
- 自定义 User-Agent、定位覆盖
- 按类型拦截图片 / 音视频 / 字体 / 样式表，加速加载并减少流量

**控制台**

- 应用式布局：会话侧栏 + 浏览器地址栏 + 实时画面 + 状态栏
- 命令面板（⌘K）、完整键盘快捷键、Toast 通知
- 明暗双主题（可跟随系统）与简体中文 / English 双语
- 本机历史与快速打开，全部保存在 `localStorage`
- 响应式：桌面折叠侧栏，移动端抽屉式侧栏

**安全**

- 单用户 Bearer 口令保护，口令只存在 `sessionStorage`
- 恒定时间口令比较 + 失败尝试指数退避限流
- 只允许 HTTP/HTTPS 与 80/443 端口；拦截 localhost、私网、链路本地、保留 IPv4/IPv6、
  `.internal` / `.onion` / `.arpa` 等后缀
- 浏览器子请求与跳转做二次 URL 检查
- 严格 CSP、`frame-ancestors 'none'`、`X-Frame-Options: DENY`
- 不持久化 Cookie、密码、网页内容或 Live View JWT；Session Recording 显式关闭

## 架构

```text
Workers Static Assets (public/)
        │
        ▼
Worker (src/index.ts) ── /api/config · /api/health（公开）
        │                 Bearer 认证 + 限流 + 请求体限长
        ▼
Durable Object “owner” (src/browser-session.ts)
        ├── session:<id> ── 多会话存储与统计
        ├── Alarm ──────── 到期销毁 + 长会话心跳
        ├── Browser Run binding ── puppeteer.launch / connect
        ├── Browser Run REST API ── Live View URL / 关闭会话
        └── BrowserContainer DO ── 容器桌面（每会话一个实例）
                    │
                    └── Xvfb + fluxbox + Chromium + noVNC:8080
                              ▲
                              └── /screen/<id>/* （Worker 票据鉴权代理）
```

单用户模型：所有受保护 API 都映射到名为 `owner` 的 Durable Object。加入多用户认证时，
把 `getByName("owner")` 换成稳定的用户 ID 即可，其余逻辑无需改动。

### 源码结构

| 文件 | 职责 |
| --- | --- |
| `src/index.ts` | 路由、认证入口、`/api/config` 元数据 |
| `src/browser-session.ts` | Durable Object：会话生命周期、alarm、心跳、配额 |
| `src/page-actions.ts` | 复用会话的导航、截图、PDF、正文提取、请求守卫 |
| `src/browser-settings.ts` | 设备/语言/时区/区域目录与设置校验 |
| `src/security.ts` | 目标 URL 归一化与 SSRF 拦截 |
| `src/auth.ts` | Bearer 校验与登录限流 |
| `src/http.ts` | JSON / 错误 / 二进制响应与请求体限长 |
| `src/session-store.ts` | 会话记录的纯函数（公开视图、历史、alarm 计算） |
| `src/browser-container.ts` | 容器 Durable Object：启动桌面、代理画面、销毁 |
| `src/screen-ticket.ts` | 画面代理的 HMAC 短期票据签发与校验 |
| `Dockerfile` / `container/start.sh` | 完整浏览器环境镜像与启动脚本 |
| `public/js/*.js` | 控制台前端 ES 模块（api / state / render / settings / i18n / ui） |
| `public/styles/*.css` | 设计令牌、基础组件、应用布局 |

## API

除 `/api/config` 与 `/api/health` 外都需要 `Authorization: Bearer <ADMIN_TOKEN>`。

| 方法与路径 | 说明 |
| --- | --- |
| `GET /api/config` | 会话时长、并发上限、设备/语言/时区/区域目录 |
| `GET /api/health` | 服务状态与各项配置是否就绪（不返回密钥内容） |
| `POST /api/verify` | 校验口令 |
| `GET /api/sessions[?capacity=1]` | 会话列表、统计、可选 Browser Run 配额 |
| `POST /api/sessions` | 创建会话 `{ url, settings, kind }`，`kind` 为 `browser-run`（默认）或 `container` |
| `DELETE /api/sessions` | 结束全部会话 |
| `GET /api/sessions/:id` | 单个会话 |
| `DELETE /api/sessions/:id` | 结束并销毁会话 |
| `POST /api/sessions/:id/live-url` | 刷新 Live View 链接 |
| `POST /api/sessions/:id/navigate` | `{ url }` 或 `{ direction: back \| forward \| reload }` |
| `POST /api/sessions/:id/extend` | `{ seconds }` 延长会话 |
| `POST /api/sessions/:id/screenshot` | `{ fullPage, format }` 返回 PNG/JPEG |
| `POST /api/sessions/:id/pdf` | 返回 A4 PDF |
| `POST /api/sessions/:id/extract` | 返回标题、正文与链接 |
| `POST /api/sessions/:id/screen-ticket` | 签发容器画面的短期票据 URL |
| `GET /screen/:id/*` | 容器画面代理，用票据（查询参数或 Cookie）鉴权 |

错误统一为 `{ "error": { "code", "message", "field?", "retryAfter?" } }`，
控制台按 `code` 显示本地化文案。

## 部署方式

| 方式 | 最适合 | 特点 |
| --- | --- | --- |
| **Deploy to Cloudflare 按钮** | 第一次体验 | 创建 Worker 最快，首次部署后仍需设置三个运行时 Secret |
| **Fork + GitHub Actions** | 长期维护自己的版本 | 多配置一个部署 Token，之后推送到 `main` 自动检查并部署 |

### 方式一：Deploy to Cloudflare

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/chatgptuk/cloudbrowser)

部署完成后，在 Worker 的 **Settings → Variables and Secrets** 中添加：

- `ADMIN_TOKEN`：足够长的随机控制台访问口令
- `CLOUDFLARE_ACCOUNT_ID`：Cloudflare Account ID
- `CLOUDFLARE_BROWSER_TOKEN`：仅限当前账户、具有 Browser Run 编辑权限的 API Token

设置后重新部署一次。Deploy 按钮不能代替你创建敏感凭证。

### 方式二：Fork + GitHub Actions

1. [Fork 这个仓库](https://github.com/chatgptuk/cloudbrowser/fork)。
2. 打开 **Settings → Secrets and variables → Actions**，添加：

   | Secret | 用途 |
   | --- | --- |
   | `CLOUDFLARE_API_TOKEN` | GitHub Actions 部署 Worker；需要 Workers Scripts 编辑权限 |
   | `CLOUDFLARE_ACCOUNT_ID` | 部署目标账户，同时作为 Worker 运行时 Secret |
   | `ADMIN_TOKEN` | 控制台登录口令 |
   | `CLOUDFLARE_BROWSER_TOKEN` | 生成 Live View 链接和关闭浏览器会话 |

3. 打开 **Actions → Deploy to Cloudflare → Run workflow**。

缺少配置时工作流会安全跳过部署，并在 Actions Summary 中列出缺少的名称。

### 手动部署

需要 Workers Paid 计划和 Browser Run：

```bash
npx wrangler secret put ADMIN_TOKEN
npx wrangler secret put CLOUDFLARE_ACCOUNT_ID
npx wrangler secret put CLOUDFLARE_BROWSER_TOKEN

npm run check
npm run deploy
```

生成管理口令：`openssl rand -base64 32`。

## 配置项

| 变量 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `ADMIN_TOKEN` | Secret | — | 控制台访问口令，必填 |
| `CLOUDFLARE_ACCOUNT_ID` | Secret | — | 生成 Live View / 关闭会话所需 |
| `CLOUDFLARE_BROWSER_TOKEN` | Secret | — | Browser Run 编辑权限的 API Token |
| `BROWSER_SESSION_TTL_SECONDS` | Variable | `600` | 单次会话时长，`60`–`86400` |
| `MAX_CONCURRENT_SESSIONS` | Variable | `3` | 同时运行的云端浏览器数量，`1`–`10` |
| `BROWSER_MOCK` | Variable | — | 设为 `true` 启用本地 Mock，**不要用于生产** |

容器相关配置在 `wrangler.jsonc` 的 `containers` 块里：`instance_type` 默认 `standard-1`
（1/2 vCPU、4 GiB 内存、8 GB 磁盘），Chromium 跑得动但不宽裕，卡顿就升到 `standard-2`；
`max_instances` 控制同时存在的桌面数量。不需要完整环境时，删掉 `containers` 块和
`BROWSER_CONTAINERS` binding 即可正常部署。

Cloudflare 单次无活动 `keep_alive` 上限为 600 秒。会话时长超过它时，Durable Object 会
每 4 分钟重连一次远程浏览器来续期，因此控制台关闭后长会话仍能存活到设定时间。

## 本地运行

```bash
npm install
npx wrangler dev --var ADMIN_TOKEN:preview-token --var BROWSER_MOCK:true
```

用 `preview-token` 登录。Mock 模式不创建 Browser Run 实例，也不消耗浏览时长：会话、
导航、延长、到期都可用；截图与 PDF 会返回 `MOCK_UNSUPPORTED`，实时画面用本地占位面板
代替。容器会话在 Mock 下同样只走占位面板。

`wrangler.jsonc` 里设了 `dev.enable_containers: false`，所以本地开发不需要 Docker。要真的
在本地跑容器桌面，启动 Docker 后加 `--enable-containers`：

```bash
npx wrangler dev --enable-containers --var ADMIN_TOKEN:preview-token
```

`npm run check` 的 dry-run 带 `--containers-rollout=none`，同样不需要 Docker；正式
`npm run deploy` 会构建镜像，需要本地或 CI 有可用的 Docker。

## 键盘快捷键

| 快捷键 | 操作 |
| --- | --- |
| `⌘/Ctrl + K` | 命令面板 |
| `⌘/Ctrl + L` | 聚焦地址栏 |
| `⇧⌘/Ctrl + N` | 新建会话 |
| `⇧⌘/Ctrl + S` | 截图当前页面 |
| `⇧⌘/Ctrl + E` | 提取页面正文 |
| `⇧⌘/Ctrl + R` | 刷新页面 |
| `⇧⌘/Ctrl + X` | 结束当前会话 |
| `⇧⌘/Ctrl + F` | 全屏 / 退出全屏 |
| `⌘/Ctrl + 1…9` | 切换到第 N 个会话 |
| `?` | 快捷键说明 |
| `Esc` | 关闭弹层或启动面板 |

## 验证清单

部署后至少验证：

1. 无口令调用 `/api/sessions` 返回 `401`；连续错误口令后返回 `429`。
2. `localhost`、`127.0.0.1`、`169.254.169.254`、私有 IPv4/IPv6、非标准端口被拒绝。
3. `https://example.com` 可以创建会话，实时画面加载自 `live.browser.run`，
   且 API Token 不出现在页面或网络响应里。
4. 地址栏可在同一会话中打开新网址，后退 / 前进 / 刷新可用。
5. 截图与 PDF 能下载，正文提取能返回文本。
6. 设置手机视口、语言、时区、定位、出口区域后，目标页面能读到对应值。
7. 达到并发上限时返回 `SESSION_LIMIT_REACHED`。
8. 到达 `BROWSER_SESSION_TTL_SECONDS` 后会话被 alarm 关闭；延长按钮能推迟到期。
9. Cloudflare Browser Run 仪表板没有异常遗留会话。

## 安全边界

- 这是有认证的任务型浏览器，不是公开代理服务。
- Browser Run 会被网站识别为机器人流量，部分网站会阻止访问。
- 静态地址检查与 Puppeteer 请求拦截不能取代网络层出口策略；请求拦截只在 Worker 保持
  CDP 连接期间生效，Live View 中的用户操作不受它约束。
- 开放多租户前还需要 DNS 重绑定防护、按用户额度、审计、滥用处理与支付风控。
- 登录限流保存在 Worker isolate 内，属于尽力而为，不是全局速率限制。
- 完整浏览器环境里的 Chromium 由使用者自由操作，Worker 的 URL 白名单只约束首个网址；
  容器出网不受静态地址检查限制，多租户场景需要自行加出口策略。
- 容器画面靠 `/screen/<id>/` 的 HMAC 票据鉴权（默认 15 分钟，Cookie 仅限该路径），
  容器端口本身不对公网开放；x11vnc 不设密码，因为只有 Durable Object 能连到它。
- Live View URL 是临时凭证，不应记录到日志或分享给其他人。

## 常用命令

```bash
npm run typecheck   # TypeScript
npm test            # Vitest
npm run check       # typecheck + test + wrangler dry-run
npm run dev
npm run deploy
```

## 官方资料

- [Browser Run](https://developers.cloudflare.com/browser-run/)
- [Live View](https://developers.cloudflare.com/browser-run/features/live-view/)
- [CDP Session management](https://developers.cloudflare.com/browser-run/cdp/session-management/)
- [Reuse sessions](https://developers.cloudflare.com/browser-run/features/reuse-sessions/)
- [Browser Run limits](https://developers.cloudflare.com/browser-run/limits/)
- [Deploy to Cloudflare buttons](https://developers.cloudflare.com/workers/platform/deploy-buttons/)
- [Wrangler GitHub Action](https://github.com/cloudflare/wrangler-action)
