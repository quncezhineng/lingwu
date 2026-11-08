# 项目时间线与进度

> 本文件记录 LingWu（灵悟）项目的里程碑、进度跟踪与变更记录。
> 变更按时间倒序排列，最新变更在最上方。

## 变更记录

### 2026-11-08 · UI：右侧栏「智能体能力」跟随真实技能配置，按钮改为「解锁更多的能力」

**背景**

全局页面右侧栏「全局能力」里的「小悟 的能力」卡片由 `AgentMoreContent` 渲染：当 Agent 没配置自建技能、也没从技能库安装技能时，会回退到模板自带的 `current.skills`，仍然显示「行情与自选 / 市场简报 / 标的研究 / 财报解析」四张写死的卡片，与 Agent 详情 → 技能页的空态不一致。用户要求没配置技能时这一栏为空，并把底部按钮改为「解锁更多的能力」，点击进详情页技能分区。

**处理**

- [agent-sheets.tsx](../apps/mobile/src/agent-sheets.tsx)：`capabilities` 去掉 `current.skills` 模板兜底，只取 `customSkills` + `installedSkills`（最多 4 张）；卡片网格连同「{name} 的能力」标题都按 `capabilities.length` 条件渲染，为空时整块不渲染。卡片显示名 / 详情点击逻辑保持不动，已配置技能时行为不变。
- [i18n] `agentSpace.unlockMoreFeatures`：zh「解锁更多功能」→「解锁更多的能力」，en "Unlock more features" → "Unlock more capabilities"；key 名保持不变，`agent-sheets.tsx` / `agent-product.tsx` / `agent-settings-screen.tsx` 里的相关注释同步改名。
- 点击跳转链路已存在，核对后未改动：`onOpenAgentSkills` → `AgentProductShell.openAgentSkills`（`setAgentTabIntent("skills")` + `navigate("agent")`）→ `AgentSettingsScreen` 的 effect 消费意图 → `BotSkillsPage embedded`。桌面端常驻详情页时也通过 intent 重新定位到「技能」。

**验证**

- `npx biome check --write`（5 个改动文件）：无警告、无格式修复。
- `pnpm --dir apps/mobile typecheck`：改动文件无类型错误；`bot-pages/connectors.tsx` 的 7 个报错为 HEAD 既有问题。
- i18n / agent-space / skill-catalog / skill-sharing 共 47 例单测通过；全仓库检索无「解锁更多功能 / Unlock more features」残留（历史记录除外）。

### 2026-11-08 · UI：Agent 详情技能页自建技能「移除」取消二次确认

**背景**

上一条改动给每张技能卡片补齐了「移除」，但自建技能沿用旧逻辑：点「移除」先弹 `SkillDeleteConfirm`（「确定移除技能「X」？」），确认后才删。用户要求 Agent 详情技能板块的移除不再弹窗，点击即把技能从当下 Agent 移除。

**处理**

- [skills.tsx](../apps/mobile/src/bot-pages/skills.tsx)：删掉 `deletingSkill` 状态、`SkillDeleteConfirm` 导入与页面底部的确认弹层；新增 `removeCustomSkill`，直接 `deleteSkill(current.id, skill.id)` 清掉当前 Agent 的这一份副本，并用 `agent.skillUninstalledToast` 给 Toast 反馈。连同 `removeCatalogSkill`，自建技能与目录技能两类卡片现在都是「点击即移除」，交互一致。
- [i18n] zh-Hans / en 同步删除仅为该弹窗存在的 `agent.mySkillDeleteConfirmTitleOne` 与 `agent.mySkillDeleteConfirmNoteOne`；「应用与能力 → 我的技能」永久删除仍使用 `SkillDeleteConfirm` 及 `mySkillDeleteConfirmTitle` / `NoteAll` / `mySkillDeletedToast`，组件与文案均保留。
- 只删当前 Agent 的副本这一语义不变，其它智能体的同内容副本不受影响，仍可在详情里用「添加到智能体」加回。

**验证**

- `npx biome check --write`（skills.tsx、zh-Hans/agent.ts、en/agent.ts）：无警告、无格式修复。
- `pnpm --dir apps/mobile typecheck`：改动文件无类型错误；`bot-pages/connectors.tsx` 的 7 个报错为 HEAD 既有问题。
- i18n / skill-sharing / skill-catalog / agent-space 共 47 例单测通过，i18n 用例确认中英 key 集合仍一一对应。

### 2026-11-08 · UI：Agent 详情技能页每张卡片补齐「移除」入口

**背景**

Agent 详情 → 技能页的卡片分两类：用户自建技能（`current.customSkills`，排在最前）右上角已有「移除」按钮；从技能库安装的目录技能（`current.installedSkills`）只有标题 + 描述，没有移除入口，只能点开详情弹层、在「添加到智能体」里逐行取消安装。用户要求每张技能卡片右上角都有「移除」，语义是把技能从当前 Agent 移除。

**处理**

- [skills.tsx](../apps/mobile/src/bot-pages/skills.tsx)：抽出共用 `SkillRemoveButton`（红色描边小按钮、`agentSpace.removeSkill` 中英文案、无障碍标签、`stopPropagation` 防止同时打开卡片详情），两类技能卡片使用同一枚按钮，视觉与交互一致；自建技能卡片里原先内联的按钮替换为该组件，行为不变。
- 同文件新增 `removeCatalogSkill`：目录技能点「移除」执行 `setSkillInstalled(current.id, skill.id, false)` 取消当前 Agent 的安装，并用 `agent.skillUninstalledToast` 给出提示。技能本身仍留在技能库、其它 Agent 不受影响，可随时用「添加技能」装回，因此直接生效不弹确认；自建技能仍走 `SkillDeleteConfirm` 二次确认（那一份可能是技能最后一份副本），`deleteSkill(current.id, ...)` 行为不变。
- 未新增 i18n key：按钮与 Toast 复用既有 `agentSpace.removeSkill` / `agent.skillUninstalledToast`，中英两侧均已存在。

**验证**

- `npx biome check apps/mobile/src/bot-pages/skills.tsx`：无警告。
- `pnpm --dir apps/mobile typecheck`：改动文件无类型错误（`bot-pages/connectors.tsx` 的 7 个报错为 HEAD 既有问题，与本次无关）。
- i18n / skill-sharing / skill-catalog / agent-space 共 47 例单测通过。

### 2026-11-08 · 图标：Agent 详情页左侧栏「记忆」同心圆图标换为心形

**背景**

Agent 详情页左侧栏「记忆」分区标签沿用同心圆（Target）图标，与全局页面右侧栏「记忆」入口（Heart 心形图标、34×34 圆角底 + 17px 描边）不一致，同一功能的图标在不同入口缺乏统一辨识。

**处理**

- [agent-settings-screen.tsx](../apps/mobile/src/agent-settings-screen.tsx) 左侧栏「记忆」标签 `icon` 由 `Target` 改为 `Heart`（导入同步替换；图标在两个渲染分支（16px/15px）同时生效，尺寸与颜色逻辑保持不变）。

**验证**

- `npx biome check apps/mobile/src/agent-settings-screen.tsx`：无警告。
- `npx tsc --noEmit`：改动文件无类型错误（`bot-pages/connectors.tsx` 报错为 HEAD 既有问题，与本次无关）。

### 2026-11-08 · 图标：Agent 详情页两处星芒图标统一换为头脑图标

**背景**

Agent 详情页中「技能」入口两处仍沿用星芒（Sparkles）图标：左侧栏「技能」分区标签（选中态 16px `primaryStrong`）与「更多」面板的能力卡片（15px `primary`）。星芒语义偏"灵感/魔法"，与「应用与能力」页技能快捷入口（Brain 头脑图标、30×30 圆角底 + 17px 描边）不一致，技能相关入口缺乏统一辨识。

**处理**

- [agent-settings-screen.tsx](../apps/mobile/src/agent-settings-screen.tsx) 左侧栏「技能」标签 `icon` 由 `Sparkles` 改为 `Brain`（导入同步替换，标签在两个渲染分支（16px/15px）同时生效）。
- [agent-sheets.tsx](../apps/mobile/src/agent-sheets.tsx) Agent「更多」面板能力卡片图标由 `<Sparkles size={15} color={colors.primary} />` 改为 `<Brain size={15} color={colors.primary} />`，导入追加 `Brain`；「创建 Agent」对话框模板卡的 Sparkles 保持不变。

**验证**

- `npx biome check apps/mobile/src/agent-settings-screen.tsx apps/mobile/src/agent-sheets.tsx`：无警告。
- `npx tsc --noEmit`：改动文件无类型错误（`bot-pages/connectors.tsx` 报错为 HEAD 既有问题，与本次无关）。

### 2026-11-08 · UI：Agent 详情页语言选择弹窗宽度收紧至 160px

**背景**

Agent 详情页侧栏「语言」行的弹出菜单宽度 176px，超出项目下拉菜单 144px - 160px 的紧凑宽度约定。

**处理**

- [agent-product.tsx](../apps/mobile/src/agent-product.tsx) 语言选择弹窗 `width` 由 `176` 调整为 `160`，与「更多」菜单（160px）保持一致；衬垫 `compact` 模式下的横向定位不受影响。

**验证**

- `npx biome check apps/mobile/src/agent-product.tsx`：无警告。

### 2026-11-08 · UI：Agent 详情页「更多」菜单宽度收紧至 160px

**背景**

Agent 详情页右上角「更多」菜单弹窗宽度 180px，超出项目下拉菜单 144px - 160px 的紧凑宽度约定，信息密度偏低。

**处理**

- [agent-product.tsx](../apps/mobile/src/agent-product.tsx) 菜单弹窗 `menuWidth` 由 `Math.min(180, …)` 调整为 `Math.min(160, …)`，贴合紧凑布局规范；窄屏兜底 `width - 24` 不受影响。

**验证**

- `npx biome check apps/mobile/src/agent-product.tsx`：无警告。

### 2026-11-08 · 图标：「应用与能力」页「插件」入口星芒图标换为拼图块

**背景**

「应用与能力」页四个快捷入口中，「插件」入口沿用星芒（Sparkles）图标，星芒语义偏"灵感/魔法"，与插件"把常用研究流程打包成一键入口"的含义不符；且与「技能市场」等处的星芒图标重复，辨识度低。

**处理**

- [icons/keys.ts](../apps/mobile/src/icons/keys.ts) 新增 `Puzzle: "puzzle"` 导出名映射（插在 Power 与 RefreshCw 之间保持字母序）。
- [icons/project.ts](../apps/mobile/src/icons/project.ts) 补齐 `puzzle` 几何（Lucide 拼图块语义：单条描边路径勾勒互锁凸起轮廓，风格与全站 1.75 线宽一致、无装饰点）。
- [icons/index.tsx](../apps/mobile/src/icons/index.tsx) 新增 `Puzzle` 组件导出（`createIcon`），icons 注册表三处联动齐备。
- [capability-hub.tsx](../apps/mobile/src/capability-hub.tsx) 快捷入口「插件」`ShortcutCard` 图标由 `Sparkles` 改为 `Puzzle`；其余入口（技能/连接器/知识库）与「研究工具」分类的 Sparkles 均不受影响。

**验证**

- `npx tsx --test apps/mobile/test/icons.test.ts`：6 项全部通过（新增导出名能解析到几何、来源标记与所在注册表一致、无重名、路径数据完整）。
- `npx biome check`（icons 3 文件 + capability-hub.tsx）：无警告。
- `npx tsc --noEmit`：改动文件无类型错误（`bot-pages/connectors.tsx` 报错为 HEAD 既有问题，与本次无关）。

### 2026-11-08 · 图标：代理面板「每日市场简报」星形图标换为报纸图标

**背景**

代理「更多」面板中「每日市场简报」按钮沿用星形（Star）图标，与「自选与持仓」按钮的图标重复，且星形语义更贴近收藏而非晨报生成，辨识度低。

**处理**

- [icons/keys.ts](../apps/mobile/src/icons/keys.ts) 新增 `Newspaper: "newspaper"` 导出名映射。
- [icons/project.ts](../apps/mobile/src/icons/project.ts) 补齐 `newspaper` 几何（Lucide 语义：纸页外框 + 两行标题 + 线性文字行，风格与全站 1.75 线宽一致、无装饰点）。
- [icons/index.tsx](../apps/mobile/src/icons/index.tsx) 新增 `Newspaper` 组件导出（`createIcon`），icons 注册表三处联动齐备。
- [agent-sheets.tsx](../apps/mobile/src/agent-sheets.tsx) 「每日市场简报」`PanelButton` 图标由 `Star` 改为 `Newspaper`；「自选与持仓」仍保留 Star。顺带清理近期的未使用 `type AgentSkill` 导入。

**验证**

- `npx tsx --test apps/mobile/test/icons.test.ts`：6 项全部通过（新增导出名能解析到几何、来源标记与所在注册表一致）。
- `npx biome check`（4 个改动文件）：无警告。
- `npx tsc --noEmit`：改动文件无类型错误（`bot-pages/connectors.tsx` 报错为 HEAD 既有问题，与本次无关）。

### 2026-11-08 · 重构：`TwoColumnGrid` 统一迁移到 `CardGrid`

**背景**

`bot-pages/shared.tsx` 的 `TwoColumnGrid`（按 400px 固定阈值判定是否两列）与上一轮抽出的 [card-grid.tsx](../apps/mobile/src/card-grid.tsx) 的 `CardGrid`（`onLayout` 实测容器宽度 + `minColumnWidth` 自动分栏）概念重叠，同一个产品里并存两套分栏规则：同样的容器宽度，在 Agent 详情页可能是两列、在任务页可能是单列，视觉上不一致，后续调列宽还得改两处。

**处理**

- 删除 `TwoColumnGrid`、`TWO_COLUMN_MIN_WIDTH`、`TWO_COLUMN_GAP`；`shared.tsx` 的 import 收敛为 `ReactNode` / `Pressable` / `View`（`ReactNode` 仍被 `BotPage`、`BotEmpty` 使用，保留）。
- [history.tsx](../apps/mobile/src/bot-pages/history.tsx)：任务卡 `minColumnWidth={340}`，顺带删掉不再需要的 `View` 导入。
- [library.tsx](../apps/mobile/src/bot-pages/library.tsx)：文件列表与成果列表均 `minColumnWidth={300}`（外层容器仍用 `View`，保留导入）。
- [skills.tsx](../apps/mobile/src/bot-pages/skills.tsx)：自建技能与从技能库安装的技能原先分两段渲染，改为合并成 `skillCards: { key: string; node: ReactNode }[]` 一个数组（key 前缀 `custom:` / `catalog:` 区分来源）再交给 `CardGrid`（`minColumnWidth={300}`），两处卡片 `Pressable` 补 `flex: 1` 保证同行等高。
- 现在全仓 `CardGrid` 共 16 处调用，`grep TwoColumnGrid` 无残留（仅本文件历史条目还提到旧名）。

**影响**

`minColumnWidth` 成为唯一的分栏参数：Agent 详情页的卡片偏矮（300）能排两列，任务卡信息多（340）更早退化为单列，规则统一为一句话「容器宽度够放下 N 个最小宽度就排 N 列，最多 2 列」。

**验证**

- `./node_modules/.bin/biome check apps/mobile/src/bot-pages apps/mobile/src/card-grid.tsx`：9 文件通过（先 `--write` 修了 `useImportType` 与 `organizeImports` 两条）。
- `./node_modules/.bin/tsc --noEmit`：改动文件无错误（`bot-pages/connectors.tsx` 的 7 个报错为 HEAD 既有问题，与本次无关）。
- `apps/mobile/test/*.test.ts`：282 个用例全部通过。

### 2026-11-08 · 交互：任务页五个筛选的任务列表改两列

**背景**

任务页（`任务` 标签下的 `AgentActivityScreen`）五个状态筛选（全部 / 进行中 / 待确认 / 已结束 / 已暂停）共用同一份任务列表，一直是单列通栏。25 条任务要滚 25 屏，宽屏下右侧大片留白。

**处理**

- 新增 [card-grid.tsx](../apps/mobile/src/card-grid.tsx)：把原先只存在于 `tracking-screen.tsx` 的 `CardGrid` 抽成共享组件（`onLayout` 实测容器宽度 + `minColumnWidth` 自动分栏，实测前按目标栏数给百分比兜底），供任务页与跟踪页共用。
- [tracking-screen.tsx](../apps/mobile/src/tracking-screen.tsx) 删除本地实现与 `GRID_GAP`，改为 `import { CardGrid } from "./card-grid"`，`ReactNode` 导入随之清理。
- [agent-ui.tsx](../apps/mobile/src/agent-ui.tsx) `AgentActivityScreen` 的任务列表由 `.map` 平铺改为 `CardGrid`（`minColumnWidth={340}`，最多 2 列），五个筛选共用同一处渲染，因此一次性全部生效；窄屏仍自动退化为单列。
- `TaskCard` 的 `Pressable` 加 `flex: 1`，两列时同一行卡片等高。

**验证**

- `npx biome check`（3 个改动文件）：通过。
- `npx tsc --noEmit`：本次改动文件无类型错误（`bot-pages/connectors.tsx` 报错为先存问题，与本次无关）。
- `apps/mobile/test/*.test.ts`：282 个用例全部通过。

### 2026-11-07 · 文案：智能体设置页删除按钮与确认标题统一为「移除」

**背景**

「智能体设置 → 技能」页自建技能卡片上的红色操作按钮文案为「删除」，但其操作实际是移除当前智能体中的这份技能（其他智能体不受影响），与确认弹窗介绍「将移除这个智能体中的这份技能」不一致；「我的技能」页的「删除」对应全量永久删除，语义正确需保留。

**处理**

- 新增 [zh-Hans/agent.ts](../apps/mobile/src/i18n/locales/zh-Hans/agent.ts) `agentSpace.removeSkill` =「移除」、[en/agent.ts](../apps/mobile/src/i18n/locales/en/agent.ts) `agentSpace.removeSkill` = "Remove"。
- [skills.tsx](../apps/mobile/src/bot-pages/skills.tsx)：卡片操作按钮文案与读屏标签由 `agentSpace.deleteSkill` 改为 `agentSpace.removeSkill`；注释同步更新。
- 确认弹窗标题 `agent.mySkillDeleteConfirmTitleOne`（仅智能体设置页使用）由「确定删除技能」同步改为「确定移除技能」（en: "Remove \"{title}\"?"），与按钮及介绍文案保持一致。

**验证**

- `apps/mobile/test/i18n.test.ts`：16 例全部通过（中英 key 对齐）。
- `pnpm exec biome check`：改动文件通过。

### 2026-11-07 · 文案：删除技能确认弹窗拆分标题并强调「永久删除」

**背景**

「应用与能力 → 技能 → 我的技能」页删除自建技能（会连同所有智能体中的副本一起清掉，无法恢复）与「智能体设置 → 技能」页删除当前智能体副本是两种不同力度的操作，但此前共用同一个确认标题「确定删除技能「{title}」？」，介绍文案（`agent.mySkillDeleteConfirmNoteAll`）也未突出不可逆性。

**处理**

- [zh-Hans/agent.ts](../apps/mobile/src/i18n/locales/zh-Hans/agent.ts) / [en/agent.ts](../apps/mobile/src/i18n/locales/en/agent.ts)：
  - `agent.mySkillDeleteConfirmTitle` 改为「确定永久删除技能「{title}」？」（Permanently delete），仅用于「我的技能」页的全量删除。
  - 新增 `agent.mySkillDeleteConfirmTitleOne` =「确定删除技能「{title}」？」（Delete），用于「智能体设置 → 技能」页的按智能体删除。
  - `agent.mySkillDeleteConfirmNoteAll` 改为「将永久删除这份技能及其在所有智能体中的副本，删除后无法恢复。」（This permanently deletes the skill and its copies from all agents. This can't be undone.）。
- [skills.tsx](../apps/mobile/src/bot-pages/skills.tsx)：智能体设置页的删除确认由共用的 `mySkillDeleteConfirmTitle` 改为 `mySkillDeleteConfirmTitleOne`。

**验证**

- `apps/mobile/test/i18n.test.ts`：16 例全部通过（中英 key 对齐，新增 `TitleOne` 键双语言同步）。
- `pnpm exec biome check`：改动文件通过。

### 2026-11-07 · 交互：跟踪 / 目标 / 提醒三个列表改两列，目标卡片精简

**背景**

跟踪页（`全部` / `目标` / `提醒` 三个筛选）里所有列表都是单列通栏，一屏只能看到一张目标卡；目标卡本身也偏高（约 440px）：顶部有「下一步」区块内的全宽蓝色主按钮，底部又有一组「查看目标 / 设置提醒」，其中「查看目标」出现两次；「最近 7 天」既有今日计数行、又有最多 3 条活动明细，信息重叠。

**处理**

- [tracking-screen.tsx](../apps/mobile/src/tracking-screen.tsx) 把此前的 `TemplateGrid`（按窗口宽度算列数）改成 `CardGrid`：`onLayout` 实测容器宽度，按 `minColumnWidth` 自动分栏，实测前用百分比兜底。页面内容宽度扣掉侧栏后与窗口宽度差别很大，按窗口估算会把卡片挤在窄栏里。
- 三处模板网格改用新参数：任务模板 `240`、目标分类 `200`、提醒模板 `200` + `maxColumns={3}`。
- 三个筛选分支的所有列表统一接入 `CardGrid`（`minColumnWidth={340}`，最多 2 列）：关注中目标、暂停目标、独立提醒、按目标分组的提醒、已完成目标的提醒。`renderGoalTrack` 去掉自带 `key`（由网格包装层提供）。
- 目标卡 `GoalTrackCard` 精简：①「下一步」区块内的全宽主按钮去掉，整块改为可点（右上角 chevron，`runNext` 不变），消除与底部「查看目标」的重复；②「最近 7 天」删掉最多 3 条活动明细，只留今日计数一行（完整时间线在「查看目标」的详情里）；③卡片 `gap` 15→12、提醒行 38→34、活动行整块移除，卡片高度约 440 → 280；④底部操作行 `marginTop: "auto"`，两列时同一行卡片按钮对齐。
- `Card` 加 `flex: 1`（目标卡与 [agent-ui.tsx](../apps/mobile/src/agent-ui.tsx) 的 `TrackingRow`），让同一行的卡片等高。
- 清理随之失效的 `recentActivityText`、`recentActivities` 与 `CircleAlert` / `Clock3` / `ListChecks` / `RecentActivity` 导入。

**验证**

- `npx biome check`（2 个改动文件）：通过。
- `npx tsc --noEmit`：本次改动文件无类型错误（`bot-pages/connectors.tsx` 报错为先存问题，与本次无关）。
- `apps/mobile/test/tracking-view.test.ts`：7 例通过；`apps/mobile/test/*.test.ts`：282 个用例全部通过。

### 2026-11-07 · 文案：删除自建技能的确认提示补充影响范围说明

**背景**

「智能体设置 → 技能」页删除自建技能时的确认正文（`agent.mySkillDeleteConfirmNoteOne`）原为「将移除这个智能体中的这份技能，删除后无法恢复。」——与上方标题「确定删除技能？」存在「移除/删除」措辞割裂，且未说明该删除只作用于当前智能体，其它智能体中共享的同一技能不受影响。

**处理**

- [zh-Hans/agent.ts](../apps/mobile/src/i18n/locales/zh-Hans/agent.ts)：`agent.mySkillDeleteConfirmNoteOne` 改为「将移除这个智能体中的这份技能，该技能在其他智能体中不受影响。」
- [en/agent.ts](../apps/mobile/src/i18n/locales/en/agent.ts)：同步改为 "This removes the skill from this agent. Copies in other agents are unaffected."

**验证**

- `apps/mobile/test/i18n.test.ts`：16 例全部通过（中英 key 对齐、占位符一致）。
- `pnpm test` 全量 1027 例中 1016 通过；11 例失败均集中在服务端监控/任务生命周期（alerts、resume、milestone）测试，与本次文案改动无关，属存量问题。

### 2026-11-07 · 交互：技能选择弹层卡片点击直接打勾，不再弹详情页

**背景**

对话输入区的「选择技能」弹层（`SkillPickerSheet`）此前点击技能卡片会先弹出技能详情页，需在详情页里点「使用此技能」才完成勾选——多一步跳转，且详情页与「应用与能力」里的技能详情完全重复。用户期望点击卡片（含右侧方框型勾选按钮）直接打勾即完成选择。

**处理**

- [capability-picker.tsx](../apps/mobile/src/capability-picker.tsx)：
  - 自建技能卡片与目录技能卡片的 `onPress` 由 `setMyPreview` / `setCatalogPreview`（弹详情）改为直接 `onToggle(skill.id)`，点击即勾选，勾选状态即时写入对话选择。
  - 移除 `catalogPreview` / `myPreview` 两个预览 state 及对应的 `SkillDetailSheet` / `MySkillDetailSheet` 详情弹层挂载。
  - 清理不再使用的 import（`MySkillDetailSheet`、`SkillDetailSheet`、`SkillCatalogEntry`），`Sparkles` / `Button` 等其余引用不受影响。

**验证**

- `pnpm exec biome check --write apps/mobile/src/capability-picker.tsx`：通过（移除冗余 Fragment）。
- `npx tsc --noEmit`：`capability-picker.tsx` 无类型错误（`bot-pages/connectors.tsx` 报错为存量问题，与本次无关）。

### 2026-11-07 · 交互：「设置提醒」页精简并扩充提醒模板

**背景**

「提醒模板」弹层里叠了三层信息：顶部一张蓝底宣传卡（「让每一次提醒，都带着上下文。」+ 两行长说明）、一个与弹层标题完全重复的「提醒模板」小标题、然后是模板卡片和一张大号「自定义提醒」卡片。真正要点的模板被压在下面，一屏能看到的模板只有 3 个。

**处理**

- [tracking-screen.tsx](../apps/mobile/src/tracking-screen.tsx) 删除顶部蓝底上下文卡（标题栏副标题已说明用法）与重复的「提醒模板」小标题，模板直接顶到内容区第一行。
- 「自定义提醒」由大号 `OptionCard`（图标 + 标题 + 说明，约 76px）改为底部虚线按钮（`+ 自定义提醒`，43px），与仓库里「解锁更多功能」「添加技能」的次级动作样式一致。
- `TemplateGrid` 由 `desktop: boolean` 改为 `columns: 1 | 2 | 3`（`100%` / `48%` / `31%`）；提醒模板走 3 列（桌面 6 个模板 2 行），目标页仍是 2 列。
- [agent-ui.tsx](../apps/mobile/src/agent-ui.tsx) `REMINDER_TEMPLATES` 新增 `icon` 字段（图标随数据走，取代渲染处的 `id` 三元判断），模板 3 → 6：每天收盘复盘（每日 15:30 / `CalendarDays`）、自选股票公告提醒（每日 09:00 / `Bell`）、盘前要闻速览（新增，每日 08:30 / `Clock3`）、财报季跟踪（新增，每日 20:00 / `FileText`）、每周自选回顾（每周五 18:00 / `RefreshCw`）、行业政策动态（新增，每周一 09:00 / `Globe2`）。
- 中英文案新增 `agent.reminderTplPremarket*` / `agent.reminderTplEarnings*` / `agent.reminderTplPolicy*` 共 6 条（[zh-Hans/agent.ts](../apps/mobile/src/i18n/locales/zh-Hans/agent.ts)、[en/agent.ts](../apps/mobile/src/i18n/locales/en/agent.ts)）。
- 顺带把 `agent-ui.tsx` 内已废弃 `GoalsScreen` 里同一处 `id` 三元图标判断改为 `template.icon`，避免新增模板后在旧代码里取错图标。

**验证**

- `npx biome check`（4 个改动文件）：通过。
- `npx tsc --noEmit`：本次改动文件无类型错误（`bot-pages/connectors.tsx` 报错为先存问题，与本次无关）。
- `apps/mobile/test/i18n.test.ts`：16 例通过（中英 key 对齐、无中文串入英文包、占位符一致）。
- `apps/mobile/test/*.test.ts`：282 个用例全部通过。

### 2026-11-07 · 交互：能力卡片点击弹出该技能的只读详情

**背景**

「更多」面板（侧边浮层 `AgentMoreSheet` / 桌面常驻 `CapabilityRail`）上方的能力卡片（如「金融合约开发」）原先任何卡片点击都打开「技能中心」面板，无法单独查看某个技能的具体说明。用户期望点击卡片直接弹出该技能的详情页面，样式复用「应用与能力」里的技能详情弹层，但右上角不需要「添加到智能体」按钮（只读形态）。

**处理**

- [agent-sheets.tsx](../apps/mobile/src/agent-sheets.tsx)：
  - `AgentMoreContent` 新增可选属性 `onInspectSkill?: (skillId: string) => void`。能力卡片 `onPress` 现先判断该能力是否有详情页——`current.customSkills`（自建技能）或 `skillCatalog`（目录技能）命中即可查看详情；两者都未命中（系统能力，如 `quote`/`brief` 等，技能目录无对应条目）则维持原行为打开「技能中心」面板。
  - 新增导出组件 `AgentSkillInspectSheet`：根据 `skillId` 从自建技能查 `MySkillDetailSheet`、从目录查 `SkillDetailSheet`，两者均以只读形态渲染（不传 `agents` / `onToggleInstall` / `onUse`，右上角无「添加到智能体」按钮），查不到返回 `null`。
  - `AgentMoreSheet` 新增并透传 `onInspectSkill`；`AgentSheets` 在 `panel === "more"` 分支改为 Fragment，把 `AgentSkillInspectSheet` 作为 `AgentMoreSheet` 的兄弟节点挂载（避免嵌套 Modal 层级问题），并用组件内 `useState` 记录待查看的 skillId。
- [agent-product.tsx](../apps/mobile/src/agent-product.tsx)：`CapabilityRail` 同样作为兄弟节点挂载 `AgentSkillInspectSheet`，本地 `useState` 记录 skillId 并透传 `onInspectSkill` 给 `AgentMoreContent`，保证桌面端三栏与移动端抽屉行为一致。

**验证**

- `npx tsc --noEmit`：本次改动文件（`agent-sheets.tsx` / `agent-product.tsx`）无类型错误（`bot-pages/connectors.tsx` 报错为存量问题，与本次无关）。
- `pnpm exec biome check -w apps/mobile/src/agent-sheets.tsx apps/mobile/src/agent-product.tsx`：格式自动修复后通过。

### 2026-11-07 · 交互：新建目标页「任务模板」与「目标分类」统一为卡片网格

**背景**

「创建一个目标」弹层里两段内容风格割裂：任务模板是 2×2 大卡片（图标 + 标题 + 说明 + 右上角 ↗，`minHeight: 132`），目标分类是普通列表行（图标 + 文字 + chevron，`minHeight: 46`）。同一屏两种版式，分类看起来像「另一套东西」，整体也偏松散。

**处理**

- [tracking-screen.tsx](../apps/mobile/src/tracking-screen.tsx) `TemplateCard` 改成两者共用的唯一卡片：`detail` 变为可选，去掉 `minHeight: 132` / `minWidth: 180`，内边距 16→14、图标盒 34→30（底色改用 `colors.sky`）、标题 15→14、圆角统一 `radius.card`；右上角由 `ArrowUpRight` 改为 `ChevronRight`，两段语义都收敛为「进入下一步」。
- 新增 `TemplateGrid`（`items` + `getKey` + `render` 的泛型两列网格）：桌面两列（`48%`）、窄屏单列，替换原来手写的 `flexDirection: width < 760 ? "column" : "row"` 容器。
- 「目标分类」由列表行改为 `TemplateGrid` + `TemplateCard`（不传 `detail`，卡片自然收矮），与任务模板同版式；保留原 `agent.createGoalA11y` 读屏文案（`TemplateCard` 新增可选 `accessibilityLabel`）。
- 间距收紧：两段之间 18→16，标题与网格之间 12→10。
- 清理不再使用的 `ArrowUpRight` 导入，补 `ReactNode` / `IconComponent` 类型导入。

**验证**

- `npx biome check apps/mobile/src/tracking-screen.tsx`：通过。
- `npx tsc --noEmit`：本次改动文件无类型错误（`bot-pages/connectors.tsx` 报错为先存问题，与本次无关）。
- `apps/mobile/test/*.test.ts`：282 个用例全部通过。

### 2026-11-07 · 交互：「解锁更多功能」改为进入 Agent 详情设置的技能页

**背景**

「更多」面板（侧边浮层 / 桌面常驻侧栏）底部「解锁更多功能」虚线按钮原先打开「技能中心」浮层（`CapabilityHubScreen`），而左侧「应用与能力」行已经承担了技能中心入口；用户期望该按钮直接进入当前 Agent 的详情设置页并定位到「技能」分区（`BotSkillsPage`），形成「拆解该 Agent 还能加什么技能」的完整路径。

**处理**

- [agent-settings-screen.tsx](../apps/mobile/src/agent-settings-screen.tsx) `AgentSettingsScreen` 新增 `tabIntent` / `onTabIntentConsumed` 两个可选属性，并导出 `AgentSettingsTab` 类型；新增 `useEffect` 监听 `tabIntent` —— 由于详情页在桌面端可能已挂载（常驻右栏也能触发跳转），意图必须在挂载后仍能响应，应用成功后回调父级清除，避免下次进入详情页被再次定位。
- [agent-sheets.tsx](../apps/mobile/src/agent-sheets.tsx) `AgentMoreContent` 新增必选属性 `onOpenAgentSkills`，「解锁更多功能」按钮 `onPress` 由 `onPanel("capabilities")` 改为 `onOpenAgentSkills`（技能中心仍可由上方能力卡片进入，未改动）；`AgentMoreSheet` / `AgentSheets` 均新增并透传该回调。
- [agent-product.tsx](../apps/mobile/src/agent-product.tsx) `AgentProductShell` 持有 `agentTabIntent` 状态并实现 `openAgentSkills`：收起浮层/抽屉 → 设置分区意图 `"skills"` → `navigate("agent")`；`CapabilityRail`（含移动端抽屉形态）与 `AgentSheets` 均接入该回调，`AgentSettingsScreen` 渲染时传入意图与消费回调。`navigate` 对相同 Section 为无操作（见 [navigation.ts](../apps/mobile/src/navigation.ts) `navigateTo`），桌面端已停留在详情页时仅更新分区，不会产生重复历史层级。

**验证**

- `pnpm biome check --write`（三个改动文件）：通过。
- `npx tsc --noEmit`：本次改动文件无类型错误（`bot-pages/connectors.tsx` 报错为先存问题，与本次无关）。

### 2026-11-07 · 交互：技能选择弹层点击卡片打开技能详情页

**背景**

输入区「技能选择」弹层改为两列网格后，点击卡片直接切换勾选状态（`onToggle`），用户希望先看到技能详情再决定是否使用——与「更多能力」面板中卡片点击弹出详情的行为对齐。

**处理**

- [capability-picker.tsx](../apps/mobile/src/capability-picker.tsx) `SkillPickerSheet` 新增两个预览状态：`catalogPreview`（技能目录条目，`SkillCatalogEntry`）与 `myPreview`（Agent 自定义技能，`AgentSkill`）。
- 两类技能卡片的 `onPress` 由 `onToggle` 改为打开对应详情（目录技能 → `SkillDetailSheet`，自定义技能 → `MySkillDetailSheet`）；勾选动作移到详情页内的「使用此技能」按钮（点击后调用 `onToggle` 并关闭详情）。
- 详情弹层以 fragment 兄弟节点挂在选择弹层之后（非 JSX 嵌套），规避 RN/RNW 嵌套 Modal 的层级与事件冒泡问题；`SkillDetailSheet` 复用只读 + `onUse` 形态（复用 [capability-hub.tsx](../apps/mobile/src/capability-hub.tsx) 内现有组件，无新增大块代码）。
- 检查确认 `capability-hub.tsx` 不反向依赖 `capability-picker.tsx`，新增 import 无循环依赖。

**验证**

- `pnpm biome check --write apps/mobile/src/capability-picker.tsx`：通过。
- `npx tsc --noEmit`：本次改动文件无类型错误（`bot-pages/connectors.tsx` 报错为先存问题，与本次无关）。

### 2026-11-07 · 交互：连接器选择弹层未连接行支持「去连接」引导

**背景**

连接器选择弹层中，未连接的连接器整行 `disabled`（半透明 + `pointerEvents: none`），点击没有任何反馈，用户只能依赖左下角「管理连接」按钮进入连接管理，路径不直观。现场反馈「为什么无法选择连接器」——连接器确实全部未连接（live 模式未做 Google OAuth、浏览器 worker 与 OpenBot 未配置），但产品层面应给未连接行一条明确的「去连接」出口。

**处理**

- [capability-picker.tsx](../apps/mobile/src/capability-picker.tsx) `OptionRow` 新增 `onConnect` / `connectLabel`：仅当「未连接 且 提供 onConnect」时保留整行可点击（不再设 `disabled` 屏蔽），点击转交 `onConnect()`；右侧占位由灰色「—」改为主色「去连接」标签（`colors.primary`、加粗 11pt），其余置灰视觉不变。
- `ConnectorPickerSheet` 新增 `onConnect?: (id: string) => void` 属性，为每个未连接的连接器行透传 `onConnect` 与 `connectLabel`（已连接行保持原有勾选交互）。
- [chat.tsx](../apps/mobile/src/chat.tsx) 调用处接入 `onConnect`：关闭弹层并跳转连接管理页（与「管理连接」按钮行为一致，`connections` 是 `apps` 的遗留别名）。
- i18n 新增键 `chat.connectorPickerConnect`：中文「去连接」/ 英文 "Connect"。

**验证**

- `npx biome check apps/mobile/src/capability-picker.tsx apps/mobile/src/chat.tsx apps/mobile/src/i18n/locales/zh-Hans/chat.ts apps/mobile/src/i18n/locales/en/chat.ts`：通过。
- `npx tsc --noEmit`：全量通过。

### 2026-11-07 · 交互：对话框「技能选择」弹层改为两列网格

**背景**

输入区左侧「+」菜单里的「技能选择」弹层，技能按整行列表排列（每行「图标 + 标题 + 描述 + 勾选框」，行间用分隔线）。技能目录有 180+ 条，单列时一次只能看到 10 条左右，滚动成本很高；右侧栏「更多能力」已是 2×2 卡片网格，两处视觉语言也不统一。

**处理**

- [capability-picker.tsx](../apps/mobile/src/capability-picker.tsx) 新增 `OptionGrid` + `OptionCard`，替换 `SkillPickerSheet` 中「我的技能」「技能目录」两段列表（连接器弹层仍保留原来的 `OptionList` / `OptionRow`）。
- `OptionGrid` 用 `onLayout` 实测容器宽度换算列宽（弹层桌面端最宽 760、手机接近满宽，用窗口宽度估算会首帧错位）；实测到之前用 `48%` 兜底，保证一开始就是两列。
- `OptionCard` 把整行压成独立小卡片：勾选态改用底色（`colors.sky`）+ 主色描边表达，不再依赖行间分隔线；图标盒 32→26，标题单行截断。
- 描述信息按列宽分级：列宽 ≥ `240` 才补一行说明（桌面），窄格子只留标题，避免标题被挤成省略号；`status`（如「已停用」）比描述优先，窄格子也保留。
- `SKILL_PAGE_SIZE` 60 → 80：两列后单屏可见条数约翻倍，扩大渲染上限减少「还有 N 个技能」的折叠感。

**验证**

- `npx biome check apps/mobile/src/capability-picker.tsx`：通过。
- `npx tsc --noEmit`：本次改动文件无类型错误（`bot-pages/connectors.tsx` 报错为先存问题，与本次无关）。
- `apps/mobile/test/*.test.ts`：282 个用例全部通过。

### 2026-11-07 · 修复：自动沉淀记忆缺失分类导致页面全部显示「关注领域」

**背景**

记忆页面所有记忆的类别标签均为「关注领域」。排查发现：账户内 14 条记忆中 13 条是 Agent 对话中自动沉淀的 `kind=decision` 记忆（市场简报 / 深度研究 / 计划等），这些记忆在写入时未携带 `category`（[conversation.ts](../apps/server/src/engine/conversation.ts) 的 `write_memory` 工具与 [service.ts](../apps/server/src/engine/service.ts) 的投融资决策兜底均未传），前端对无分类记忆统一兜底为「关注领域」，造成页面分类单一。

**处理**

- [service.ts](../apps/server/src/engine/service.ts) `saveMemory`：新增按 kind 推断默认类别的映射（fact→关注领域、thesis→关注标的、analysis→分析习惯、decision→投资目标），显式传入的 category 优先；一处修改，对 `write_memory` / `remember_fact` / 投融资决策兜底 / 手动添加全部生效。
- 存量数据修复：对本地库中 13 条缺失 category 的记忆按 kind 补齐（仅补缺失，不覆盖已有值），SQL：
  `UPDATE records SET data=data || jsonb_build_object('category', CASE data->>'kind' ... ) WHERE kind='memories' AND data->'category' IS NULL`。生产环境（Render/Supabase）可在部署新代码后执行同一条 SQL 对齐存量。

**验证**

- `tests/agent-api.test.ts`：21 个用例全部通过（含 `memories can be edited and forgotten` 的 category 校验）。
- 复查本地库记忆分类分布：投资目标 13 条、关注领域 1 条，不再单一。

### 2026-11-07 · 功能：记忆类型新增「关注标的」与「复盘教训」

**背景**

「添加记忆」弹窗的记忆类型选择器原固定为 4 类（投资目标 / 风险偏好 / 关注领域 / 分析习惯），用户希望补充更多类别，以覆盖更多的投研记忆场景（自选跟踪、复盘纠错）。

**处理**

- [agent.ts](../packages/domain/src/agent.ts)：`MEMORY_CATEGORIES` 常量追加 `"关注标的"`、`"复盘教训"`，作为唯一数据源；后端 `z.enum(MEMORY_CATEGORIES)`（[conversation.ts](../apps/server/src/engine/conversation.ts) / [routes.ts](../apps/server/src/engine/routes.ts)）引用同一常量，校验自动生效，无需改后端。
- [preferences-screen.tsx](../apps/mobile/src/preferences-screen.tsx)：`CATEGORY_META` 注册两项（「关注标的」→ `Star` 图标、「复盘教训」→ `Brain` 图标），并补充图标导入。
- 中英文文案：新增 `preferences.categoryWatch` / `preferences.categoryLesson`（[zh-Hans/app.ts](../apps/mobile/src/i18n/locales/zh-Hans/app.ts)、[en/app.ts](../apps/mobile/src/i18n/locales/en/app.ts)）。

**验证**

- `npx tsc --noEmit -p apps/mobile/tsconfig.json`：本次改动文件无类型错误（`connectors.tsx` 报错为先存问题，与本次无关）。
- `npx biome check`（preferences-screen.tsx / agent.ts）：通过。

### 2026-11-07 · 部署：render.yaml 按新版 .env 同步环境变量

**背景**

本地 `.env` 新增了 Hindsight 记忆引擎相关变量（`HINDSIGHT_BASE_URL` / `HINDSIGHT_API_KEY`）、`COPILOTKIT_TELEMETRY_DISABLED`，并显式设置了 `RATE_LIMIT_MAX_REQUESTS=1200` 与 `DEEPSEEK_BASE_URL`，而 Render 部署配置未同步，可能导致生产环境记忆引擎未启用或速率限制默认偏低。

**处理**

- [render.yaml](../render.yaml) `lingwu-api` 服务：
  - 新增 `RATE_LIMIT_MAX_REQUESTS: "1200"`（与 `.env` 一致，避免 web 端多屏轮询触发 429）。
  - 新增 `COPILOTKIT_TELEMETRY_DISABLED: "true"`（关闭 SDK 遥测，与 `.env` 一致）。
  - 新增 `HINDSIGHT_BASE_URL` / `HINDSIGHT_API_KEY`（均 `sync: false`，密钥需在 Render 控制台手动填入；Base URL 留空则走本地关键词召回降级）。
  - `DEEPSEEK_BASE_URL` 由 `sync: false` 改为固定值 `https://api.deepseek.com/v1`（公开端点，无需控制台填入）。

**验证**

- `ruby -ryaml` 校验通过：3 个服务、`lingwu-api` 40 个 env 项；新增 5 个变量全部就绪。

### 2026-11-07 · 文档：记忆系统术语体系金融投研化（PRD v1.3 + 架构同步）

**背景**

LingWu 定位为个人投研智能体，记忆系统原术语为泛化分类（投资目标/风险偏好/关注领域/分析习惯），与金融投研场景不契合。用户要求记忆系统关键术语全面向金融投研靠拢。

**处理**

- [PRD-多Agent记忆系统.md](PRD-多Agent记忆系统.md) 升至 v1.3：
  - 记忆类型扩为 **7 类**，覆盖投研全生命周期：`fact` / `watch`（自选）/ `thesis`（论点）/ `analysis` / `decision` / `trade`（操作成交）/ `mistake`（复盘教训）。
  - `FinanceTerms` 扩为四组维度（标的/研究/市场资金/风险组合），新增 `name`、`index`、`timeframe`、`rating`、`targetPrice`、`thesisStatus`、`capitalFlow`、`catalysts`、`macroFactors`、`position`、`stopLoss`、`takeProfit`、`riskFactors` 字段；`DealHabits` 新增 `round`、`valuation`、`equity`。
  - 新增 **§4.4 投研术语表**：16 维度关键词 → 结构化字段映射，作为召回/筛选/自动沉淀的统一术语词典。
  - FR-2 沉淀扩展为「评级→thesis / 操作→trade / 投融资→decision」三路信号；FR-5 召回增加术语感知过滤；非功能新增「术语归一化」。
- [记忆系统技术架构.md](记忆系统技术架构.md)：
  - §4 数据模型与 PRD 同步；迁移映射补充「关注领域→watch」「投资笔记/论点追踪→thesis（保留 thesisStatus）」。
  - §5.4 由单一投融资决策沉淀扩展为三组信号表（`THESIS_SIGNALS` / `TRADE_SIGNALS` / `DEAL_SIGNALS`）。

**验证**

- 字段口径与主 PRD（个人投研智能体 R6 投资笔记/论点追踪、评级、估值口径）对齐；两份文档 kind 枚举与字段定义一致，无术语冲突。

### 2026-11-07 · Agent 详情「任务 / 资料 / 技能」页改为双列布局

**背景**

Agent 详情的「任务」「资料」「技能」三个页面内容都是单列卡片列表，宽屏下浪费横向空间。用户要求把这三个页面（连同「记忆」）改成双列布局。

**处理**

- [shared.tsx](../apps/mobile/src/bot-pages/shared.tsx)：新增通用 `TwoColumnGrid` 容器——用 `onLayout` 实测内容列宽（三栏布局下列宽远小于窗口，首帧用窗口宽做初值），列宽 ≥ 400 时排两列、否则单列；通过 render-prop 把 `columns` 与 `itemWidth`（两列时的固定列宽，单列为 undefined）交给调用方，子项用 `width` 自行撑满对应列。间距 10px。
- [history.tsx](../apps/mobile/src/bot-pages/history.tsx)：「任务」页的 `TaskCard` 列表包进 `TwoColumnGrid`。
- [library.tsx](../apps/mobile/src/bot-pages/library.tsx)：「资料」页的文件（`LinkRow`）与产物（`ArtifactCard`）两段各自包进 `TwoColumnGrid`，`SectionHeading` 仍整行占满。
- [skills.tsx](../apps/mobile/src/bot-pages/skills.tsx)：「技能」页的自建技能卡与已安装技能卡合并包进 `TwoColumnGrid`，每张卡外层套一层 `View` 控制列宽，卡内「删除」入口等交互不变。
- 「记忆」页（`PreferencesScreen`）的记忆卡片本身已有响应式多列逻辑（列宽 ≥ 560 即两列），无需改动；其偏好设置表单不适合分列，保持单列。
- 窄屏（内容列 < 400）时三页均自动退回单列，不影响移动端。

**验证**

- `biome check --write` 通过；i18n / skill-sharing / skill-catalog 共 30 例单测通过。
- `tsc --noEmit`（apps/mobile）仍只有 `bot-pages/connectors.tsx` 的 7 个既有错误，与本次改动无关。

### 2026-11-07 · Agent 详情「任务」页移除「目标」标签

**背景**

上一条刚把目标内容并进 Agent 详情的「任务」页，形成「任务 / 目标」双标签；用户随后认为这里的目标页多余，要求删掉。目标内容在任务中心的一级「目标」标签里仍有入口，Agent 详情不必重复承载。

**处理**

- [history.tsx](../apps/mobile/src/bot-pages/history.tsx)：`BotHistoryPage` 简化为只渲染任务列表——移除 `HubTabs` 二级标签栏、`tab` / `addingGoal` / `goalId` 状态、目标列表 / 详情 / 新建三个分支，以及 `GoalCard` / `GoalForm` / `HubTabs` / `Pressable` / `Button` / `ChevronRight` / `Plus` / `colors` / `s` / `useState` 等导入；`useBotResources` 只取 `tasks`。只剩一个标签时标签栏本身也一并去掉，页面直接铺任务卡片。
- [goals-memory.tsx](../apps/mobile/src/bot-pages/goals-memory.tsx)：更新过时的组件注释（原写「目标内容已并入任务页」）。
- 保留：`HubTabs` 组件（`task-hub.tsx` 仍在使用）、`agent.goalsTab` / `agent.goalsEmpty` / `agent.createGoal` 等文案（任务中心、`details.tsx`、`tracking-screen.tsx` 仍用）、以及全局任务中心的「目标」入口。目标功能并未删除，只是不再出现在 Agent 详情。
- 页面标题 `agentSpace.analysisHistory`（任务 / Tasks）与空态 `agentSpace.noTasks` 保持不变。

**验证**

- Biome 检查通过；i18n / skill-sharing / skill-catalog 共 30 例单测通过；`tsc --noEmit`（apps/mobile）仍只有 `bot-pages/connectors.tsx` 的 7 个既有错误，与本次改动无关。

### 2026-11-07 · 目标内容并入「任务」页，采用「任务 / 目标」双标签页布局

**背景**

Agent 详情页的「目标与记忆」分区内含「目标 / 记忆」两个标签页，与独立的「任务」分区割裂：目标与任务同属 Agent 的执行待办，却分处两个入口。用户希望把目标内容移到「任务」页，并用两个标签页组织。

**处理**

- [history.tsx](../apps/mobile/src/bot-pages/history.tsx)：重写「任务」页，顶部用 `HubTabs`（「任务」/「目标」）切换；任务标签展示现有 TaskCard 列表，目标标签承接原「目标与记忆」页的目标列表（点击进入 `GoalCard` 详情、`GoalForm` 新建），两处均带数量角标与空态。
- [goals-memory.tsx](../apps/mobile/src/bot-pages/goals-memory.tsx)：精简为纯「记忆」页，仅渲染 `PreferencesScreen`，标题与副标题改用 `agent.memory` / `agent.memoryDetail`；目标相关分支整体移除。
- [agent-settings-screen.tsx](../apps/mobile/src/agent-settings-screen.tsx#L40)：左栏导航项「目标与记忆」更名「记忆」（`agent.memory`）。
- [i18n] 清理无引用的 `agentSpace.goalsMemory` 与 `agentSpace.sharedGoalsMemory` 键（zh-Hans / en 同步删除）。

**验证**

- `pnpm exec tsc --noEmit`（apps/mobile）：无类型错误（`connectors.tsx` 的既有错误与本次改动无关）。
- `pnpm exec tsx --test apps/mobile/test/i18n.test.ts`：16 项全部通过。

### 2026-11-07 · 「分析记录与过程」标题改为「任务」

**背景**

用户选中 Agent 设置页左侧「分析记录与过程」导航项（该键同时驱动分析记录页标题），希望改名为「任务」，命名更短更贴合记录列表的内容。

**处理**

- [i18n] `agentSpace.analysisHistory` 值更新：zh-Hans「分析记录与过程」→「任务」，en「Analysis history & process」→「Tasks」。影响 [agent-settings-screen.tsx](../apps/mobile/src/agent-settings-screen.tsx#L39) 的设置导航项与 [history.tsx](../apps/mobile/src/bot-pages/history.tsx#L11) 的页面标题，两处共用同一键保持命名一致。

**验证**

- `pnpm exec tsc --noEmit`（apps/mobile）：无类型错误（`connectors.tsx` 的既有错误与本次改动无关）。
- `pnpm exec tsx --test apps/mobile/test/i18n.test.ts`：16 项全部通过。

### 2026-11-07 · 技能库为自建技能加「自建」小标签

**背景**

自建技能与内置技能混排在同一网格里，仅靠「置顶」无法一眼区分来源。

**处理**

- [skills.tsx](../apps/mobile/src/bot-pages/skills.tsx)：`SkillLibraryItem` 新增 `custom?: boolean`；标题行改为横向容器，自建技能在标题前插入浅灰描边小徽标（10px 文字、`colors.surfaceSoft` 底 + `colors.lineStrong` 描边，在「已添加」蓝底上也清晰），标题设 `flex: 1` 保证长名称照样单行截断；读屏标签同步带上来源。
- `SkillLibraryPanel` 映射时传 `custom={Boolean(entry.custom)}`。
- [i18n] 新增 `agentSpace.addSkillCustomTag`（自建 / Custom），zh-Hans / en 同步。

**验证**

- `pnpm exec biome check --write`（改动文件）通过；i18n / skill-sharing / skill-catalog 共 30 例单测通过。
- `pnpm --dir apps/mobile typecheck` 仍只有 `bot-pages/connectors.tsx` 的 7 个既有错误，与本次改动无关。

### 2026-11-07 · 「添加技能」列表纳入用户自建技能

**背景**

「添加技能」页此前只渲染 `skillCatalog`（180+ 条内置技能），用户自己创建的技能存在各 Agent 的 `customSkills` 里，完全不出现在列表，也就无法从这里把自建技能复制到其它智能体。

**处理**

- [skills.tsx](../apps/mobile/src/bot-pages/skills.tsx)：新增 `LibraryEntry` 统一类型（key / title / description / installed + 可选 `catalog` / `custom`）。`SkillLibraryPanel` 用 `collectSharedSkills(agentList)` 跨 Agent 汇总自建技能、按内容指纹去重，与 `skillCatalog` 合并；自建技能**置顶**，避免被内置目录淹没。
- 搜索：自建匹配 `name` / `purpose` / `instructions` / `outputFormat`，内置仍匹配中英标题、描述与 id；分页上限作用于合并后的列表。
- 状态与切换：内置用 `current.installedSkills.includes(id)` + `setSkillInstalled`；自建用 `findSkillCopy(current, skill)` 判定是否已持有，`toggleSkillShare({ saveSkill, deleteSkill }, current, skill)` 复制 / 移除副本并给 Toast。沿用上一轮结论，不传 `guard`，没有「不可移除」保护。
- 详情：props 拆成 `onViewCatalogDetail` / `onViewCustomDetail`；`adding` 分支同时挂 `SkillDetailSheet`（内置，带「添加到智能体」）与 `MySkillDetailSheet`（自建，只读，不传 `agents` / `onToggleAdd`）；点「返回」时清空两个详情 state。
- [i18n] `agentSpace.addSkillHint` 补上「含自建技能」说明，zh-Hans / en 同步。

**验证**

- `pnpm exec biome check --write`（改动文件）通过；i18n / skill-sharing / skill-catalog 共 30 例单测通过。
- `pnpm --dir apps/mobile typecheck` 仍只有 `bot-pages/connectors.tsx` 的 7 个既有错误，与本次改动无关。

### 2026-11-07 · Agent 详情技能页取消自建技能的「不可移除」保护

**背景**

Agent 详情 → 技能 → 自建技能 →「添加到智能体」里，来源 Agent 与最后一份副本被锁定：行变灰只读、徽标显示「已添加 · 不可移除」、顶部提示也写「需保留的副本不可移除」。用户要求在这个板块去掉该保护，所有智能体都能自由安装 / 移除。

**处理**

- [skills.tsx](../apps/mobile/src/bot-pages/skills.tsx)：`BotSkillsPage` 删除 `shareLockedIds`（`skillLockedAgentIds`）计算与对应导入；`MySkillDetailSheet` 不再传 `lockedAgentIds`；`toggleSkillInAgent` 不再传 `guard`，去掉 `blocked` 分支与 `agent.skillShareBlockedToast`。
- [capability-hub.tsx](../apps/mobile/src/capability-hub.tsx)：`AgentPickerPanel` 的提示改为按是否传入 `lockedAgentIds` 选文案——有锁定列表用原 `agent.skillInstallHint`，没有则用新增的 `agent.skillInstallHintNoLock`（不含「不可移除」）。顺带修正技能库技能详情原本也显示这条锁定说明的不一致。
- [i18n] zh-Hans / en 同步新增 `agent.skillInstallHintNoLock`；`agent.skillShareLocked`、`agent.skillShareBlockedToast` 仍被「应用与能力 → 技能 → 我的技能」使用，予以保留。
- 范围只限 Agent 详情页这一处；「我的技能」页的只读保护、`skillLockedAgentIds` / `guard` 及其单测全部保持不变。
- 行为变化：现在可以把某自建技能从所有智能体上一一移除，该技能会彻底从列表消失；卡片上的「删除」入口仍保留二次确认。

**验证**

- `pnpm exec biome check --write`（改动文件）通过；i18n / skill-sharing / skill-catalog 共 30 例单测通过。
- `pnpm --dir apps/mobile typecheck` 仍只有 `bot-pages/connectors.tsx` 的 7 个既有错误，与本次改动无关。

### 2026-11-07 · 「添加技能」技能库改为两列网格

**背景**

上一轮把每行压成紧凑行后，用户仍希望一屏看到更多技能，确认改成两列网格：每格只留标题 + 状态图标，描述改由搜索或详情查看。

**处理**

- [skills.tsx](../apps/mobile/src/bot-pages/skills.tsx)：新增 `SkillLibraryItem`。宽屏（`grid`）每格 `minHeight` 38、只显示标题与「已添加」徽标 / `Plus`，容器 `flexDirection: "row"` + `flexWrap` + `gap: 8`，列宽 `(width - 8) / 2`；窄屏退回单列并保留一行说明。
- 列宽用容器 `onLayout` 实测（三栏布局里内容列远窄于窗口），`useWindowDimensions` 仅作首帧初值；列宽 < 400 时走单列，避免两列把标题挤没。
- 一次渲染条数拆成 `GRID_PAGE_SIZE = 120` / `LIST_PAGE_SIZE = 80`：两列行高更矮，总滚动长度仍可控。
- 描述不再占版面，但搜索仍匹配 `descriptionZh` / `descriptionEn` 全文。每格右侧提供一个 `FileText` 详情按钮（`event.stopPropagation()` 避免连带触发安装），触摸端另支持长按整格；两者都打开 `SkillDetailSheet` 查看完整说明，复用 `viewingCatalog` 与 `toggleCatalogSkillInstall`。该弹层原先只在技能主页渲染，`adding` 分支提前 return 时看不到，现已一并放到 `adding` 的 `BotPage` 内。点击格子安装 / 再次点击移除的交互不变。
- [i18n] 新增 `agentSpace.addSkillDetailHint`（查看技能说明 / View skill details），`agentSpace.addSkillHint` 补上「点图标或长按看说明」提示，zh/en 同步。

**验证**

- `pnpm exec biome check --write`（改动文件）通过；i18n / skill-sharing / skill-catalog 共 30 例单测通过。
- `pnpm --dir apps/mobile typecheck` 仍只有 `bot-pages/connectors.tsx` 的 7 个既有错误，与本次改动无关。

### 2026-11-07 · 「添加技能」技能库改为紧凑列表，一屏显示更多技能

**背景**

技能库每行是大卡片（15px 标题 + 两行描述 + 20px 内边距），行高约 80px，一屏只看得到 7～8 个技能；且一次只渲染 40 条。用户要求页面更简洁、能看到更多技能。

**处理**

- [skills.tsx](../apps/mobile/src/bot-pages/skills.tsx)：`SkillLibraryPanel` 改为紧凑行——标题 13/18 加粗、描述 11/15 且 `numberOfLines={1}`，`minHeight` 56 → 44、`paddingVertical` 10 → 6、`gap` 3 → 1，行高约 46px（原约 81px）；「已添加」徽标内距与 `Plus` 图标同步缩小。
- 同文件：`LIBRARY_PAGE_SIZE` 40 → 80。行高减半后，一次渲染的滚动长度与原先 40 条大卡片相当，首屏开销没有明显增加；搜索框 `minHeight` 40 → 36、容器 `gap` 10 → 8，顶部说明改用 `s.small`。
- [i18n] `agentSpace.addSkillHint` zh/en 缩短为一行提示。
- 描述虽然只显示一行，搜索仍匹配 `descriptionZh` / `descriptionEn` 全文，长描述不影响检索；点击安装 / 再次点击移除、「已添加」徽标、空态与「还有 N 个技能」提示均保持不变。

**验证**

- `pnpm exec biome check --write`（改动文件）通过；i18n / skill-sharing / skill-catalog 共 30 例单测通过。
- `pnpm --dir apps/mobile typecheck` 仍只有 `bot-pages/connectors.tsx` 的 7 个既有错误，与本次改动无关。

### 2026-11-07 · Agent 详情技能页只保留「添加技能」并改为文字按钮

**背景**

Agent 详情 → 技能 右上角的「+」原本弹出双项菜单（创建技能 / 添加技能）。用户要求去掉「创建技能」，只保留从技能库添加；随后又要求把纯图标「+」改成一眼可读的「+ 添加技能」文字按钮。创建入口统一放在「应用与能力 → 技能 → 我的技能」。

**处理**

- [skills.tsx](../apps/mobile/src/bot-pages/skills.tsx)：删除 `SkillMenuAnchor` / `SkillMenuRow` / `SkillActionMenu` 与锚点测量、`menuAnchor` 状态；右上角改用一个 `Button small icon={Plus}`，文案 `agentSpace.addSkill`，点击直接 `setAdding(true)` 打开技能库。复用 ui 里的小号次要按钮，与「应用与能力 → 技能」页的「创建技能」同款样式（描边 + 图标 + 文字）。
- 同文件：`editingSkill` 状态由 `AgentSkill | "new"` 收窄为 `AgentSkill`，编辑页标题固定为 `agentSpace.editSkill`，`SkillEditor` 只接收已有技能；自建技能的「编辑」「删除」入口保持不变。
- [i18n] zh-Hans / en 同步移除 `agentSpace.skillMenuLabel`；`agentSpace.skillEmpty` 去掉「写下研究方法创建技能」的引导，改为提示点右上角「添加技能」从技能库挑选。`agentSpace.createSkill` 仍被「我的技能」页使用，予以保留。

**验证**

- `pnpm exec biome check --write`（改动文件）通过；`pnpm exec tsx --test` 的 i18n / skill-sharing / skill-catalog 共 30 例通过，确认中英语言包 key 集合仍一一对应。
- `pnpm typecheck` 仍被既有问题挡住：`apps/mobile/src/bot-pages/connectors.tsx` 引用了不存在的 `AgentDefinition.installedConnectors` 与 `agentSpace.connectors*` 文案 key（HEAD 中同样缺失），与本次改动无关；`skills.tsx` 无类型报错。

### 2026-11-07 · 自建技能「添加到智能体」来源行只读，禁止移除最后一份

**背景**

把来源 Agent 一并放进列表后，它显示「已添加」却仍可点击切换：误点会移除技能的原始副本；若那是最后一份，技能会从「我的技能」列表彻底消失。用户要求来源行只读，且任何情况下都不允许把技能移除到没有任何副本。删除技能统一走列表里的「删除」入口（`deleteSkillEverywhere`）。

**处理**

- [skill-sharing.ts](../apps/mobile/src/skill-sharing.ts)：新增 `skillLockedAgentIds(agents, skill, sourceAgentId?)`——锁定来源 Agent 的副本；若只剩一个持有者，即使没传来源也锁住那最后一份。
- [skill-sharing.ts](../apps/mobile/src/skill-sharing.ts)：`toggleSkillShare` 增加可选 `guard: { agents, sourceAgentId }`，移除前查锁定列表，命中返回 `blocked` 且不调用 `deleteSkill`，作为 UI 之外的兜底。
- [capability-hub.tsx](../apps/mobile/src/capability-hub.tsx)：`AgentInstallRow` 支持 `locked`（`disabled` + 无障碍 disabled 态 + 0.72 透明度 + 专属徽标）；`AgentPickerPanel` / `MySkillDetailSheet` 新增可选 `lockedAgentIds`，只有自建技能传入——系统内置技能仍可自由安装 / 卸载。
- 两个详情页（「应用与能力 → 我的技能」与 Agent 详情 → 技能）计算锁定列表并传 `guard`；`blocked` 时弹 `agent.skillShareBlockedToast`，不再误报「已移除」。
- 锁定的「来源」取详情页上下文：「我的技能」用汇总条目的 agentId（最近更新的那份副本），Agent 详情用当前 Agent；数据模型未记录技能最初创建于哪个 Agent，注释已说明这一近似。
- [i18n] 新增 `agent.skillShareLocked`（已添加 · 不可移除 / Added · locked）与 `agent.skillShareBlockedToast`，zh-Hans 与 en 同步；`agent.skillInstallHint` 补一句锁定说明。
- [skill-sharing.test.ts](../apps/mobile/test/skill-sharing.test.ts)：新增锁定判定 2 例（来源 + 最后一份、多副本只锁来源）与 `blocked` 分支 1 例。

**验证**

- 本次会话仍无本地命令执行通道，`tsc --noEmit` / `biome check` / 单测未运行，待本机补跑（命令同前：`pnpm --dir apps/mobile typecheck`、`pnpm exec biome check <改动文件>`、`pnpm exec tsx --test apps/mobile/test/skill-sharing.test.ts apps/mobile/test/i18n.test.ts`）。
- 静态核对：`lockedAgentIds` 在两处调用点均已接线、`SkillDetailSheet` 未传锁定列表、zh/en 新增 key 一一对应且无占位符。

### 2026-11-07 · 技能页新增「创建技能」入口与自建技能删除（删除需二次确认）

**背景**

「应用与能力 → 技能」里，「创建技能」只在「我的技能」子页内容区出现，切到「技能市场」就看不到；自建技能卡片只能点开详情，没有删除入口。

**处理**

- [capability-hub.tsx](../apps/mobile/src/capability-hub.tsx)：`HubTabBar` 增加 `action` 槽位，「创建技能」按钮常驻二级标签栏右上角（两个子 tab 均可见），窄屏换行避免挤出屏幕；`MySkillsList` 每张卡片新增红色「删除」按钮，`stopPropagation` 防止同时打开详情。
- [skill-editor.tsx](../apps/mobile/src/skill-editor.tsx)：新增可选 `onSaved`，从技能市场创建并保存后自动切到「我的技能」展示结果；Agent 详情技能页不传该回调，行为不变。
- [skill-sharing.ts](../apps/mobile/src/skill-sharing.ts)：新增 `deleteSkillEverywhere`，按内容指纹清掉所有 Agent 上的副本——「我的技能」是去重汇总，只删一条会让其它副本重新出现；删除后给出 Toast。
- [i18n] zh-Hans / en 同步新增 `agent.mySkillDeletedToast`；[skill-sharing.test.ts](../apps/mobile/test/skill-sharing.test.ts) 新增「清掉全部同内容副本」与「不误删不同内容技能」用例。
- 删除前二次确认：[capability-hub.tsx](../apps/mobile/src/capability-hub.tsx) 导出共用 `SkillDeleteConfirm`（`ModalOverlay` + `s.card`，点遮罩取消，取消 / 危险确认双按钮）；「我的技能」卡片点击只打开确认层，确认后才执行 `deleteSkillEverywhere`；[skills.tsx](../apps/mobile/src/bot-pages/skills.tsx) Agent 详情技能页的删除入口同样改为先确认，确认后删当前 Agent 那一份并给 Toast。新增 zh/en `agent.mySkillDeleteConfirmTitle` / `NoteAll`（会清掉所有智能体副本）/ `NoteOne`（只删当前智能体），按钮文案复用 `agentSpace.deleteConfirmAction` 与 `common.cancel`。

**验证**

- 本次会话无本地命令执行通道，待本机补跑：`pnpm exec biome check --write`（上述改动文件）、`pnpm typecheck`、`pnpm test`。
- 已静态核对：新增导入 / 导出与调用点一致，zh/en key 集合、占位符 `{title}` 一致。

### 2026-11-07 · 技能详情「添加到智能体」展示全部智能体（含技能来源 Agent）

**背景**

「应用与能力 → 技能」里，系统内置技能详情的「添加到智能体」已列出 `agentList` 全部智能体；但自建技能详情用 `skillTargetAgents` 主动排除了创建该技能的来源 Agent——技能 A 创建于智能体 B 时列表里看不到 B，无法确认这份技能的归属。要求两类技能详情都展示全部智能体，来源 Agent 也要出现。

**处理**

- [skill-sharing.ts](../apps/mobile/src/skill-sharing.ts#L36-L42)：移除 `skillTargetAgents`，新增 `skillHolderAgentIds`——按内容指纹返回已持有该技能的 Agent id（含来源 Agent），用于行内「已添加」徽标与底部计数。
- [capability-hub.tsx](../apps/mobile/src/capability-hub.tsx#L1172-L1176)：「我的技能」详情弹层 `agents` 直接传 `agentList`，`mySkillAddedAgentIds` 改用 `skillHolderAgentIds`；来源 Agent 因此显示为「已添加」且计入计数。系统内置技能详情原本就传 `agentList`，保持不变。
- [skills.tsx](../apps/mobile/src/bot-pages/skills.tsx#L249-L250)：Agent 详情 → 技能 的自建技能详情同步改为 `agents={agentList}`，不再排除当前 Agent，保证两处共用同一套判定。
- 切换仍复用 `toggleSkillShare`：点击来源 Agent 会移除它持有的那份副本（与技能市场逐行开关一致）；若它是最后一个持有者，该技能会从「我的技能」列表消失。
- [i18n] `agent.skillShareNoTargets` 文案由「还没有其他智能体」改为「还没有智能体」，zh-Hans 与 en 同步；列表至少包含来源 Agent，该提示仅在完全没有智能体时出现。
- [skill-sharing.test.ts](../apps/mobile/test/skill-sharing.test.ts#L42-L51)：替换旧的「排除来源 Agent」用例，新增「已添加列表包含来源 Agent」与「未持有不计入」用例。

**验证**

- 本次会话无本地命令执行通道，以下校验待在本机终端运行：`pnpm --dir apps/mobile typecheck`、`pnpm exec biome check apps/mobile/src/skill-sharing.ts apps/mobile/src/capability-hub.tsx apps/mobile/src/bot-pages/skills.tsx apps/mobile/test/skill-sharing.test.ts apps/mobile/src/i18n/locales/zh-Hans/agent.ts apps/mobile/src/i18n/locales/en/agent.ts`、`pnpm exec tsx --test apps/mobile/test/skill-sharing.test.ts apps/mobile/test/i18n.test.ts`。
- 已静态核对：`skillTargetAgents` / `mySkillTargets` / `shareTargets` 无残留引用（历史记录里的说明除外），改动文件的导入与调用点一致，zh/en 文案键同步。

### 2026-11-07 · Agent 详情「技能库」技能详情新增「添加到智能体」

**背景**

Agent 详情 → 技能页里，自建技能详情右上角已有「安装到智能体」（用户称「添加到智能体」）入口；从技能库安装的技能点开详情仍是只读，右上角空白，无法把同一份目录技能复用到其他智能体。

**处理**

- [skills.tsx](../apps/mobile/src/bot-pages/skills.tsx#L228)：`BotSkillsPage` 从 `useAgentSpace` 取出 `setSkillInstalled`。
- [skills.tsx](../apps/mobile/src/bot-pages/skills.tsx#L267-L281)：新增 `toggleCatalogSkillInstall`，按目标 `agent.installedSkills` 判定后切换安装状态，并复用 `skillInstalledToast` / `skillUninstalledToast` 弹提示。
- [skills.tsx](../apps/mobile/src/bot-pages/skills.tsx#L439-L446)：`SkillDetailSheet` 传入 `agents={agentList}` 与 `onToggleInstall`，右上角渲染与技能市场、自建技能详情同一个按钮，点开为智能体逐一开关面板（含当前 Agent，可在此直接移除）。
- [capability-hub.tsx](../apps/mobile/src/capability-hub.tsx#L600-L605)：更新组件注释，「Agent 详情页只传 skill 退化为只读」的描述已不再成立。
- 未新增 i18n 键：按钮、面板标题、提示与计数全部复用既有 `agent.skillInstall*` 文案，与技能市场保持一致。

**验证**

- 静态复核：新增调用的 props 类型（`setSkillInstalled` 签名、`AgentDefinition`、Toast 插值参数）与调用链一致，未改动公共组件接口。
- 本次环境未提供命令执行能力，`tsc --noEmit` / `biome check` / 单测未运行，需在本地补跑确认。

### 2026-11-07 · 「我的技能」不再按智能体分类，并支持直接创建技能

**背景**

「我的技能」列表每行右侧带来源 Agent 标签，同一份技能被复制到多个 Agent 后会出现多行；用户认为不同智能体里创建的技能本质上是同一份，不应该以 Agent 作为分类维度。同时希望在这个页面就能创建技能，不必跳到 Agent 详情。

**处理**

- [skill-sharing.ts](../apps/mobile/src/skill-sharing.ts#L39-L70)：新增 `SharedSkillEntry` 与 `collectSharedSkills`，跨 Agent 汇总自建技能时按内容指纹去重，同内容只保留最近更新的一条（副本 id 不同，不能按 id 判重）。
- [capability-hub.tsx](../apps/mobile/src/capability-hub.tsx#L992-L1050)：`MySkillsList` 行内删除来源 Agent 标签，只保留技能名 + 用途 + 箭头；`MySkillEntry` 改为复用 `SharedSkillEntry`。
- 详情弹层的副标题「创建于 {agent}」一并去掉：去重后保留的「来源 Agent」只是最近更新的那份副本，标注出来反而是误导；`agent.mySkillSource` 键随之清理。
- [capability-hub.tsx](../apps/mobile/src/capability-hub.tsx#L1483-L1501)：「我的技能」标签页顶部新增右对齐的「创建技能」按钮，点击在 Sheet 里打开技能表单；列表为空时按钮同样可用，空状态文案同步更新。
- 新增 [skill-editor.tsx](../apps/mobile/src/skill-editor.tsx)：把原来只存在于 Agent 技能页的创建 / 编辑表单（含「工作提示词」Markdown 预览）抽成共享组件，Agent 技能页与「我的技能」共用同一份表单；技能写入当前选中的 Agent。
- [i18n] `agent.mySkillsEmpty` 文案更新为「点右上角『创建技能』写一个」，zh-Hans 与 en 同步。
- [skill-sharing.test.ts](../apps/mobile/test/skill-sharing.test.ts)：新增跨 Agent 去重用例（同内容保留最近更新、不同内容各自成行）。

**验证**

- `pnpm exec tsc --noEmit`（apps/mobile）：无新增类型错误（`connectors.tsx` 的既有错误与本次无关）。
- `pnpm exec biome check`：改动文件通过。
- `tsx --test skill-sharing.test.ts i18n.test.ts agent-space.test.ts`：38 项全部通过。

### 2026-11-07 · 自建技能详情新增「添加到智能体」

**背景**

用户自己创建的技能此前只能只读查看；想把同一份技能复用到其他智能体时，只能进入那个 Agent 从头再写一遍。要求在自建技能详情页右上角加一个「添加到智能体」，功能与技能市场里同名按钮一致（点开后逐一选择智能体）。

**处理**

- [skill-sharing.ts](../apps/mobile/src/skill-sharing.ts)：新增共享模块。`findSkillCopy` 按「名称 + 用途 + 工作提示词 + 输出格式」的内容指纹判定目标 Agent 是否已持有该技能（复制过去的是新副本、id 不同，不能按 id 判重）；`skillTargetAgents` 排除技能来源 Agent；`toggleSkillShare` 统一「没有副本就复制、已有副本就删除」。
- [capability-hub.tsx](../apps/mobile/src/capability-hub.tsx#L554-L600)：把原先内联在 `SkillDetailSheet` 里的智能体选择面板抽成 `AgentPickerPanel`，两个弹层共用同一版式（行进式列表、已添加徽标、底部计数）。
- [capability-hub.tsx](../apps/mobile/src/capability-hub.tsx#L726-L801)：`MySkillDetailSheet` 新增 `agents` / `addedAgentIds` / `onToggleAdd`；传入后在右上角渲染按钮（复用市场详情页同一按钮 `agent.skillInstallAction`），点开切换为智能体选择面板。
- 两处调用都接上：「应用与能力 → 我的技能」与 Agent 详情 → 技能 → 自建技能详情；切换后弹 Toast（复用 `skillInstalledToast` / `skillUninstalledToast`）。
- [i18n] 新增 `agent.skillShareNoTargets`（只有一个 Agent、没有可添加目标时的提示），zh-Hans 与 en 同步。
- [skill-sharing.test.ts](../apps/mobile/test/skill-sharing.test.ts)：新增 4 项单元测试，覆盖内容判重、目标筛选与添加 / 移除。

**验证**

- `pnpm exec tsc --noEmit`（apps/mobile）：无新增类型错误（`connectors.tsx` 的既有错误与本次无关）。
- `pnpm exec biome check`：改动文件通过。
- `tsx --test apps/mobile/test/skill-sharing.test.ts apps/mobile/test/i18n.test.ts`：20 项全部通过。

### 2026-11-07 · 「应用与能力 → 技能」二级标签「全部」改为「技能市场」

**背景**

用户选中「应用与能力 → 技能」页面顶部的「全部」标签（蓝色激活态），希望改名为「技能市场」，与「我的技能」形成「市场 / 个人」两个视角的对照。

**处理**

- [i18n] 新增 `agent.skillMarketAll`（zh-Hans：技能市场 / en：Skill market）。
- [capability-hub.tsx](../apps/mobile/src/capability-hub.tsx#L1400-L1408)：技能 tab 二级标签页的「全部」标签改用 `agent.skillMarketAll`；插件 / 连接器等类型分类筛选里的「全部」（`agent.hubCategoryAll`）保持不变。
- 同步更新 `HubTabBar` 组件注释（「全部 / 我的技能」→「技能市场 / 我的技能」）。

**验证**

- `pnpm exec tsc --noEmit`（apps/mobile）：无类型错误（`connectors.tsx` 的既有错误与本次改动无关）。

### 2026-11-06 · 「我的技能」详情弹窗工作提示词支持 Markdown 渲染

**背景**

「应用与能力 → 我的技能」卡片详情弹窗中的「工作提示词」以纯文本展示 Markdown 源码（标题、列表、加粗都显示为 `#`、`-`、`**`），可读性差。用户在浏览器中选中这些源码，要求按 Markdown 语法渲染。

**处理**

- [instructions-markdown.ts](../apps/mobile/src/instructions-markdown.ts)：新增共享样式模块，将技能编辑器里已调好的 `instructionsTextStyle` / `instructionsMarkdownStyle`（15 号正文字、按层级缩放的标题、引用/代码/分割线等样式）从 skills.tsx 迁出，供编辑器预览与详情弹窗共用，保证同一份指令各处排版一致。
- [capability-hub.tsx](../apps/mobile/src/capability-hub.tsx#L719-L724)：`MySkillDetailSheet` 的「工作提示词」板块改用 `<Markdown markdownit={assistantMarkdown} style={instructionsMarkdownStyle}>` 渲染，替代原来的 `<Text>` 纯文本。
- [skills.tsx](../apps/mobile/src/bot-pages/skills.tsx#L8-L16)：移除本地样式定义与不再使用的 `Platform` / `TextStyle` / `MarkdownStyles` / `fonts` 导入，改为引用共享样式，行为不变。

**验证**

- `pnpm exec tsc --noEmit`（apps/mobile）：`instructions-markdown.ts` / `capability-hub.tsx` / `skills.tsx` 无类型错误（`connectors.tsx` 的既有错误与本次改动无关）。

### 2026-11-07 · 「应用与能力 → 技能」恢复「全部 / 我的技能」双标签页

**背景**

上一版把「我的技能」当成独立板块叠在技能目录上方：一屏里两个列表互相挤压，浏览技能目录时视线要跨过整块自建技能。用户要求恢复到之前的双标签页设计——「全部」和「我的技能」两个横排标签页切换内容。

**处理**

- [capability-hub.tsx](../apps/mobile/src/capability-hub.tsx#L863-L923)：新增 `HubTabBar`，横排标签页（40 高、1px 下分隔线、选中态主色文字 + 2px 下划线），带 `accessibilityRole="tab"` / `tablist` 与 `selected` 状态。
- [capability-hub.tsx](../apps/mobile/src/capability-hub.tsx#L925-L1004)：抽出 `MySkillsList`，复用原「我的技能」卡片样式（名称 + 用途 + 来源 Agent 标签 + 箭头），点击仍打开只读详情弹窗。
- [capability-hub.tsx](../apps/mobile/src/capability-hub.tsx#L1394-L1417)：技能 tab 顶部渲染标签页；切到「我的技能」时整块内容替换为自建技能列表，目录侧栏与搜索框隐藏；没有自建技能时给空状态提示。
- 目录视图（「全部」标签页）删除原来的「我的技能」板块，侧栏分类 + 技能栅格回到原样。
- [capability-hub.tsx](../apps/mobile/src/capability-hub.tsx#L113)：抽取 `EMPTY_STATE_BOX` 供目录无匹配与「我的技能」空态共用；不再使用的 `SectionHeading` 从 `./ui` 的 import 中移除。
- [i18n] 新增 `agent.mySkillsEmpty`（zh-Hans / en）；标签文案复用 `agent.hubCategoryAll`（全部 / All）与 `agent.mySkills`（我的技能 / My skills）。

**验证**

- `pnpm exec tsc --noEmit`（apps/mobile）：`capability-hub.tsx` 无类型错误（`connectors.tsx` 的既有错误与本次无关）。
- `pnpm exec biome check`：改动文件通过。
- `tsx --test apps/mobile/test/i18n.test.ts`：16 项全部通过。

### 2026-11-06 · 移除技能页「我的技能」标题

**背景**

用户选中技能页顶部的「我的技能」大标题，认为页面内容已自明（上方就是技能卡片列表），标题冗余，要求删除。

**处理**

- [skills.tsx](../apps/mobile/src/bot-pages/skills.tsx#L320-L323)：删除标题行 `<Text>{t("agentSpace.mySkills")}</Text>`，顶部「+」入口所在容器由 `s.between` 改为 `alignItems: flex-end`，保持按钮固定在右上角。
- [i18n] 清理无引用的 `agentSpace.mySkills` 键（zh-Hans 与 en 同步删除）。「应用与能力」页「我的技能」板块使用的 `agent.mySkills` 不受影响、继续保留。

**验证**

- `pnpm exec tsc --noEmit`（apps/mobile）：`skills.tsx` 无类型错误。

### 2026-11-07 · Agent 详情「工作提示词」支持 Markdown 预览

**背景**

技能编辑表单里的「工作提示词」是纯文本输入框：用户用 Markdown 写的标题、列表、加粗只能看到源码，无法确认渲染后的排版，写坏了也没法自查。

**处理**

- [skills.tsx](../apps/mobile/src/bot-pages/skills.tsx#L66-L135)：新增 `InstructionsField`，字段标签右侧提供「预览 / 编辑」切换；预览态用 `react-native-markdown-renderer` 配共享 `assistantMarkdown` 实例渲染，容器复用 `s.input` 的描边与内边距，与输入框同高（120）不跳版，内容为空时给占位提示。
- [skills.tsx](../apps/mobile/src/bot-pages/skills.tsx#L26-L64)：`instructionsMarkdownStyle` 对齐输入框的 15 号字，标题逐级缩小，行内代码 / 引用 / 表格沿用正文配色。
- [skills.tsx](../apps/mobile/src/bot-pages/skills.tsx#L159)：工作提示词改用 `InstructionsField`，其余字段仍走 `Field`。
- [ui.tsx](../apps/mobile/src/ui.tsx#L80)：抽出 `s.fieldLabel`（12/18 w500），供 `Field` 与自定义字段共用，`Field` 的视觉输出不变。
- [i18n] 新增 `agentSpace.skillInstructionsPreview`（预览 / Preview）、`agentSpace.skillInstructionsEdit`（编辑 / Edit）、`agentSpace.skillInstructionsPreviewEmpty`，zh-Hans 与 en 同步。
- 切换只影响渲染分支，`instructions` 草稿状态始终保留，预览不会丢内容。

**验证**

- `pnpm exec tsc --noEmit`（apps/mobile）：`skills.tsx` / `ui.tsx` 无类型错误（`connectors.tsx` 的既有错误与本次改动无关）。
- `pnpm exec biome check`：4 个改动文件通过。
- `tsx --test apps/mobile/test/i18n.test.ts`：16 项全部通过。

### 2026-11-06 · 移除技能详情弹窗中的使用提示文案

**背景**

用户选中技能详情弹窗中「只 会把技能带入对话输入区，你描述问题后再决定是否发送。」的提示文本，认为「使用」按钮已能表达意图，提示冗余，要求删除。

**处理**

- [capability-hub.tsx](../apps/mobile/src/capability-hub.tsx#L676-L682)：删除 `onUse` 区块中 `<Text>{t("agent.skillDetailUseHint")}</Text>` 提示文本，仅保留「使用此技能」按钮。
- [i18n] 清理无引用的 `agent.skillDetailUseHint` 键（zh-Hans 与 en 同步删除）。

**验证**

- `pnpm exec tsc --noEmit`（apps/mobile）：`capability-hub.tsx` 无类型错误。

### 2026-11-06 · 移除安装技能卡片的勾选图标

**背景**

用户选中「从技能库安装的技能」卡片右上角的绿色勾选图标，要求一并移除。自建技能与安装技能两张卡片随后续精简，逐步统一为纯信息卡片。

**处理**

- [skills.tsx](../apps/mobile/src/bot-pages/skills.tsx#L400-L407)：删除安装技能卡片内 `<Check size={16} color={colors.success} />` 勾选图标，并从 `../icons` 的 import 中移除未再使用的 `Check`。卡片结构简化为：技能标题 → 描述。
- 至此技能页「从技能库安装的技能」卡片与自建技能卡片均为纯信息展示（标题 + 描述），不再冗余状态元素。

**验证**

- `pnpm exec tsc --noEmit`（apps/mobile）：`skills.tsx` 无类型错误。

### 2026-11-06 · 移除自建技能卡片的版本号展示

**背景**

用户选中自建技能卡片底部的「版本 10」小字，认为版本号对用户无参考价值，要求移除。此前该卡片已同步移除启停开关（自建技能不再提供开关），卡片信息进一步精简。

**处理**

- [skills.tsx](../apps/mobile/src/bot-pages/skills.tsx#L384-L385)：删除自建技能卡片内 `customSkills.map` 末尾的 `<Text>{t("agentSpace.skillVersion", ...)}</Text>` 版本号行。卡片结构简化为：技能名 + 删除按钮 → 用途描述。
- i18n 键 `agentSpace.skillVersion` 保留：「应用与能力」页「我的技能」只读详情弹窗中仍展示版本。

**验证**

- `pnpm exec tsc --noEmit`（apps/mobile）：`skills.tsx` 无类型错误。

### 2026-11-06 · 移除技能卡片中的「已添加」状态文本

**背景**

用户在技能页选中「已添加」的灰色小字，认为该状态信息冗余：卡片右上角已有绿色勾选图标表示已安装状态，无需再单独用文字提示。

**处理**

- [skills.tsx](../apps/mobile/src/bot-pages/skills.tsx#L393-L418)：删除「从技能库安装的技能」卡片内 `installedEntries.map` 末尾的状态文本行 `<Text>{t("agent.skillInstallInstalled")}</Text>`。卡片结构简化为：技能名 + 勾选图标 → 描述。
- i18n 键 `agent.skillInstallInstalled` 保留：技能库行内徽标（StatusBadge）与「应用与能力」页 AgentInstallRow 仍在使用。

**验证**

- `pnpm exec tsc --noEmit`（apps/mobile）：`skills.tsx` 无类型错误。

### 2026-11-06 · 「应用与能力」技能 tab 新增「我的技能」板块

**背景**

用户希望「应用与能力」页面的「技能」中能直接看到自己创建的自建技能，而不必逐个进入 Agent 的人设页。已与用户确认：展示范围为**全部 Agent 的自建技能汇总**，点击技能卡片打开**只读详情弹窗**。

**处理**

- [capability-hub.tsx](../apps/mobile/src/capability-hub.tsx#L857-L867)：新增 `MySkillEntry` 类型与 `mySkills` 数据——`agentList.flatMap` 汇总所有 Agent 下的 `customSkills`，每条带来源 Agent 名。
- [capability-hub.tsx](../apps/mobile/src/capability-hub.tsx#L1196-L1271)：技能 tab 内容列顶部新增「我的技能」板块（仅 `typeFilter === "skills"` 且有数据时显示），卡片展示技能名、一句话用途、来源 Agent 标签，点击打开详情。
- [capability-hub.tsx](../apps/mobile/src/capability-hub.tsx#L1351-L1378)：新增只读详情 Sheet，展示用途 / 工作提示词 / 输出格式 / 版本，副标题标注「创建于 {agent}」。
- [i18n] `agent.mySkills`（我的技能 / My skills）、`agent.mySkillSource`（创建于 {agent} / Created in {agent}），zh-Hans 与 en 同步。

**验证**

- `pnpm exec tsc --noEmit`（apps/mobile）：`capability-hub.tsx` 无类型错误。

### 2026-11-06 · 任务目标提醒 P1：关联管理、通知分组与近 7 天活动

**背景**

完成 [PRD：任务目标提醒](./PRD-任务目标提醒.md) 的 P1 范围，在 P0「接下来 + 目标轨道」之上补齐收件箱与关联管理。

**处理**

- [service.ts](../apps/server/src/engine/service.ts)：已有提醒支持关联、改绑、解除目标；`null` 表示显式解除；监控任务同步更新 `goalId` / `milestoneId`，避免展示与执行上下文不一致。
- [agent.ts](../packages/domain/src/agent.ts) / [db.ts](../apps/server/src/db.ts)：里程碑新增可选 `completedAt`，勾选、整表更新和任务自动完成三条路径都会记录完成时间，取消勾选时清除。
- [tracking-view.ts](../apps/mobile/src/tracking-view.ts)：目标轨道增加近 7 天任务回执、提醒告警与里程碑完成记录，并按 `Asia/Shanghai` 生成当日摘要。
- [notification-view.ts](../apps/mobile/src/notification-view.ts) / [agent-ui.tsx](../apps/mobile/src/agent-ui.tsx)：通知抽屉按 `notification.taskId -> task.goalId -> goal` 分组；缺失任务、已删目标和无任务通知回退到「独立通知」。
- [tracking-screen.tsx](../apps/mobile/src/tracking-screen.tsx)：完成目标的关联提醒进入独立折叠区，保留逐条暂停/恢复、查看与改绑入口；每日摘要放在目标卡片内，不新增逐条推送。
- [agent-ui.tsx](../apps/mobile/src/agent-ui.tsx)：提醒编辑表单支持独立提醒、关联目标、切换里程碑和解除关联。

**验证**

- `pnpm typecheck`
- `pnpm build:web`
- `node --import tsx --import ./tests/setup.ts --test --test-reporter=dot tests/*.test.ts apps/mobile/test/*.test.ts`：983 个测试通过。

### 2026-11-06 · 左侧栏置顶 Agent 区块底色区分

**背景**

用户反馈左侧栏 Agent 列表中，置顶 Agent 区域与下方的非置顶区块视觉上没有区分，需要为置顶区域添加背景色。

**处理**

- [agent-product.tsx](../apps/mobile/src/agent-product.tsx#L624-L632)：新增 `pinnedAgents`（系统默认 + 用户置顶）与 `restAgents` 分组计算。
- [agent-product.tsx](../apps/mobile/src/agent-product.tsx#L717-L745)：列表渲染改为两块——置顶区块包裹在带 `colors.overlay1` 淡灰底色、圆角、4px 内边距的容器中；非置顶区块正常平铺。

**验证**

- `pnpm exec tsc --noEmit`（apps/mobile）：`agent-product.tsx` 无类型错误。

### 2026-11-06 · 左侧栏系统内置默认 Agent 永远置顶

**背景**

用户反馈左侧栏的系统内置默认 Agent（如「小悟」）会被用户置顶的 Agent 挤到下方，需要始终固定在列表最上方。

**处理**

- [agent-product.tsx](../apps/mobile/src/agent-product.tsx#L613-L623)：`orderedAgents` 排序规则由「仅按置顶」改为三级排序——系统内置（`agent.system`）永远置顶 → 用户置顶 → 其余（同组内保持创建顺序）。

**验证**

- `pnpm exec tsc --noEmit`（apps/mobile）：`agent-product.tsx` 无类型错误。

### 2026-11-06 · 界面精简：删除免责声明、移除「研究模板」标题、删除 Agent 改为弹窗确认

**背景**

用户通过元素选择器反馈三处 UI 调整：删除笔记列表底部的两段免责声明文字与「研究模板」标题行；两个「删除 Agent」按钮（左侧栏菜单项与编辑页底部按钮）点击后需先弹窗确认，避免误删（删除不可恢复，必须带红色确认警示态）。

**处理**

- [notes-screen.tsx](../apps/mobile/src/notes-screen.tsx)：删除笔记列表末尾的「AI 生成，仅供参考，不构成投资建议」与「以上内容为信息整理，不构成投资建议。」两行免责声明。
- [agent-ui.tsx](../apps/mobile/src/agent-ui.tsx#L1233-L1238)：研究模板区块移除 `SectionHeading` 标题行，仅保留说明文字与模板卡片。
- [agent-product.tsx](../apps/mobile/src/agent-product.tsx)：删除行内二次确认组件 `AgentDeleteConfirm`，`pendingDelete` 由存 id 改为存 `AgentDefinition`；菜单点击「删除 Agent」后不再行内展开确认块，改为 `ModalOverlay` 居中弹窗（标题 + 不可恢复说明 + 取消/确认删除），确认按钮为 danger 红色。
- [bot-pages/edit.tsx](../apps/mobile/src/bot-pages/edit.tsx)：删除行内确认块，删除按钮常驻，点击后弹出 `ModalOverlay` 确认弹窗。
- i18n 新增文案键：`agentSpace.deleteConfirmTitle`（确定删除这个 Agent？/ Delete this Agent?）、`agentSpace.deleteConfirmAction`（确认删除 / Delete），zh-Hans 与 en 同步。

**验证**

- `pnpm exec tsc --noEmit`（apps/mobile）：本次改动文件无类型错误。

### 2026-11-06 · 任务弹窗改为全局视图（汇总所有 Agent 的任务）

**背景**

用户反馈右侧栏的任务弹窗此前按当前 Agent 作用域展示（标题为「任务 · 交易 Agent」），需要改为全局任务，汇总所有 Agent 的全部任务，并去掉标题中的 Agent 名称。

**处理**

- [agent-sheets.tsx](../apps/mobile/src/agent-sheets.tsx#L618-L624)：`panel === "tasks"` 的 `Sheet` 标题改为「任务」（去掉 `· Agent 名`），`TaskHubScreen` 不再传入按 Agent 过滤的 `agentTasks`，删除该过滤计算。
- [task-hub.tsx](../apps/mobile/src/task-hub.tsx)：移除 `tasks` 可选参数，计数与列表统一回落全工作区任务。
- [agent-ui.tsx](../apps/mobile/src/agent-ui.tsx#L372-L377)：`AgentActivityScreen` 移除 `scopedTasks` 参数，直接使用全局 `data.tasks`。

**验证**

- `npx tsc --noEmit`（apps/mobile）通过。

### 2026-11-06 · 添加模型服务商预设改用国内版（智谱 / MiniMax / Kimi）

**背景**

用户反馈「添加模型」服务商列表中 Z.ai、MiniMax Global、Kimi Global 三个预设用的是国际版端点，需要全部切换为国内版。

**处理**

- [model-settings.tsx](../apps/mobile/src/model-settings.tsx#L53-L73)：`PROVIDER_PRESETS` 中三处预设切换为国内版——
  - 智谱：`https://open.bigmodel.cn/api/paas/v4`（原 z.ai）
  - MiniMax：`https://api.minimaxi.com/v1`（原 minimax.io，去掉 Global 后缀）
  - Kimi：`https://api.moonshot.cn/v1`（原 moonshot.ai，去掉 Global 后缀）

**验证**

- `npx tsc --noEmit`（apps/mobile）通过。

### 2026-11-06 · 提示条（Toast）去掉前后图标

**背景**

用户反馈提示条左右两侧的图标（前置对勾、右侧关闭）不需要显示，只保留正文文字。

**处理**

- [toast.tsx](../apps/mobile/src/toast.tsx)：移除前置对勾图标与右侧关闭按钮，仅显示提示文字；不可撤销动作仍以文字按钮展示。同时清理不再使用的 `icon` prop 与图标导入。

**验证**

- `npx tsc --noEmit`（apps/mobile）通过。

### 2026-11-06 · 提示条（Toast）提升到页面最上层

**背景**

用户反馈在「模型管理」弹窗内切换「启用」开关时，「已启用 / 已停用」的提示没有显示在页面最上层——因为弹窗使用 RN `Modal`（portal 渲染在页面顶层），而提示条只是普通绝对定位，被弹窗遮挡不可见。

**处理**

- [toast.tsx](../apps/mobile/src/toast.tsx)：`Toast` 改用透明 `Modal` 渲染（`transparent` + `animationType="none"`），提示天然浮在所有弹窗之上；外层容器 `pointerEvents="box-none"` 保证透明区域不拦截点击。全局所有 `notify` 提示（含模型启停、删除、归档等）均受益。

**验证**

- `npx tsc --noEmit`（apps/mobile）通过。

### 2026-11-06 · 选择模型面板去掉「跟随默认」区块，改为在默认模型上打勾

**背景**

用户反馈「选择模型」面板顶部的「跟随默认模型 · X / 与工作区的默认模型保持一致」区块多余，希望未选择模型时直接在列表里勾中工作区默认的那一条。

**处理**

- [model-selector.tsx](../apps/mobile/src/model-selector.tsx)：删除面板顶部「跟随默认模型」卡片；新增 `checkedModel = 当前选择 ?? 工作区默认模型`，列表按它打勾，因此未指定专属模型的 Agent 会显示默认模型被选中；点击已生效的默认项不产生变更（避免多存一条与默认相同的选择）。触发按钮仍显示「跟随默认模型 · X」，便于看出实际生效的版本。

**验证**

- `npx tsc --noEmit`（apps/mobile）、biome 通过。

### 2026-11-06 · 「添加模型」改为服务商选择 → 填写密钥 → 勾选模型

**背景**

用户希望添加模型时先看到常见服务商（Google、OpenAI、DeepSeek、Anthropic、xAI、Z.ai、MiniMax Global、Kimi Global）以及「自定义模型」入口，点进去填写 API Key 后能配置该服务商下的模型。

**处理**

- [model-settings.tsx](../apps/mobile/src/model-settings.tsx)：新增 `AddModelSheet`——第一步按截图布局列出「自定义模型」（通栏）与 8 个服务商（两列卡片，字母标记代替品牌素材，避免引入商标）；第二步 `ProviderModelForm` 填写 API Key 与 Base URL（预设各家的 OpenAI 兼容地址，可改），点「读取可用模型」进入勾选列表（全选 / 取消全选 / 计数），再批量添加；「自定义模型」仍走原有的单模型表单（可手填模型 ID）。
- [model-settings.ts](../apps/server/src/model-settings.ts)：把 `/models` 拉取从 `verify()` 抽成 `fetchModels()`（统一错误映射、不回传厂商报文）；新增 `discover()` 与 `saveCustomBatch()`——同一端点只校验一次即可写入多个模型，记录 `provider` 供列表展示「服务商」，端点没声明的模型仍拒绝写入。
- [app.ts](../apps/server/src/app.ts)：新增 `POST /api/model/library/discover`、`POST /api/model/library/batch`。
- [packages/domain/src/model-settings.ts](../packages/domain/src/model-settings.ts)：新增 `ModelDiscoveryResult`、`CustomModelBatchInput`。
- 模型列表「服务商」列改为显示添加时选择的服务商名，纯自定义模型仍显示「自定义（OpenAI Compatible）」。
- 新增文案 11 条（中英）。

**验证**

- 新增测试：`discover` 返回端点声明的模型；`batch` 一次写入两个模型且 `providerLabel` 为 DeepSeek、响应不含明文密钥、`resolve` 使用批量的密钥；未声明的模型 ID 返回 422。
- `pnpm typecheck`、biome、`pnpm test`（971 项）全部通过。

**遗留说明**

- 预设地址都是各家 OpenAI Chat Completions 兼容端点；Anthropic 官方端点不兼容该协议，需要换成兼容网关地址才能读取模型。

### 2026-11-05 · 添加模型弹窗移除服务商地址副标题

**背景**

用户反馈「添加模型」选择服务商后，表单页标题下方显示的服务商地址（如 `https://api.anthropic.com/v1`）无需展示。

**处理**

- [model-settings.tsx](../apps/mobile/src/model-settings.tsx#L633)：`AddModelSheet` 服务商表单的 `Sheet` 移除 `subtitle={preset.baseUrl}`，标题只保留服务商名称。

**验证**

- `npx tsc --noEmit`（apps/mobile）通过。

### 2026-11-05 · 模型管理弹窗移除顶部说明文案

**背景**

用户反馈「模型管理」（`ModelSettingsSheet`）弹窗顶部的说明区块（「内置模型来自服务端配置…」+「当前模型：xxx」）不需要显示。

**处理**

- [model-settings.tsx](../apps/mobile/src/model-settings.tsx#L425-L426)：删除弹窗内顶部的两行说明（`modelSettings.managerHint` 提示语与 `modelSettings.current` 当前模型），弹窗直接以「添加模型」按钮与模型列表开头。

**验证**

- `npx tsc --noEmit`（apps/mobile）通过。

### 2026-11-05 · 模型管理弹窗宽度收窄

**背景**

用户反馈「模型管理」（`ModelSettingsSheet`）弹窗过宽。原 `wide` 宽度（`maxWidth: 1050`）经两轮反馈最终收窄至约一半。

**处理**

- [model-settings.tsx](../apps/mobile/src/model-settings.tsx#L545-L550)：`ModelSettingsSheet` 的 `Sheet` 由 `wide`（1050px）改为 `small`（440px，约为原宽 42%），紧凑居中展示；内置/自定义分组列表与「服务商」列在窄宽下仍可完整显示。

**验证**

- `npx tsc --noEmit`（apps/mobile）通过。

### 2026-11-05 · 「大模型连接」改为「模型管理」：内置只读 + 自定义模型

**背景**

用户希望「大模型连接」页面像模型列表那样呈现：服务端内置模型（含 DeepSeek）以表格只读列出，同时允许用户自己添加模型（地址 + API Key），并能编辑、删除、启停。

**处理**

- [packages/domain/src/model-settings.ts](../packages/domain/src/model-settings.ts)：新增 `ModelLibraryEntry` / `ModelLibrary` / `CustomModelInput`；自定义模型规格为 `custom/<model-id>`（含版本号，本身就是模型 ID）。
- [model-settings.ts](../apps/server/src/model-settings.ts)：新增模型库能力——`library()`（内置目录 + 自定义列表，密钥只回 `hasApiKey`）、`saveCustom()`（保存前用 `/models` 校验地址与模型，密钥加密且留空沿用）、`setCustomEnabled()`（只切开关，不重新校验网络）、`removeCustom()`（同时清理指向它的默认选择）；`choices()` / `customLabels()` 让自定义模型进入选模型列表与展示名；`resolve()` 支持 `custom/` 规格并优先使用记录里的端点与密钥，停用/缺失时回落默认模型；`read()` 避免读到 `custom/` 时报「厂商不可用」。
- [app.ts](../apps/server/src/app.ts)：新增 `GET/PUT/PATCH/DELETE /api/model/library`。
- [workspace.ts](../apps/server/src/workspace.ts)：`modelLabels` 合并账号自定义模型名。
- [model-settings.tsx](../apps/mobile/src/model-settings.tsx)：整页重做为「模型管理」——说明文案 + 「添加模型」+ 三列表格（模型 / 服务商 / 操作），「内置」「自定义」两组可折叠；内置行只读显示「–」，自定义行提供编辑、删除（二次确认）与启停开关；窄屏把服务商并入模型名下方；新增/编辑表单含模型 ID、显示名称、Base URL、API Key、保存前校验。
- [model-selector.tsx](../apps/mobile/src/model-selector.tsx)、[screens.tsx](../apps/mobile/src/screens.tsx)：自定义模型分组标题按语言渲染。
- 新增文案约 30 条（中英）。

**验证**

- 新增测试：模型库仅回内置 + 空自定义；`PUT` 添加后 `hasApiKey` 为真且响应不含明文密钥；自定义模型可被 `resolve` 解析为自身 baseUrl/key；停用后从 `choices` 消失且解析回落默认；删除后记录清空并清理默认选择。
- `pnpm typecheck`、biome、`pnpm test`（970 项）全部通过。

**遗留说明**

- 自定义模型仅支持 OpenAI Chat Completions 兼容端点；保存前需要该端点提供 `GET /models`。
- 内置模型是否出现取决于部署配置的厂商密钥；仍支持历史上已保存的个人厂商密钥。

### 2026-11-05 · 每个 Agent 可以选择自己的模型与版本

**背景**

用户希望「Agent 详情 → 模型」能按 Agent 分别选择模型与版本号，而不是所有 Agent 共用账号级的默认模型。

**处理**

- [agent-space-model.ts](../apps/mobile/src/agent-space-model.ts)：`AgentDefinition` 新增可选 `model`（`provider/model-id`）；`normalizeAgent` 校验取值，非法或空值不写字段（= 跟随工作区默认模型），保证规范化前后键集合一致。
- [agent-space.tsx](../apps/mobile/src/agent-space.tsx)：`updateAgent` 清空模型时删除字段，避免空字符串被服务端 schema 拒绝。
- [model-selector.tsx](../apps/mobile/src/model-selector.tsx)：新增受控模式（`value` / `onSelect` / `inheritLabel`）。不传 `onSelect` 时仍是原来的账号级模型切换；传入后由调用方保存，并在列表首部提供「跟随默认模型 · 当前默认」一项。
- [agent-settings-screen.tsx](../apps/mobile/src/agent-settings-screen.tsx)：模型分区绑定当前 Agent 的 `model`，选择后写入该 Agent。
- [packages/../agent-space.ts](../apps/server/src/agent-space.ts)：持久化 schema 接受可选 `model`（同模型 ID 字符集与长度上限）；新增 `agentModelForThread`，按 `threadId` 反查 Agent 的专属模型。
- [model-settings.ts](../apps/server/src/model-settings.ts)：`resolve(owner, requested?)` 支持本次请求指定模型——命中用户个人密钥走个人连接，命中服务端密钥走服务端连接，不可用时回落到用户默认模型。
- [conversation.ts](../apps/server/src/engine/conversation.ts)、[engine/model.ts](../apps/server/src/engine/model.ts)：对话按 `input.threadId`、任务按 `task.threadId` 解析所属 Agent 的模型，因此该 Agent 的对话与其发起的后台任务使用同一模型版本。
- 新增文案：`agentSpace.modelFollowDefault`、`agentSpace.modelHint`、`modelSettings.followsWorkspaceSelection`（中英）。

**验证**

- `pnpm typecheck`、`npx biome check` 通过。
- 新增 `tests/model-settings.test.ts`：通过 `PUT /api/agent-space` 写入带 `model` 的 Agent，断言该线程的对话与该线程发起的任务都使用 `deepseek-v4-pro`，其他线程仍用默认 `deepseek-flash`，且密钥不串号。
- 新增 `apps/mobile/test/agent-space.test.ts`：专属模型被保留、非法取值退化为跟随默认。
- `pnpm test`：969 项全部通过。

### 2026-11-05 · Agent「详情」改为左右分栏的独立页面

**背景**

用户反馈点击顶部 Agent 胶囊（`行情 Agent · 市场观察员`）弹出的「详情」浮层（`AgentManagerSheet`）承载内容过多，弹窗内层层跳转不易阅读。希望改成独立界面：左侧是功能选项，右侧是对应功能的设置内容。

**处理**

- [agent-settings-screen.tsx](../apps/mobile/src/agent-settings-screen.tsx)：新增 `AgentSettingsScreen`。宽屏为左栏（Agent 信息卡 + 人设 / 指令 / 能力 / 资料 / 分析记录 / 目标与记忆 / 模型）+ 右栏内容；列宽不足 760 时左栏收成横向分区条，避免挤压内容。分栏依据实际列宽（`onLayout`）而非窗口宽度，三栏布局下同样成立。
- [agent-product.tsx](../apps/mobile/src/agent-product.tsx)：胶囊 `onManage` 改为 `navigate("agent")`，主列在 `section === "agent"` 时渲染新页面；顶部标题映射为「Agent 详情」。
- [agent-sheets.tsx](../apps/mobile/src/agent-sheets.tsx)：删除 `AgentManagerSheet` 及仅它能到达的 `manage` / `bot-*` 浮层分支与 `AgentPanel` 成员，避免遗留死代码。
- [bot-pages/shared.tsx](../apps/mobile/src/bot-pages/shared.tsx) 及各页：`BotPage` 新增 `embedded`，为真时只渲染内容（标题由独立页面提供）；新增 `BotInlineBack` 给嵌套编辑态（技能编辑、新增目标、目标详情）提供返回入口。
- [agent-floating-header.tsx](../apps/mobile/src/agent-floating-header.tsx)：胶囊无障碍标签由「管理」改为「Agent 详情」。
- 新增文案：`agentSpace.agentDetails`、`agentSpace.changesSaved`（中英）。
- [packages/domain/src/index.ts](../packages/domain/src/index.ts)：`Section` 增加 `"agent"`。

**验证**

- `pnpm typecheck`、`npx biome check` 通过。
- `pnpm test`：967 项全部通过。

### 2026-11-05 · 设置等次级页面内容宽度自适应整体区块

**背景**

用户反馈移动端「设置」等次级页面选中的内容区块（`SecondarySection`）宽度固定为 1050，不跟随整体区块宽度。

**处理**

- [agent-product.tsx](../apps/mobile/src/agent-product.tsx#L907-L920)：`SecondarySection` 的 `ScrollView contentContainerStyle` 由 `maxWidth: 1050` 改为 `maxWidth: "100%"`，使内容始终跟随父级（主列，`columnMaxWidth: 965`）宽度，避免在窄视口下溢出、宽视口下与顶部区块宽度不一致。

**验证**

- `npx tsc --noEmit`（apps/mobile）通过。

### 2026-11-05 · 任务入口按当前 Agent 作用域统计与展示

**背景**

用户反馈左侧栏（Agent 管理面板，`AgentManagerSheet` 统计区）的「任务」区块：① 数字显示的是全局工作区任务数，而非当下 Agent 的任务数；② 点击后弹窗列出的是全部任务，而非当下 Agent 的任务。

**处理**

- [agent-sheets.tsx](../apps/mobile/src/agent-sheets.tsx)：
  - `AgentManagerSheet` 任务格计数由 `data?.tasks.length` 改为 `agentTasks.length`（`useBotResources` 已按 `threadId` 过滤当前 Agent 的任务）。
  - `AgentSheets` 计算与 `selectBotResources` 同口径的 `agentTasks` 过滤项（`task.threadId === current.threadId || (!task.threadId && current.system)`），「任务」弹窗改渲染 `TaskHubScreen tasks={agentTasks}`，标题追加当前 Agent 名。
- [task-hub.tsx](../apps/mobile/src/task-hub.tsx)：`TaskHubScreen` 新增可选 `tasks` 作用域参数，`totalTasks` 计数与「任务」页均以该参数为准；未传时保持全工作区行为。
- [agent-ui.tsx](../apps/mobile/src/agent-ui.tsx)：`AgentActivityScreen` 新增可选 `scopedTasks` 参数，列表与各状态筛选计数基于该作用域，未传时回落全局。

**验证**

- `npx tsc --noEmit`（apps/mobile）通过。
- 行为：任务格只显示当前 Agent 的任务数；点击「任务」在浮层内只列出当前 Agent 的任务（含全部 5 态筛选）。

### 2026-11-05 · 移动端 Agent 列表隐藏角色简介、压缩区块高度

**背景**

用户反馈：① 移动端左侧栏 Agent 列表里，每个 Agent 名称下方的简介（`agent.role`，如「投研助理」）无需再显示；② 每个 Agent 区块高度可再调小。

**处理**

- [agent-product.tsx](../apps/mobile/src/agent-product.tsx)：
  - `AgentListItem` 移除角色简介文本行，仅保留 Agent 头像与名称。
  - 区块高度压缩：`minHeight` 72 → 52，`paddingVertical` 13 → 6，头像 34 → 30，行高 19 → 17。

**验证**

- `npx tsc --noEmit`（apps/mobile）通过。

### 2026-11-05 · 修复登录表单字段缺少 id 的控制台日志

**背景**

用户反馈移动端控制台出现 5 条日志（其中包含浏览器可访问性 issue：`A form field element should have an id or name attribute`，count: 2）。经浏览器实测（`http://localhost:8081`）确认，登录页的「邮箱」「验证码」两个输入框渲染为 `<input>` 时没有 `id`/`name` 属性，触发该 issue；「访问密钥」输入框同理（access-key 表单未展开时不可见）。

**根因与处理**

- [App.tsx](../apps/mobile/App.tsx)：登录表单的「邮箱」「验证码」「访问密钥」三个 `Field` 增加 `nativeID`（rn-web 会将其渲染为 DOM `id` 属性，原生端亦无损）：
  - `auth-email` / `auth-code` / `auth-access-key`

**排查结论（无代码改动）**

- 用户选中的「个人中心」按钮（[agent-product.tsx](../apps/mobile/src/agent-product.tsx#L533) 的 `AgentRail`）及其周边组件（`AgentListItem`、`AccountMenu`、`LanguageMenuRow`、`AccountMenuRow`）逐一核查：`HoverPressable` 内部为纯 View/Image/Text，无嵌套 `accessibilityRole="button"`，无重复 key，结构合法。
- 历史 5 条日志中「2× `net::ERR_ABORTED /api/agent`、`/api/workspace`」为浏览器正常的在途请求中断（3 秒轮询被新请求取代或切页取消），`catch(() => {})` 已静默处理，无需改动。

**验证**

- `npx tsc --noEmit`（apps/mobile）通过。
- Chrome DevTools 实测：登录页两个输入框已带 `id="auth-email"` / `id="auth-code"`，`form field issue` 日志消失，控制台仅剩开发模式下的正常日志（React DevTools 提示与 Running application 信息）。

### 2026-11-01 · 移动端旁聊抽屉「应用与能力」图标与设置页对齐

移动端左侧抽屉（旁聊）中「应用与能力」入口原先使用 `Settings2`（齿轮）图标，与设置面板内同名入口的 `Shapes` 图标不一致。本次将旁聊抽屉中的图标改为与设置页面一致的 `Shapes`，保持同一功能入口在全局的视觉一致性。

**修改**

- `apps/mobile/src/threads.tsx`：「应用与能力」LinkRow 的图标由 `Settings2` 替换为 `Shapes`，并同步调整图标导入。
- 已通过 `npx tsc --noEmit` 类型检查。

### 2026-11-01 · 移动端旁聊抽屉移除「智能体电脑」简介

移动端左侧抽屉（旁聊）中「智能体电脑」入口原先带有一行副标题简介「浏览器、会话与文档」，本次删除该简介，仅保留入口名称，与其他入口保持一致的单一文本行样式。

**修改**

- `apps/mobile/src/threads.tsx`：「智能体电脑」LinkRow 移除 `detail` 属性。
- `apps/mobile/src/i18n/locales/zh-Hans/threads.ts` 与 `en/threads.ts`：删除已无引用的 `threads.agentComputerDetail` 键。
- 已通过 `npx tsc --noEmit` 类型检查。

### 2026-11-01 · 移动端顶栏新增搜索入口

移动端顶栏左侧原本只有一个「侧栏抽屉」按钮，本次在其右侧并列新增全局搜索按钮，点击打开 `GlobalSearchSheet`，与桌面端复用同一搜索组件与 `search.title` 文案。

**修改**

- `apps/mobile/App.tsx`：顶栏左侧按钮包改为横向排列，在「侧栏抽屉」按钮（Menu）右侧新增 `Search` 图标按钮，`onPress` 复用 `setSearchOpen(true)`。
- 已通过 `npx tsc --noEmit` 类型检查。

### 2026-11-01 · 移动端底部导航「工作台」前置并作为默认主页

移动端底部导航原顺序为「对话 / 工作台 / 任务 / 灵感 / 资料 / 我的」，本次将「工作台」调整到「对话」之前，使其成为第一个页签；应用打开时默认展示工作台（`today`）页面。

**修改**

- `apps/mobile/src/shell.tsx`：`MOBILE_NAV` 中 `today`（工作台）项调整至 `chat` 之前，顺序变为「工作台 / 对话 / 任务 / 灵感 / 资料」。
- `apps/mobile/App.tsx`：默认页签已是 `useState<Section>("today")`，打开项目主页即显示工作台，无需额外改动。
- 已通过 `npx tsc --noEmit` 类型检查。

### 2026-11-01 · 移动端对话页移除右上角「智能体电脑」入口

移动端顶栏右上角原先在对话（chat）页签下会额外叠加一个紧凑的「智能体电脑」入口按钮（`ComputerEntry`，状态点是圆点图标）。该入口在顶栏右侧与设置、通知按钮并列，信息密度偏高；智能体电脑仍可从「旁聊」抽屉与「应用与能力」等处进入，故本次在对话页将其移除。

**修改**

- `apps/mobile/App.tsx`：删除 `import { ComputerEntry } from "./src/computer";` 及对话页签下绝对定位渲染 `<ComputerEntry compact />` 的代码块。
- `apps/mobile/src/computer.tsx`：`ComputerEntry` 组件保留导出（仍被共享模块引用），但已无任何渲染入口。
- 已通过 `npx tsc --noEmit` 类型检查。

### 2026-11-01 · 左侧栏 Logo 标题字号收窄

移动端旁聊抽屉标题带品牌 Logo 时，「灵悟」标题从 22px 收紧至 17px（移动端）/ 18px（桌面端），与 24px 的 Logo 图形保持视觉和谐。

**修改**

- `apps/mobile/src/ui.tsx`：`Sheet` 标题样式在存在 `titleIcon` 时叠加更紧凑的字号（移动端 17px / 桌面端 18px），行高同步调整。
- 已通过 `npx tsc --noEmit` 类型检查。

### 2026-11-01 · 移动端顶栏中间改为智能体状态按钮

移动端顶栏中间区域原本展示「Logo + 灵悟 + 状态文字」，现替换为与桌面侧栏一致的智能体状态按钮：水豚头像 + 「{名称}在为你关注市场」+ 状态点 + 盯盘状态文案，点击可打开智能体设置（人格与记忆）面板。

**修改**

- `apps/mobile/App.tsx`：移除移动端中间的 `BrandMark` + 名称 + 状态文字渲染，改为 `Pressable` 智能体状态按钮（`Mascot` 头像 + `app.agentWatching` 文案 + 状态点 + `monitorStatus`），点击 `open({ type: "personality" })`；`activeTask`/`status` 计算替换为 `activeMonitorCount`/`monitorStatus`（取自 `data.monitors`）。
- 已通过 `npx tsc --noEmit` 类型检查。

### 2026-11-01 · 移动端左侧栏顶部标题改为 Logo + 项目名称

移动端旁聊抽屉（ThreadsSheet）顶部的标题原本只有「灵悟」文字，本次在标题文字前加入品牌 Logo（`logo.png`）图形，与标题并排展示，形成「Logo + 项目名称」的组合。

**修改**

- `apps/mobile/src/ui.tsx`：`Sheet` 组件新增可选 `titleIcon` 属性，用于在标题文字前展示装饰元素（如品牌 Logo）；标题区域改为横向布局，图标与标题并排。
- `apps/mobile/src/threads.tsx`：`ThreadsSheet` 传入 `titleIcon`（尺寸 24 的 `logo.png` 品牌 Logo），并新增 `Image` 导入。
- 已通过 `npx tsc --noEmit` 类型检查。

### 2026-11-01 · 移动端侧栏「资料」改为「自选与组合」入口

移动端点击左上角菜单打开的「旁聊」抽屉中，原「资料」行（跳转资料页）改为「自选与组合」入口，点击跳转自选与组合（watchlist）页面，图标同步替换为靶心图标。

**修改**

- `apps/mobile/src/threads.tsx`：`ThreadsSheet` 中资料行改为 `Target` 图标 + `app.navWatchlist`（自选与组合）文案，点击调用 `go("watchlist")`；`go` 的签名从 `"calendar" | "files" | "preferences" | "apps"` 更新为 `"calendar" | "watchlist" | "preferences" | "apps"`；导入将 `FileText` 替换为 `Target`。
- 已通过 `npx tsc --noEmit` 类型检查。

### 2026-11-01 · 移除旁聊抽屉副标题中的工作区名称

移动端点击左上角菜单打开的「旁聊」抽屉，其 Sheet 副标题在非样例模式下显示当前工作区/用户名（如 `luffy`）。该名称信息性与标题「灵悟」冗余，本次删除整个副标题，抽屉仅保留标题。

**修改**

- `apps/mobile/src/threads.tsx`：`ThreadsSheet` 移除 `subtitle` 属性（原为样例文本或 `workspace.profile.name`），并清理组件内不再使用的 `workspace` 解构。
- 已通过 `npx tsc --noEmit` 类型检查。

### 2026-11-01 · 「我的」页设置入口移至移动端顶栏右上角

移动端「我的」页面正文内原有的「设置」入口卡片迁移至页面顶栏右上角，与通知（铃铛）按钮同级、位于其左侧，仅当当前页签为「我的」时显示；桌面端不受影响（仍走侧边栏齿轮）。

**修改**

- `apps/mobile/src/account.tsx`：删除正文内 `compact` 条件下的「设置」卡片入口，并清理不再使用的 `Settings2`、`LinkRow`、`useWindowDimensions`、`breakpoints` 导入及 `open` 解构。
- `apps/mobile/App.tsx`：移动端顶栏右上角操作组新增 `Settings2` 图标按钮，点击打开设置面板，与通知按钮同级排列。
- 已通过 `npx tsc --noEmit` 类型检查。

### 2026-11-01 · 移动端顶栏设置入口改为常驻显示

原先移动端顶栏的「设置」齿轮按钮只在「我的」页签下显示，本次改为在任何页签下都常驻顶栏，与通知按钮永远并列。

**修改**

- `apps/mobile/App.tsx`：移除 `section === "account"` 条件，设置入口在移动端顶栏始终显示。
- 已通过 `npx tsc --noEmit` 类型检查。

### 2026-11-01 · 移动端底部导航补充「灵感」入口

移动端底部导航原先只有「对话 / 工作台 / 任务 / 资料 / 我的」五个页签，「灵感」此前并入「工作台」的高亮组（无独立 tab），导致移动端无法像桌面端一样直达灵感页。本次将「灵感」提升为底部导航独立入口。

**修改**

- `apps/mobile/src/shell.tsx`：`MOBILE_NAV` 新增 `{ id: "ideas", labelKey: "app.navIdeas", icon: Lightbulb }`（位于「任务」与「资料」之间），复用桌面侧边栏已有的图标与 i18n key。
- `apps/mobile/App.tsx`：底部导航 active 判定中，从「工作台」高亮组移除 `"ideas"`，避免「灵感」页签与「工作台」页签同时高亮。
- 已通过 `npx tsc --noEmit` 类型检查。

### 2026-10-31 · 「个人上下文」与「对话管理」分组迁移至「设置」面板

「我的」页面（`AccountScreen`）中的「个人上下文」（记忆 / 应用与能力 / 自选与组合）与「对话管理」（已归档对话）分组迁入桌面端「设置」面板（`SettingsSheet`），让配置类入口统一收拢。移动端没有侧边栏齿轮，因此在「我的」页面头像卡片下新增「设置」入口，保证两端都能打开设置面板。

**合并去重**：设置面板「工作区」分组已含"记忆"与"应用与能力"两行，迁移时只补「自选与组合」一行，不复制重复入口。

**修改**

- `apps/mobile/src/workspace.tsx`：`Detail` 联合类型新增 `{ type: "archived" }`，用于在设置面板内打开「已归档对话」。
- `apps/mobile/src/account.tsx`：
  - 删除「个人上下文」「对话管理」两个分组及对应的 `view` 子页状态（memory / archived）。
  - 导出 `ArchivedThreadsScreen` 并新增 `embedded` 属性，嵌入 Sheet 时隐藏页内标题与返回键。
  - 头像卡片下新增移动端「设置」入口（`width < breakpoints.desktop` 时显示），调用 `open({ type: "settings" })`。
  - 清理不再使用的 `navigate`、`useAgentWorkspace`、`richThreads` 及多余图标导入。
- `apps/mobile/src/details.tsx`：
  - `SettingsSheet`「工作区」分组新增「自选与组合」行（`Target` 图标 → `navigate("watchlist")`）。
  - 新增「对话管理」分组（`richThreads` 条件）：已归档对话入口 → `open({ type: "archived" })`。
  - 新增 `ArchivedThreadsDetail`：用 `Sheet` 承载 `ArchivedThreadsScreen`（embedded 模式）。
- I18n 文案复用既有 key，无需新增。
- 已通过 `npx tsc --noEmit` 类型检查。

### 2026-10-31 · 「我的」页面设置分组标题改为"模型"

个人信息页面（`AccountScreen`）中「设置」分组下只有"大模型连接"一行，分组标题改为「模型」更贴合内容。移动端与桌面端共用该页面，一次修改两处同步生效；桌面端「设置」面板（`SettingsSheet`）标题保持不变。

**修改**

- `apps/mobile/src/i18n/locales/zh-Hans/app.ts`：新增 `app.profileModelHeading` = "模型"。
- `apps/mobile/src/i18n/locales/en/app.ts`：新增 `app.profileModelHeading` = "Model"。
- `apps/mobile/src/account.tsx`：个人信息页「设置」分组标题改用 `t("app.profileModelHeading")`，不再复用 `details.settingsTitle`。
- 已通过 `npx tsc --noEmit` 类型检查。

### 2026-10-30 · 移除欢迎界面品牌名旁的斜体小字 lingwu

登录/欢迎界面（`App.tsx`）品牌名「灵悟」旁存在一个 13px 灰色斜体小字 `lingwu` 作为装饰，用户要求删除。

**修改**（`apps/mobile/App.tsx`）

- 删除 `lingwu` 装饰性小字 `<Text>`,保留 `BrandMark` 与品牌名「灵悟」,布局不变。

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

| 日志                                                      | 根因                                                                                                                                                                                                                                           | 处理                                                                                                                                                                                                                    |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2× `In HTML, <button> cannot be a descendant of <button>` | React 19 的嵌套校验扩展到 `role="button"`：ThreadRow 外层整行是按钮，内层「重命名」Pressable 也设了 `accessibilityRole="button"`，Web 端渲染为 `div role="button"` 嵌套，触发告警                                                              | [shell.tsx](../apps/mobile/src/shell.tsx)：去掉内层 Pressable 的 `accessibilityRole`（保留 onPress），渲染为普通 div + onClick，交互不变                                                                                |
| 1× 重复 key `evidence-mail-fieldtrip`                     | 10-19 的去重只做了列表**内部**去重；当本地待建旁聊首次上线服务端列表的短暂窗口，同一 id 会同时出现在 `sideThreads` 与 `pendingThreads`（同一 ScrollView 的兄弟节点），以及 ThreadsSheet 的 `listedThreads` 与 `visitedPending`，跨列表重复 key | [shell.tsx](../apps/mobile/src/shell.tsx)：`pendingThreads` 增加 `seenSideIds.has(item.id)` 排除；[threads.tsx](../apps/mobile/src/threads.tsx)：先算 `listedThreads`，`visitedPending` 再按 `seenThreadIds` 跨列表排除 |
| 2× `net::ERR_ABORTED /api/agent`、`/api/workspace`        | 正常中断：`/api/agent` 每 3 秒轮询被新请求取代或页面切换时，浏览器取消在途请求；已 `catch(() => {})` 静默处理                                                                                                                                  | 无需改动（浏览器正常行为）                                                                                                                                                                                              |

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

| 状态     | 触发时机                | 视觉变化                            | 时长 / 曲线                                   |
| -------- | ----------------------- | ----------------------------------- | --------------------------------------------- |
| 按压     | `onPressIn`             | 缩放到 0.97                         | 90ms，`Easing.out(Easing.cubic)`              |
| 松开     | `onPressOut`            | 弹簧回弹到 1                        | `Animated.spring`（friction 6 / tension 180） |
| 保存中   | `busy` 变 true          | 加载指示器淡入、整体透明度降到 0.75 | 180ms，`Easing.inOut(Easing.cubic)`           |
| 保存完成 | `busy` 由 true 回 false | 一次轻微回弹脉冲（1 → 1.04 → 1）    | 130ms 放大 + spring 回落                      |

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

| 日志                                                                         | 真相                                                                |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `net::ERR_ABORTED /api/workspace`、`/api/agent`                              | 服务端热重载（`tsx watch`）重启时，在途请求被浏览器取消（瞬时）     |
| `REST connect request failed: Failed to fetch`                               | CopilotKit 将底层 `ERR_CONNECTION_REFUSED` 包装为 "Failed to fetch" |
| `agent_connect_failed` / `agent_run_failed_event` / `Agent execution failed` | 连接未建立即触发运行失败事件的连锁反应                              |

根因：修改 `app.ts` 触发 `tsx watch` 热重载，服务端重启的 1~2 秒内连接被拒绝。服务恢复后所有请求均返回 `200`，报错不再复现。

另外，`wss://realtime.intelligence.copilotkit.ai` 的 WebSocket 连接警告为 CopilotKit 云端（Intelligence）实时推送通道的间歇性网络失败，CopilotKit 内置优雅降级（最多重试 5 次后回退到 REST 轮询），不影响线程列表与记忆功能。

### 2026-11-08 · 环境变量文件安全审查与本地部署精简

**背景**

以 `.env.example` 为基准核对本地部署用的 `.env`，发现并处理了两类问题：仓库内残留的密钥文件、以及本地部署（云端 Hindsight 模式）下用不到的配置项。

**处理**

1. **`.env.example` 确认无密钥**：核对 `git show HEAD:.env.example` 与工作区文件，均已是不含真实密钥的占位符模板，无需改动。
2. **移除误暂存的 `.env copy`**：该备份副本曾被 `git add` 暂存（状态 `AD`），工作区文件已缺失。执行 `git reset` + `git rm --cached` 彻底移出索引，`git ls-files` 已不再跟踪。
3. **`.env` 注释掉本地部署不需要的变量**：
   - `HINDSIGHT_LLM_PROVIDER` / `HINDSIGHT_LLM_API_KEY` / `HINDSIGHT_LLM_MODEL` / `HINDSIGHT_LLM_BASE_URL` / `HF_ENDPOINT`：仅供 `infra/hindsight.yaml` 自托管容器读取；云端模式（`HINDSIGHT_BASE_URL=https://api.hindsight.vectorize.io`）下 LingWu API 不读取，见 `apps/server/src/config.ts`。
   - `WORKER_DATA_DIR` / `WORKER_HOST`：本地未启用浏览器 worker（`BROWSER_WORKER_URL` 已注释）。
4. **`.gitignore` 增加防护**：新增 `.env copy` 规则，防止编辑器/系统生成的备份副本再次入库。

**验证**

- `git ls-files` 中环境相关文件仅剩 `.env.example`。
- `git status` 无异常残留；`.env` 保持 gitignore 忽略状态。
- DeepSeek / Supabase / CopilotKit / Hindsight 的真实密钥仅存在于 `.env` 与 Render 控制台。

### 2026-11-08 · 新增本地浏览器 Worker 启动指南文档

**背景**

用户在上一轮确认本地未启用浏览器 worker（`BROWSER_WORKER_URL` 已注释）。为便于日后开启「读网页做研究」场景，补充本地启动说明文档。

**处理**

- 新增 `docs/BROWSER-WORKER-本地启动指南.md`：说明 worker 用途与启用判定（`BROWSER_WORKER_URL` + `WORKER_TOKEN` 同时配置才启用 `browse_web` 工具）、方式 A（`pnpm dev:browser` 本地直接运行）与方式 B（`docker compose -f infra/compose.yaml up --build -d`）的完整步骤、验证方法、停止与恢复、常见问题与安全注意。
- `docs/README.md` 的 Guides 列表增加该指南入口，保留对 `apps/worker/README.md` 的引用（该文件为 API/持久化/网络边界的权威说明）。

**验证**

- 启动命令 `pnpm dev:browser`（即 `node --env-file=.env --import tsx apps/worker/src/index.ts`）与 Docker 配置均取自根目录 `package.json` / `apps/worker/README.md` / `infra/compose.yaml`，与代码一致。

### 2026-11-08 · Render 配置与 .env 同步（移除云端模式下无用的 Hindsight LLM 变量）

**背景**

部署前以最新 `.env` / `.env.example` 为准复核 `render.yaml`：`.env.example` 已把 `HINDSIGHT_LLM_PROVIDER` / `HINDSIGHT_LLM_API_KEY` / `HINDSIGHT_LLM_MODEL` / `HINDSIGHT_LLM_BASE_URL` / `HF_ENDPOINT` 全部注释（仅供自托管容器 `infra/hindsight.yaml` 读取；云端模式下 LingWu API 不读取，见 `apps/server/src/config.ts`）。

**处理**

- 从 `render.yaml` 的 `lingwu-api` 服务中删除上述 5 个变量；`HINDSIGHT_BASE_URL` / `HINDSIGHT_API_KEY` 保持 `sync: false`（云端模式控制台手动填入）。
- 保留 `RATE_LIMIT_MAX_REQUESTS=1200` 等已同步项；`WORKER_DATA_DIR` / `WORKER_HOST` 仅影响本地（`.env` 已注释），`lingwu-browser` 容器的 `WORKER_DATA_DIR=/data`、`WORKER_HOST=0.0.0.0` 不受影响。

**验证**

- `python3 -c "import yaml..."` 解析通过：3 个服务（lingwu-api / lingwu-browser / lingwu-web），lingwu-api 共 40 个环境变量。

### 2026-11-08 · TOKEN_ENCRYPTION_KEY 改为手动固定（防止环境重建导致加密数据失效）

**背景**

Render Blueprint 部署时若 `TOKEN_ENCRYPTION_KEY` 使用 `generateValue: true`，Render 会在环境重建时重新生成随机值，导致此前用旧密钥加密的用户令牌无法解密。需改为手动固定、与本地 `.env` 保持一致的值。

**处理**

- `render.yaml` 的 `lingwu-api` 服务中，`TOKEN_ENCRYPTION_KEY` 由 `generateValue: true` 改为 `sync: false`（不在蓝图中同步值，需在 Render 控制台 Environment 手动填入与本地 `.env` 相同的值）。已补充中文注释说明原因。
- 注意点：`generateValue` 仅支持 `true` 表达「自动生成」，`sync: false` 才是「手动填写」的正确写法。

**验证**

- `python3 -c "import yaml..."` 解析通过，`TOKEN_ENCRYPTION_KEY` 仍在 lingwu-api 服务环境变量列表中。
