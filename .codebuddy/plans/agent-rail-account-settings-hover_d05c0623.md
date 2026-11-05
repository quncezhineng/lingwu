---
name: agent-rail-account-settings-hover
overview: 在真正生效的左侧栏 AgentRail（agent-product.tsx）中删除账户与设置之间的竖线，并为账户行和设置按钮添加鼠标悬停灰底反馈。
todos:
  - id: add-hover-pressable
    content: 在 ui.tsx 新增 HoverPressable，暴露 pressed 与 hovered 的样式状态
    status: completed
  - id: fix-agent-rail-footer
    content: 改造 agent-product.tsx 的 AgentRail 底部：删除竖线，账户块与设置按钮接入 hover 灰底与按下深灰
    status: completed
    dependencies:
      - add-hover-pressable
  - id: verify-agent-rail
    content: 运行 tsc --noEmit 与 biome check，并复核桌面与抽屉两种布局表现
    status: completed
    dependencies:
      - fix-agent-rail-footer
---

## 用户需求
修正左侧栏底部「个人账户（个人用户）」与「设置」两个入口之间的交互与视觉：

1. 删除账户块与设置图标之间的那条竖线分隔符（桌面横排时的 `1px` 竖线、折叠/紧凑时对应的分隔线）。
2. 鼠标悬停在「个人账户 / 个人用户」区块上时，该区块出现灰底（或边框阴影）反馈，明确可点击。
3. 鼠标悬停在「设置」图标上时，同样出现灰底圆角反馈。
4. 按下（点击）时反馈需比悬停更深一档，避免悬停与按下视觉相同。
5. 该入口同时用于桌面三列布局与窄屏抽屉，两处表现保持一致；原生触摸端不产生悬停态属预期行为。

## 关键前提
上一轮改动落在 `apps/mobile/src/shell.tsx` 的旧版 `Rail`，但应用实际渲染的是 `apps/mobile/src/agent-product.tsx` 中的 `AgentRail`，因此用户看不到任何变化。本次必须改在 `AgentRail` 上。


## 技术栈
- Expo（SDK 54）+ React Native 0.81 + react-native-web 0.21 + TypeScript
- 样式：项目自有 token（`theme.ts` 的 `colors` / `radius` / `space`）
- 校验：`npx tsc --noEmit`、`npx biome check`

## 实现方案
### 现状确认
- 真正生效的左侧栏为 `apps/mobile/src/agent-product.tsx` 的 `AgentRail`（第 298 行起），桌面三列在 977-985 行渲染，窄屏抽屉在 1089 行以 `compact` 渲染同一组件。
- 竖线仅剩一处：`agent-product.tsx:457` `<View style={{ width: 1, height: 20, backgroundColor: colors.line }} />`。
- 底部账户块 `Pressable`：427-456 行；设置按钮 `Pressable`：458-475 行；两者都只有 `pressed` 态，无 hover 态。
- RNW 的 `Pressable` 内部已用 `useHover` 并计算 `interactionState = { hovered, focused, pressed }`，但 RN 的 TS 类型 `PressableStateCallbackType` 只声明 `pressed`，直接写 `({ pressed, hovered })` 会类型报错。

### 方案
1. 在共享 UI 模块 `apps/mobile/src/ui.tsx` 新增可复用的 `HoverPressable`：用 `useState` 自行记录 `hovered`（`onHoverIn` / `onHoverOut` 维护，并透传外部同名回调），把 `{ pressed, hovered }` 交给样式函数；样式函数类型单独声明，绕开 RN 类型缺失。沿用第一轮 `shell.tsx` 中已验证的写法，保证全项目 hover 交互写法统一。
2. `agent-product.tsx` 中删除 457 行的竖线 `View`，两个底部入口改用 `HoverPressable`：
   - 账户块：`backgroundColor = pressed ? colors.overlay3 : hovered ? colors.overlay2 : "transparent"`，其余（`flex:1`、`paddingVertical:13`、`borderRadius:13`、`gap:10`）保持不变。
   - 设置按钮：`backgroundColor` 同上，保留 `36x36`、`radius.control`、图标 `colors.muted`；可让图标在悬停时改为 `colors.text` 以增强提示（需把图标放进样式函数可感知的状态外，如仍用条件渲染则通过 `hovered` state 传给子节点，实现时用最简方式即可）。
3. 悬停用 `overlay2`、按下用 `overlay3`，实现“悬停浅灰、按下更深”的层级，符合用户“背景变成灰色”的诉求，不引入阴影令牌，避免与卡片描边风格冲突。
4. `shell.tsx` 中上一轮的 `SidebarButton` hover 改造保留（现已一致，且属 legacy 外壳），不做回退，减少无关变动。

### 性能与可靠性
- 每个可悬停元素仅一次 `useState`，`onHoverIn/Out` 每次进出各触发一次渲染；RNW 的 `useHover` 以 `contain: true` 监听，子节点指针移动不会反复触发，无抖动风险。
- 不改变布局结构（仅移除 1px 分隔节点），父容器 `gap: 4` 不变，避免其它列宽/断点计算受影响。
- 无网络、无数据流改动；`HoverPressable` 为纯展示层组件，向后兼容（原 `Pressable` 属性原样透传）。

## 关键代码结构
```ts
// apps/mobile/src/ui.tsx
export type HoverPressableState = { pressed: boolean; hovered: boolean };

export function HoverPressable(props: Omit<PressableProps, "style"> & {
  style?: StyleProp<ViewStyle> | ((state: HoverPressableState) => StyleProp<ViewStyle>);
}): JSX.Element;
```

## 目录结构
```
apps/mobile/src/
├── ui.tsx              # [MODIFY] 新增 HoverPressable（本地 hovered state + 样式函数类型），需从 react-native 补 type PressableProps 导入；不改变既有导出
├── agent-product.tsx   # [MODIFY] 删除 AgentRail 底部账户与设置之间的竖线 View(457 行)；两个 Pressable 改为 HoverPressable，悬停 colors.overlay2、按下 colors.overlay3；从 ./ui 导入 HoverPressable
└── shell.tsx           # [KEEP] 上一轮 SidebarButton hover 支持与竖线移除保留，无需再改
```

## 验证
- `cd apps/mobile && npx tsc --noEmit`、`npx biome check apps/mobile/src/ui.tsx apps/mobile/src/agent-product.tsx`。
- 浏览器验证：悬停账户块与设置图标出现灰底，移出恢复；点击时更深；竖线消失；折叠/抽屉（compact）布局无空档或错位。
- 若当前预览的是构建产物 `apps/mobile/dist/web`，需重新执行 `pnpm --filter @lingwu/mobile build:web` 或刷新开发服务器页面，否则仍是旧代码。

