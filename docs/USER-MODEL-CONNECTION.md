# 个人大模型连接（DeepSeek 首期）

配置入口位于「我的 → 设置 → 大模型连接」。工作台和对话输入框左下角提供模型下拉选择，显示当前模型名称（如 DeepSeek-Flash）；这里只列出当前账号或服务端已配置的模型。「管理模型」可跳转到个人模型设置。

## 用户配置流程

1. 「模型厂商」下拉列表选择厂商，首期开放 DeepSeek。
2. 「模型」下拉列表随厂商联动，首期提供 DeepSeek-Flash 与 DeepSeek-V4-Pro，默认选中平台默认模型。
3. 填写该厂商的 API Key。已有密钥时，留空表示保持不变。
4. 可先「测试连接」，再「保存并启用」。支持移除个人连接并恢复部署默认模型。

BASE_URL、模型 ID 及协议参数由服务端公共目录统一管理，不要求用户输入。模型厂商目录定义在 `apps/server/src/models.ts`；`personal` 元数据控制是否开放个人密钥接入。前端的两个下拉列表由服务端返回，新增厂商无需新增一套表单。新增厂商时仍需配套相应调用协议的运行时适配器，不能把非兼容协议直接接入 Chat Completions。

「测试连接」请求厂商模型目录 `/models`，确认目录可访问并包含所选模型，不保存、不生成内容。它不保证账号余额、模型推理或工具调用一定成功。「保存并启用」再次验证当前选择，失败不覆盖旧配置。

新对话轮次和新执行的模型后台任务使用保存的配置，已运行的轮次沿用启动时的配置。工作台、对话输入框以及应用与能力中的原模型选择器复用账号隔离逻辑，不能修改所有人的共享模型。选中后立即更新输入框显示，并保存为当前账号的模型偏好；切换失败保留原选择。

## 配置分层与存储

| 层级 | 内容 | 存放位置 |
| --- | --- | --- |
| 平台公共配置 | 厂商标识、名称、协议、模型目录与默认模型、BASE_URL | `modelProviders` 目录及服务端环境变量 |
| 用户连接 | 厂商、所选模型 ID 引用、加密 API Key、更新时间 | `records(owner, credentials, model:<provider>)` |
| 用户模型偏好 | 当前 `provider/model-id` 引用 | `records(owner, settings, model)` |

用户记录不复制 BASE_URL 或基础模型参数。当前登录会话决定 owner，客户端不能指定其他 user。共享目录更新后，用户凭证仍然独立，新请求使用统一的厂商配置。

数据库复用现有 Store，不新增数据库实例或迁移表。默认本地持久化路径为 `.lingwu/postgres`，配置 `DATABASE_URL` 后使用外部 PostgreSQL。

密钥复用 AES-256-GCM 加密能力，依赖 `TOKEN_ENCRYPTION_KEY`（32 字节随机值的 Base64）。接口不回传密钥或密文，前端不写浏览器持久化存储。每次调用独立构造模型客户端，不修改 `process.env` 或共享 `config.model`；对话、后台任务和独立任务 worker 均按 owner 解析。

## 接口

- `GET /api/model/settings?provider=deepseek`：返回公共厂商/模型目录、配置来源和该用户是否保存密钥等安全信息。
- `POST /api/model/settings/test`：验证当前厂商、模型和密钥，不落库。
- `PUT /api/model/settings`：保存 `{provider, model, apiKey?}`，不接受 BASE_URL 或自定义参数。
- `DELETE /api/model/settings?provider=deepseek`：移除当前用户在该厂商的凭证。
- `GET /api/models`、`POST /api/model`：读取和切换当前账号的可用模型。

## 部署配置

必须使用 `AGENT_BACKEND=model` 并配置 `TOKEN_ENCRYPTION_KEY`。公共模型目录中的默认模型来自 `MODEL`（当前厂商匹配时），DeepSeek 地址来自 `DEEPSEEK_BASE_URL`，未设置地址时使用 `https://api.deepseek.com/v1`。用户没有个人连接时继续使用部署默认模型及服务器密钥；配置个人连接后无需依赖服务器的厂商 Key。

用户不可通过请求覆盖厂商地址或注入其他厂商，接口严格校验公共目录中的模型。生产地址要求 HTTPS，管理员负责维护可信厂商地址。验证和推理请求均不跟随重定向，避免凭证被转发；网关错误原文不会进入接口响应或模型错误记录。

旧版全局模型选择保留为启动默认以兼容旧数据，新选择全部按账号保存。

## 验证范围

覆盖接口认证、用户隔离、共享厂商参数、密钥加密与不回显、失败不覆盖旧配置、未知厂商/模型及地址注入拒绝、重启保留和恢复默认。模拟 Chat Completions 服务验证并发用户对话与后台任务分别使用自己的 Key 和模型引用。

DeepSeek 初始目录与默认模型参考官方文档：https://api-docs.deepseek.com/en/
