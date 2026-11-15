# PRD: LingWu 对标 OpenBot 的架构与功能借鉴

> 版本：v0.1 | 日期：2026-11-15 | 作者：产品经理 | 状态：Draft
>
> 关联文档：`PRD-LingWu-个人投研智能体.md`（v1.0，产品主线）、《OPENBOT-INTEGRATION.md》（CopilotKit/OpenBot 集成边界，注意与本文的 nightly-labs/openbot 是不同项目）

---

## 0. 文档说明

本文档基于对 **nightly-labs/openbot**（GitHub 7.7k stars，Electron + SolidJS + Bun，最新 v0.71.0）的源码级分析，输出一份**以「从 openbot 借鉴」为核心目标**的 LingWu 产品需求框架。与既有 `PRD-LingWu-个人投研智能体.md` 的关系是**并存而非替代**：旧 PRD 定「做什么（投研产品主线）」，本文定「怎么做得更好（借力 openbot 的架构与产品经验）」。

> 注意区分两个 "OpenBot"：
> - **nightly-labs/openbot**：本文分析对象，local-first 桌面工作区，管理持久化 AI 队友（Codex/Claude/Grok 等）。
> - **CopilotKit/OpenBot**：仓库内 `OPENBOT-INTEGRATION.md` 已分析的另一套代码（AG-UI / CopilotKit runtime 集成）。
> 两者技术栈、架构、协议均不同，借鉴结论需分别对待。

---

## 1. 项目概述与目标

### 1.1 定位

LingWu 是**个人投研智能体**：带浏览器、终端与文件，持续工作的 AI 投研助手，兼容任意智能体框架（当前基于 CopilotKit + AG-UI）。

### 1.2 本版目标（openbot 对标维度）

在「投研产品主线」之上，从 openbot 借鉴三件事：

| 目标 | 说明 | 借鉴来源 |
| --- | --- | --- |
| **多智能体协作** | 从「单个通用投研 Agent」演进为「多专家 Agent + 显式委托」 | openbot 的 agent-to-agent 消息、任务 owner、共享工作区 |
| **持久化与可恢复** | 任务中断可恢复、长对话自动压缩、崩溃安全 | openbot 的 FIFO 队列 + SQLite 投影 + compaction |
| **安全与进程隔离** | 浏览器/终端与主进程隔离，能力按需授权 | openbot 的 preload 桥 + 沙箱化 WebContentsView |

### 1.3 成功标准（增量）

| 指标 | 目标 | 说明 |
| --- | --- | --- |
| 多 Agent 协作任务完成率 | ≥ 90% | 委托型投研任务（研究员→分析师→汇总） |
| 任务中断恢复成功率 | ≥ 99% | 断网/重启后任务可从断点续跑 |
| 单次会话上下文窗口浪费率 | 下降 40% | 通过 compaction 压缩历史 |
| 第三方工具接入耗时 | ≤ 1 天 | 通过 MCP/Skill 机制 |

---

## 2. 目标用户与使用场景

（沿用旧 PRD 的用户画像，此处只补充 openbot 带来的新场景）

### 2.1 目标用户（复用）

价值投资者、趋势交易者、基金/ETF 投资者、研究型投资者（详见旧 PRD §2.2）。

### 2.2 openbot 启发的增量场景

| 场景 | 描述 | 借鉴点 |
| --- | --- | --- |
| **多专家协同研究** | 用户发起「研究比亚迪」→ 自动拆分为：宏观分析师 + 行业研究员 + 财报分析师并行/串行协作，产出合成研报 | 多 Agent 协作 + 任务队列 |
| **断点续跑** | 深夜跑深度研究任务中途断网，次日自动从上次进度继续 | 持久化队列 + SQL 租约恢复 |
| **团队共享工作区** | 用户与同事共享一个「研究空间」，各自 Agent 读写共享文件、互相 @ 委托任务 | 共享目录 + 消息传输清单 |
| **一键接入第三方数据源** | 用户从市场安装「东方财富数据」「同花顺行情」等 MCP 插件 | Marketplace + MCP 集成 |
| **远程盯盘** | 用户手机通过扫码连回家里/云上的 LingWu 实例，实时查看 Agent 工作 | 移动端 + WebRTC 远程 |

---

## 3. 核心功能清单

### 3.1 现有能力（复用旧 PRD）

Chat（AG-UI 流式）、Agent computer（持久化 Chromium + Linux 沙箱）、Activity（耐久任务）、Ideas、Goals、Documents（PDF 管线）、Finance、Gmail/Calendar、Personal context、Rich Threads。

### 3.2 openbot 借鉴的新增能力清单

| 功能 | 优先级 | 描述 | openbot 对应 |
| --- | --- | --- | --- |
| **多 Agent 委托协作** | P0 | 多专家 Agent 并行/串行协作，显式委托与任务 owner | agent-to-agent 消息 + 任务 owner |
| **FIFO 任务队列 + 断点恢复** | P0 | 消息排队、暂停/恢复/取消、崩溃安全持久化 | 事件日志 + SQLite 投影 + SQL 租约 |
| **长对话自动压缩** | P1 | 窗口耗尽前自动 compaction | 上下文监控 + compaction |
| **共享工作区** | P1 | Agent 间共享文件目录，带所有权/校验元数据 | `~/OpenBot/Shared` + `.openbot-transfer.json` |
| **Skill 市场 / 本地技能** | P1 | 可复用工作流技能（SKILL.md 格式），本地库 + 市场 | Marketplace + Skills |
| **MCP 插件接入** | P1 | 第三方数据/工具接入，工具调用需授权 | MCP OAuth + tool consent |
| **移动端远程接入** | P2 | 手机扫码连回实例，远程查看/控制 | Expo 移动端 + QR 扫码 |
| **远程桌面 / 浏览器接管** | P2 | 用户随时接管 Agent 的浏览器会话 | 浏览器控制 + Take control |

---

## 4. 技术架构方案

### 4.1 LingWu 现状架构

```
apps/
├── server/      # Hono 服务端，AG-UI 流式，SQL 租约恢复
├── worker/      # Playwright 浏览器 worker（持久化 Chromium）
├── computer/    # Agent 电脑（浏览器 + 可选 Linux 沙箱）
└── mobile/      # CopilotKit React Native（iOS/Android/Web）
packages/
├── backends/    # OpenBotAdapter 等后端适配
├── domain/      # 领域模型
└── integrations/ # 集成层
```

技术栈：TypeScript + Hono + CopilotKit 1.70.1 + AG-UI 0.0.59 + PGlite/PG + Playwright + Expo + Biome。

### 4.2 openbot 架构对照

| 维度 | openbot | LingWu 现状 | 差距/借鉴 |
| --- | --- | --- | --- |
| 客户端形态 | Electron 桌面（main + renderer） | Server + Web/Mobile | LingWu 是 B/S，天然更适合远程 |
| Agent 运行时 | 多提供商 CLI（Codex/Claude/Grok） | CopilotKit 智能体 | openbot 的「多提供商会话绑定」值得借鉴 |
| 存储 | SQLite 事件日志 + 读投影 | PGlite/PG | 事件溯源思想可借鉴（见 §6.2） |
| 进程隔离 | preload 类型化桥 + 沙箱 | worker 进程隔离 | LingWu 已隔离，可强化能力授权 |
| 远程传输 | WebRTC + Signal + coturn | HTTP/WS | 远程桌面/流式屏幕可借鉴 WebRTC |
| 扩展机制 | Marketplace + MCP + Skills | MCP SDK 已有 | 缺 Skill 市场与工具 consent |

### 4.3 借鉴后的目标架构

```
┌─────────────────────────────────────────────────────┐
│                    接入层（客户端）                    │
│   Web (React)  │  Mobile (RN)  │  远程 WebRTC 接管      │
└──────────────────────┬──────────────────────────────┘
                       │ AG-UI / WS / WebRTC
┌──────────────────────▼──────────────────────────────┐
│                  LingWu Server (Hono)                 │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐  │
│  │ 多 Agent 编排 │ │ 任务队列/租约 │ │ 事件日志/投影 │  │
│  │ (委托+owner) │ │ (FIFO+恢复)  │ │ (SQLite/PG)  │  │
│  └──────┬───────┘ └──────────────┘ └──────────────┘  │
│         │  MCP / Skill / Tool Consent 授权层          │
└─────────┼────────────────────────────────────────────┘
          │
   ┌──────▼───────┐  ┌────────────┐  ┌──────────────┐
   │ Browser Worker│  │ Linux 沙箱 │  │ 数据/模型适配 │
   │ (Playwright) │  │ (computer) │  │ (多提供商)   │
   └──────────────┘  └────────────┘  └──────────────┘
```

---

## 5. 功能优先级与迭代规划

### 5.1 迭代路线

| 阶段 | 时间 | 目标 | 关键功能 |
| --- | --- | --- | --- |
| **M1（借鉴基础）** | 2 周 | 任务可靠性与恢复 | FIFO 队列、SQL 租约恢复、断点续跑 |
| **M2（多智能体）** | 3 周 | 多 Agent 协作 | 委托协作、任务 owner、共享工作区 |
| **M3（扩展机制）** | 3 周 | 生态可扩展 | MCP 工具 consent、Skill 市场、本地技能库 |
| **M4（体验增强）** | 持续 | 移动与远程 | 长对话压缩、远程接管、移动端远程接入 |

### 5.2 优先级原则

- **P0**：多 Agent 委托协作、FIFO 队列 + 断点恢复 —— 直接决定「投研 Agent 是否可信、能否跑长任务」。
- **P1**：长对话压缩、共享工作区、Skill/MCP —— 决定生态与规模化。
- **P2**：远程桌面/移动远程 —— 决定使用半径，后置。

---

## 6. openbot 可借鉴项明细（含落地建议）

> 每项均说明：**解决什么问题 → 为何适合 LingWu → 如何落地**。

### 6.1 多 Agent 委托协作 + 任务 owner

- **解决什么问题**：单个通用 Agent 难以同时做好「宏观判断 + 个股研究 + 财报分析」，任务拆解与结果汇总需要编排。
- **为何适合 LingWu**：投研天然是「多角色协作」场景（研究员→分析师→汇总），openbot 的「显式委托 + 任务 owner + 共享历史」模型可直接映射到投研工作流。
- **如何落地**：在 server 引入 `AgentOrchestrator`，支持把一次投研任务拆为子任务派给不同专家 Agent，维护 `task owner` 与共享 thread 历史；沿用现有 AG-UI 协议，子 Agent 输出流式回传汇总 Agent。

### 6.2 事件日志 + 读投影 + SQL 租约恢复

- **解决什么问题**：长任务（深度研究、定时简报）中途崩溃/断网即前功尽弃，用户不敢交给 Agent 跑重活。
- **为何适合 LingWu**：LingWu 已有「耐久任务引擎」与 SQL 租约（README 明确「SQL leases recover interrupted work」），但可借鉴 openbot 的**事件溯源（event log）**思想，把「状态」改为「可重放的事件序列」，恢复更彻底、审计更清晰。
- **如何落地**：将 Activity 任务引擎的事件持久化从「快照式」升级为「追加式事件日志 + 读投影」，恢复时重放事件；复用现有 PGlite/PG，无需换库。

### 6.3 每 Agent 独立持久化工作区 + 共享目录

- **解决什么问题**：多 Agent 之间文件互相污染，无边界；协作时又缺少共享出口。
- **为何适合 LingWu**：LingWu 的 computer 已有「可选 Linux 沙箱 + 可编辑工作区文件」，可进一步按 Agent 隔离目录，并加一个 `Shared` 目录用于协作，附所有权 + SHA-256 元数据（openbot 的 `.openbot-transfer.json`）。
- **如何落地**：在 computer 文件系统层为每个 Agent 建独立 `workspace/<agent-id>`，新增 `Shared/` 目录；文件传输写入 manifest（owner/recipient/size/sha256），供审计与去重。

### 6.4 长对话自动压缩（compaction）

- **解决什么问题**：投研对话动辄上百轮（查数据、看财报、追新闻），很快耗尽模型上下文窗口，Agent 变笨或报错。
- **为何适合 LingWu**：投研会话天然长且信息密度高，压缩历史是刚需；openbot 在「窗口耗尽前自动压缩」的时机控制值得借鉴。
- **如何落地**：在 server 的线程管理中加入 token 预算监控，接近上限时触发 summarization/compaction，保留关键结论与数据引用，丢弃冗余过程。

### 6.5 MCP 工具调用授权（tool consent）

- **解决什么问题**：Agent 接入第三方工具（数据源、交易接口）后可能误操作，需「注意力注册表」式的人为确认。
- **为何适合 LingWu**：投研 Agent 未来会接「行情、交易、通知」等高敏感工具，openbot 的 `test:mcp-tool-consent` 展示了「工具同意流」的成熟做法。
- **如何落地**：在 MCP 工具调用链路前加 consent 层，对高敏感工具（写操作、资金相关）强制人工确认，低风险只读工具免确认；记录审批日志。

### 6.6 Skill 市场 + 本地技能库（SKILL.md）

- **解决什么问题**：用户/团队沉淀的可复用工作流（如「财报分析 SOP」「打新流程」）无法跨会话、跨人复用。
- **为何适合 LingWu**：投研方法高度可模板化，Skill 化后一键复用；LingWu 仓库已有 `skills/` 目录（302 个 md），说明已认同 Skill 机制，可借鉴 openbot 的 `SKILL.md + example-prompt` 格式与工具集（`create_skill`/`install_local_skill` 等）。
- **如何落地**：标准化 `skills/` 为 openbot 兼容的 `SKILL.md` 结构，暴露 skill 管理工具给 Agent，支持本地库 + 未来市场分发。

### 6.7 移动端远程接入 + 扫码登录

- **解决什么问题**：投研 Agent 跑在电脑/云上，用户出门后无法查看进度、接管操作。
- **为何适合 LingWu**：LingWu 已有 Expo 移动端，天然适配；openbot 的「QR 扫码登录 + WebRTC 远程」可直接复用思路，让手机连回实例。
- **如何落地**：在 mobile 端加「扫码连接本地/云实例」能力，WebRTC 通道复用 openbot 的传输经验（直接 DataChannel，失败走 coturn），用于实时查看 Agent 浏览器画面与任务进度。

### 6.8 进程隔离 + 类型化 preload 桥（安全）

- **解决什么问题**：Agent 能力越强（浏览器、终端、文件），越需要隔离，防止误操作/注入影响宿主。
- **为何适合 LingWu**：LingWu 已把浏览器/终端放到独立 worker/computer 进程，方向正确；可借鉴 openbot「渲染进程永不暴露为公开网站、只暴露类型化 API」的边界纪律，以及「禁止 `--no-sandbox`」的硬约束。
- **如何落地**：梳理 worker/computer 的 IPC/协议边界，只暴露类型化能力接口（类似 openbot 的 `window.openbot`），杜绝裸 shell 透传；CI 加 sandbox 断言。

---

## 7. 风险与开放问题

| 风险/问题 | 说明 | 建议 |
| --- | --- | --- |
| 多 Agent 编排复杂度 | 委托 + owner + 共享历史引入一致性挑战 | M2 先做「串行委托」，并行后置 |
| 事件溯源改造成本 | 现有任务引擎改为事件日志需迁移 | 先并行双写，灰度切换 |
| openbot 许可证 | nightly-labs/openbot 为 PolyForm Noncommercial，商业用需授权 | 只借鉴设计思路与协议，不复制代码 |
| 远程传输安全 | WebRTC/Signal 需自托管 | 参考 openbot self-hosting 组件，先 loopback + 内网 |
| 上下文压缩误删关键信息 | compaction 可能丢引用 | 保留结构化摘要 + 可回溯索引 |

---

## 8. 附录

- 分析对象：`nightly-labs/openbot` @ v0.71.0（Electron + SolidJS + Bun + TypeScript）
- 关键协议：ACP（多提供商 CLI）、WebRTC v3、AG-UI（LingWu 侧）
- 关联仓库文档：`OPENBOT-INTEGRATION.md`（CopilotKit/OpenBot，注意区分）
