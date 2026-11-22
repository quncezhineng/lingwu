# hithink-finance CLI 简介与首次接入

官方 CLI 适合终端、Agent 命令执行、批量落盘和本地 DuckDB 工作流，包内自带 14 个领域与共享 Skills。本页覆盖安装前准备和首次接入；完成后由宿主根据内置 Skill 的 description 直接选择业务域。

## 1. 环境与版本

```bash
node --version
npm --version
```

需要 Node.js `^22.13.0 || >=24.0.0`，推荐 Node 24。先检查 PATH 中是否已有 `hithink-finance`；已安装时读取实际版本，复用现有安装和当前有效凭据。

本指引的 OAuth 与 Skills 流程面向 CLI 0.2.0 及以上版本。文档版本不代表 npm 已发布该版本；以 registry 和安装副本的实际版本为准。

## 2. 安装并确认命令可用

用户已选择 CLI 后执行：

```bash
npm install -g @hithink-tech/hithink-finance-cli
hithink-finance --version
```

安装成功后核对可执行命令、版本和运行时。`EACCES`、PATH、registry 或 `E404` 问题按原始错误定位；不要用目录存在、源码安装或打包成功代替正式包安装验证。旧版本需要升级时，先确认 registry 中有目标版本，再按用户授权更新。

## 3. 首次登录：默认推荐 OAuth

先读取本地状态：

```bash
hithink-finance auth status --format json
```

- 已连接时退出 0，stdout 返回 `ok=true` 和 `data.connected=true`，沿用 `data.active_method`。
- 未连接时退出 3，stdout 仍返回 `ok=true` 和 `data.connected=false`；这是需要登录的状态。
- 读取或存储失败时，从 stderr 的 `ok=false` 信封读取 `error.code` 与指引。状态检查不联网、不刷新或写入凭据。

CLI 默认推荐 OAuth。首次登录或当前 OAuth 失效时使用：

```bash
hithink-finance auth login --method oauth
```

在用户可见的浏览器中完成授权。Agent 或宿主负责打开链接时使用：

```bash
hithink-finance auth login --method oauth --background --no-browser
```

该命令在后台回调任务就绪后输出授权 URL；由用户或宿主打开一次，再轮询 `auth status` 等待完成。授权 URL 只用于本次登录，不保存到日志、文档或 Git。

用户明确选择 API Key 时，先复用环境变量或用户级凭据文件；人工终端使用 `auth login --method api-key` 隐藏输入，Agent 通过执行器的标准输入传入 Key。创建与持久配置见 [API Key 指引](api-key-onboarding.md)，通过 stdin 登录：

```bash
hithink-finance auth login --method api-key --api-key-stdin
```

CLI 使用同一系统用户、同一服务环境下的共享认证文件。成功登录会保存并启用新凭据；后续调用复用当前有效凭据。

## 4. Skills 同步与宿主发现

安装脚本默认将包内 Skills 同步到共享目录，并链接到已检测到的 Agent。检查结果：

```bash
hithink-finance skills status --format json
```

查看 `strategy`、`content` 和当前 Agent 对应的 `targets`。`ready` 表示文件及链接验证通过，不代表当前会话已经加载；按客户端要求刷新或新建会话。

如果安装使用了 `--ignore-scripts`，或当前 Agent 尚未检测到，先确认保存策略，再按实际目标同步：

```bash
hithink-finance skills sync --help
hithink-finance skills sync --agent <实际Agent标识> --format json
```

显式目标会追加并保留已有选择。只同步当前或用户指定的 Agent；用户已禁用自动同步时保留其选择。未知同名目录、用户占用或权限冲突按 `skills status` 的详情处理，不手工覆盖。

如果宿主暂时无法刷新，可从 `canonical` 路径读取包内各 Skill 的 name/description，选中后读取目标入口与 reference。共享规则和安装后的维护由内置 `hithink-finance-shared` 提供。

## 5. 首次接入验证

```bash
hithink-finance doctor --format json
hithink-finance auth status --format json
hithink-finance symbol search --q 600519 --limit 1 --format json
```

`doctor` 和本地登录状态检查完成后，再用一个有界真实请求验证当前凭据。只有业务命令退出码 0、信封 `ok=true` 且返回真实结果，才说明远端访问已验证；本地状态、帮助或文件出现不能代替业务验收。

报告实际安装版本、认证方式、当前 Agent 的 Skill 文件状态和有界请求结果。后续业务由宿主根据 CLI 内置 Skills 的 description 直接选择领域。
