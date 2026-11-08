# 本地启用浏览器 Worker（无头浏览器）指南

**版本**: 1.0 ｜ **日期**: 2026-11-08 ｜ **适用对象**: 本地开发 / 自托管部署

---

## 0. 结论摘要

浏览器 worker 是一个独立运行的**无头 Chromium 服务**（`apps/worker`），负责帮智能体「真正打开网页」完成研究任务。**默认关闭**，只有同时配置了 `BROWSER_WORKER_URL` 和 `WORKER_TOKEN` 才会启用。

| 配置状态 | LingWu 的能力 |
| --- | --- |
| 未配置（当前默认） | 模型只能**搜索**并拿到网页摘要，读不了网页全文，无法截图/下载 PDF |
| 已配置（本文档） | 新增 `browse_web` 工具：整页读取（含 JS 动态渲染的内容）、截图、下载 PDF、接管会话控制 |

如果你要开发或测试「读网页做研究」的场景，按本文 **方式 A（本地直接运行）** 三步即可开启；否则保持关闭完全不影响其他功能。

---

## 1. 前置条件

- 已按 `README.md` 完成根目录 `pnpm install`（本地直接运行依赖 pnpm workspace）。
- 已确认 `.env` 中 `WORKSPACE_MODE=live`、`AGENT_BACKEND=model`（生产模式）。
- 懂基本的终端操作；**每次改 `.env` 后需要重启 LingWu API 进程**才生效。

---

## 2. 方式 A：本地直接运行（推荐，最简单）

### 第 1 步：配置 `.env`（API 与 worker 共用）

编辑根目录 `.env`，把以下两行取消注释并填写：

```bash
# 同一随机密钥：LingWu API 与浏览器 worker 必须一致（至少 32 字符）
WORKER_TOKEN=换成你自己的随机字符串，至少32位，例如 Cqm4Xp2vL9aR1hN8sT6uW5yB3dF7gJ0k
BROWSER_WORKER_URL=http://127.0.0.1:8790
```

> 生成随机密钥最省事的方式，在终端执行：
>
> ```bash
> openssl rand -base64 32
> ```
>
> 把输出结果整段粘贴到 `WORKER_TOKEN=` 后面即可。

### 第 2 步：安装 Chromium（仅首次需要）

```bash
pnpm --dir apps/worker exec playwright install chromium
```

### 第 3 步：启动 worker

```bash
pnpm dev:browser
```

看到类似 `listening on http://127.0.0.1:8790` 的日志即启动成功。**保持这个终端开着**，不要关闭。

### 第 4 步：重启 LingWu API

另开一个终端，重启你的 API 启动命令（通常为 `pnpm dev`），让 `.env` 新配置生效。

---

## 3. 方式 B：Docker Compose 运行（与容器部署一致）

适合不想在本机装 Chromium、或后续要部署到服务器的情况。

### 第 1 步：配置 `.env`（同上一步）

同样需要 `WORKER_TOKEN`（随机、至少 32 字符）与 `BROWSER_WORKER_URL=http://127.0.0.1:8790`。

### 第 2 步：启动 worker 容器

```bash
docker compose -f infra/compose.yaml up --build -d
```

`browser-worker` 服务构建自 `apps/worker/Dockerfile`，镜像内含与 Playwright 匹配的 Chromium；配置文件里已把 `8790` 端口只绑定到本机回环地址 `127.0.0.1`，外部无法访问。

### 第 3 步：验证

```bash
curl http://127.0.0.1:8790/health
```

返回 `{"status":"ok"}` 即服务正常。

浏览器会话数据（登录态、下载的 PDF）保存在 Docker 卷 `browser-profiles` 中，重启容器不丢失。

---

## 4. 验证是否生效

在 LingWu 聊天中发送一条需要读网页的指令，例如：

> 打开 https://example.com，把页面主要内容总结给我

观察行为是否符合预期：

| 预期表现 | 说明 |
| --- | --- |
| 回复中开始使用 `browse_web` 工具，并给出页面全文内容 | 配置成功 |
| 明确回复「Full-page browsing is not configured」或类似提示 | worker 未连接，检查第 2、4 步 |
| 模型只说「我搜到……摘要」但不打开页面 | worker 未配置的降级行为 |
| API 日志出现 `Browser worker is unavailable` | worker 没启动，或 `WORKER_TOKEN` 不一致 |

---

## 5. 停止与恢复

- **停用 worker**：回到运行 `pnpm dev:browser` 的终端按 `Control-C`；再把 `.env` 里 `BROWSER_WORKER_URL` / `WORKER_TOKEN` 重新注释掉，重启 API。系统自动回到「仅搜索摘要」模式。
- **Docker 方式停止**：`docker compose -f infra/compose.yaml down`（加 `-v` 会删除浏览器会话数据）。

## 6. 常见问题

| 问题 | 处理 |
| --- | --- |
| `Browser worker is not configured` | `.env` 的 `BROWSER_WORKER_URL` / `WORKER_TOKEN` 未同时配置或 API 未重启 |
| `UNAUTHORIZED (401)` | worker 与 API 的 `WORKER_TOKEN` 不一致 |
| 某些网站打不开 / 报 `BLOCKED_URL` | worker 出于安全只允许访问公网 80/443 端口，私网/保留地址一律拒绝 |
| 网页需要登录才能看 | worker 会保存会话 Cookie（本地 `.lingwu/browser-profiles` 或 Docker 卷），重新打开同一会话可保持登录 |

## 7. 安全注意

- `WORKER_TOKEN` 属于密钥：只放在 `.env` 和服务端，**绝不要发给浏览器或手机客户端**。
- worker 的持久化目录包含敏感浏览状态（登录态、PDF），与文档库同等保护级别。
- worker 是应用级出口策略而非内核防火墙，仅限可信任的开发/自托管环境使用。