# PRD：灵悟 · 主动服务与信任架构

> 版本：v1.0 ｜ 日期：2026-11-26 ｜ 作者：产品经理 ｜ 状态：Draft
>
> 输入：《个人投研智能体_PRD_v1.0.docx》（2026 新加坡金融科技节演讲整理：从会话式 AI → 助理 Agent → 主动提醒式 Personal Agent）
>
> 承接文档：[PRD-LingWu-个人投研智能体.md](PRD-LingWu-个人投研智能体.md)（功能面）、[PRD-产品优化-从投研助手到盯盘的同事.md](PRD-产品优化-从投研助手到盯盘的同事.md)（形态重心）、[PRD-灵悟-个人投研智能体-8P进化.md](PRD-灵悟-个人投研智能体-8P进化.md)（体验与闭环）、[PRD-多Agent记忆系统.md](PRD-多Agent记忆系统.md)（记忆底座）

---

## 1. Summary

灵悟已经有「主动提醒」的骨架：事件接入、两级判级（规则 + 轻量模型）、信息流、降噪冷却、论点证据绑定、可解释判级依据。但它还没回答两个更基础的问题：

1. **凭什么提醒我？** —— 系统不知道用户的投资目标、期限、风险偏好、目标配置区间，所以「偏离」「到期」「首次亏损」这些真正有价值的触发条件没有基准可算。
2. **提醒之后能不能动手？** —— 系统没有一份用户签署过的授权清单，也没有把「建议」与「动作」分开的议案对象，更没有在内容发出去之前的合规门。

本文档补的就是这两块地基，包含六个新对象/机制与三条进阶能力。**不新增"更多研究功能"，而是让已有的主动能力获得合法性与可审计性。**

一句话定位：**从"会主动说话的助手"，升级为"有档案、有授权、有议案、有留痕的受托助理"。**

---

## 2. Background and Evidence

### 2.1 docx 给出的三段演进

| 阶段 | 触发方式 | 能力特征 | 价值定位 |
| --- | --- | --- | --- |
| 会话式 AI | 客户主动提问 | 检索、解释、问答 | 让信息更容易获得 |
| 助理型 Agent | 顾问或客户下达任务 | 接收任务、调用工具、整理结果 | 减少重复劳动 |
| **主动型 Personal Agent** | **市场、账户、客户状态或日历事件触发** | **持续监测、识别变化、主动提醒、组织后续服务** | **从被动响应转为持续陪伴** |

灵悟目前处在第 2 段到第 3 段的中间：**触发能力有了，但触发所需的"客户状态"是空的。**

### 2.2 docx 反复强调的五条产品底线

这五条不是免责声明，而是产品机制，本文档逐条落地：

| # | 底线 | 本文档对应 |
| --- | --- | --- |
| 1 | 主动服务由客户授权决定（数据类别/用途/渠道/频率/有效期，可撤回） | **A3 授权中心** |
| 2 | Agent 只访问完成当前任务所需的数据，默认禁止跨用户读取 | A3 + 现有 owner 隔离 |
| 3 | 高影响动作保留人工判断与客户确认 | **A5 投研议案** |
| 4 | 每个结论可追溯、每个提醒可解释、每个重要动作可审计 | A6 合规门 + 现有判级 `reasons` |
| 5 | 尊重免打扰时段、渠道偏好、频率上限与关闭设置 | **A4 事件源扩展** + A3 渠道授权 |

### 2.3 现状与差距（代码级证据）

| 能力 | 现状 | 证据 | 差距 |
| --- | --- | --- | --- |
| 事件两级判级 | ✅ 已实现 | [event-triage.ts](../apps/server/src/engine/event-triage.ts)：`prefilterEvent` 一级过滤 + `judgeEvent` 加权打分，`PUSH_SCORE=60` / `FEED_SCORE=35`，每条带 `reasons` | 判级维度只有"持仓权重 / 自选 / 论点 / 幅度 / 到期天数" |
| 免打扰 | 🟡 只有"非交易时段" | [service.ts](../apps/server/src/engine/service.ts) 注入 `quiet: (_owner, now) => isMarketClosed(now)` | **没有用户级免打扰时段**（如 22:00–08:00），也没有渠道偏好 |
| 事件类型 | 🟡 7 类 | [investor.ts](../packages/domain/src/investor.ts) `EVENT_TYPES`：价格异动、价格阈值、论点受威胁、财报、新闻、公告、估值 | **缺"到期""配置偏离""首次亏损"** |
| 个人档案 | 🔴 无 | 只有 `memories` 文本片段 | 无结构化投资目标/期限/风险偏好/可信状态 |
| 目标配置区间 | 🔴 无 | [agent.ts](../packages/domain/src/agent.ts) `portfolioSchema` 只有 `name/base_currency/benchmark` | **没有 `InvestmentPolicy`，"偏离"没有基准** |
| 配置偏离分析 | 🔴 名存实亡 | `build_portfolio_rebalance` 只出现在 [agent-market-instructions.ts](../apps/mobile/src/agent-market-instructions.ts#L643) 的提示词里 | 服务端**无对应工具、无 API、无 UI** |
| 组合分析 | 🟡 基础 | [portfolios.ts](../apps/server/src/engine/portfolios.ts) 有 `by_currency/by_symbol/by_sector` 配置切片；[portfolio-risk.ts](../apps/server/src/engine/portfolio-risk.ts) 有 Beta/Sharpe/回撤 | 无集中度指标（HHI/CRn）、无相关性矩阵、无情景压力测试 |
| 到期事项 | 🔴 无 | 全仓库无到期日字段与监测 | 高价值、低成本的一类事件完全缺失 |
| 授权中心 | 🔴 无 | 只有连接器连接状态（[catalog.ts](../apps/server/src/connectors/catalog.ts) 三层权限是**工具调用级**，不是**授权级**） | 无 Consent 对象、无数据类别/用途/有效期维度 |
| 议案/审核 | 🟡 可复用壳 | [actions.ts](../apps/server/src/actions.ts) `ActionProposal` 已有 `awaiting_review → executing → succeeded/failed` + 幂等键 + hash，但 `kind` 仅 `email.send` / `calendar.*` | 无投研议案类型（调仓草案、资料更新、外部研究） |
| 交付物状态机 | 🟡 只有类型 | [index.ts](../packages/domain/src/index.ts#L86-L96) 定义了 `Deliverable{status: draft/approved/shareable/archived}`，[workspace.ts](../apps/server/src/workspace.ts) 只读列出；**服务端没有 CRUD 路由**（[app.ts](../apps/server/src/app.ts) 未挂载） | A5 议案需要它做承载物，需补齐或合并 |
| 合规门 | 🔴 无 | 无敏感字段识别、无脱敏、无违禁表述检测 | A6 全部缺失 |
| 论点证据 | ✅ 已实现 | `thesisSignal` 支持 price / change_pct / keyword / financial，缺数据判 `pending_confirmation` | 可作为"论点受威胁"的信号源，无需重做 |

**结论**：灵悟缺的不是"判定引擎"，而是**判定所需的三类输入（档案 / 授权 / 基准）**，以及**判定输出之后的承载物（议案 / 合规门）**。

---

## 3. 产品定位与设计原则

### 3.1 三个新对象，一条主线

```
档案 (Profile)          →  知道用户是谁、约束是什么
   ↓
授权 (Consent)          →  知道允许我读什么、推什么、动什么
   ↓
触发 (Event)            →  在授权范围内持续比对档案与事实
   ↓
议案 (Proposal)         →  把"建议"变成有待审的物件，而不是一句话
   ↓
合规门 (Gate)           →  发出去之前过一遍红线
```

### 3.2 设计原则

1. **档案只写用户确认过的事实**：模型可以"提议更新"，但不能静默改写风险偏好这类高影响字段（docx 明确要求）。
2. **授权按维度拆分**：类别 × 用途 × 渠道 × 频率 × 有效期，五维独立可撤回；不做"一键全开"。
3. **议案默认草稿**：任何对外/写入动作先落 `draft`，`approved` 只能由人触发。
4. **提醒必须解释**：每条提醒都要能回答"为什么是现在、为什么和我有关、数据什么时候的"。
5. **缺数据就说缺数据**：沿用现有 `pending_confirmation` 与 `missing[]` 的设计，不补造结论。
6. **全部复用 `records` JSONB**：不新建数据库、不做迁移重建，与现有 owner 隔离一致。

---

## 4. Functional Requirements

### 优先级总览

| ID | 需求 | 优先级 | 复用点 |
| --- | --- | --- | --- |
| A1 | 个人投资档案（InvestmentProfile） | P0 | records / 设置页 |
| A2 | 目标配置区间与偏离检测（InvestmentPolicy） | P0 | portfolios + event-triage |
| A3 | 授权中心（Consent） | P0 | records + 设置页 |
| A4 | 事件源扩展：到期 / 首次亏损 / 配置偏离 | P0 | event-triage 新增候选生成器 |
| A5 | 投研议案与审核状态机（Proposal） | P0 | actions.ts 复用壳 |
| A6 | 合规门：敏感字段 / 脱敏 / 误导表述 / 溯源 | P0 | 新增轻量规则层 |
| A7 | 组合情景分析与集中度 | P1 | portfolio-risk 扩展 |
| A8 | 基金/ETF 穿透与重叠 | P1 | research 新增报告类型 |
| A9 | 多 Agent 分歧与置信度呈现 | P1 | orchestrator 扩展 |
| A10 | 数据分级的模型路由 | P2 | model.ts 扩展 |
| A11 | 投顾工作台（机构双视图） | P2 | 需多租户，暂不做 |

---

### A1（P0）个人投资档案 InvestmentProfile

**用户故事**

> 作为长期价值投资者，我填一次"我投资是为了孩子教育、能接受 20% 回撤、只投 A 股和港股、偏好 ROE>15%"，之后所有研究、提醒、组合分析都应该自动带上这些约束，而不是每次重新交代。

**现状问题**

只有 `memories` 文本片段（`fact/thesis/analysis/decision` 四类），没有结构化、带可信状态的档案；因此：
- 判级不知道"这个标的属于用户关注的范围吗"（现在靠持仓/自选/论点反推，见 `prefilterEvent` 的 `universe`）；
- 研究任务无法携带风险偏好与期限；
- 无法判断"用户问的产品超出其风险承受能力"（docx 1.4 的高风险产品咨询场景）。

**功能行为**

1. **档案字段**（每个字段独立记录 `来源 / 更新时间 / 有效期 / 可信状态`）：

| 分组 | 字段 | 来源 | 是否需确认 |
| --- | --- | --- | --- |
| 目标 | 投资目标（教育/退休/增值/保值）、期限、资金用途 | 用户录入 | 是 |
| 约束 | 风险偏好（保守/稳健/平衡/进取）、可接受最大回撤、禁止行业/地区 | 用户录入 | 是 |
| 范围 | 关注市场（A股/港股/美股）、关注行业、关注风格 | 用户录入 + 从自选推导 | 推导项标注"推断" |
| 习惯 | 常用指标口径、偏好语言、时区、货币 | 用户录入 + 设备推断 | 否 |

2. **可信状态三档**：`user_confirmed`（用户确认）/ `derived`（系统推断，可一键确认）/ `stale`（过期，需复核）。
3. **模型只能提议，不能改写**：模型可产出 `ProfileChangeProposal`（如"你提到偏好低波动，是否更新风险偏好为稳健？"），用户确认后才落库；风险偏好、期限、禁止行业三项**强制确认**。
4. **缺失显式提示**：未填风险偏好时，涉及适当性的分析必须显示"风险偏好未设置，无法判断适当性"，不得自行假设。
5. **入口**：`我的 → 投资档案`；首次引导（onboarding）可作为可跳过的一步。

**数据模型**

```ts
// kind: "investment-profiles", id: "profile"（每账户一份）
interface InvestmentProfile {
  owner: string;
  goals: Array<{
    kind: "education" | "retirement" | "growth" | "preservation" | "other";
    label: string;
    horizonMonths?: number;
    amount?: { value: number; currency: MonitorCurrency };
    source: "user" | "derived";
    confirmedAt?: string;
    updatedAt: string;
  }>;
  risk: {
    appetite?: "conservative" | "balanced" | "assertive" | "aggressive";
    maxDrawdownPercent?: number;
    excludedSectors: string[];
    excludedMarkets: string[];
    source: "user" | "derived";
    confirmedAt?: string;
    updatedAt: string;
    staleAt?: string;          // 过期时间，如测评后 12 个月
  };
  scope: { markets: Array<"CN" | "HK" | "US">; sectors: string[]; style?: string };
  habits: { language?: string; timeZone?: string; currency?: MonitorCurrency };
}
```

**验收标准**

- 档案任一字段可查看"来源 / 更新时间 / 是否确认"，未确认项在 UI 上有明确标记。
- 模型尝试直接改写 `risk.appetite` 一律被服务端拒绝（422），只能走提议流程。
- 研究任务上下文可携带档案（与 8P R3 的画像对接，本需求只提供结构化来源）。
- 档案清空/撤回后，依赖它的分析显示"缺少档案"，不静默降级为默认值。

**复用与落点**

`packages/domain/src/investor.ts` 新增 `InvestmentProfile` schema；`apps/server/src/engine/` 新增 `investor-profile.ts` + 路由挂到已有 `/api/investor`；前端在 `apps/mobile/src/preferences-screen.tsx` 增入口。

---

### A2（P0）目标配置区间与偏离检测 InvestmentPolicy

**用户故事**

> 我设定"股票 60%（±10%）、债券 30%（±8%）、现金 10%"，当股票涨到 72% 时，希望它告诉我"已越过上沿，偏离 12 个点"，并给我一份调仓草案，而不是等我自己发现。

**现状问题**

- [portfolioSchema](../packages/domain/src/agent.ts#L381-L390) 只有 `name/base_currency/benchmark`，**没有目标配置，也没有允许偏离带**；
- 因此"配置偏离"这个 docx 里最高价值的触发源在我们这里无法计算；
- `build_portfolio_rebalance` 只是提示词文本，服务端无实现（见 2.3 证据）。

**功能行为**

1. **策略定义**：每个组合可设一份 `InvestmentPolicy`：按**资产类别 / 行业 / 地区 / 币种**四个维度定义目标权重与允许区间（区间上下限，默认 ±5%）。
2. **基准口径（已定）**：**主口径按市值**，即实际权重 = 当日市值 / 组合当日总市值；**成本口径作辅助**，仅在 UI 提供切换后参与对比，不参与 `breach` 判定。跨币种**不做汇率折算**（沿用现有分币种汇总口径），UI 必须标注"按原币市值占比，未折算"。
   - 理由：目标配置本质是"风险预算"，风险随市值变化而变化；按成本计算会让"涨多了要不要减"这类核心问题失去意义。
3. **偏离计算**：输出 `drift`（实际 − 目标，百分点）、`band`（允许区间）、`status`（`within` / `warning`（越过 80% 带宽）/ `breach`（越界））。
4. **越界触发事件**：`policy_drift` 事件进入 A4 的事件管线，按现有两级判级决定 push/feed/silent。
5. **生成调仓草案**：越界后可生成 A5 议案，必须包含：触发原因、当前 vs 目标配置、偏离度、拟议变化、费用/交易成本提示、主要风险、反方情景。
6. **不做交易**：草案永远不产生买卖指令，只产出"待确认清单"。

**数据模型**

```ts
// kind: "investment-policies", id: portfolioId
interface InvestmentPolicy {
  owner: string;
  portfolioId: string;
  basis: "asset_class" | "sector" | "region" | "currency";
  targets: Array<{
    key: string;              // "equity" / "tech" / "CN" / "CNY"
    label: string;
    targetPercent: number;    // 0..100
    bandPercent: number;      // 允许上下浮动，默认 5
  }>;
  /** 口径声明，前端必须展示 */
  note: string;               // "按原币市值占比，未做汇率折算"
  updatedAt: string;
}

interface PolicyDrift {
  portfolioId: string;
  basis: InvestmentPolicy["basis"];
  /** 数值口径：market=按市值（主口径，参与 breach 判定）；cost=按成本（仅对比展示） */
  valueBasis: "market" | "cost";
  currency?: MonitorCurrency; // 分币种各算一份
  rows: Array<{
    key: string;
    target: number;
    actual: number;
    drift: number;
    status: "within" | "warning" | "breach";
  }>;
  computedAt: string;
}
```

**验收标准**

- 目标权重合计不在 100% 时拒绝保存（允许 ±0.5 容差），并提示差额。
- 越界 `breach` 必然生成一条 `policy_drift` 候选事件，事件里带 `drift` 与 `band`，判级 `reasons` 可展示。
- 无 `InvestmentPolicy` 的组合不产生偏离事件（而不是用默认值假设）。
- 偏离计算对多币种组合分别输出，不混算。
- 切到成本口径时，`valueBasis="cost"` 且 `status` 只作展示用，**不得触发 `policy_drift` 事件**（可测：市值口径 `within`、成本口径 `breach` 时无事件产生）。

**复用与落点**

`portfolios.ts` 已有 `allocation` 切片（`by_symbol/by_sector`），偏离计算直接在其上做；新增 `policy-drift.ts`；API 挂 `/api/portfolios/:id/policy` 与 `/api/portfolios/:id/drift`。

---

### A3（P0）授权中心 Consent

**用户故事**

> 我希望清楚地知道它读了什么、能推到哪里、能替我做什么，并且每项都能单独关掉。比如"允许读持仓做分析，但不允许把持仓明细发到邮件"。

**现状问题**

- 连接器三层权限（可查看 / 需确认后执行 / 不允许）是**工具级**的，回答不了"某类数据能不能用于某类用途、送到某个渠道"；
- 没有授权有效期与撤回记录；
- 因此"主动提醒"缺少合法性依据，也无法实现 docx 的 22:00–08:00 免打扰与渠道控制。

**功能行为**

1. **五维授权**：

| 维度 | 取值示例 |
| --- | --- |
| 数据类别 | `portfolio` / `holdings` / `notes` / `thesis` / `watchlist` / `profile` / `market_data` |
| 用途 | `research`（研究分析）/ `monitor`（持续监测）/ `remind`（主动提醒）/ `external_send`（对外发送） |
| 渠道 | `in_app` / `email` / `push` / `webhook` |
| 频率 | `realtime` / `daily` / `weekly` / `manual_only` |
| 有效期 | 起止时间，可永久但需显式勾选 |

2. **组合授权**：一条 Consent = 一个五维组合。可单独停用/删除，删除后立即失效（下一个判级周期生效）。
3. **默认最小**：新用户默认只有 `in_app` + `research` + `manual_only`；`external_send` 与 `monitor` 必须显式开启。
4. **免打扰时段（已定：账户级 + 设备可覆盖）**：`quietHours { start, end, timeZone }` 与 `dailyPushCap`（每日推送上限）**主设置存于账户级 Consent**；单设备可通过 `deviceQuietOverrides` 覆盖，生效顺序为 **设备级 > 账户级 > 是否开市**。设备级只影响该设备的推送投放，不改变其他设备，也不改变账户的授权状态。
   - 理由：免打扰是"人"的作息（账户级），但确实存在"这台手机晚上不响、平板要响"的场景，用设备覆盖表达比给每个设备各开一份授权更轻。
   - 账户级设置变更对未设置覆盖的设备立即生效；设备级可随时清除以回落到账户级。
5. **使用可回看**：每次主动提醒/读取都记 `consentId`，用户可在"授权详情"里看到"这份授权最近被用了几次、用在哪"。
6. **撤回即停**：撤回后不再产生新的该类事件；已产生的提醒保留但不继续跟进。

**数据模型**

```ts
// kind: "consents", id: uuid
interface Consent {
  owner: string;
  dataScope: Array<"portfolio" | "holdings" | "notes" | "thesis" | "watchlist" | "profile" | "market_data">;
  purposes: Array<"research" | "monitor" | "remind" | "external_send">;
  channels: Array<"in_app" | "email" | "push" | "webhook">;
  frequency: "realtime" | "daily" | "weekly" | "manual_only";
  validFrom: string;
  validTo?: string;              // 缺省=长期，UI 需标注"长期有效"
  quietHours?: { start: string; end: string; timeZone: string };
  dailyPushCap?: number;         // 1..10，缺省 5
  /** 设备级免打扰覆盖（设备优先于账户级），仅影响该设备的推送投放 */
  deviceQuietOverrides?: Array<{
    deviceId: string;
    label?: string;
    quietHours?: { start: string; end: string; timeZone: string };
    dailyPushCap?: number;
    updatedAt: string;
  }>;
  revokedAt?: string;
  createdAt: string;
  updatedAt: string;
}
```

**验收标准**

- 没有 `remind` 用途授权时，任何 `push` 决策自动降级为 `feed`（沿用 `applyDecisionPolicy` 的降级逻辑），并在 `reasons` 写明"未授权主动提醒"。
- 没有 `external_send` 授权时，A5 议案的"发送"按钮禁用并说明原因。
- 撤回授权后，下一个判定周期内该类事件不再产生（可测：撤回 → 调 `POST /api/investor/events` → 结果为 `muted`/`not_relevant`）。
- 免打扰时段内 `push` 一律降级为 `feed`，`reasons` 写明"免打扰时段"。
- 设备级覆盖生效顺序正确：账户级设为 22:00–08:00、设备 A 覆盖为 23:00–07:00 时，22:30 在设备 A 可推、在设备 B 降级；清除覆盖后设备 A 回落到账户级。
- 设备级覆盖不改变其他设备的投放，也不改变 `consent.purposes` 等授权状态。
- 每日 `push` 数超过 `dailyPushCap` 后，超额自动降级为当日汇总（一条 `feed`）。

**复用与落点**

新增 `consent.ts`；`event-triage.ts` 的 `TriageContext` 增加 `consent` 字段，`applyDecisionPolicy` 读取它做降级——**这是本需求最小的切入点**：不改判定算法，只加一道策略闸。

---

### A4（P0）事件源扩展：到期 / 首次亏损 / 配置偏离

**用户故事**

> 我的债券下个月到期、持仓某只票第一次跌破成本、组合股票仓位越过目标上沿，这三件事我应该被提前告知，而不是等我自己算。

**现状问题**

- `EVENT_TYPES` 有 7 类，价格类只有"异动"和"阈值"；
- 没有到期日字段，没有成本价对比，没有配置偏离（依赖 A2）；
- 判级中 `daysUntil` 已支持"到期临近加分"，但没有事件源产出这类候选。

**功能行为**

1. **新增三类事件**：

| 事件 | 触发条件 | 默认级别 | 依赖 |
| --- | --- | --- | --- |
| `maturity` 到期事项 | 债券/存款/基金/风险测评到期日 ≤ 30 天，7/3/1 天各提醒一次 | 必须知道（≤7 天） | 持仓新增 `maturity_date`；档案新增 `assessment_expires_at` |
| `first_loss` 首次亏损 | 持仓现价首次跌破 `avg_cost`，或组合回撤首次越过用户设定阈值 | 必须知道（首次）/ 归档（重复） | `holding.avg_cost` + 历史快照 |
| `policy_drift` 配置偏离 | A2 的 `status === "breach"` | 可以稍后 → 持续越界升级 | A2 |

2. **首次亏损必须去重**：用"首次"语义——同一持仓在回到成本线上方之前只推一次（`dedupeKey` 含 `cost_band` 区间），避免每天重复。
3. **到期事项不推交易建议**：只输出"到期日 + 当前持仓 + 需要确认的信息"，不输出"买什么替代"。
4. **交易日历留白**：A4 不做交易日历（属 8P R5），非交易日仍按现有 `isMarketClosed` 只进信息流。

**数据模型增量**

- `holdingSchema` 增加 `maturity_date?: string`（债券/存款/理财类）。
- `InvestmentProfile.risk` 增加 `assessment_expires_at?: string`。
- `EVENT_TYPES` 增加 `"maturity" | "first_loss" | "policy_drift"`，`EVENT_TYPE_LABELS` 同步。

**验收标准**

- 到期日在 30 天内时，7/3/1 天各产生一条候选，去重键含"天数档"，不重复轰炸。
- 首次亏损仅在"从未亏 → 首次亏"跃迁时产生，回到成本上方后再跌破可再次产生。
- 三类事件都能被 A3 的授权与免打扰规则正确降级。
- 任一事件缺关键数据（如无 `avg_cost`）时不产生，而不是用 0 假设。

**复用与落点**

`event-triage.ts` 增加候选生成器（与现有价格预警的产出口径一致）；`monitor-price.ts` 已有周期扫描骨架可复用。

---

### A5（P0）投研议案与审核状态机 Proposal

**用户故事**

> 我要的是"一份可以看、可以改、可以批、可以留痕的建议书"，不是聊天里的一段结论。

**现状问题**

- [actions.ts](../apps/server/src/actions.ts) 的 `ActionProposal` 设计得很好（幂等键、hash、`awaiting_review` 状态、`outcome_unknown` 恢复），但 `kind` 只有邮件与日历四类，**投研议案没有位置**；
- `Deliverable` 类型存在但无服务端路由，交付物中心实际未落地。

**功能行为**

1. **议案类型**：在 `ActionProposal` 之外新增投研专用 `ResearchProposal`（不与邮件/日历混用，避免审批语义污染）：

| 类型 | 触发者 | 审什么 | 默认状态 |
| --- | --- | --- | --- |
| `rebalance_draft` 调仓草案 | A2 偏离越界 | 目标/偏离/成本/风险/反方情景 | draft |
| `profile_update` 档案变更 | A1 模型提议 | 哪一项要改、依据、影响 | draft |
| `thesis_status` 论点状态变更 | 论点回检 | 新状态 + 证据 | draft |
| `report_publish` 研报/简报外发 | 用户或定时任务 | 内容 + 溯源 + 合规门结果 | draft |

2. **状态机**（与现有 action 对齐，增加 `gate_failed`）：

```
draft → in_review → approved → sent
  ↓        ↓           ↓
rejected  rejected   gate_failed（可退回 in_review）
  ↓
archived
```

   `archived` 只能由用户显式触发；系统不提供"超期自动归档"路径（见下文第 7 条）。

3. **议案必须结构化**：`trigger`（为什么现在）、`evidence[]`（带 url/抓取时间/引用数字）、`change`（拟议变化）、`cost`（费用/交易成本提示）、`risks[]`、`counterCase`（反方情景）、`unknowns[]`（缺什么）。
4. **`approved` 只能由人触发**：模型可通过工具提交议案，但不能调用批准接口（与现有"模型不能自行批准"一致）。
5. **可追溯**：议案引用其来源（事件 ID / 报告 ID / 论点 ID），反向可从标的详情看到相关议案。
6. **不进入聊天正文**：议案以卡片进入交付物中心，聊天只给摘要与入口。
7. **超期处理（已定：持续提醒，不自动归档）**：议案不存在"7 天未处理自动消失"。停留 `draft` / `in_review` 超过 3 天进入每日待办，超过 7 天提升优先级并在提醒文案中说明"已等待 N 天"；只有用户显式拒绝或归档才离开待办队列。
   - 理由：调仓类议案的价值有强时效性，静默归档等于把风险藏起来；但也不应逼迫用户仓促决定，所以用"逐级提升可见度"而不是"自动过期"。
   - 与 A3 的免打扰规则冲突时，议案提醒属于"必须知道"，可在免打扰时段内以 `in_app` 静默落库、不发声，次日首个活跃时段重申。

**数据模型**

```ts
// kind: "research-proposals", id: uuid
interface ResearchProposal {
  id: string;
  owner: string;
  kind: "rebalance_draft" | "profile_update" | "thesis_status" | "report_publish";
  title: string;
  status: "draft" | "in_review" | "approved" | "rejected" | "sent" | "gate_failed" | "archived";
  trigger: { type: EventType | "manual"; eventId?: string; reason: string };
  subject?: { symbol?: string; portfolioId?: string; noteId?: string; reportId?: string };
  evidence: Array<{ url?: string; quote?: string; fetchedAt: string; source: string }>;
  change: Record<string, unknown>;
  cost?: { amount?: number; currency?: MonitorCurrency; note: string };
  risks: string[];
  counterCase?: string;
  unknowns: string[];
  /** 合规门结果，gate_failed 时必填 */
  gate?: { passed: boolean; issues: Array<{ code: string; message: string; span?: string }>; checkedAt: string };
  reviewedBy?: "user";
  reviewedAt?: string;
  reviewNote?: string;
  createdAt: string;
  updatedAt: string;
}
```

**验收标准**

- 议案创建即 `draft`，不存在"直接 approved"的路径（服务端校验）。
- `evidence` 为空时不允许 `approved`（至少一条可点开的证据）。
- `gate.passed === false` 时不允许 `approved`，只能退回修改。
- 每条议案可从来源事件/报告/论点双向追溯。
- 审批记录含操作人、时间、意见，可导出。
- 议案停留超过 3 天必然出现在当日待办；超过 7 天提醒文案含等待天数；**任何情况下不会自动变为 `archived`**（可测：造一条 30 天未处理议案，状态仍为 `draft`/`in_review`）。

**复用与落点**

新增 `research-proposal.ts`；复用 `actions.ts` 的幂等与状态推进模式，但不复用其 `kind` 枚举；前端新增议案卡片与审批页（可参考 `report-brief-card.tsx` 的卡片壳）。

---

### A6（P0）合规门：敏感字段 / 脱敏 / 误导表述 / 溯源

**用户故事**

> 我要能确认"这句话不是它编的"；并且在我把东西发出去之前，系统应该替我把明显的红线挡住。

**现状问题**

- 搜索有 `evidence`（含 URL 与摘录），但**数字级出处不强制**；
- 有对外写入审批（邮件/日历），但**没有内容层面的合规检查**；
- 没有敏感字段识别与脱敏——docx 明确举例：用途不需要 NRIC 时，系统应识别超范围采集并拦截 + 留痕。

**功能行为**

1. **数字级溯源**：议案/报告中的关键数字可标注 `evidenceRef`；无来源的数字在 UI 标黄，处理方式三选一：补来源 / 删除 / 标为估算（`estimate`）。未处理不允许 `approved`。
2. **敏感字段拦截**：规则识别身份证/护照/银行卡/完整手机号等模式；命中即：
   - 若当前用途不需要该字段 → **拦截 + 记录 `blocked_field`**（不落原文，只落类型与位置）；
   - 若用途需要 → 强制脱敏展示（如 `3101**********1234`）。
3. **对外内容红线检测**：收益承诺（"稳赚""保本""必涨"）、保证性表述、未经证实的绝对化结论 → 命中即 `gate_failed`，列出问题片段与建议改法。
4. **免责声明注入**：`report_publish` 类议案 `approved → sent` 之间自动注入可配置免责声明，不可移除。
5. **审计**：每次门检查落一条记录（检查对象、命中规则、结论、耗时），进入现有审计视图。
6. **性能约束**：规则层同步执行（P95 ≤ 300ms），模型复核异步补（不阻塞 `approved`，但结果可回滚到 `gate_failed` 并通知）。

**验收标准**

- 含疑似身份证号的内容无法 `approved`，且审计可见"拦截了哪类字段"（不含原文）。
- 含"稳赚""保本"等词的对外议案必然 `gate_failed`。
- 无源数字 100% 标黄，未处理不可 `approved`。
- 规则层 P95 ≤ 300ms（本地压测）。
- 门检查对内部使用的分析（不外发）不做强制拦截，仅提示——避免拖慢研究体验。

**复用与落点**

新增 `compliance-gate.ts`（纯函数规则层，便于单测）；与 A5 的 `gate` 字段对接；审计复用 `audit-routes.ts`。

---

### A7（P1）组合情景分析与集中度

**功能行为**

1. **集中度**：`HHI`、前 5 大持仓占比（`CR5`）、单标的/行业/地区暴露上限提示（与 A2 的 `targets` 联动）。
2. **相关性**：基于现有日线历史（`portfolio-risk.ts` 已有 250 日窗口）计算持仓两两相关系数，输出高相关簇提示。
3. **情景压力测试**：用户选择情景（市场普跌 10%/20%、利率 +100bp、本币贬值 5%），按 Beta 与历史相关性做**近似估算**，输出组合影响区间。
4. **必须标注"近似"**：情景结果是线性近似，不是精确模拟；UI 必须写明假设。

**验收标准**

- 数据不足（<120 个对齐观测）时明确返回 `unavailable` 及原因，不出假数值。
- 每个情景结果附假设清单与置信边界。

---

### A8（P1）基金/ETF 穿透与重叠

**功能行为**

1. 新增基金研究维度：投资范围、前十大持仓、费用率、跟踪指数、历史表现与回撤。
2. **重叠分析**：用户持有的基金 vs 自选股/其他基金的持仓重叠度，输出重叠标的与合计权重。
3. **适用性待核验点**：结合 A1 档案，标出"该产品风险等级高于你的风险偏好"这类待核验项（只提示，不下结论）。

**验收标准**

- 持仓穿透数据缺失时明确标注来源与缺口，不用估算补齐。
- 重叠度计算口径（按权重交集）在 UI 说明。

---

### A9（P1）多 Agent 分歧与置信度呈现

**现状**

[orchestrator.ts](../apps/server/src/engine/orchestrator.ts) 已支持 DAG 编排与失败传播，但汇总阶段是"合并各片段"，没有暴露分歧。

**功能行为**

1. 每个子 Agent 输出统一结构化结果：`findings[] / risks[] / unknowns[] / confidence(0..1) / sources[]`。
2. 汇总层**标注共识与分歧**：同一问题不同 Agent 结论冲突时，并列呈现并标出各自证据强弱，不做"投票取胜"。
3. 用户可追问某个 Agent 的依据，跳转到其使用的数据与来源。
4. 分歧清单进入议案的 `unknowns`/`counterCase` 字段（与 A5 打通）。

**验收标准**

- 存在冲突结论时，汇总必然显示分歧条目（不是被吞掉）。
- 每个结论可回溯到具体 Agent 与来源。

---

### A10（P2）数据分级的模型路由

按数据敏感级别路由：持仓/档案/客户类数据优先本地或内部模型，公开资料可用外部模型；路由规则可配置、可审计。当前 `model.ts` 已有按 owner 解析模型的机制，扩展为"按数据级别二次选择"即可。

### A11（P2）投顾工作台

docx 的 FinDesk 形态（客户待办、提案审核、风险队列）。涉及多租户、客户级隔离与合规职责，**本期不做**，仅在数据模型上预留 `tenantId` 与 `advisorId` 字段，避免将来重构。

---

## 5. 数据模型增量总表

| 新增 kind / 字段 | 说明 | 迁移 |
| --- | --- | --- |
| `investment-profiles` | A1 投资档案，每账户一份 | 无（records JSONB） |
| `investment-policies` | A2 目标配置区间，按 portfolioId | 无 |
| `consents` | A3 授权，一条一个五维组合 | 无 |
| `research-proposals` | A5 投研议案 | 无 |
| `holding.maturity_date` | A4 到期事项 | 可选字段，无需回填 |
| `profile.risk.assessment_expires_at` | A4 风险测评到期 | 可选字段 |
| `EVENT_TYPES` += `maturity` / `first_loss` / `policy_drift` | A4 三类事件 | 枚举扩展；旧数据按 rules 读 |
| `event-feed` 增加 `consentId` | A3 使用留痕 | 可选字段 |

**原则**：全部走现有 `records(owner, kind, id, data jsonb)`，`compareAndSwap` 乐观并发不变；不做 schema 迁移。

---

## 6. API 增量

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET/PUT` | `/api/investor/profile` | 读取/更新投资档案（高风险字段需 `confirm: true`） |
| `POST` | `/api/investor/profile/proposals` | 模型提议档案变更 |
| `GET/POST` | `/api/investor/consents` | 列出/创建授权 |
| `DELETE` | `/api/investor/consents/:id` | 撤回授权 |
| `GET/PUT` | `/api/portfolios/:id/policy` | 目标配置区间 |
| `GET` | `/api/portfolios/:id/drift` | 偏离计算 |
| `GET/POST` | `/api/investor/proposals` | 议案列表/创建 |
| `POST` | `/api/investor/proposals/:id/review` | 审核（approve/reject/rework） |
| `POST` | `/api/investor/proposals/:id/send` | 外发（需 `external_send` 授权 + 门通过） |
| `POST` | `/api/investor/compliance/check` | 预检查（不落库） |

已有 `/api/investor/*` 路由在 [investor-routes.ts](../apps/server/src/engine/investor-routes.ts)，新接口直接追加，不新建命名空间。

---

## 7. 与现有模块的复用映射（避免重复造）

| 本文档需求 | 直接复用 | 不重复造 |
| --- | --- | --- |
| A3 授权降级 | `applyDecisionPolicy` 已有 `quiet`/`explicitAlert` 降级逻辑 | 不改判定算法，只加策略闸 |
| A4 事件 | `prefilterEvent` / `judgeEvent` / `dedupeKey` / `feedFeedback` | 不新建事件管线 |
| A5 议案 | `actions.ts` 的幂等键、hash、状态推进、`outcome_unknown` 恢复 | 不复用其 `kind` 枚举 |
| A6 溯源 | `search` 的 evidence、`thesisSignal` 的缺数据语义 | 不重做证据结构 |
| A7 风险 | `portfolio-risk.ts` 的对齐窗口与 `unavailable` 语义 | 不重算收益序列 |
| A9 编排 | `orchestrator.ts` 的 DAG 与失败传播 | 不改调度，只改汇总协议 |

---

## 8. 迭代计划与取舍

| 阶段 | 内容 | 验证什么 | 明确不做 |
| --- | --- | --- | --- |
| M1 | A3 授权 + A4 到期/首次亏损（不依赖 A2） | 主动提醒是否首次拥有"合法依据 + 免打扰" | 不做偏离、不做议案 |
| M2 | A1 档案 + A2 目标配置与偏离 | "偏离"能否算准、用户是否愿意建档 | 不做情景分析 |
| M3 | A5 议案 + A6 合规门 | 建议能否真正"交出去"且留痕 | 不做多渠道路由 |
| M4 | A7 + A8 | 组合分析是否够深 | 不做 A11 |
| 观察 | A9 / A10 / A11 | 按数据决定 | — |

**取舍原则**：任何需求若不能回答"它让提醒更准、或让建议更可信"，本轮不做。

---

## 9. 风险

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| 档案建档摩擦高，用户不填 | 高 | 默认从持仓/自选推导 `derived` 项，只需确认；不填也能用，但明确提示缺失 |
| 授权粒度太细，用户看不懂 | 中 | 首屏只暴露 4 个开关（读数据/做分析/主动提醒/对外发送），高级五维收在"高级"里 |
| 偏离计算口径争议（币种/成本 vs 市值） | 中 | UI 强制展示口径声明；提供"按市值/按成本"切换 |
| 合规门误杀正常内容 | 中 | 规则层只拦硬红线（证件号、保本承诺），其余交人工；异步模型复核可回滚 |
| 议案沦为"没人审"的库存 | 高 | 议案进入"今天"首页待办；3 天后逐日提醒、7 天后提级，**不自动归档**（已定） |
| 与 8P R5/R6 重复建设 | 中 | 本文档只做数据与策略，推送通道与交易日历仍归 8P R5；审计仍归 `audit-routes.ts` |

---

## 10. 决策与待定

### 10.1 已决策（2026-11-26 确认，已在各需求章节落地）

| # | 议题 | 决策 | 落点 |
| --- | --- | --- | --- |
| 1 | A2 目标权重主口径 | **按市值**；成本口径仅辅助展示，不参与越界判定与事件触发 | A2 第 2 条、`PolicyDrift.valueBasis`、A2 验收第 5 条 |
| 2 | A3 免打扰层级 | **账户级为主 + 设备可覆盖**，生效顺序：设备级 > 账户级 > 是否开市 | A3 第 4 条、`Consent.deviceQuietOverrides`、A3 验收第 5–6 条 |
| 3 | A5 议案超期处理 | **持续提醒**，3 天进每日待办、7 天提级，**不自动归档** | A5 第 7 条、状态机说明、A5 验收第 6 条 |

### 10.2 仍待定

- [ ] A1 档案是否允许导出（可携带性）？
- [ ] A6 敏感字段规则是否要覆盖港股/美股常见证件格式，还是只做中国大陆？
- [ ] A8 基金持仓穿透的数据源是否具备商用授权（待供应商确认）。

---

## 附录 A：docx 概念 → 需求映射

| docx 概念 | 本文档需求 | 状态 |
| --- | --- | --- |
| 个人投资档案（目标/期限/风险/授权） | A1 | 本期 |
| 投资政策与约定区间 | A2 | 本期 |
| 客户授权（类别/用途/渠道/频率/有效期） | A3 | 本期 |
| 到期事项、首次亏损、配置偏离 | A4 | 本期 |
| 议案 P-0912 与顾问审核 | A5 | 本期 |
| 风险控制台 / 敏感字段拦截 / 脱敏 | A6 | 本期 |
| 组合情景与相关性 | A7 | 下期 |
| 基金研究与非持有/同类/已持有三种视角 | A8 | 下期 |
| 多 Agent 协作与分歧呈现 | A9 | 下期 |
| 机构内模型 / 私有云模型路由 | A10 | 观察 |
| FinDesk 顾问工作台 | A11 | 观察（不承诺） |

## 附录 B：与既有文档的关系

| 文档 | 关系 |
| --- | --- |
| [PRD-LingWu-个人投研智能体.md](PRD-LingWu-个人投研智能体.md) | 功能面不变；本文档补其 P1/P2 中"组合分析、知识库"的合法性基础 |
| [PRD-产品优化-从投研助手到盯盘的同事.md](PRD-产品优化-从投研助手到盯盘的同事.md) | 其 OPT-05「溯源与合规门」由本文档 A6 承接并细化；OPT-01 的事件源由 A4 补齐 |
| [PRD-灵悟-个人投研智能体-8P进化.md](PRD-灵悟-个人投研智能体-8P进化.md) | 其 R6「敏感动作确认与操作审计」由 A3/A5/A6 承接；R5 的推送与交易日历仍归该文档 |
| [PRD-多Agent记忆系统.md](PRD-多Agent记忆系统.md) | A1 档案是结构化记忆的一种，与文本记忆互补：档案管"约束"，记忆管"经历" |
| [PRD-任务目标提醒.md](PRD-任务目标提醒.md) | A4 在其监控规则上扩展事件类型，不改其调度机制 |

---

**文档结束**

> 下一步：先评审第 3 节（设计原则）与第 8 节（迭代顺序）。这两处定了，M1 可直接拆任务——它只动 `event-triage.ts` 的策略闸与事件枚举，是本文档中改动面最小、验证最快的一步。
