# CloudBrowser

一个基于 Cloudflare Workers、Durable Objects 与 Browser Run 的临时云端浏览器 MVP。

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/chatgptuk/cloudbrowser)
[![Deploy workflow](https://github.com/chatgptuk/cloudbrowser/actions/workflows/deploy.yml/badge.svg)](https://github.com/chatgptuk/cloudbrowser/actions/workflows/deploy.yml)

用户输入公开网址后，Worker 会启动远程 Chrome、导航到目标页面，并返回 Cloudflare Live View 短期访问链接。Durable Object 保存会话元数据，并在配置的会话时间到期后强制关闭浏览器。

## 已实现

- 单用户 Bearer 口令保护，口令仅保存在浏览器 `sessionStorage`
- Browser Run binding 创建远程 Chrome
- Live View 普通页面与 DevTools 链接生成
- `live.browser.run` 实时画面直接嵌入控制台
- Durable Object 会话复用、状态查询、定时销毁
- 手动结束与 Cloudflare CDP Session API 关闭
- 仅允许 HTTP/HTTPS、80/443 端口
- 拦截 localhost、私网、链路本地、保留 IPv4/IPv6 与危险协议
- 浏览器子请求和跳转的二次 URL 检查
- 前端倒计时、链接刷新、错误状态与移动端布局
- 明确的机器人流量与用途边界提示
- 本地显式 Mock 模式，不消耗 Browser Run 时长

## 架构

```text
Workers Static Assets
        │
        ▼
Worker API ── Bearer auth / URL validation
        │
        ▼
Durable Object (owner)
        ├── Browser Run binding ── remote Chrome
        ├── Alarm ── hard expiry
        └── Browser Run CDP API ── Live View URL / close session
```

第一版刻意采用单用户模型：所有受保护 API 都映射到名为 `owner` 的 Durable Object。后续加入多用户认证时，应改为使用稳定的用户 ID 创建 Durable Object。

## 部署方式

两种方式都已提供：

| 方式 | 最适合 | 特点 |
| --- | --- | --- |
| **Deploy to Cloudflare 按钮** | 第一次体验、不会使用 GitHub Actions 的用户 | 创建 Worker 最快，但首次部署后仍需在 Cloudflare 中设置三个运行时 Secret |
| **Fork + GitHub Actions** | 长期维护自己的版本 | 初次多配置一个部署 Token，之后推送到 `main` 会自动检查并部署 |

### 方式一：Deploy to Cloudflare

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/chatgptuk/cloudbrowser)

按钮会从这个公开仓库部署名为 `cloudbrowser` 的 Worker。部署完成后，在 Cloudflare Worker 的 **Settings → Variables and Secrets** 中添加：

- `ADMIN_TOKEN`：足够长的随机控制台访问口令
- `CLOUDFLARE_ACCOUNT_ID`：Cloudflare Account ID
- `CLOUDFLARE_BROWSER_TOKEN`：仅限当前账户、具有 Browser Run 编辑权限的 API Token
- `BROWSER_SESSION_TTL_SECONDS`（可选 Variable）：会话时长，支持 `60`–`86400` 秒；默认 `600`

设置 Secret 后重新部署一次 Worker。Deploy 按钮不能代替你创建敏感凭证，因此这一步不能安全地完全自动化。

### 方式二：Fork + GitHub Actions

1. [Fork 这个仓库](https://github.com/chatgptuk/cloudbrowser/fork)。
2. 在 Fork 后的仓库打开 **Settings → Secrets and variables → Actions**。
3. 添加以下 Repository secrets：

   | Secret | 用途 |
   | --- | --- |
   | `CLOUDFLARE_API_TOKEN` | GitHub Actions 部署 Worker；需要 Workers Scripts 编辑权限 |
   | `CLOUDFLARE_ACCOUNT_ID` | 部署目标账户，同时作为 Worker 运行时 Secret |
   | `ADMIN_TOKEN` | CloudBrowser 控制台登录口令 |
   | `CLOUDFLARE_BROWSER_TOKEN` | Worker 生成 Live View 链接和关闭浏览器会话 |

4. 打开 **Actions → Deploy to Cloudflare → Run workflow**。
5. 首次成功后，每次推送到 `main` 都会自动运行检查并部署。

Fork 不会继承上游仓库的 Secret。缺少配置时，工作流会安全跳过部署，并在 Actions Summary 中列出缺少的名称，不会打印 Secret 内容。

部署按钮更省事；如果准备长期使用或修改代码，推荐 Fork + GitHub Actions。

## 本地运行

安装依赖：

```bash
npm install
```

使用显式 Mock 浏览器运行本地界面和完整会话流程：

```bash
npx wrangler dev \
  --var ADMIN_TOKEN:preview-token \
  --var BROWSER_MOCK:true
```

打开 Wrangler 输出的本地地址，并使用 `preview-token` 登录。Mock 只用于本地开发；它会把 Live View 链接指向用户输入的公开网址，不会创建 Browser Run 实例。

不要把 `BROWSER_MOCK` 写进生产环境配置。

## 手动部署

需要 Workers Paid 计划和 Browser Run。创建一个仅限当前账户的 API Token，并授予 Browser Run 编辑权限。

设置三个生产 Secret：

```bash
npx wrangler secret put ADMIN_TOKEN
npx wrangler secret put CLOUDFLARE_ACCOUNT_ID
npx wrangler secret put CLOUDFLARE_BROWSER_TOKEN
```

- `ADMIN_TOKEN`：足够长的随机控制台访问口令
- `CLOUDFLARE_ACCOUNT_ID`：Cloudflare Account ID
- `CLOUDFLARE_BROWSER_TOKEN`：用于列出 Live View target 和关闭 CDP 会话的受限 API Token

建议生成管理口令：

```bash
openssl rand -base64 32
```

检查并部署：

```bash
npm run check
npm run deploy
```

配置中的 Browser Run binding 名为 `BROWSER`，Durable Object binding 名为 `BROWSER_SESSIONS`。首次部署会通过 `v1` migration 创建 SQLite-backed Durable Object 类。

`BROWSER_SESSION_TTL_SECONDS` 控制 CloudBrowser 的总会话时长，默认 600 秒，最大 86400 秒。例如配置为 `3600` 时，界面会显示一小时。Cloudflare 的单次无活动 `keep_alive` 上限仍为 600 秒；控制台打开时会每四分钟刷新 Live View，使活跃会话继续运行。如果控制台关闭或断网超过十分钟，Cloudflare 可能在总会话到期前回收浏览器。

## 验证清单

部署后至少验证：

1. 无口令调用 `/api/session` 返回 `401`。
2. 错误口令无法查看或结束当前会话。
3. `localhost`、`127.0.0.1`、`169.254.169.254`、私有 IPv4/IPv6 和非标准端口被拒绝。
4. `https://example.com` 可以创建会话。
5. 控制台内嵌的实时浏览器加载自 `live.browser.run`，且 API Token 不出现在页面或网络响应里。
6. “结束并销毁”后 Live View 不再可用。
7. 到达 `BROWSER_SESSION_TTL_SECONDS` 配置的时间后，Durable Object alarm 会关闭会话。
8. Cloudflare Browser Run 仪表板没有异常遗留会话。

## 安全边界

- 这是有认证的任务型浏览器，不是公开代理服务。
- Browser Run 会被网站识别为机器人流量，部分网站会阻止访问。
- 静态地址检查和 Puppeteer 请求拦截不能取代完整的网络层出口策略；开放多租户前还需要 DNS 重绑定防护、按用户额度、审计、滥用处理和支付风控。
- 当前不持久化 Cookie、密码、网页内容或 Live View JWT。
- Session Recording 显式关闭。
- Live View URL 本身是临时凭证，不应记录到日志或分享给其他人。

## 常用命令

```bash
npm run typecheck
npm test
npm run check
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
