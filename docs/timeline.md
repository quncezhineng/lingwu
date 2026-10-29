# 项目时间线与进度

> 本文件记录 LingWu（灵悟）项目的里程碑、进度跟踪与变更记录。
> 变更按时间倒序排列，最新变更在最上方。

## 变更记录

### 2026-10-30 · 桌面宽屏下输入框不再贴住浏览器底部

对话页（`ChatScreen`）桌面宽屏时，输入框组件紧贴浏览器最下方,缺少呼吸间距。

**修改**（`apps/mobile/src/chat.tsx`）

- 在对话页 `PromptComposer` 的 style 中,宽屏（`wide`）时追加 `marginBottom: 18`,使输入框与页面底部留出间距;窄屏保持原样（仍由底部 tab 栏承载间距）。

### 2026-10-30 · 减小输入框底部按钮工具栏与下框线之间的间距

对话页 / 工作台输入框（`PromptComposer`）中，按钮工具栏行紧贴容器底部，但容器四边统一使用 `padding`（dense 11 / 普通 16），导致工具栏行距离输入框下边框线留白偏大。

**修改**（`apps/mobile/src/prompt-composer.tsx`）

- 将统一 `padding` 拆分为 `paddingTop` / `paddingHorizontal`（保持原值）与 `paddingBottom`（dense 11→8、普通 16→10），顶部与左右不受影响，仅收紧下框线处的留白。

### 2026-10-29 · 消除 Biome lint 告警（useLiteralKeys / noNonNullAssertion / 无用变量）

对内联 lint 输出中暴露的残余告警做最小化清理：

- `packages/integrations/src/market-data.ts`：AKShare 中文键访问由 `parsed["最新"]` 改为字面量键 `parsed.最新`（等价的标识符属性访问，消除 10 处 `lint/complexity/useLiteralKeys` 提示）。
- `apps/server/src/engine/portfolio-risk.ts`：`sampleCovariance` 移除多余的 `!` 断言（tsconfig 未启用 `noUncheckedIndexedAccess`，索引访问即为 `number`），消除 2 处 `lint/style/noNonNullAssertion` 警告。
- `tests/portfolio-risk.test.ts`：删除从未使用的 `compoundReturn` 帮助函数，消除 `lint/correctness/noUnusedVariables` 警告。

**验证**

- `pnpm lint`（biome check 377 个文件）：无任何告警。
- `npx tsc --noEmit`：通过。
- `tests/portfolio-risk.test.ts` + `tests/rich-threads.test.ts`：18 项全部通过 / 0 失败。

### 2026-10-29 · 修复主对话线程（Rich Threads）孤儿数据导致的永久 502

**现象**

前端对话页顶部显示红色告警：

```
Main conversation is unavailable. Check the Rich Threads connection and try again.
```

**根因**

- 本地 PGlite 曾两次损坏重建（`postgres.corrupt-*`），`conversation-settings/main` 保留的 threadId 与 CopilotKit 平台侧云端状态不一致，形成孤儿线程数据。
- 复现链路（真实 API 探测）：`GET /api/threads/{threadId}?userId=` → **404**，触发 SDK `getOrCreateThread` 走创建流程；`POST /api/threads` → **409 `DATABASE_CONSTRAINT_VIOLATION`**（云端存在该 threadId 但按 userId 查不到）；SDK 捕获 409 后重试 GET → 仍 **404** → SDK 抛出带 `status: 404` 的 `PlatformRequestError`。
- `apps/server/src/app.ts` 的 `/api/main-thread` 原先无条件 `catch {}` 转 **502**，导致主对话永久不可用。

**修复**（`apps/server/src/app.ts` `/api/main-thread`）

- 捕获错误时结构化判断 `error.status`（SDK 未导出 `PlatformRequestError` 类，按属性判断）。
- 平台返回 **404/409**（孤儿/约束冲突）→ 为该 owner 生成新 threadId（`randomUUID()`）→ 用新 id 重新 `getOrCreateThread` → 成功则 `db.put` 更新 `conversation-settings/main` 并返回 `{ threadId, existing: false }`，主对话自愈重建。
- 其余错误（无 `status` 的普通错误、5xx 平台故障）→ 保持原行为返回 502，不产生新 id，不改动 DB。
- 补充 `console.error` 结构化日志（`phase`、`status`、`replacedThread`），便于后续排障。

**验证**

- `tests/rich-threads.test.ts`：8 项全部通过（新增 1 项：`an orphaned main thread is rebuilt with a fresh id when the platform reports 404/409`）。
- 既有约束保持：普通 `Error` 抛错仍返回 502 且不创建新 id、DB 记录不变。
- `pnpm test`：806 项全部通过 / 0 失败。
- `npx tsc --noEmit`：通过。

### 2026-10-29 · 修复 lingwu-browser 磁盘写满导致启动崩溃（ENOSPC 自愈 + LRU 淘汰）

**现象**

Render 部署 `lingwu-browser` 服务启动即崩溃并反复重启，日志：

```
Error: ENOSPC: no space left on device, mkdir '/data/<uuid>/download-outcomes'
  at async readDownloadFailures (src/downloads.ts:32:3)
  at async createBrowserManager (src/browser.ts:61:27)
  at async createWorkerServer (src/server.ts:46:19)
==> Exited with status 1
```

**根因**

- 持久盘 `/data`（1 GB）被无界累积的 Chromium 持久化 profile（最多 20 个，仅拒绝新会话、从不淘汰）与已下载 PDF（按会话限 20 份，但跨会话 × 20 个 profile 可累积 GB 级）占满。
- `createBrowserManager` 启动时恢复会话并调用 `readDownloadFailures`（内部执行 `mkdir download-outcomes`）→ 磁盘满抛 `ENOSPC` → 进程退出 → 重启永远失败，形成死循环。

**修复（四层）**

- `apps/worker/src/browser.ts`：
  - 启动恢复逻辑增加 ENOSPC 自愈：捕捉错误码 `ENOSPC` 时先调用新增的 `reclaimSessionSpace(dataDir, maxProfiles)` 紧急回收空间（清理 `.tmp` 半成品、每个会话保留最新 4 份已发布 PDF 及对应 `.json` 元数据、按 `updatedAt` 淘汰超限的最旧配置目录），随后重试一次恢复。
  - `maxProfiles` 硬拒绝改为 LRU 淘汰：达上限时用 `selectEvictionVictim` 优先淘汰「未运行中最旧」配置，关闭其运行中 context 并删除目录（防御性保留 `PROFILE_LIMIT` 抛错）。
  - Chromium 启动参数新增 `--disk-cache-size=1`，禁用磁盘缓存以压缩 profile 体积。
- `render.yaml`：`lingwu-browser` 服务磁盘 `sizeGB: 1` → `2`，留足余量。

**验证**

- `pnpm typecheck`：通过。
- `tests/browser.test.ts`：27 项全部通过（新增 2 项：`selectEvictionVictim` 淘汰选择、`reclaimSessionSpace` 全盘回收）。
- `pnpm test`：775 项全部通过 / 0 失败。
- `ruby -ryaml` 校验 `render.yaml` 合法（3 个服务、`lingwu-browser.disk.sizeGB == 2`、`mountPath == /data`）。

**注意事项**

- Render 控制台需对 `lingwu-browser` 手动应用新配置并重新部署，才会挂载 2 GB 磁盘；当前已写满的旧磁盘数据可能需在控制台清理后重建。
- 磁盘回收是启动期兜底，正常运行阶段依赖 LRU 淘汰与 PDF 保留上限控制增长。

### 2026-10-28 · 图标替换终审：emoji/文本字形功能图标清零、线宽离群归一

**背景**

用户再次发起基于「Doubao」设计系统（V.3RSOA.PBS1K2）的视觉重构，要求保留当前蓝色（`#3A83F7`）与白色主题，并优先以设计系统图标替换前端图标。本轮 Design Canvas 依然不可用，故在项目内已转写的 Doubao 图标资产（`icons/library.ts` 40 枚 + `icons/project.ts` 补齐）范围内推进；未读取、未依赖设计库外部文件。

**全站扫描结论**

- 图标消费已 100% 收敛于自有 SVG 图标层（`apps/mobile/src/icons`）：无 `lucide-react-native` 残留、无紫色 `#4B3FE3`/`blueDark` 残留。
- 84 个语义导出键全部映射库内/项目几何，注册表完整性由 `icons.test.ts` 覆盖。
- 残余缺口 2 类（本轮修复）：
  - **emoji/文本字形充当功能图标**：`briefing-card.tsx` 事件行日历 emoji `📅`；`symbol-detail.tsx` 任务计划步骤状态字形 `✓`/`✕`。
  - **线宽离群**：`briefing-card.tsx` 2 处（`1.9`、`1.6`），违反「常规 1.8 / 强调 2 / 填充 0」图标规范。

**修正（最小必要改动，仅样式/图标，无逻辑变化）**

- `apps/mobile/src/briefing-card.tsx`：
  - 事件行 `📅` emoji → `CalendarDays` 图标（`size 14` / `strokeWidth 1.8` / `colors.faint`，与时间列对齐）。
  - 标题行 `Activity` 线宽 `1.9` → `1.8`（常规档）。
  - 空态占位 `Activity` 线宽 `1.6` → `1.8`。
- `apps/mobile/src/symbol-detail.tsx`：
  - 计划步骤「成功」状态 `✓` 文本字形 → `Check` 图标（`size 14` / `strokeWidth 2` 强调档 / 状态色）。
  - 计划步骤「失败」状态 `✕` 文本字形 → `CircleX` 图标（同上）。

**验证**

- `pnpm typecheck`：通过（根 + mobile 两个工程）。
- `pnpm test`：772 项全部通过 / 0 失败。
- `biome check`：目标文件无告警。

**说明**

- 设计库本轮仍不可用：未转写任何新几何；本轮全部改动仅为既有图标资产替换与线宽收敛，蓝色 `#3A83F7` 与白色主题保持不变。
- 待「Doubao」设计库 Design Canvas 恢复后，可再按设计库原始规格复核图标几何与 token 映射。

### 2026-10-28 · 修复后端启动崩溃：PGlite 本地数据目录损坏（WAL 重放失败）

**现象**

`pnpm dev` 启动即崩溃，终端报：

```
RuntimeError: Aborted(). Build with -sASSERTIONS for more info.
  at async createStore (apps/server/src/db.ts:199:5)
```

**根因**

- 本地嵌入数据库 PGlite 的数据目录 `.lingwu/postgres` 因之前进程被强杀而损坏（WAL/checkpoint 状态与数据不一致）。
- PGlite 每次打开该目录重放 WAL 失败，Emscripten 仅暴露不透明 `Aborted()`，无法直接定位。
- 佐证：`.lingwu` 下已存在 10-25 的损坏备份 `postgres.corrupt-20261025`，说明该类问题曾发生过。

**修复（数据保留，不删除）**

- 将损坏目录移走存档：`.lingwu/postgres` → `.lingwu/postgres.corrupt-20261028`。
- 服务启动时自动重建全新数据库，业务数据仍存于 Supabase，不受影响。

**验证**

- `pnpm dev`：API 正常拉起，输出 `LingWu live API ready at http://localhost:8787`。
- `curl /api/health`：返回 `{"ok":true,...}`。

**注意事项（复发时的处理步骤）**

1. 停止后端：`lsof -i :8787` 找到残留进程后退出。
2. 备份损坏目录：`mv .lingwu/postgres .lingwu/postgres.corrupt-$(date +%Y%m%d)`。
3. 重新 `pnpm dev`。

### 2026-10-28 · 视觉一致性终审：圆角体系偏离项归零（修正 7 处 11/13 离群值）

**背景**

第三轮视觉重构（图标体系补全）后的全站一致性终审：不以设计库外部文件为依据（本轮 Design Canvas 不可用），仅对项目内组件层的圆角/描边/阴影令牌做扫描，检验是否偏离已确认体系（面板 10 / 控件 9 / 小徽标 7 / 胶囊 999 / Sheet 12 / 代码块 8 / 头像 14）。

**扫描结论**

- 圆角 `borderRadius` 全量盘点：绝大部分数值落在体系档位内；**7 处离群值**（圆角 11 与 13）既不属于任何档位，应归一。
- 描边宽度：全站统一 1px（仅 2 处 `borderWidth: 5` 为 16×16 实心状态点，小徽标级，属合理例外）。
- 阴影：仅 3 处浮层（展开面板、语言切换菜单、侧栏 sheet）使用弱阴影（opacity 0.08、radius 10–14），符合「边框优先、弱阴影」规范，未滥用。

**修正（最小必要改动）**

- `chat.tsx`：产物/附件行图标底座 40×40 圆角 13 → 10（面板档）。
- `approval-card.tsx`：审批卡片图标底座 40×40 圆角 13 → 10。
- `agent-ui.tsx`：插件图标底座 38×38 圆角 11 → 10；监控/搜索类输入框 44 行高圆角 11 → 9（控件档）；成功徽章 26×26 圆角 13 → 999（胶囊档，恢复正圆）。
- `search-sheet.tsx`：搜索输入框圆角 11 → 9（控件档）。
- `computer.tsx`：浏览器预览图圆角 11 → 10（面板档）。

**验证**

- `pnpm typecheck`：退出码 0。
- `pnpm test`：772 项全部通过 / 0 失败。

**注意**

- 全部改动仅为 1–2px 的圆角量化收敛，不涉及布局、配色或图标几何变更；蓝色 `#3A83F7` 与白色主题保持不变。
- 待「Doubao」设计库 Design Canvas 恢复后，可再按设计库原始规格复核圆角档位。

### 2026-10-28 · 图标体系补全：Doubao 库 40 枚资产全量注册可用（蓝色/白色主题不变）

**背景**

用户再次发起基于「Doubao」设计系统的视觉重构，明确要求保留当前蓝色（`#3A83F7`）与白色主题，并优先以设计系统图标替换前端图标。本轮 Design Canvas 依然不可用，故在**项目内已转写的 Doubao 图标资产**（`apps/mobile/src/icons/library.ts`，40 枚）范围内推进；未读取、未依赖设计库外部文件。

**审计结论**

- 盘点 `keys.ts` 全部 86 个语义导出：已注册的映射均为库内最贴合图标（`AlertTriangle→triangle-alert`、`FileText→file`、`Play→circle-play` 等），无「本应使用库内资产却走项目补齐」的错配。
- 前端无 Lucide 残留、无 emoji 功能性图标、无绕过 icons 层的自定义 SVG——图标消费 100% 收敛于自有 SVG 层，符合项目既定规范。

**实现（本轮的实质增量：库内资产 100% 可消费）**

- `apps/mobile/src/icons/keys.ts` + `icons/index.tsx`：新增注册 17 枚此前未暴露的库内资产，使「Doubao 转写图标」40 枚全量可用——
  - 导航/方向：`ChevronUp`、`ChevronsDownUp`、`ChevronsUpDown`
  - 状态反馈：`CircleAlert`、`CircleCheck`、`CircleMinus`、`CirclePlus`
  - 新增语义：`Box`、`Funnel`（筛选）、`Grip`、`Home`（house）、`MapPin`、`MousePointerClick`、`Star`、`Tag`、`ThumbsDown`、`ThumbsUp`
  - 全部沿用统一 Icon 层：线宽默认 1.8、描边/填充语义一致、渲染走 `createIcon`。
- 未改动：`ui.tsx` 品牌色令牌（保留蓝色 `#3A83F7` 与白色主题）、`library.ts`/`project.ts` 几何数据、50 枚项目补齐图标（库内无对应语义，所需映射仍由 project 补齐，语义已在 keys.ts 注释说明）。

**验证**

- `pnpm --filter mobile typecheck`：退出码 0。
- `pnpm test`：772 项测试全部通过 / 0 失败（含 `icons.test.ts` 注册表完整性：库内 40 枚、来源标记、唯一性、几何元素完整性全部校验通过）。
- 库内 40 枚资产 = 已注册 23 枚（首轮 23 个库键被引用） + 本轮 17 枚，覆盖率达到 100%。

**注意**

- 「Doubao」设计库（V.3RSOA.PBS1K2）本轮 Design Canvas 不可用：本轮仅在项目内既有转写资产的范围内做全量注册，未转写任何新几何；若需进一步按设计库新增/复核图标，待设计库恢复后进行。
- 新增导出均为库内资产，未来前端新增功能可直接 `import { Star, Home, Funnel } from "../icons"` 消费设计系统风格图标，不再需要新画面补 project 补齐图标（除非新语义库内确实缺资产）。

### 2026-10-28 · 视觉重构收尾：清除紫色品牌残留并统一图标线宽（遵循已确认 Doubao 规范）

**背景**

用户基于「Doubao」设计系统发起前端 UI 视觉重构。本次会话 Design Canvas 暂不可用，因此以会话中已沉淀并经代码固化的 Doubao 规范（中性面阶梯、边框优先弱阴影、圆角体系、图标线宽 1.8/2/0、品牌色隔离）为基准，并维持当前蓝色（`#3A83F7`）品牌主色、不回归紫色 `#4B3FE3`（经用户确认）。

**实现**

- `apps/mobile/src/artifact-html.ts`：产物 HTML 模板 5 处紫色残留改为蓝色系——
  - `.chip` 标签底色 `#E5EAFF` → `#EDF3FF`（对齐 `colors.sky` 轻蓝底座），文字 `#4B3FE3` → `#245FC4`（`colors.primaryStrong`，保证浅底小字对比度）。
  - `.summary` 左侧强调条、`.summary a` 链接、`.summary code` 行内代码、`.bar-fill` 分配条填充统一 `#4B3FE3` → `#3A83F7`（`colors.primary`）。
- `apps/mobile/src/portfolio-screen.tsx`：`ALLOCATION_COLORS` 分配色板去紫——首色 `#4B3FE3` → `#3A83F7`（品牌主色），次色 `#6E5AF0` → `#2FB3FF`（明亮青蓝，与 `#3C7FB1` 钢蓝保持区分度）。
- `apps/mobile/src/research.ts`：研报打印模板链接色 `#4b3fe3` → `#3A83F7`。
- `apps/mobile/src/preferences-screen.tsx`：8 处图标线宽偏差统一回常规档 1.8（`1.7`×6、`1.5`×1、`1.6`×1），符合「常规 1.8 / 强调 2 / 填充 0」图标规范。

**验证**

- 全库 grep `#4B3FE3` / `#6E5AF0` / `#E5EAFF`：`apps/` 与 `packages/` 0 命中，紫色彻底清零。
- 组件层硬编码色值审计：除 `ui.tsx` 设计令牌、图表色板、自包含 HTML 模板与 `shadowColor` 外，无散落色值。
- 测试无颜色断言引用：`*.test.*` 对 `ALLOCATION_COLORS` / `bar-fill` / 相关色值 0 命中。
- `pnpm typecheck`（server + mobile）退出码 0；`pnpm test`：772 项测试全部通过 / 0 失败。

**注意**

- 本次不回归紫色：`ui.tsx` 品牌主操作保留 `#3A83F7`；品牌位图 `assets/logo.png` 维持蓝色系，无需替换。
- 依据会话中确认的 Doubao 视觉规范执行；「Doubao」设计库（V.3RSOA.PBS1K2）本次 Design Canvas 不可用，尺寸/间距/圆角体系的最终复核待设计库恢复后进行。
- 图标线宽规范已内置于 `apps/mobile/src/icons/index.tsx`（`DEFAULT_STROKE_WIDTH = 1.8`），后续新增图标默认即合规。

### 2026-10-27 · render.yaml 补齐每日简报定时调度环境变量（O2）

**背景**

O2 功能（`7430e33`，每日简报定时调度与行情源自检）在 `.env.example` 新增 `BRIEFING_SCHEDULE_ENABLED` / `BRIEFING_SCHEDULE_UTC_HOUR` / `MARKET_DATA_HEALTH_TTL_MS`，但 `render.yaml` 未同步。生产环境不显式开启开关时，每日简报永远不会自动生成，只剩手动 `POST /api/briefings/generate`。

**实现**

- [render.yaml](../render.yaml)：`lingwu-api` 服务同步部署环境变量共两批——
  - O2 每日简报：`BRIEFING_SCHEDULE_ENABLED=true`（生产必开；默认关闭）、`BRIEFING_SCHEDULE_UTC_HOUR=0`（UTC 00:00 = 北京 08:00 执行）、`MARKET_DATA_HEALTH_TTL_MS=300000`（akshare 自检缓存）。
  - P1/F3 财报与行情：`PDFTOTEXT_BIN=pdftotext`（财报 PDF 解析依赖 PATH 中的 poppler 二进制，缺失时 PDF 上传返回 422、文本粘贴可用）、`PDF_HEALTH_TTL_MS=300000` 与 `PDF_HEALTH_TIMEOUT_MS=3000`（`/api/health` 的 pdf 自检）、`RISK_FREE_RATE=0.02`（Sharpe 无风险利率）、`MARKET_DATA_HISTORY_TIMEOUT_MS=10000` 与 `MARKET_DATA_HISTORY_CACHE_TTL_MS=1800000`（日线行情 10s 截止 / 30min 缓存）。
- 单进程部署（API 内嵌 worker、PGlite）即可生效，无需拆独立 worker。

**验证**

- `ruby -ryaml` 解析通过：`services=lingwu-api,lingwu-browser,lingwu-web`，`lingwu-api` 环境变量共 36 个，结构合法。
- 释放到 Render 后需重新部署 `lingwu-api` 使新环境变量生效；次日 UTC 00:00 观察日志 `phase=briefing-schedule outcome=enqueued`。

**注意**

- A 股实时数据依赖部署环境预装 `python3 + akshare`（可配置 `AKSHARE_PYTHON` 指向 venv 解释器）；未安装时 `/api/health` 返回 `market_data.akshare.status=unavailable`，A 股自动回退 Yahoo（约 15 分钟延迟），不影响服务启动。
- 财报 PDF 解析依赖 `pdftotext`（poppler-utils）；环境中未安装时 `POST /api/financials/parse` 对 PDF 请求返回 422，`/api/health` 的 `pdf.status=unavailable`，文本粘贴仍可用。

### 2026-10-27 · 未读通知卡片添加浅紫色背景提示

**背景**

用户选中「通知」列表中的未读通知卡片（含「新」Chip、来源 Markdown 摘要、时间戳与「查看任务」按钮），希望未读卡片以浅紫色背景与已读卡片区分，形成更直接的视觉提示。

**实现**

- `apps/mobile/src/agent-ui.tsx`：`NotificationsSheet` 中通知卡片新增条件背景色——未读（`!item.read`）使用品牌浅紫 `colors.sky`（#E5EAFF），已读回到 `colors.canvas` 白底；描边继续按未读/已读在 `lineStrong` / `line` 间切换。背景色沿用设计令牌，未硬编码色值。

**验证**

- `pnpm --filter mobile typecheck`（`tsc --noEmit`）退出码 0。
- `pnpm test`：686 项测试全部通过 / 0 失败。

### 2026-10-27 · 任务来源卡片支持 Markdown 语法渲染

**背景**

用户选中「查看任务」详情页「来源」区域内的摘要文本，内容为市场快讯的 Markdown 原文（`##` 标题、`**加粗**`、`* 列表`、链接等），语法被原样显示。该区域由 `EvidenceList` 渲染，同时服务于任务详情与灵感（Idea）详情的来源列表。

**根因**

[agent-ui.tsx](apps/mobile/src/agent-ui.tsx) 中 `EvidenceList` 组件使用 `<Text selectable style={s.small}>{item.excerpt}</Text>` 将来源摘要纯文本直出，Markdown 原始语法未被解析。

**实现**

- `apps/mobile/src/agent-ui.tsx`：
  - 引入 `react-native-markdown-renderer` 的 `Markdown` 组件，并复用 `assistantMarkdown`（`html: false`，禁用原始 HTML 注入）与 `isSafeAssistantUrl` 安全校验。
  - 新增模块级 `evidenceMarkdownStyle`：正文沿用原 `s.small` 规格（`colors.muted`、11px、行高 17），标题逐级缩小至 12.5/12/11.5px 并去除默认下边框，段落与列表边距压缩至 1-2px，链接使用品牌主色 `colors.primary` + 下划线，行内代码/代码块使用 `colors.tertiary` 浅底区隔，引用块与分隔线同样按小卡片尺度收敛。
  - 新增 `evidenceMarkdownRules`：`textgroup` 节点保持 `selectable`，来源摘要仍可整段复制。
  - 新增 `openEvidenceLink`：链接统一经 `isSafeAssistantUrl` 校验后调用 `Linking.openURL`，拦截 `javascript:` 等危险协议。
  - `EvidenceList` 的 `item.excerpt` 改用 `<Markdown>` 输出；来源标题、打开来源/查看邮件/查看文件按钮与来源链接行为保持不变。

**验证**

- `pnpm typecheck`（server + mobile）退出码 0。
- `pnpm test`：686 项测试全部通过 / 0 失败。
- 真实浏览器验证（Chrome DevTools + sample QA 环境）：任务「Availability watch」来源卡片中，`##` 标题已按标题样式分段、`**加粗**` 已加粗、`* 列表` 已转为列表符号、`[链接](url)` 已剥离 URL 变为可点击文本、行内代码已去掉反引号呈现等宽底色，Markdown 语法全部闭环渲染，原始标记不再以字面文本显示。
- 补充修复：来源摘要在服务端生成时也会被 `\s+` 折叠为单行（见 `apps/server/src/engine/service.ts`），破坏标题/列表/引用的块级结构。`runMonitor` 现将折叠后文本仅用于 hash 匹配与条件判定，证据摘要 `excerpt` 单独派生自原始观察文本并保留换行结构，确保 Markdown 块级语法可正常渲染。

### 2026-10-27 · 对话回复卡片加宽

**背景**

用户选中对话流中一条助手回复卡片（含序号列表与要点说明）及其下的工具结果卡片，要求「对话回复的卡片宽度拉长一些」。原助手消息列 `maxWidth` 为 720，在高分屏下（内容列 61.8% 可达 890+）留白明显；工具结果卡片另有一层 `maxWidth: 640`，比正文更窄，形成视觉阶梯。

**实现**

- [chat.tsx](apps/mobile/src/chat.tsx)：助手消息容器 `maxWidth` 由 `720` 提升至 `860`（用户气泡仍为 `560` 不变）。
- [tool-step.tsx](apps/mobile/src/tool-step.tsx)：`wrap` 的 `maxWidth` 由 `640` 提升至 `860`，与助手回复卡片同宽，消除工具卡片窄一截的错位。
- 布局宽度本身仍受主内容区 61.8% 列宽约束，窄屏下自动收窄，不影响移动端。

**验证**

- `pnpm typecheck`（server + mobile）退出码 0。
- `pnpm test`：678 项测试全部通过 / 0 失败。

### 2026-10-27 · 对话流记忆回顾卡片支持 Markdown 语法渲染

**背景**

用户选中对话流中一条「Closing Bell: Nasdaq / S&P 500」市场快讯（内容为完整的 Markdown 原文，含 `##` 标题、`**加粗**`、`* 列表`、时间戳与被截断的段落），其外层 DOM class 为 react-native-web 的原子类（`r-userSelect-1xnzce8` 提示由 RN `<Text selectable>` 渲染纯文本），原始语法全部原样显示。经与用户确认，该区域定位为对话流里的「记忆回顾卡片」。

**根因**

[memory-recall-card.tsx](apps/mobile/src/memory-recall-card.tsx) 中 `MemoryRow` 组件第 40-41 行使用 `<Text selectable style={styles.text}>{memory.text}</Text>` 将记忆内容纯文本直出，`##`、`**`、`*`、`[](url)` 等原始语法被原样展示。

**实现**

- `apps/mobile/src/memory-recall-card.tsx`：
  - 引入 `react-native-markdown-renderer` 的 `Markdown` 组件与 `assistantMarkdown` / `isSafeAssistantUrl`（复用助手消息同一 markdown-it 实例与安全 URL 校验）。
  - 新增模块级 `memoryMarkdownStyle`：正文沿用原 `styles.text`（`colors.text`、13.5px、行高 19），标题逐级缩小、链接品牌主色下划线、行内代码/代码块浅紫底（`tertiary`）区隔。
  - 自定义 `memoryMarkdownRules`：`textgroup` 节点显式 `selectable`，长文本记忆仍可整段复制（与 `AssistantResponse` 行为一致）。
  - 链接点击统一走 `openSafeLink`（`isSafeAssistantUrl` 校验后 `Linking.openURL`），拦截外部地址与危险协议。
  - 移除不再使用的 `styles.text` 样式条目。
- 保持原卡片容器样式（Canvas 表面色图标、圆角、`flex: 1` 正文列）不变。

**验证**

- `pnpm typecheck`（server `tsc --noEmit` + mobile `tsc --noEmit`）退出码 0。
- `pnpm test`：651 项测试全部通过 / 0 失败。
- 真实记忆卡片渲染需在已登录浏览器中触发 `recall_memory` 工具后确认。

### 2026-10-27 · 对话页用户消息气泡支持 Markdown 语法渲染

**背景**

用户选中对话流中一条「国际金融市场快讯」消息（内容为完整的 Markdown 原文，含 `##` 标题、`* [链接](url)` 列表、行内链接），其外层 DOM class 为 react-native-web 的原子类，说明该文本此前由 RN `<Text>` 组件以纯文本直出，`##`、`*`、`[]()` 等原始语法全部原样显示。用户要求对该区域（div）添加 Markdown 语法渲染。

**根因**

[chat.tsx](apps/mobile/src/chat.tsx) 中消息渲染分两条路径：`assistant` 消息已走 `<AssistantResponse>`（Markdown 渲染），而 `user` 消息走 `<Text selectable>{text}</Text>` 纯文本直出——用户在输入框中粘贴/发送含 Markdown 原文的内容（如研究快讯）时，原文被原样展示。

**实现**

- `apps/mobile/src/chat.tsx`：
  - 引入 `react-native-markdown-renderer` 的 `Markdown` 组件与 `assistantMarkdown` / `isSafeAssistantUrl`（复用助手消息同一 markdown-it 实例与安全 URL 校验）。
  - 新增用户气泡专用样式 `userMarkdownStyle`（模块级常量）：文字反白为 `colors.onPrimary`（品牌色紫底上保持白色），标题 1/2/3 白色加粗放大、链接白色下划线、行内代码/代码块保留浅紫底（`tertiary`）做区隔。
  - 自定义 `userMarkdownRules`：`textgroup` 节点显式 `selectable`，保证长文本可复制（与 `AssistantResponse` 行为一致）。
  - 链接点击统一走 `openSafeLink`（`isSafeAssistantUrl` 校验后 `Linking.openURL`），拦截外部地址与危险协议。
  - 纯文本短消息渲染效果与原来一致（`paragraph` margin 归零 + 气泡内边距不变）。

**验证**

- `pnpm typecheck`（server `tsc --noEmit` + mobile `tsc --noEmit`）退出码 0；顺带修复了遗留未跟踪文件 `apps/server/src/market-data-health.ts` 中 `??` 与 `||` 混用导致的 TS5076 报错（仅补括号，语义不变）。
- `pnpm test`：658 项测试全部通过 / 0 失败。
- 页面在 8081 正常编译渲染，无 React 运行时错误（MCP 浏览器上下文无法访问 8787 后端，真实消息渲染需在已登录浏览器中刷新确认）。

### 2026-10-27 · 对话页主内容区宽度调整为整页 61.8% + 产物面板改为右侧停靠栏

**背景**

用户先要求对话页主内容区在宽屏下占整个网页宽度的 70%（而非固定 900px），随后将比例缩短为 61.8%（黄金分割比）；且点击页头文件图标（`FileText` svg）后，产物面板从「覆盖式弹窗」（带遮罩、浮在内容上）改为「停靠在主对话列右侧的侧边栏」，与主内容区并排分栏、不遮挡。

**实现**

- `apps/mobile/App.tsx`：`WorkspaceShell` 中计算 `contentMax = desktop ? Math.max(760, Math.round(width * 0.618)) : 760`，主内容区 `maxWidth` 由固定 `900` 改为 `contentMax`——桌面端占整页 61.8%（下限 760 防止窄桌面过挤），移动端保持窄列不变。
- `apps/mobile/src/chat.tsx`：
  - 引入 `useWindowDimensions`，按 `wide = windowWidth >= 900`（与 App 外壳的 desktop 判断一致）区分宽/窄屏。
  - 宽屏且产物栏展开时，`ChatScreen` 根节点切换为 `flexDirection: "row"` 分栏：主对话列（`flex: 1, minWidth: 0`）与右侧停靠栏并排，其余情况保持独占整列。
  - `ThreadArtifactsPanel` / `ArtifactsPanel` 增加 `mode: "docked" | "overlay"` 双模式：
    - `docked`（宽屏）：右侧停靠，宽 340 / `maxWidth: 42%`，无遮罩、无阴影、无 `accessibilityViewIsModal`。
    - `overlay`（窄屏）：保留原覆盖式行为（宽 320 / `maxWidth: 85%`，带 `modalShade` 遮罩、阴影与 `accessibilityViewIsModal`），避免移动端对话列被压缩。
- 产品/业务逻辑零改动：面板内容、产物列表、打开/关闭行为均不变。

**验证**

- `pnpm typecheck`（`tsc --noEmit` + `pnpm --dir apps/mobile typecheck`）退出码 0。
- `pnpm test`：630 项测试全部通过 / 0 失败。

### 2026-10-26 · 图标体系迁移至自有 SVG 图标层 + 全站视觉收敛「Doubao」

**背景**

用户要求按选中的设计系统「Doubao」（ID `V.3RSOA.PBS1K2`）重构 LingWu 前端视觉，并用该设计系统的图标替换现有图标，同时保留 LingWu 既有的紫色（`#4B3FE3`）与白色主题。

**设计库可用性说明（重要）**

本轮 Design Canvas 未启用 / 未选中 / 鉴权不可用，因此**未能通过 trae-design 插件正式读取并核验该设计库资产**。实际执行依据为：

1. 本会话此前已确立并固化进代码的设计规范（`ui.tsx` 令牌 + 圆角 + 描边 + 密度规则）；
2. 早期会话从本地目录 `/Users/luffy/.trae/design_libraries/Doubao` 抓取的历史本地快照。

历史快照中的 40 枚图标已登记为 `source: "library"`；其余 50 枚为设计库缺少对应语义时按同风格补齐，登记为 `source: "project"`。**Design Canvas 恢复后仍需重新通过插件核验资产清单与 token 映射。**

**实现 · 图标层**

- 新建 `apps/mobile/src/icons/`：`types.ts`（`IconDefinition` / `IconSource`）、`library.ts`（40 枚快照图标 + `LIBRARY_ICON_COUNT`）、`project.ts`（50 枚补齐图标）、`keys.ts`（纯数据映射表，可脱离 `react-native-svg` 在 Node 下测试）、`index.tsx`（渲染与注册表解析）。
- 直接复用项目已有的 `react-native-svg` 15.12.1，**未新增依赖**；`apps/mobile/package.json` 已移除 `lucide-react-native`。
- API 与 Lucide 保持兼容：`size` / `color` / `strokeWidth` / `fill` / `absoluteStrokeWidth`，并补齐 `accessibilityLabel`、`testID`。
- 线宽语义不变：常规 `1.8`、强调 `2`、填充 `0`；`absoluteStrokeWidth` 按 24×24 viewBox 等比换算；统一 `strokeLinecap="round"` / `strokeLinejoin="round"`。
- 未注册图标在模块加载时立即抛错，避免静默缺图。
- 28 个使用 Lucide 的文件全部改为从 `./icons` 导入。

**实现 · 视觉收敛**

- 令牌（`ui.tsx`）：中性面阶梯 `canvas #FFFFFF → surface #EFF1F4 → tertiary #E7EAEF`；统一描边 `line #E7EAEF` / `lineStrong #D5DBE3`；品牌 `primary #4B3FE3` + `onPrimary #FFFFFF`；`sky #E5EAFF` 仅保留给小面积状态 Chip。清理了无源码调用的 `blue` / `blueDark` / `primaryLight` / `lavender` / `card` 别名。
- 结构规范：边框优先、弱阴影；圆角收敛为面板 14 / 控件 10 / 小徽标 8 / 胶囊 999（对话气泡 18、语言切换器 19 为有意特例）。
- 覆盖范围：`shell.tsx`（宽屏侧栏）、`chat.tsx`（对话流、输入器、队列、侧聊、产物面板）、`ui.tsx` 基础组件、`agent-ui.tsx`、`screens.tsx`、`account.tsx`、`details.tsx`、`threads.tsx`、`thread-artifacts.tsx`、`conversation-header.tsx`、`question-card.tsx`、`approval-card.tsx` 及全部工具卡（提醒 / 记忆 / 搜索 / 邮件 / 浏览器 / 桌面 / 通知 / JEV / 工具步骤）。
- `artifact-html.ts` 自包含 HTML：页面改为白底 + 1px 描边 + 14px 圆角、移除重投影；摘要 / 统计 / 表头 / `pre` 改用 `surface` 与 `tertiary` 分层；`.bar-fill` 改为品牌紫纯色；深色代码块与语法高亮配色保留。CSP、iframe `sandbox`、`escapeHtml` 未改动。
- `HtmlPreview`（Web / 原生）与 `BrowserConsole.web.tsx` 的硬编码 `#FFF` 统一为 `colors.canvas`。

**安全与约束（全部保持）**

- 产物 HTML 仍为自包含、无脚本注入，`escapeHtml` 强制生效。
- 弹窗遮罩关闭 + 弹窗内部阻止冒泡；二级菜单按点击坐标动态定位并做边界检测。
- 研究产物只展示标题行 + 摘要，详情走全屏 Sheet。
- 对话发送 / 停止按钮位置不变、停止后恢复并保留草稿；消息队列、暂停队列、侧聊草稿行为未变。
- 第三方服务品牌色经产品确认后保留：Connections 列表新增 `serviceBrands` 令牌（Gmail `#EA5B4D`、Google Calendar `#4285F4`、浏览器 `#1987CF`、OpenBot `#6866A6`，各带 12% 浅色图标底座），仅用于服务识别；LingWu 自身模型行继续使用品牌紫。

**验证**

- `pnpm test`：597 通过 / 0 失败（新增 `apps/mobile/test/icons.test.ts`，覆盖 40 枚快照数量、全部导出名可解析、来源标记、注册表无重复、几何数据完整性）。
- `pnpm typecheck`、`pnpm lint`（266 文件）、`pnpm build:web`（1293 modules / index 3.78 MB）全部通过。
- `biome.json` 增加 `.qoder` / `.qoder-collab-runtime` 忽略项，避免本地工具运行文件干扰仓库级 lint。

### 2026-10-26 · 移动端业务页面视觉对齐「Doubao 紧凑型 AI Dashboard」

**背景**

设计令牌已在 `ui.tsx` 中确立（`canvas / surface / tertiary` 中性面阶梯、边框优先、统一圆角），但 `screens.tsx`、`account.tsx`、`conversation-header.tsx`、`threads.tsx`、`thread-artifacts.tsx` 五个业务页面仍混用旧的灰面大面板、`colors.sky` 大块底色、`colors.blueDark` 强调色与松散间距，需要在不改任何业务逻辑的前提下收敛到同一套视觉语言。

**实现**

- **卡片 / 面板**：Today 看板小卡片、Browser 顶部面板、研究产物封面、文档预览底色统一为 `canvas` + 1px `line` 描边 + 14px 圆角；`colors.sky` 不再做大块面板底色，仅保留给 Activity 待审核状态 Chip 与 Connections 当前模型 Chip 这类小面积状态标签。
- **数据表**：Connections 列表由灰色圆角面板改为白底描边数据表，表头使用 `s.label` 风格（11px、加粗、letterSpacing），表行使用 1px `colors.line` 分隔线 + 行圆角 10。
- **分段控件**：日历周历由品牌浅底选中态改为 `surface` 容器 + `canvas` 选中项 + `line` 描边，选中文字与事件圆点统一 `colors.primary`。
- **列表行 / 按压态**：邮件、日程、浏览器会话、Activity 操作与时间线、Connections 表行统一为紧凑密度（padding 10~12）、行圆角 10、按压态 `colors.overlay1`。
- **图标底座**：全部图标底座回到中性面 `surface`；图标、链接文字、强调小标题、激活态图标统一 `colors.primary`，`colors.blueDark` 在这五个文件中已全部清零。
- **产物条目**：对话内文件产物改为 `s.card` 承载的紧凑卡片（内边距 12、间距 8），字段区保持标题行 + 最多 4 行摘要，不展开大块内容；数值文本使用 `tabular-nums`。
- **文件按钮**：`conversation-header.tsx` 顶部文件按钮的展开 / 按压态统一 `colors.overlay1`，激活图标 `colors.primary` + 线宽 2。
- Connections 列表中 Gmail / Google 日历 / 浏览器 / OpenBot 的第三方品牌色已移除，统一使用 `colors.primary`，避免硬编码色值。（注：同日晚些时候的产品决策已恢复这些品牌色，详见上方「图标体系迁移至自有 SVG 图标层」条目。）

**验证**

- `pnpm --dir apps/mobile typecheck`（`tsc --noEmit`）退出码 0。
- Grep 自查：这五个文件无 `strokeWidth={1.5}/{2.5}/{3}` 离群线宽、无 `shadowOpacity`/`shadowRadius`、无硬编码十六进制色值、无残留 `colors.blueDark`。
- 影响面：仅样式与图标外观，未改动任何 `onPress` / `onChangeText` / 状态变量 / props / 翻译 key / 数据请求与导出符号。

### 2026-10-26 · 通知正文支持 Markdown

- [agent-ui.tsx](../apps/mobile/src/agent-ui.tsx) 的通知正文改用紧凑版 `AssistantResponse` 渲染，支持标题、粗体、列表、代码块、安全链接及对话中已有的文件引用。
- 复用现有 `markdown-it` 安全配置与 `react-native-markdown-renderer`，不新增依赖。
- `apps/mobile` 的 `tsc --noEmit` 通过；已在 Web 端通知弹窗核对标题、列表、粗体和行内代码的实际渲染。

### 2026-10-26 · 对话里的 HTML 文件可全屏打开

**背景**

LingWu 的 `FileViewer` 会把生成的 HTML 页面以 `srcDoc` 放进全屏 iframe，允许页面脚本运行但不授予同源权限。LingWu 此前只支持 PDF，点击对话里的 `.html` 文件名仍会进入 PDF 阅读器。REA 对 LingWu 约 506 KB 的生产 bundle 分析在 300 秒后超时，因此本次以 `web/src/components/FileViewer.tsx` 与相关源码作为逆向证据。

**实现**

- 服务端 [files.ts](../apps/server/src/files.ts)：支持 `.html` / `.htm` 与 PDF，HTML 必须是 UTF-8，按 `id.html` 存储并记录 `text/html`、`pageCount: 0`；HTML 不允许走 PDF 表单填充。
- 服务端 [app.ts](../apps/server/src/app.ts)：文件内容按真实 MIME 返回；HTML 额外发送 `X-Content-Type-Options: nosniff` 与 `Content-Security-Policy: sandbox`。
- 服务端 [computer-tools.ts](../apps/server/src/computer-tools.ts)：新增 `export_computer_file`，只把电脑工作区里的 `.html` / `.htm` 自包含页面导入 Files；对话与委托任务提示词要求页面使用内联 CSS/JavaScript、无外部资源，并在回复里写出准确文件名。
- 移动端新增 [file-kind.ts](../apps/mobile/src/file-kind.ts)，统一按 MIME/扩展名识别 HTML、PDF；对话文件卡、任务详情、Files、电脑文件与邮件附件都显示正确类型。
- 移动端 [details.tsx](../apps/mobile/src/details.tsx)：HTML 文件使用登录态读取文本，在 `fullscreen` Sheet 中由 `HtmlPreview` 渲染，并提供原文件打开/下载、分享与附加邮件操作。
- [HtmlPreview.web.tsx](../apps/mobile/src/HtmlPreview.web.tsx) 对文件页启用 `allow-scripts allow-popups allow-forms allow-modals`，但不加 `allow-same-origin`；原生 WebView 同步开启 JavaScript 与 DOM storage。研究产物仍使用无脚本的只读沙箱。
- Files 导入选择器与上传 MIME 同时接受 PDF 和 HTML。

**验证**

- `biome check`、根目录与 `apps/mobile` 的 `tsc --noEmit` 通过。
- 全量测试 577/577 通过；新增 HTML 存储/响应头/填充拒绝、`export_computer_file`（含非 HTML 拒绝）与前端文件类型测试。

### 2026-10-26 · 图标体系一致性统一

**背景**

在视觉大改版（对齐 TraeWork Light）之后，用户要求对前端全部 icon 进行重构。本轮设计库「TraeWork」在 Design Canvas 中暂时不可用，经用户确认采用「先做一致性统一」方式执行：不依赖设计库文件，仅基于会话中已确认的令牌与项目现状做收敛。

**规范（两档线宽语义）**

- 常规界面图标：`strokeWidth={1.8}`（细线基准，涵盖缺失补全与 1.7/1.9 归一）。
- 强调/主 CTA/激活态图标：`strokeWidth={2}`（2.1/2.2 归一至此）。
- 填充方钮（播放/停止）：保留 `strokeWidth={0}`。
- 残留的 3 处硬编码白色图标（`#FFF`/`#FFFFFF`）对齐为 `colors.onPrimary`：`thread-artifacts.tsx` 文件图标、`ui.tsx` 勾选框、`agent-ui.tsx` 保存成功对勾。

**实现**

- 批量处理 `apps/mobile/src/*.tsx` 及 `App.tsx` 共 25 个文件：新增/规格化 `strokeWidth={1.8}` 92 处，离群值规格化 7 处（含 `shell.tsx` 导航激活态条件式 `active ? 2.1 : 1.7 → active ? 2 : 1.8`），全项目仅剩 1.8/2/0 三档合法值。
- 边界处理：跳过 `Mascot`（自定义组件）、`ActivityIndicator`（RN 组件）、`PdfReader`/`desktop-stream`（渲染时无 `size` 属性）。

**验证**

- biome 检查 257 文件无告警（format 修复 3 个超长图标标签换行）；`pnpm typecheck` 通过；全量测试 570/570 通过。
- 影响面：仅图标线宽与 3 处图标颜色，无布局/逻辑变化。

### 2026-10-26 · 视觉体系对齐 TraeWork Light 设计系统

**背景**

用户通过 trae-design 插件选定「TraeWork」设计库，要求将 LingWu 前端视觉体系从自定义靛蓝紫主题（`#4F46E5` 系）迁移对齐到 TraeWork Light 模式设计语言。经确认执行两项决策：①彩色分类卡片统一为中性面（TraeWork「Quiet by default」）；②品牌主色同步替换 Logo/启动资源。

**令牌映射（[ui.tsx](../apps/mobile/src/ui.tsx)）**

- 页面背景 `#FFFFFF`（`--bg-base-default`）、卡片灰面 `#F5F5F5`（`--bg-base-secondary`，层级与旧主题相反）、次级灰面 `#E5E5E5`。
- 文字阶梯 `#171717`/`#404040`/`#737373`/`#A1A1A1`（`--text-*`）；边框/分割线中性 alpha `rgba(115,115,115,0.12/0.18)`（`--border-neutral-l1/l2`）。
- 交互态走中性 overlay 阶梯 `0.08/0.12/0.16`（悬停 l1 → 选中 l2 → 按下 l3），不再用品牌色填充。
- 品牌主色 `#4B3FE3`（`--bg-brand`，稀缺使用）、亮阶 `#6A6FFF`、brand-100 浅底 `#E5EAFF`（选中态/图标块/状态 Chip 等小面积）。
- 状态色 `#15A877`/`#E27900`/`#E8463A` 及配套 surface 浅底（`rgba(…,0.12)`）；新增 `modalShade` 遮罩令牌。
- 数据/度量数字启用 `tabular-nums`（`s.metric`），对齐数值展示规范。

**页面色值替换（消除约 120 处硬编码十六进制色）**

- [App.tsx](../apps/mobile/App.tsx)、[chat.tsx](../apps/mobile/src/chat.tsx)、[shell.tsx](../apps/mobile/src/shell.tsx)、[screens.tsx](../apps/mobile/src/screens.tsx)、[agent-ui.tsx](../apps/mobile/src/agent-ui.tsx)、[tool-step.tsx](../apps/mobile/src/tool-step.tsx)、[approval-card.tsx](../apps/mobile/src/approval-card.tsx)、[assistant-response.tsx](../apps/mobile/src/assistant-response.tsx)。
- 工具卡系列（`browser/desktop/mail/search/jev-tool-card`、`computer`、`computer-workspace`、`thread-artifacts`、`question-card`、`conversation-header`、`LanguageSwitcher`）：卡片底统一 `colors.surface`，内嵌块 `colors.tertiary`，状态色对齐 TraeWork。
- 治理说明：统一后移除 `AgendaRow` 失效的 `index` 参数及调用的 `index={i}`（其 `#C7D2FE/#C7D6AB/#D9CDEA` 轮换色条已收敛为中性线）；保留第三方品牌色（Gmail/Google/Skype/Yahoo）。
- [artifact-html.ts](../apps/mobile/src/artifact-html.ts)（Web 产物模板）：背景/文字/表格/条纹/统计数字全部对齐 Light 规范；`.bar-fill` 渐变与 `.chip`/`.summary` 品牌色同步为 `#4B3FE3` 系；`.stat-value`/`.bar-value` 增加 `tabular-nums`；深色代码块配色保留。

**品牌资源**

- [logo.svg](../apps/mobile/assets/logo.svg)、[favicon.svg](../apps/mobile/public/favicon.svg)、[app.json](../apps/mobile/app.json) 的 `web.themeColor`：`#4F46E5` → `#4B3FE3`。

**验证**

- biome 检查 257 文件无告警（格式化 9 个文件）；`pnpm typecheck` 通过；全量测试 570/570 通过；Web 端 Metro 服务正常渲染。
- 注意事项：`assets/logo.png` 为位图无法直接改色，需用新品牌色 `#4B3FE3` 重新导出。

### 2026-10-25 · 灵感页空态下方预置投研灵感建议

**背景**

用户在灵感页空态选中「给好研究留点空间」提示块（`Empty` 组件），要求在它下方添加一些投研灵感，让空状态不只是两句话，而是可以直接动手的高频投研场景。

**方案**

将空态中原有的「或从投研模板快速开始 + 3 个按钮」升级为**投研灵感建议列表**：每条灵感以「emoji + 标题 + 一句话动机 + 开始这个」的行卡片呈现，视觉与云端刷新出来的灵感卡片一致；点击「开始这个」直接委派一条 `kind: "agent"` 研究任务并打开任务详情，沿用既有 `executeModelTask` 链路，无需新增后端路由。

**实现**

- [agent-ui.tsx](../apps/mobile/src/agent-ui.tsx)：
  - `IDEA_TEMPLATES` 升级为 `IDEA_SUGGESTIONS`（5 条，含 `emoji` / `titleKey` / `reasonKey` / `promptKey`）：个股深度研究、每日市场简报、财报核心分析、利率与政策跟踪、同业估值对比。
  - `startTemplate` 更名为 `startSuggestion`，按条目粒度用 `busyKey` 控制按钮忙碌态（原先整页 `busy`）。
  - 空态渲染由按钮列表改为分隔线卡片列表（`s.row` 行布局，标题 + 动机 + 右侧「开始这个」primary 小按钮）。
- i18n：
  - [zh-Hans/agent.ts](../apps/mobile/src/i18n/locales/zh-Hans/agent.ts) / [en/agent.ts](../apps/mobile/src/i18n/locales/en/agent.ts)：`agent.ideaTemplates` 更名为 `agent.ideaSuggestions`；为原有 3 条补充 `Reason` 键；新增利率政策、同业对比 2 组建议的 Title/Reason/Prompt 键（中英对齐）。

**验证**

- biome 检查无告警（自动格式化 2 个文件）；`pnpm typecheck` 通过；全量测试 570/570 通过。
- 影响面：仅灵感页的空态展示区块，非空态（已有云端灵感或已接受状态）渲染不变。

### 2026-10-25 · 为「灵感」「目标」「对话」预置投研模板

**背景**

用户基于 [PRD-LingWu-个人投研智能体](PRD-LingWu-个人投研智能体.md) 提出，为「灵感」「目标」「对话」三个区块预置投研模板，帮助快速发起基本面研究、市场简报、行业对比等日常工作。经确认采用**直接内置到界面**的形式：灵感页空态提供一键研究模板、目标表单按分类提供模板示例按钮、对话空态建议由 3 个扩充到 6 个。

**方案**

- **灵感空态**：在 `Empty` 组件下方渲染 3 个一键研究模板（个股深度研究 / 每日市场简报 / 财报分析），点击直接委派一个 `kind: "agent"` 的通用研究任务并打开任务详情，复用既有 `executeModelTask` 链路，无需新增后端路由。
- **目标表单**：按 `GoalsScreen` 传入的四类内部类目（Health / Relationships / Finances / Something else）各预置 2 个模板示例按钮，点击自动填充标题、成功标准与里程碑（多行文本），用户仍可编辑后再创建。
- **对话空态**：保留原有 3 个建议按钮，新增 3 个投研建议（深度研究股票基本面与估值 / 生成今日市场简报 / 对比同行业公司估值），共 6 个。

**实现**

- [agent-ui.tsx](../apps/mobile/src/agent-ui.tsx)：
  - 新增 `GOAL_TEMPLATES`（8 个目标模板，每类 2 个，字段全部使用 i18n key）与 `IDEA_TEMPLATES`（3 个灵感模板）。
  - `IdeasScreen` 空态新增模板区块，`startTemplate` 通过 `useAgentWorkspace().delegate({ title, prompt, kind: "agent", input: {} })` 一键委派并 `open({ type: "task", taskId })` 打开任务详情。
  - `GoalForm` 在字段区上方按 `category` 渲染对应模板按钮，点击填充 `title` / `description` / `milestones`。
- [chat.tsx](../apps/mobile/src/chat.tsx)：空态建议按钮由 3 个扩充到 6 个，新增 `chat.suggestionDeepDive` / `chat.suggestionBriefing` / `chat.suggestionPeerCompare` 三个普通研究建议（纯 `enqueue`，无需特殊导航）。
- i18n：
  - [zh-Hans/agent.ts](../apps/mobile/src/i18n/locales/zh-Hans/agent.ts) / [en/agent.ts](../apps/mobile/src/i18n/locales/en/agent.ts)：新增 `agent.ideaTemplates`、`agent.templateExamples` 及 3 组灵感模板、8 组目标模板的标题/描述/里程碑键（中英对齐）。
  - [zh-Hans/chat.ts](../apps/mobile/src/i18n/locales/zh-Hans/chat.ts) / [en/chat.ts](../apps/mobile/src/i18n/locales/en/chat.ts)：新增 `chat.suggestionDeepDive` / `chat.suggestionBriefing` / `chat.suggestionPeerCompare` 三个建议键（中英对齐）。

**验证**

- biome 检查无告警（自动格式化）；`pnpm typecheck` 通过；i18n 键等对校验 15/15 通过；全量测试 570/570 通过。
- 影响面：仅新增空态/表单内的提示区块与按钮，既有列表、编辑、创建流程不受影响。

### 2026-10-25 · 「委派任务」入口移入「目标」页面

**背景**

用户要求「button 这个功能移到 div 这个边栏，位于灵感和目标之间」，随后又调整方向「还是将这个功能移到 div 目标页面吧」，最终确认：委派任务入口不再放在图标栏/底部标签栏，而是作为「目标」页面内的一个入口行。

**方案**

委派任务在语义上是一个**动作入口**（点击打开委派面板），但它不适合作为顶级页签常驻导航——占用导航空间且与上下文割裂。最终将其作为「目标」页面（GoalsScreen）底部的一个独立入口行，与「创建一个目标」区块同层并列，点击调用 `useWorkspace().open({ type: "delegate" })` 弹出委派面板（Detail 面板类型本就支持该形态，workspace 层无需改动）。

**实现**

- [agent-ui.tsx](../apps/mobile/src/agent-ui.tsx)：`GoalsScreen` 引入 `useWorkspace().open`；在「创建一个目标」区块之后追加分隔线与一条「委派任务」入口行（`Send` 图标 + `threads.delegateTask` 文案 + `ChevronRight` 尾图标），点击打开委派面板。
- [shell.tsx](../apps/mobile/src/shell.tsx)：撤销上次的联合类型 `SectionNavItem`（page/action 可辨识联合），恢复为纯页面导航类型 `NavItem = { id: Section; labelKey; icon }`；`SECTION_NAV` 移除委派任务动作项，「灵感」与「目标」恢复相邻；`Rail` 渲染点还原为 `active={section === item.id}`、`onPress={() => navigate(item.id)}`。
- [App.tsx](../apps/mobile/App.tsx)：底部标签栏移除动作项分流（`item.kind === "action"` 逻辑删除，`onPress` 直调 `navigate(item.id)`、`active` 直判 `section === item.id`），页签数由七个还原为六个（对话/动态/灵感/目标/应用/我的）。
- i18n：`threads.delegateTask` 键保留，复用为目标页入口文案；无新增键。

**验证**

- biome 检查无告警（自动格式化）；`pnpm typecheck` 通过；全量测试 570/570 通过。
- 浏览器实测（Chrome DevTools + 本地 dev 服务，桌面视口与 390×844 移动视口）：
  - 桌面端左侧图标栏已无「委派任务」，顺序为 对话/动态/灵感/目标/应用。
  - 桌面端「目标」页面底部出现「委派任务」入口，点击弹出委派面板（计划/文档/财务/通用任务）。
  - 移动端底部标签栏还原为六个页签（对话/动态/灵感/目标/应用/我的）；「目标」页面内「委派任务」入口点击正常弹出委派面板。
- i18n 校验（中英键等对）通过。

### 2026-10-24 · 移除「更多」面板中的刷新工作区入口

**背景**

用户选中「更多 → 刷新工作区」按钮并要求删除该功能：此前该入口会触发 `useWorkspace().refresh()` 重新拉取工作区数据，实际使用率低，保留只会增加界面噪音。

**方案**

直接删除入口与相关资源，不影响其他工作区数据读取（会话、日历、文件等列表仍按各自逻辑自动加载/刷新）。

**实现**

- [threads.tsx](../apps/mobile/src/threads.tsx)：删除 `ThreadsSheet` 底部的「刷新工作区」按钮；`useWorkspace()` 解构移除 `refresh`；移除 `RefreshCw` 图标导入。
- [en/threads.ts](../apps/mobile/src/i18n/locales/en/threads.ts) / [zh-Hans/threads.ts](../apps/mobile/src/i18n/locales/zh-Hans/threads.ts)：删除 `threads.refreshWorkspace` 键（中英同步）。

**验证**

- biome 检查无告警（自动格式化）；`pnpm typecheck` 通过；全量测试 555/555 通过。
- 影响面：仅「更多 → 对话」面板底部一个入口；其余入口（委托任务、智能体电脑、日历、文件、应用与设置）保持不变。

### 2026-10-23 · 旁聊操作入口由内联重命名改为紧贴按钮的下拉操作列表

**背景**

用户要求「svg 改为点击弹出小窗，可选择重命名、归档和删除」，随后进一步明确「删掉标题，换成小弹窗，弹窗要紧挨按钮——准确说是按钮下属的二级操作列表」：此前对话列表中旁聊行右侧的铅笔图标点击后直接进入内联重命名，交互单一；现改为点击铅笔弹出**紧贴按钮的下拉操作列表**（无标题栏），提供「重命名 / 归档 / 删除」三项操作。

**方案**

- 旁聊行的铅笔图标保留为独立的行内按钮（不嵌套在整行选中按钮内，避免 react-native-web 冒泡吞点击），点击时把 `pageX/pageY` 记作锚点，在其正下方弹出无标题栏的下拉菜单 `ThreadActionsMenu`；菜单超出右/下边缘时向回夹紧，避免溢出屏幕。
- 菜单内三个操作项：
  - **重命名**：关闭菜单并复用既有的内联改名输入框（`editingId`/`draft` 逻辑不变）。
  - **归档**：调用 `useThreads` 的 `archiveThread(id)`；成功后若被归档的正是当前选中对话，自动切回主对话。
  - **删除**：CopilotKit `deleteThread` 为不可恢复的永久删除，菜单内先进入确认步骤（红色警示 + 取消按钮），确认后才真正删除；删除后若正是当前选中对话，同样切回主对话。
- 点击菜单外部任意处（透明背板）关闭菜单；菜单面板自身拦截点击冒泡，避免误关。

**实现**

- [shell.tsx](../apps/mobile/src/shell.tsx)：
  - 新增 `MenuAction`（操作行）与 `ThreadActionsMenu`（无标题下拉菜单，`Modal` + 透明背板 + 绝对定位卡片，含删除二次确认态）。
  - `ChatsColumn` 新增 `menuAnchor` 状态（记录坐标 `x/y` 与目标线程 `id`）与 `renameFromMenu` / `archiveFromMenu` / `deleteFromMenu` 处理逻辑；旁聊行 `onStartEdit` 改为透传铅笔按钮点击坐标并打开菜单。
  - `ThreadRow` 的 `onStartEdit` 签名由 `() => void` 扩展为 `(x, y) => void`，铅笔按钮 `onPress` 读取 `e.nativeEvent.pageX/pageY` 传出。
  - 新增 `Archive`、`Trash2` 图标导入；`Modal`、`useWindowDimensions` 从 react-native 导入；移除不再使用的 `Sheet` 导入。
- [en/threads.ts](../apps/mobile/src/i18n/locales/en/threads.ts) / [zh-Hans/threads.ts](../apps/mobile/src/i18n/locales/zh-Hans/threads.ts)：新增 `threads.actions`、`threads.delete`、`threads.permanentlyDelete`、`threads.deleteConfirmTitle`、`threads.deleteConfirmNote` 中英双语键。

**验证**

- biome 检查无告警（自动格式化）；`pnpm typecheck` 通过；全量测试 555/555 通过。
- 影响面：仅宽屏外壳（窗口宽度 ≥ 900）对话列表栏的旁聊行交互；主对话、本地待建旁聊（无铅笔）不受影响；`ThreadsSheet`（小屏「更多」面板）既有交互保持不变。

**注意**

- 删除为永久操作，已在菜单内增加二次确认；归档后可从「更多 → 对话」面板中恢复。

### 2026-10-22 · 登录会话有效期由 24 小时延长至 7 天

**背景**

用户要求「延长用户登录有效期到一周」：此前登录会话默认 24 小时过期，登录后一天内未操作即需重新登录，改为 7 天。

**方案**

会话有效期由 `SESSION_TTL_MS` 环境变量控制（代码默认值兜底），统一将默认值与本地/部署配置全部改为 7 天（`604800000` ms），确保不因某处配置遗漏而回退到短有效期。

**实现**

- [auth.ts](../apps/server/src/auth.ts)：`ttl()` 默认值 `24 * 60 * 60 * 1000` → `7 * 24 * 60 * 60 * 1000`，注释同步。
- [config.ts](../apps/server/src/config.ts)：`sessionTtlMs` 字段注释更新为「默认 7 天」。
- [.env](../.env) / [.env.example](../.env.example)：启用并写入 `SESSION_TTL_MS=604800000`。
- [render.yaml](../render.yaml)：`lingwu-api` 服务 `SESSION_TTL_MS` 值 `"86400000"` → `"604800000"`（下一次部署生效）。
- [demo/entry.ts](../apps/server/src/demo/entry.ts)：demo 模式预置会话 `expiresAt` 同步改为 7 天。
- [FEATURES.md](../docs/FEATURES.md)：说明文字「default 24 hours」→「default 7 days」。

**验证**

- biome 检查无告警；`pnpm typecheck` 通过；全量测试 555/555 通过。
- 影响面：仅登录 JWT/session 的过期时长；已签发的会话在签发时按当时 TTL 计算，新配置对新登录会话生效。

**注意**

- Render 部署后需重新部署 `lingwu-api` 以应用新 `SESSION_TTL_MS`；本地直接重启 API 即可（.env 已生效）。
- demo 模式与 live 模式登录有效期保持一致的 7 天。

### 2026-10-22 · 研究产物数据支持代码块语法高亮

**背景**

用户要求在 iframe 渲染的研究产物详情页中为数据增加「HTML 语法渲染」（经确认是指**数据代码块高亮**）：产物数据里的 JSON、多行代码/长文本（如计划、对比数据）此前是转义后的纯文本，可读性差，希望按语法上色。

**方案**

维持「渲染后的网页」展示不变，在 [artifact-html.ts](../apps/mobile/src/artifact-html.ts) 内置一个零依赖的轻量 tokenizer 做语法高亮：所有内部文本仍先 `escapeHtml` 转义（安全不变），仅对有结构的文本按 token 分类包裹 span 上色。不引入任何外部高亮库/脚本，保证 iframe/WebView 跨端一致。

**实现**

- [artifact-html.ts](../apps/mobile/src/artifact-html.ts)：
  - 新增 `highlightJson`：把 `JSON.stringify(value, null, 2)` 输出拆成 key / string / number / boolean·null / 标点 5 类 token 上色（key 靠「后跟冒号」判定）。
  - 新增 `highlightCode`：多行/超长字符串（代码、Markdown 面板数据）拆成字符串 / 数字 / URL 3 类 token 上色。
  - `text(value, inline=false)`：块级默认下，含换行或超 120 字符的字符串渲染为深色 `pre.code` 代码块；对象/数组渲染为 `pre.code[data-lang=json]` 高亮 JSON；`inline=true`（表格单元格）仍走转义行内纯文本，避免嵌套撑坏布局（`renderCell` 改传 `true`）。
  - HTML 文档 `<style>` 新增 `pre.code` 深色代码块与 `tok-key/tok-str/tok-num/tok-bool/tok-punc/tok-url` 配色。

**验证**

- 根目录 `pnpm typecheck` 通过；biome 检查无告警。
- 全量测试 555/555 通过。
- 需在部署后实测：详情页中对象/数组字段显示为高亮 JSON 代码块；含换行的长字符串显示为深色代码块；表格单元格仍显示紧凑行内文本。

**注意**

- 无外部资源、无脚本，延续 iframe `sandbox=""` / WebView `about:srcdoc` 的安全渲染方式。
- 仅影响详情页展示，对话内联的产物标题行与右侧边栏不受影响。

### 2026-10-22 · 研究产物详情弹窗改为全屏

**背景**

用户反馈：点击对话里的研究产物标题行弹出的详情页（HTML 渲染网页）仍是一个居中的小弹窗（最大宽 790/1050、高 94%、圆角、带背板 padding），要求改为与整个网页相同大小，即全屏铺满。

**方案**

`Sheet` 是全部详情弹窗的公共组件（FileDetail/MailDetail/BrowserDetail 等共用），不能直接改基础样式。新增 `fullscreen` 属性，仅让研究产物详情使用：弹窗铺满整个视口（宽高 100%、去圆角、去边框、去背板 padding），紧凑屏（宽 < 600）分支同样统一为全屏（不再走底部抽屉样式、隐藏顶部拖动条）。

**实现**

- [ui.tsx](../apps/mobile/src/ui.tsx)：`Sheet` 新增可选属性 `fullscreen?: boolean`。为 true 时：背板 `padding: 0`；面板 `width/height/maxWidth/maxHeight: "100%"`、`borderRadius: 0`、`borderWidth: 0`；紧凑屏分支（`compact && !fullscreen`）与拖动条均被跳过；`ScrollView` 设 `flex: 1` + `contentContainerStyle.flexGrow: 1`，让内部内容撑满剩余空间。
- [HtmlPreview.web.tsx](../apps/mobile/src/HtmlPreview.web.tsx) / [HtmlPreview.native.tsx](../apps/mobile/src/HtmlPreview.native.tsx)：外层 View `flex: 1` 撑满，iframe（`height: 100%`）与 WebView（`flex: 1`）填满容器，替换原先固定高度 620。
- [details.tsx](../apps/mobile/src/details.tsx)：`ArtifactDetail` 由 `wide` 改为 `fullscreen`。

**验证**

- 根目录 `pnpm typecheck` 通过；biome 检查无告警。
- 全量测试 555/555 通过。
- 需在部署后实测：点击研究产物标题行 → 详情网页全屏铺满、HTML 内容自适应撑满、右上角关闭按钮正常。

**注意**

- 其他详情弹窗（文件/邮件/浏览器/任务等）未走 fullscreen 分支，仍保持居中弹窗样式，不受影响。

### 2026-10-22 · 文件产物右边栏「分对话显示」

**背景**

用户反馈右侧「文件产物」边栏把**所有对话**生成的产物与文件一股脑放在一起，要求：只能展示左侧当前对话对应的产物文件，分对话显示，互不混淆。

**方案**

通过「对话 thread ↔ 任务 task ↔ 产物/文件」链路做过滤。任务创建时由服务端记录发起对话的 `threadId`；客户端边栏只展示「threadId 匹配当前对话的任务」所关联的研究产物（`AgentArtifact.taskId`）与文件（`AgentTask.artifactIds`）。

**实现**

- [agent.ts](../packages/domain/src/agent.ts)：`AgentTask` 新增可选字段 `threadId?: string`（发起该任务的对话 id；由对话内委托创建的任务才有，独立入口创建的任务为空）。
- [service.ts](../apps/server/src/engine/service.ts)：`createTask(owner, raw, idempotencyKey?, held?, threadId?)` 新增第 5 个可选参数，持久化到任务的 `threadId` 字段。
- [conversation.ts](../apps/server/src/engine/conversation.ts)：对话内 3 处创建任务的入口全部传入当前对话 `input.threadId` —— `delegate_task` 工具执行、sample 兜底的文档任务、sample 兜底的 agent 任务（`sample(prompt, key, threadId?)` 签名同步扩展）。
- [chat.tsx](../apps/mobile/src/chat.tsx)：新增 `ThreadArtifactsPanel` 包装组件 —— 按当前 `threadId` 过滤出本级对话的任务集合，研究产物按 `artifact.taskId ∈ 任务 id 集合` 过滤，文件按任务 `artifactIds` 匹配，再交给原 `ArtifactsPanel` 渲染；`ChatScreen` 调用点从传全局 `w.files`/`agentWorkspace.artifacts` 改为传全量 + threadId 由包装组件过滤。

**验证**

- 根目录 `pnpm typecheck`（含 root `tsc --noEmit` 与 mobile 单独 typecheck）通过；biome 检查无告警。
- 全量测试 555/555 通过。
- 需在部署后实测：对话 A 生成的产物只出现在对话 A 的右侧边栏，对话 B 不受影响；旧任务（无 threadId）不再出现在任何对话边栏中。

**注意**

- 仅影响边栏展示；对话内联的产物标题行、任务详情卡片等展示逻辑不变。
- 独立入口（监视任务、想法采纳、REST 创建）创建的任务不带 threadId，不会混入任意对话的边栏。

### 2026-10-22 · 研究产物改为「标题行 + 点击弹出 HTML 详情页 + 文件产物边栏展示」

**背景**

用户在对话页中把结构化研究产物（`AgentArtifact`：计划/对比/财务/报告）展开成大量数据 div 的大卡片（原 `ArtifactCard`/`FinanceArtifact`，如财务 Svg 卡），希望改为：对话里只显示标题提示；点击标题弹出 HTML 渲染的网页查看详情；同时这些研究产物条目也要出现在右侧「文件产物」边栏中。经确认目标产物为**灵悟生成的研究产物**（`AgentArtifact`，`kind: plan/comparison/finance/report`）。

**实现**

- [artifact-html.ts](../apps/mobile/src/artifact-html.ts)（新增）：纯函数 `renderArtifactHtml(artifact)` —— 把研究产物渲染为**自包含静态 HTML 文档字符串**。无外部资源、无脚本、全部文本转义；通用数据按顶层字段渲染 `<table>`/`<dl>`/`<ul>`（数组截断 100 条）；财务产物专属「收入/支出/结余」统计卡 + 分类占比条形图 + 交易明细表。服务端不产出研究产物的 HTML 文件（`files.ts` 只处理 PDF），故由客户端生成。
- [HtmlPreview.web.tsx](../apps/mobile/src/HtmlPreview.web.tsx) / [HtmlPreview.native.tsx](../apps/mobile/src/HtmlPreview.native.tsx)（新增）：平台分支组件，Web 用 `<iframe srcDoc sandbox="" referrerPolicy="no-referrer">`、原生端用 react-native `WebView source={{ html }}`，安全渲染产物 HTML。
- [workspace.tsx](../apps/mobile/src/workspace.tsx)：`Detail` 联合类型新增 `{ type: "artifact"; artifact: AgentArtifact }`。
- [App.tsx](../apps/mobile/App.tsx)：detail 分发 key 新增 `detail.type === "artifact" ? detail.artifact.id` 分支。
- [details.tsx](../apps/mobile/src/details.tsx)：新增 `ArtifactDetail` 组件（`Sheet` + `HtmlPreview`，标题为产物标题、副标题为类型 + 日期）。
- [agent-ui.tsx](../apps/mobile/src/agent-ui.tsx)：`ArtifactCard` 重写为 `LinkRow` 紧凑标题行（标题 + 「类型 · 查看详情」，点击 `open({ type: "artifact" })`）；删除旧的展开式大卡片与整个 `FinanceArtifact` Svg 财务卡、`record`/`display` 辅助函数。对话 flow 与任务详情中的调用点自动生效。
- [chat.tsx](../apps/mobile/src/chat.tsx)：`ArtifactsPanel` 扩展数据源（新增 `artifacts`/`onOpenArtifact` props），面板按「研究产物 / 文件」两个分区渲染：研究产物行显示标题 + 「类型 · 创建时间」，点击打开 HTML 详情；文件行沿用原样。空态条件变为「files 与 artifacts 都为空」。
- i18n：新增 `chat.researchArtifacts`（研究产物 / Research outputs）、`chat.filesGroup`（文件 / Files）、`chat.artifactRow`（打开产物：{name} / Open artifact: {name}），以及 `agent.artifactOpenDetail`（查看详情）、`agent.artifactPreview`（研究产物预览 / Artifact preview）、`agent.artifactEmpty`、`agent.artifactTruncated`（截断提示，含 `{count}` 占位符），中英双语同步。

**验证**

- `pnpm --dir apps/mobile typecheck`（`tsc --noEmit`）通过。
- 全量测试 555/555 通过（含 i18n 中英 key 对等与占位符校验）。
- HTML 渲染需登录态下硬刷新后实测：对话中产物显示为标题行、点标题弹出详情网页、右侧边栏按分区列出研究产物与文件。

**注意**

- `agent.financeTracker`/`financeTrackerDetail`/`financeReadFromTransactions`/`financeTransactionsSummary` 等旧财务卡专属键现无 UI 引用（无害，未删除）。
- 财务统计卡复用的 `agent.financeIncome/Spending/Remaining`、`agent.whereMoneyWent`、`agent.viewTransactions` 等键仍被 `artifact-html.ts` 引用。

### 2026-10-22 · 对话页顶部按钮改为「展开文件产物右边栏」

**背景**

用户对对话页（`ChatScreen`）顶部的「新建侧边对话」加号按钮提出修改：改为点击展开右边栏，右边栏列表展示该对话生成的文件产物（工作区文件）。

**实现**

- [conversation-header.tsx](../apps/mobile/src/conversation-header.tsx) `ConversationHeader`：
  - 接口由 `onNewChat`/`newChatLabel` 改为 `onOpenFiles`/`filesOpen`/`filesLabel`；
  - 顶部图标由 `Plus`（新建侧边对话）改为 `FileText`（文件产物），选中态（`filesOpen`）高亮为 `colors.sky` 背景 + `colors.blueDark` 图标。
- [chat.tsx](../apps/mobile/src/chat.tsx) `ChatScreen`：
  - 移除 `useLingWuThread()` 解构中的 `start`，新增 `filesOpen` 状态（布尔，默认收起）；
  - header 传入 `onOpenFiles={() => setFilesOpen((open) => !open)}` 与语义化标签；
  - 新增覆盖式 `ArtifactsPanel` 组件：`position: absolute` 盖在聊天区右侧（宽 320 / `maxWidth` 85%），白底 + 左边框 + 阴影 + `elevation`；顶部标题「文件产物」与 ✕ 关闭按钮；正文按 `createdAt` 倒序列出 `w.files`（每个文件行显示名称、来源与大小、创建时间），点击行 `onOpen(file)` 打开文件详情；无文件时显示空态。
  - 交互与「点击背板关闭」保持一致：点击面板外的半透明遮罩（`Pressable`）收起面板；面板本体 `zIndex` 高于遮罩，内部点击不会误触遮罩关闭。
- i18n：新增 `chat.openArtifacts`（文件产物 / Files）、`chat.closeArtifacts`、`chat.artifactsEmptyTitle`、`chat.artifactsEmptyDetail`，中英双语同步；列表行无障碍标签复用 `chat.openAttachment`。

**验证**

- `pnpm --dir apps/mobile typecheck`（`tsc --noEmit`）通过。
- 全量测试 555/555 通过（含 i18n 中英 key 对等测试）。
- 面板展开/点击遮罩收起需登录态下硬刷新后实测。

**注意**

- 对话页顶部原「新建侧边对话」入口被替换；`threads.newSideChat`（新建侧边对话）现仅在 `ThreadsSheet` 侧栏中使用，如后续需要可在此处另行补充入口。

### 2026-10-22 · 详情弹窗支持「点击背板关闭」

**背景**

用户反馈：通知弹窗打开后（`NotificationsSheet` 经 `Sheet` 弹出），希望点击弹窗外任意处的深色背板（遮罩）也能关闭弹窗。

**核查**

此前代码中 `close` 仅由 ✕ 按钮（`onClose`）与 Escape 键（`ModalContent.js` 的 `closeOnEscape`）触发，不存在点击背板关闭的机制；`Sheet`/`Modal`/`modalShade` 均无背板点击 handler。

**实现**

[ui.tsx](../apps/mobile/src/ui.tsx) 的 `Sheet` 组件（所有详情弹窗的公共组件：通知 / 个性 / 委派 / 电脑 / 任务等）：

- 外层 `modalShade`（深色遮罩）由 `View` 改为 `Pressable`，`onPress={onClose}`——点击弹窗外任意处即关闭；
- 内层弹窗面板 `Pressable` 保留 `accessibilityViewIsModal`，并 `onPress={(e) => e.stopPropagation()}`——面板内任意点击（含空白区）不会冒泡到背板导致误关，面板内的按钮 / 滚动 / 底部抽屉拖动条等交互不受影响；
- 新增 `dismissOnBackdrop` 可选项（默认 `true`），个别需要防止误关的弹窗可传 `false` 关闭背板点击行为。

**验证**

- `tsc --noEmit`（apps/mobile）通过。
- Metro 运行中，`curl http://localhost:8081/apps/mobile/index.bundle?platform=web` 实测 bundle 已包含 `dismissOnBackdrop` 标识符（2 处）。
- 面板内点击不关闭、点击背板关闭的交互需登录态下硬刷新后实测。

**注意**

`Sheet` 是所有详情弹窗的公共组件，因此该行为对全部详情弹窗生效（点击遮罩即关闭为 RN Web 生态常见惯例）。若个别场景需要「点背板不可关闭」，传 `dismissOnBackdrop={false}` 即可。

### 2026-10-22 · 修复对话列表行点击无响应（嵌套按钮吞掉点击）

**背景**

用户反馈侧边栏「研究助手」会话行按钮点击没有反应，无法切换到该对话页。

**根因**

[shell.tsx](../apps/mobile/src/shell.tsx) 的 `ThreadRow` 把「点击标题改名」的内层 `Pressable` 嵌套在外层「选择对话」按钮内部。react-native-web 的 `PressResponder.onClick`（[PressResponder.js](../apps/mobile/node_modules/react-native-web/src/modules/usePressEvents/PressResponder.js)）始终调用 `event.stopPropagation()` 并只调用最近祖先 responder 的 onPress——点击标题区域时内层改名 handler 先触发并阻断冒泡，外层 `select()` 永远不执行，表现为「点击没反应」。Web 端已不可用，原生端也不符合「点击行应选中对话」的主流预期。

**修复**

- `ThreadRow` 重构：整行仅保留一个负责 `select()` 的按钮；改名入口改为行右侧独立铅笔图标（兄弟节点，不再嵌套），编辑态显示对勾保存/回车提交/失焦取消，与 `ThreadsSheet` 侧栏的「重命名 → 保存名称」交互一致。
- 内层不再有任何可点元素，点击标题任意区域都会命中外层按钮并切换对话。

**验证**

- `tsc --noEmit`（apps/mobile）通过。
- 全量测试 555/555 通过。
- `curl http://localhost:8081/apps/mobile/index.bundle?platform=web` 实测 bundle 已包含新代码（`Pencil`/`hitSlop`/`threads.saveName`）；登录页之外的真实点击需用户登录态下硬刷新确认。

**注意**

- 原生端交互变化：之前单击标题直接进入改名，现在单击标题选中对话、点铅笔改名。若希望在原生端保留「单击标题改名」，可后续按平台分支处理，但需注意双端一致性与本项目一贯的 UI 一致性偏好（此前用户曾要求平台内布局一致）。

### 2026-10-22 · 复核重复 key 报错：修复已生效，日志属历史/缓存

**背景**

用户再次从 trae-preview 控制台贴出 `Encountered two children with the same key, evidence-mail-fieldtrip`。

**核查（只排查，无代码改动）**

- 确认 10-20 修复 commit `b5c0931` 已入库，三个线程列表渲染点均带「列表内去重 + 跨列表互斥」：`shell.tsx`（`sideThreads`/`pendingThreads` + `seenSideIds`）、`threads.tsx`（`listedThreads`/`visitedPending` + `seenThreadIds`）、`App.tsx`（`visited` 经 Map 按 id 去重）。
- `curl http://localhost:8081/apps/mobile/index.bundle?platform=web` 实测 bundle 已包含修复标识符（`seenSideIds`×4 / `seenThreadIds`×4 / `visitedPending`×5），即 dev server 提供的是修复后代码。
- 其余 `key={*.id}` 渲染点（messages、toolCall、evidence、monitor、goal、notification 等）均非线程 id，不受 `evidence-mail-fieldtrip` 这类平台 slug 线程 id 影响。

**结论**

该报错是修复前页面产生的历史日志（React 警告随控制台保留、不自动清除），或 trae-preview 缓存了旧页面。清空控制台并硬刷新（清缓存重载）后不再出现；若刷新后仍复现，再按复现步骤追查。

### 2026-10-20 · 修复控制台 5 条日志（嵌套按钮 + 重复 key + ERR_ABORTED）

**背景**

trae-preview 控制台出现 5 条日志：2 条嵌套 button 报错、1 条重复 key（`evidence-mail-fieldtrip`）、2 条 `net::ERR_ABORTED`。

**根因与处理**

| 日志 | 根因 | 处理 |
|------|------|------|
| 2× `In HTML, <button> cannot be a descendant of <button>` | React 19 的嵌套校验扩展到 `role="button"`：ThreadRow 外层整行是按钮，内层「重命名」Pressable 也设了 `accessibilityRole="button"`，Web 端渲染为 `div role="button"` 嵌套，触发告警 | [shell.tsx](../apps/mobile/src/shell.tsx)：去掉内层 Pressable 的 `accessibilityRole`（保留 onPress），渲染为普通 div + onClick，交互不变 |
| 1× 重复 key `evidence-mail-fieldtrip` | 10-19 的去重只做了列表**内部**去重；当本地待建旁聊首次上线服务端列表的短暂窗口，同一 id 会同时出现在 `sideThreads` 与 `pendingThreads`（同一 ScrollView 的兄弟节点），以及 ThreadsSheet 的 `listedThreads` 与 `visitedPending`，跨列表重复 key | [shell.tsx](../apps/mobile/src/shell.tsx)：`pendingThreads` 增加 `seenSideIds.has(item.id)` 排除；[threads.tsx](../apps/mobile/src/threads.tsx)：先算 `listedThreads`，`visitedPending` 再按 `seenThreadIds` 跨列表排除 |
| 2× `net::ERR_ABORTED /api/agent`、`/api/workspace` | 正常中断：`/api/agent` 每 3 秒轮询被新请求取代或页面切换时，浏览器取消在途请求；已 `catch(() => {})` 静默处理 | 无需改动（浏览器正常行为） |

**验证**

- `tsc --noEmit`（apps/mobile）通过。
- 移动端测试 65/65 通过。
- 修复均为纯前端防御性调整：嵌套 button 去掉内层角色、跨列表按 id 互斥去重，不改变线程数据与任何交互行为。

**备注**

`app.renameChatLabel` 翻译键因去掉内层按钮的无障碍标签而暂时无引用，与 `app.sideChat` 一样可作后续清理的技术债。

**反思（2026-10-20 晚）**

本轮修复此前只停留在工作区、未提交（`git status` 显示 App.tsx / shell.tsx / threads.tsx / timeline.md 为 Modified），因此用户再次看到同样的 `evidence-mail-fieldtrip` 重复 key 报错——已部署/旧 bundle 版本不包含修复。当晚将三处渲染去重（shell / ThreadsSheet / App.tsx visited 按 id 去重）连同本期变更记录整理为单个 commit `b5c0931` 推送至 main。教训：**前端修复完成后必须及时提交并推送，否则线上（Render 自动部署来源）仍会复现旧问题**；同时确认所有线程列表渲染点均已覆盖去重（shell.tsx sideThreads/pendingThreads、threads.tsx listedThreads/visitedPending、App.tsx visited Map 去重）。

### 2026-10-20 · 保存设置去除按钮动效，改为弹窗提示已保存

**背景**

「保存偏好设置」与「记住」两个按钮在保存中（`busy` 状态）会显示加载转圈动画、并整体降低透明度，产生“文字动态效果”。用户希望点击保存时消除该动态效果，改为在最上层弹窗提示“已保存”。

**实现**

- [ui.tsx](../apps/mobile/src/ui.tsx)：`Button` 新增 `quietBusy` 可选项——`busy` 时保持原有防重复点击能力，但不再渲染 `ActivityIndicator`、不再降低透明度，文字保持静止。
- [agent-ui.tsx](../apps/mobile/src/agent-ui.tsx)：`AgentPersonalitySheet` 的「保存偏好设置」「记住」两个按钮改用 `busy + quietBusy`；保存成功后不再使用底部 toast 的 `notify`，改为经 `Modal` 弹出的居中「已保存」圆角卡片（对勾图标 + 文案），约 1.6 秒自动关闭；提示文案复用已有 i18n 键 `agent.saved`（已保存 / Saved）。

**验证**

- `npx tsc --noEmit`（apps/mobile）通过，无类型错误。
- `vitest run`：11 个测试文件全部通过（含 i18n 完整性检查，本次未新增翻译键）。
- Web bundle 编译 200 正常。

### 2026-10-19 · 修复会话列表重复 key 报错

**背景**

浏览器控制台反复出现 React 真实报错：

```
Encountered two children with the same key, `evidence-mail-fieldtrip`.
Keys should be unique so that components maintain their identity across updates.
```

**根因**

- `evidence-mail-fieldtrip` 是 CopilotKit 运行时/平台随机生成的服务端线程 id（三词连字符 slug 风格），并非项目代码生成的字符串——代码库中不存在任何 `evidence-` 前缀拼接。
- CopilotKit `useThreads` 首屏列表（`listSucceeded`）直接采用服务端返回的线程数组、不做去重（去重仅发生在翻页合并 `upsertThread` 时）。当运行时在首屏返回同 id 两条记录时，`ChatsColumn`（[shell.tsx](../apps/mobile/src/shell.tsx)）与 `ThreadsSheet`（[threads.tsx](../apps/mobile/src/threads.tsx)）的 `key={thread.id}` 渲染即冲突。
- 主线程 id（`/api/main-thread` 返回 `randomUUID()`）与本地新建线程（`newThreadId()` UUID v4）均非 slug 格式，进一步确认重复 id 来自运行时/平台侧数据。

**实现**

- [shell.tsx](../apps/mobile/src/shell.tsx)：`sideThreads` 与 `pendingThreads` 渲染前按 id 去重（保留首个）。
- [threads.tsx](../apps/mobile/src/threads.tsx)：`ThreadsSheet` 新增 `visitedPending` 与 `listedThreads` 两个去重后的列表，替换原两个 `.map()` 的渲染源；空态判断改用 `listedThreads.length`。

**验证**

- `npx tsc --noEmit`（apps/mobile）通过，无类型错误。
- 修复为纯前端防御性去重，不改变线程数据本身与任何交互行为；重复记录仅影响列表展示。

### 2026-10-19 · 添加网站 logo 与 favicon

**背景**

用户提供 `apps/mobile/assets/logo.png`（48×48）与 `logo.svg`（紫色圆角方底 `#4F46E5` + 白色折线图形），要求用作网站（Web 端）的 logo 与浏览器标签页图标。

**实现**

- [app.json](../apps/mobile/app.json)：`web.favicon` 指向 `./assets/logo.png`（供 `/favicon.ico` 服务与导出使用），并新增 `web.lang: "zh"`、`web.themeColor: "#4F46E5"`。
- [public/index.html](../apps/mobile/public/index.html)（新增）：Expo SDK 54 的自定义 HTML 模板（读取项目 `public/index.html`，优先级高于内置模板），在 `<head>` 加入 favicon 链接——SVG 优先、PNG 兜底、apple-touch-icon；保留 `%WEB_TITLE%` / `%LANG_ISO_CODE%` 占位符、`expo-reset` 样式与 `#root` 挂载点。项目根目录的 `index.html`（早期尝试）SDK 54 并不读取，已删除。
- [public/favicon.svg](../apps/mobile/public/favicon.svg)（新增）：复制自 `assets/logo.svg`，作矢量 favicon 静态资源。
- [public/favicon.png](../apps/mobile/public/favicon.png)（新增）：复制自 `assets/logo.png`，作 PNG 兜底 favicon 静态资源。
- 修正头像资源扩展名：[ui.tsx](../apps/mobile/src/ui.tsx) 的 `AVATAR_SOURCES` 六张照片头像在 `assets/` 下实际均为 `avatar1.png`~`avatar6.png`（此前误引 `.jpg`，导致 Web 打包 `Unable to resolve "../assets/avatar1.jpg"`），已统一为 `.png`；同步更正 [agent-ui.tsx](../apps/mobile/src/agent-ui.tsx) 注释与 [assets/README.md](../apps/mobile/assets/README.md)。

**验证**

- Web 打包通过（`Web Bundled … 2779 modules`）。
- `curl http://localhost:8081`：HTML 输出 `<html lang="zh">`、三条 favicon 链接（svg/png/apple-touch-icon）、`<meta name="theme-color" content="#4F46E5">`、`<title>` 等于 `web.name`。
- `curl -I /favicon.svg` → 200 image/svg+xml；`/favicon.png` → 200 image/png；`/favicon.ico` → 200 image/x-icon（由 Expo 从 `web.favicon` 自动生成）。

### 2026-10-19 · 头像模板由三色水豚换成六张照片头像

**背景**

智能体偏好设置里的头像选择原本是「天空蓝 / 沙色 / 淡紫」三款水豚涂装（同一张 `capybara.png` 配不同底色）。用户希望换成 `assets/avatar1.png`~`avatar6.png` 六张照片头像，供用户选择设置。

**实现**

- 领域类型 [agent.ts](../packages/domain/src/agent.ts)：`identity.avatar` 由 `"sky" | "sand" | "lilac"` 改为 `"avatar1"`~`"avatar6"`。
- 服务端校验 [routes.ts](../apps/server/src/engine/routes.ts)：`POST /identity` 的 `avatar` 枚举同步更新为新六值。
- 头像渲染 [ui.tsx](../apps/mobile/src/ui.tsx)：`Mascot` 新增 `AVATAR_SOURCES` 照片映射，`variant` 命中 `avatar1`~`avatar6` 时渲染圆形照片；未传值或旧版 `sky/sand/lilac` 历史值仍回退默认水豚涂装，保证旧数据不破图。
- 选择器 [agent-ui.tsx](../apps/mobile/src/agent-ui.tsx)：`AgentPersonalitySheet` 改为 `AVATAR_OPTIONS` 六张头像，默认 `avatar1`；`normalizeAvatar` 兼容旧值。
- i18n：[status.ts](../apps/mobile/src/i18n/locales/zh-Hans/status.ts) 与英文版删除 `status.sky/sand/lilac`，新增 `status.avatar1`~`status.avatar6`（头像 1~6 / Avatar 1~6）。
- 测试与文档：更新 [i18n.test.ts](../apps/mobile/test/i18n.test.ts) 枚举清单、[agent-api.test.ts](../tests/agent-api.test.ts) 用例值、[EXPERIENCE.md](../docs/EXPERIENCE.md) 与 [assets/README.md](../apps/mobile/assets/README.md)。

**验证**

- `pnpm typecheck` 通过（含移动端 `tsc --noEmit`）。
- `pnpm test` 全部 551 项通过（含服务端 `/identity` 枚举校验与 i18n key 完整性校验）。

### 2026-10-18 · 修复对话页 `Unexpected text node` 控制台报错

**背景**

Web 预览（`localhost:8081`，react-native-web）控制台反复出现：

```
Unexpected text node: . A text node cannot be a child of a <View>.
```

冒号后为空，说明某个 `<View>` 收到了空字符串子节点。`react-native-web` 在开发模式会遍历 children，发现 `typeof child === "string"` 即输出该警告。

**根因**

[chat.tsx](../apps/mobile/src/chat.tsx) 中：

```tsx
const integrityWarning = integrity.mismatched.length ? t("chat.streamIntegrityWarning") : "";
...
{integrityWarning && (<Text>{integrityWarning}</Text>)}
```

无数据校验冲突时 `integrityWarning` 为 `""`，`"" && JSX` 求值为 `""`，被 React 当作文本节点渲染进消息列表 `ScrollView`（内部是 `View`），因此每次渲染都会报错。

**实现**

- 改为 `{!!integrityWarning && (...)}`：空串时求值为 `false`，React 不再渲染任何节点。
- 同步审计移动端其余 `{变量 && JSX}` 条件渲染，确认其余变量均为 `boolean`、对象、`string | null | undefined`（不会产生空串），无需改动。

**验证**

- `apps/mobile` 下 `npm run typecheck` 通过。
- 该改动只影响开发期警告，不改变任何可见 UI 或业务行为；刷新 `http://localhost:8081` 即可确认警告消失。

### 2026-10-18 · 项目定位全局重构为「个人投研智能体」

**背景**

将 LingWu（灵悟）的整体定位从「给今天留一点余地」的生活/通用助理，重构为「个人投研智能体」。范围包括介绍标题、对话模板、灵感模板、目标任务、功能定位等全部用户可见文案，统一为金融投研口径。

**实现**

- 介绍标题：[app.ts](../apps/mobile/src/i18n/locales/zh-Hans/app.ts) 与英文包同步修改 `app.webTitle` / `app.welcomeTitle` / `app.welcomeSubtitle`，及各页签标题与副标题（灵感、目标、数据源、浏览器、文件）定位为投研场景。
- 对话模板：[chat.ts](../apps/mobile/src/i18n/locales/zh-Hans/chat.ts) 修改空态标题/副标题与三条建议按钮文案；[chat.tsx](../apps/mobile/src/chat.tsx) 中前两条建议按钮的硬编码 `enqueue` 提示同步改为投研提示（「分析一只股票的近期走势」「梳理一份财报的核心信息」）。
- 灵感模板：[agent.ts](../apps/mobile/src/i18n/locales/zh-Hans/agent.ts) 修改灵感空态、委派占位符（研报/持仓/研究计划）。
- 目标任务：[agent.ts](../apps/mobile/src/i18n/locales/zh-Hans/agent.ts) 修改目标空态、追踪占位符、分类（宏观研究 / 个股研究 / 组合与交易）。
- 功能定位：[screens.ts](../apps/mobile/src/i18n/locales/zh-Hans/screens.ts) 修改首页 Hero、助手提示、文件/活动副标题。
- README 顶部标语改为中英双语投研定位。

**验证**

- `pnpm typecheck` 通过。
- i18n 单测 15/15 通过（含中英 key 对齐、占位符一致、专有名词「灵悟」译名校验）。

**备注（未纳入本次范围）**

浏览器 Demo 场景（`apps/server/src/demo/` 下的 Hacker News / CopilotKit / 水族馆郊游示例及对应 `tests/demo-model.test.ts`、`docs/DEMO.md`）属独立的交互演示流，未在本次「定位文案重构」范围内，如需一并改为投研示例可另行处理。

### 2026-10-18 · 删除保存按钮动效，改为保存后弹窗提示

**背景**

「个性与记忆」弹窗里的「保存偏好设置」「记住」两个保存按钮，原先点击时有按压缩放、保存中淡入、保存完成脉冲等动画。用户希望删除这些点击动效，改为保存成功后弹出「已保存」提示。

**实现**

- [ui.tsx](../apps/mobile/src/ui.tsx)：`Button` 组件移除全部 `Animated` / `Easing` 动效（按压缩放、保存中淡入、完成脉冲、透明度过渡），恢复为简单 `Pressable`；保留禁用/保存中的静态透明度与保存中的加载指示器，按压时仅做静态透明度反馈，不再有动画。
- [agent-ui.tsx](../apps/mobile/src/agent-ui.tsx)：`AgentPersonalitySheet` 的 `save` 成功后调用 `notify(t("agent.saved"))` 弹出提示。
- 新增 i18n key `agent.saved`（中文「已保存」/ 英文「Saved」）。

**验证**

- `yarn typecheck` 通过。
- 保存按钮点击不再有缩放/脉冲动画，保存成功后底部弹出「已保存」提示。

### 2026-10-18 · 删除头像右上角红色数字角标

**背景**

宽屏左侧图标栏顶部头像右上角原本显示未读数量的红色数字角标（`pending > 0` 时出现），用户希望删除该角标。

**实现**

在 [shell.tsx](../apps/mobile/src/shell.tsx) 的 `Rail` 组件中，删除头像 `Mascot` 外层包裹的 `position: relative` 容器及其中 `pending > 0` 的红色角标块，头像现在直接渲染。`pending` 参数仍保留，供底部「通知」入口的 `badge` 使用。

**验证**

- `yarn typecheck` 通过（无诊断错误）。
- 头像不再显示红色数字角标。

### 2026-10-18 · 删除「更多」按钮与「刷新工作区」入口

**背景**

宽屏左侧图标栏底部的「更多」菜单在上一步已仅剩「刷新工作区」一项，用户希望直接删除该按钮及菜单入口，让底部只保留「通知 → 语言 → 我的」。

**实现**

在 [shell.tsx](../apps/mobile/src/shell.tsx) 的 `Rail` 组件中：

- 删除「更多」`RailItem` 及其触发的 `Modal` 菜单弹层；
- 删除「刷新工作区」菜单项，以及不再使用的 `menuRow` 辅助函数；
- 清理相关状态与引用：`menuOpen`、`anchor`、`trigger`、`showMenu`、`refresh`（来自 `useWorkspace`），以及 `MoreHorizontal`、`RefreshCw`、`Modal`、`useRef`、`useWindowDimensions` 等导入。

**验证**

- `yarn typecheck` 通过（无诊断错误）。
- 左侧栏底部现为「通知 → 语言 → 我的」，「更多」及「刷新工作区」已移除。

### 2026-10-18 · 通知与语言移出「更多」菜单

**背景**

宽屏左侧图标栏里，「通知」与「语言」原先收纳在底部「更多」菜单中，需要多点一级才能触达。

**实现**

在 [shell.tsx](../apps/mobile/src/shell.tsx) 的 `Rail` 底部，把「通知」与「语言」移出菜单，直接放在「我的」上方：

- 通知：复用 `RailItem`（铃铛图标 + 文字 + 未读角标），点击打开通知弹窗；
- 语言：给 [LanguageSwitcher.tsx](../apps/mobile/src/i18n/LanguageSwitcher.tsx) 新增 `vertical` 形态，渲染成竖排图标栏项（语言图标 + 「语言」文字），点击在按钮右上方弹出语言列表；
- 「更多」菜单现在只保留「刷新工作区」。

**验证**

- `yarn typecheck` 通过。
- Web 端浏览器实测：左侧栏底部顺序为「通知 → 语言 → 我的 → 更多」；通知带角标；「更多」菜单仅剩「刷新工作区」。

### 2026-10-18 · 保存按钮点击交互动效重构

**背景**

「个性与记忆」弹窗中的「保存偏好设置」按钮（以及其他所有复用 `Button` 组件的按钮）原先的点击反馈是静态的：按下时 `transform: scale(0.98)`、禁用/保存中时 `opacity: 0.5`，状态切换是瞬间跳变，缺少过渡。

**实现**

在 [ui.tsx](../apps/mobile/src/ui.tsx) 的 `Button` 组件中，改用 React Native 内置 `Animated` + `Easing`（原生驱动）实现三段动效：

| 状态 | 触发时机 | 视觉变化 | 时长 / 曲线 |
|------|----------|----------|-------------|
| 按压 | `onPressIn` | 缩放到 0.97 | 90ms，`Easing.out(Easing.cubic)` |
| 松开 | `onPressOut` | 弹簧回弹到 1 | `Animated.spring`（friction 6 / tension 180） |
| 保存中 | `busy` 变 true | 加载指示器淡入、整体透明度降到 0.75 | 180ms，`Easing.inOut(Easing.cubic)` |
| 保存完成 | `busy` 由 true 回 false | 一次轻微回弹脉冲（1 → 1.04 → 1） | 130ms 放大 + spring 回落 |

要点：

- 用 `Animated.createAnimatedComponent(Pressable)` 把透明度与缩放直接作用在按钮根节点，`useNativeDriver: true` 保证不阻塞 JS 线程，也不影响 `onPress` 里的保存接口请求。
- 禁用态透明度 0.4、保存中 0.75，均做平滑过渡而非瞬间跳变。

**验证**

- `yarn typecheck` 通过。
- Web 端（PC）浏览器实测：应用正常加载、「个性与记忆」弹窗正常打开、按钮可点击，点击后回到正常态、无崩溃。
- 备注：Web 端 `useNativeDriver` 会回退到 JS 动画（RN Web 无原生动画模块），功能正常仅性能略低；移动端原生环境下由原生驱动，保持 60fps 流畅。

### 2026-10-18 · 修复「获取对话历史报 Failed to fetch」

**问题现象**

前端 Web 端加载对话历史时，浏览器控制台报错：

```
Failed to fetch
```

对应的 SSE 流请求 `GET /api/conversation/stream/:threadId` 在浏览器网络面板中被标记为 `net::ERR_FAILED`。

**根因**

前端发起 SSE 流请求时携带了 `Cache-Control: no-cache` 请求头（见 [conversation-stream.ts](../apps/mobile/src/conversation-stream.ts) 的 `headers()` 函数）。该自定义请求头会触发浏览器的跨域预检（preflight）。但服务端 CORS 配置的 `allowHeaders` 未放行 `Cache-Control`，导致预检通过后实际请求仍被 CORS 拦截，最终表现为 `Failed to fetch`。

**修复**

在 [app.ts](../apps/server/src/app.ts) 的 CORS 配置中，将 `Cache-Control` 加入 `allowHeaders`：

```ts
allowHeaders: ["Content-Type", "Authorization", "Accept", "Last-Event-ID", "Cache-Control"],
```

**验证**

- 预检响应头 `access-control-allow-headers` 现包含 `Cache-Control`。
- 浏览器网络面板中 `/api/conversation/stream/:threadId` 由 `net::ERR_FAILED` 变为 `200`。
- 页面不再展示 `Failed to fetch`，对话历史正常回放。

### 2026-10-18 · 排查结论：其余报错为瞬时 / 可降级

修复 CORS 后，控制台曾短暂出现以下报错，经排查均非代码缺陷：

| 日志 | 真相 |
|------|------|
| `net::ERR_ABORTED /api/workspace`、`/api/agent` | 服务端热重载（`tsx watch`）重启时，在途请求被浏览器取消（瞬时） |
| `REST connect request failed: Failed to fetch` | CopilotKit 将底层 `ERR_CONNECTION_REFUSED` 包装为 "Failed to fetch" |
| `agent_connect_failed` / `agent_run_failed_event` / `Agent execution failed` | 连接未建立即触发运行失败事件的连锁反应 |

根因：修改 `app.ts` 触发 `tsx watch` 热重载，服务端重启的 1~2 秒内连接被拒绝。服务恢复后所有请求均返回 `200`，报错不再复现。

另外，`wss://realtime.intelligence.copilotkit.ai` 的 WebSocket 连接警告为 CopilotKit 云端（Intelligence）实时推送通道的间歇性网络失败，CopilotKit 内置优雅降级（最多重试 5 次后回退到 REST 轮询），不影响线程列表与记忆功能。
