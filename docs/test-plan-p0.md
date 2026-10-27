# 测试计划：LingWu 个人投研智能体 P0 功能

> 版本：v1.0 | 日期：2026-10-26 | 作者：测试工程师 | 状态：Draft

---

## 1. 测试范围

### 1.1 In Scope

| 需求 | 功能 | 优先级 |
|------|------|--------|
| R1 | 每日市场简报 | P0 |
| R2 | 观察列表 | P0 |
| R3 | 标的动态推送 | P0 |
| R4 | 深度研究任务 | P0 |

### 1.2 Out of Scope

- R5 持仓导入与管理（P1）
- R6 投资笔记与论点追踪（P1）
- 单元测试（由开发团队负责）
- 性能测试（单独计划）
- 安全测试（单独计划）

### 1.3 测试类型

- **Web E2E 测试**：前端 UI 交互、用户旅程
- **API 测试**：后端接口行为验证
- **集成测试**：耐久任务执行、数据源集成
- **手动测试**：AI 生成内容质量评估

---

## 2. 测试策略

### 2.1 测试优先级

1. **P0 测试**：核心功能 Happy Path，必须全部通过
2. **P1 测试**：Error Path 和降级场景
3. **P2 测试**：Edge Case 和边界条件

### 2.2 测试环境

- **前端**：iOS / Android / Web 三端
- **后端**：开发环境 + 测试环境
- **数据源**：Mock API + 真实 API（Yahoo Finance、Tushare）
- **定时任务**：调整时间配置以触发定时任务

### 2.3 测试数据

- 观察列表：10+ 标的（A 股、港股、美股）
- 市场简报：预生成样本数据
- 深度研究：3-5 个典型标的（AAPL、TSLA、宁德时代、贵州茅台、比亚迪）

---

## 3. 测试用例

### 3.1 R1: 每日市场简报

#### TC-R1-001 简报在用户打开应用前已生成
- **Source**: PRD R1 验收标准
- **Requirement**: 简报在用户首次打开应用时已生成（≤ 用户所在时区 08:00）
- **Priority**: P0
- **Type**: Web E2E + API
- **Preconditions**:
  - 用户已登录
  - 耐久任务已配置为每日 UTC 00:00 触发
  - 用户有至少一个观察列表
- **Test Steps**:
  1. 等待耐久任务在 UTC 00:00 触发
  2. 在用户所在时区 08:00 前打开应用
  3. 查看首页是否展示"今日市场简报"卡片
  4. 调用 `GET /api/market-briefings/today` 验证简报已生成
- **Expected Result**:
  - 首页展示"今日市场简报"卡片
  - API 返回状态 200，简报数据完整
  - 简报 `generated_at` 时间戳在用户时区 08:00 之前
- **Evidence to Capture**:
  - 首页截图
  - API 响应 JSON
  - 耐久任务执行日志
- **Pass/Fail Criteria**:
  - Pass: 简报在用户时区 08:00 前生成且首页可见
  - Fail: 简报未生成或生成时间晚于 08:00
- **Residual Risk / Notes**:
  - 依赖耐久任务引擎正常运行
  - 需要 Mock 时间或使用测试环境调整系统时间

#### TC-R1-002 简报要点数量 3-5 条
- **Source**: PRD R1 验收标准
- **Requirement**: 要点数量 3-5 条，每条 ≤ 50 字
- **Priority**: P0
- **Type**: API + Web E2E
- **Preconditions**:
  - 简报已生成
- **Test Steps**:
  1. 调用 `GET /api/market-briefings/today`
  2. 检查 `summary` 数组长度
  3. 检查每条要点的字符数
  4. 在首页展开简报卡片，查看要点展示
- **Expected Result**:
  - `summary` 数组长度在 3-5 之间
  - 每条要点字符数 ≤ 50
  - 首页卡片展示 3-5 条要点预览
- **Evidence to Capture**:
  - API 响应 JSON
  - 首页卡片截图
- **Pass/Fail Criteria**:
  - Pass: 要点数量 3-5 条且每条 ≤ 50 字
  - Fail: 要点数量不在范围内或单条超长
- **Residual Risk / Notes**:
  - 需要验证 AI 生成的内容是否符合字数限制

#### TC-R1-003 追问后 Agent 能基于简报内容继续展开分析
- **Source**: PRD R1 验收标准
- **Requirement**: 追问后 Agent 能基于简报内容继续展开分析
- **Priority**: P0
- **Type**: Web E2E
- **Preconditions**:
  - 简报已生成并展示在首页
- **Test Steps**:
  1. 在首页点击"今日市场简报"卡片展开
  2. 点击"追问详情"按钮
  3. 在对话中输入"详细说说 [某条要点中的标的]"
  4. 观察 Agent 回复内容
- **Expected Result**:
  - 进入对话界面
  - Agent 回复包含该标的的详细分析
  - 回复内容与简报中的要点相关联
- **Evidence to Capture**:
  - 对话截图
  - Agent 回复内容
- **Pass/Fail Criteria**:
  - Pass: Agent 能基于简报内容展开分析
  - Fail: Agent 回复与简报无关或无法理解追问
- **Residual Risk / Notes**:
  - 依赖 LLM 理解能力
  - 需要验证上下文传递是否正确

#### TC-R1-004 生成失败时有降级提示
- **Source**: PRD R1 验收标准
- **Requirement**: 生成失败时有降级提示（如"今日简报生成失败，请手动刷新"）
- **Priority**: P1
- **Type**: Web E2E + API
- **Preconditions**:
  - Mock 数据源不可用或耐久任务执行失败
- **Test Steps**:
  1. 配置 Mock 使数据源 API 返回错误
  2. 触发耐久任务执行市场简报生成
  3. 打开应用首页
  4. 查看简报卡片状态
- **Expected Result**:
  - 首页展示降级提示："今日简报生成失败，请手动刷新"
  - 提供"手动刷新"按钮
  - 点击刷新按钮后重新尝试生成
- **Evidence to Capture**:
  - 首页截图（降级状态）
  - 耐久任务错误日志
- **Pass/Fail Criteria**:
  - Pass: 展示降级提示且可手动刷新
  - Fail: 无提示或刷新功能不可用
- **Residual Risk / Notes**:
  - 需要 Mock 数据源故障场景

#### TC-R1-005 生成失败时保留上次简报
- **Source**: PRD 场景推导
- **Requirement**: 当今日简报生成失败时，应保留并展示上次成功生成的简报
- **Priority**: P1
- **Type**: API + Web E2E
- **Preconditions**:
  - 昨日简报已成功生成
  - Mock 今日简报生成失败
- **Test Steps**:
  1. 确认昨日简报已存在
  2. Mock 今日简报生成失败
  3. 打开应用首页
  4. 查看展示的简报日期
- **Expected Result**:
  - 首页展示昨日简报（带"昨日简报"标记）
  - API 返回最近一次成功的简报
- **Evidence to Capture**:
  - 首页截图
  - API 响应 JSON（包含简报日期）
- **Pass/Fail Criteria**:
  - Pass: 展示上次成功的简报
  - Fail: 无简报展示或展示错误数据
- **Residual Risk / Notes**:
  - 需要验证简报缓存策略

#### TC-R1-006 用户无观察列表时的简报内容
- **Source**: PRD 场景推导
- **Requirement**: 当用户没有观察列表时，简报应包含通用市场信息
- **Priority**: P2
- **Type**: API + Web E2E
- **Preconditions**:
  - 用户已登录
  - 用户没有创建任何观察列表
- **Test Steps**:
  1. 确保用户观察列表为空
  2. 触发市场简报生成任务
  3. 查看生成的简报内容
- **Expected Result**:
  - 简报包含通用市场信息（主要指数、重要新闻）
  - 不包含"观察列表动态"部分
  - 简报正常生成，无错误
- **Evidence to Capture**:
  - API 响应 JSON
  - 简报内容截图
- **Pass/Fail Criteria**:
  - Pass: 简报正常生成且包含通用市场信息
  - Fail: 生成失败或内容为空
- **Residual Risk / Notes**:
  - 需要验证简报生成逻辑对不同用户状态的适配

#### TC-R1-007 多时区用户的简报生成
- **Source**: PRD 场景推导
- **Requirement**: 不同用户时区的简报应在各自时区 08:00 前生成
- **Priority**: P2
- **Type**: API
- **Preconditions**:
  - 用户 A 时区：UTC+8（北京）
  - 用户 B 时区：UTC-5（纽约）
- **Test Steps**:
  1. 配置用户 A 时区为 UTC+8
  2. 配置用户 B 时区为 UTC-5
  3. 在 UTC 00:00 触发简报生成任务
  4. 分别在两个用户时区的 08:00 检查简报是否已生成
- **Expected Result**:
  - 两个用户的简报都在各自时区 08:00 前生成
  - 简报内容根据用户时区调整（如"隔夜市场"的定义不同）
- **Evidence to Capture**:
  - API 响应中的 `generated_at` 时间戳
  - 简报内容（验证时区适配）
- **Pass/Fail Criteria**:
  - Pass: 两个时区的简报都在规定时间内生成
  - Fail: 某个时区的简报生成时间不符合要求
- **Residual Risk / Notes**:
  - 需要验证时区转换逻辑
  - 可能需要调整耐久任务的调度策略

---

### 3.2 R2: 观察列表

#### TC-R2-001 创建观察列表
- **Source**: PRD R2 验收标准
- **Requirement**: 列表创建操作即时生效
- **Priority**: P0
- **Type**: Web E2E + API
- **Preconditions**:
  - 用户已登录
- **Test Steps**:
  1. 进入"观察列表"页面
  2. 点击"创建列表"按钮
  3. 输入列表名称"新能源"
  4. 点击确认
  5. 验证列表是否出现在左侧导航
  6. 调用 `GET /api/watchlists` 验证 API 响应
- **Expected Result**:
  - 列表立即出现在左侧导航
  - API 返回状态 201，列表数据正确
  - 列表 ID、名称、创建时间正确
- **Evidence to Capture**:
  - 观察列表页面截图
  - API 响应 JSON
- **Pass/Fail Criteria**:
  - Pass: 列表创建成功且即时可见
  - Fail: 列表未出现或创建失败
- **Residual Risk / Notes**:
  - 无

#### TC-R2-002 删除观察列表
- **Source**: PRD R2 验收标准
- **Requirement**: 列表删除操作即时生效
- **Priority**: P0
- **Type**: Web E2E + API
- **Preconditions**:
  - 用户已创建至少一个观察列表
- **Test Steps**:
  1. 进入"观察列表"页面
  2. 选择要删除的列表
  3. 点击"删除"按钮
  4. 确认删除操作
  5. 验证列表是否从导航中消失
  6. 调用 `GET /api/watchlists` 验证 API 响应
- **Expected Result**:
  - 列表立即从导航中消失
  - API 返回状态 200，列表不再包含在响应中
  - 列表中的标的关联关系被清除
- **Evidence to Capture**:
  - 观察列表页面截图
  - API 响应 JSON
- **Pass/Fail Criteria**:
  - Pass: 列表删除成功且即时生效
  - Fail: 列表仍存在或删除失败
- **Residual Risk / Notes**:
  - 需要验证级联删除逻辑

#### TC-R2-003 添加标的到观察列表
- **Source**: PRD R2 验收标准
- **Requirement**: 标的添加后 ≤ 1 分钟展示最新行情
- **Priority**: P0
- **Type**: Web E2E + API
- **Preconditions**:
  - 用户已创建一个观察列表
- **Test Steps**:
  1. 进入观察列表详情页
  2. 点击"添加标的"按钮
  3. 在搜索框输入"AAPL"
  4. 从下拉列表中选择"Apple Inc."
  5. 点击确认添加
  6. 等待 ≤ 1 分钟
  7. 验证标的卡片是否展示最新行情（价格、涨跌幅）
- **Expected Result**:
  - 标的在 1 分钟内出现在列表中
  - 标的卡片展示最新价、日涨跌幅、周涨跌幅
  - API `GET /api/watchlists/:id` 返回标的信息
- **Evidence to Capture**:
  - 观察列表页面截图（添加前后）
  - API 响应 JSON
  - 行情数据时间戳
- **Pass/Fail Criteria**:
  - Pass: 标的在 1 分钟内展示最新行情
  - Fail: 标的未出现或行情数据延迟超过 1 分钟
- **Residual Risk / Notes**:
  - 依赖行情数据源响应速度
  - 需要验证行情刷新机制（≤ 1 分钟）

#### TC-R2-004 移除标的从观察列表
- **Source**: PRD 场景推导
- **Requirement**: 用户可以从观察列表中移除标的
- **Priority**: P0
- **Type**: Web E2E + API
- **Preconditions**:
  - 观察列表中已有至少一个标的
- **Test Steps**:
  1. 进入观察列表详情页
  2. 找到要移除的标的卡片
  3. 点击"移除"按钮（或滑动删除）
  4. 确认移除操作
  5. 验证标的是否从列表中消失
  6. 调用 `GET /api/watchlists/:id` 验证 API 响应
- **Expected Result**:
  - 标的立即从列表中消失
  - API 响应中不再包含该标的
  - 标的元数据不被删除（仅解除关联）
- **Evidence to Capture**:
  - 观察列表页面截图
  - API 响应 JSON
- **Pass/Fail Criteria**:
  - Pass: 标的移除成功且即时生效
  - Fail: 标的仍存在或移除失败
- **Residual Risk / Notes**:
  - 无

#### TC-R2-005 行情数据 ≤ 1 分钟刷新
- **Source**: PRD R2 验收标准
- **Requirement**: 行情数据刷新间隔 ≤ 1 分钟
- **Priority**: P0
- **Type**: Web E2E + API
- **Preconditions**:
  - 观察列表中已有标的
- **Test Steps**:
  1. 进入观察列表页面
  2. 记录当前行情数据（价格、时间戳）
  3. 等待 1 分钟
  4. 验证行情数据是否自动刷新
  5. 检查 API 调用频率（通过浏览器开发者工具）
- **Expected Result**:
  - 行情数据在 1 分钟内自动刷新
  - 价格数据更新（如有变化）
  - 时间戳更新
  - API 调用间隔 ≤ 60 秒
- **Evidence to Capture**:
  - 行情数据截图（刷新前后）
  - 网络请求日志（API 调用时间）
- **Pass/Fail Criteria**:
  - Pass: 行情数据在 1 分钟内刷新
  - Fail: 刷新间隔超过 1 分钟
- **Residual Risk / Notes**:
  - 需要验证前端定时刷新机制
  - 需要考虑网络延迟和 API 响应时间

#### TC-R2-006 标的代码不存在时的提示
- **Source**: PRD 场景推导
- **Requirement**: 当用户输入的标的代码不存在时，应给出明确提示
- **Priority**: P1
- **Type**: Web E2E
- **Preconditions**:
  - 用户正在添加标的
- **Test Steps**:
  1. 进入观察列表详情页
  2. 点击"添加标的"
  3. 输入不存在的代码"INVALID123"
  4. 等待搜索结果
- **Expected Result**:
  - 显示"未找到匹配的标的"提示
  - 提供"手动输入"或"重新搜索"选项
  - 不添加任何标的到列表
- **Evidence to Capture**:
  - 搜索结果页面截图
- **Pass/Fail Criteria**:
  - Pass: 显示明确提示且不添加标的
  - Fail: 无提示或错误添加了标的
- **Residual Risk / Notes**:
  - 需要验证标的搜索和匹配逻辑

#### TC-R2-007 网络断开时的缓存展示
- **Source**: PRD 场景推导
- **Requirement**: 网络断开时应展示缓存的行情数据
- **Priority**: P1
- **Type**: Web E2E
- **Preconditions**:
  - 观察列表中已有标的
  - 行情数据已缓存
- **Test Steps**:
  1. 进入观察列表页面
  2. 断开网络连接（通过浏览器开发者工具）
  3. 刷新页面
  4. 查看行情数据展示
- **Expected Result**:
  - 展示缓存的行情数据（带"数据延迟"标记）
  - 不显示错误页面
  - 恢复网络后自动刷新数据
- **Evidence to Capture**:
  - 离线状态页面截图
  - 缓存数据时间戳
- **Pass/Fail Criteria**:
  - Pass: 展示缓存数据且标记延迟
  - Fail: 显示错误页面或无数据
- **Residual Risk / Notes**:
  - 需要验证前端缓存策略

#### TC-R2-008 100+ 标的分页加载
- **Source**: PRD R2 验收标准 + 验收标准 10.3
- **Requirement**: 支持至少 100 个标的/列表，分页加载不影响性能
- **Priority**: P2
- **Type**: Web E2E + API
- **Preconditions**:
  - 观察列表中有 100+ 个标的
- **Test Steps**:
  1. 创建观察列表并添加 100+ 个标的
  2. 进入列表详情页
  3. 滚动页面查看标的加载
  4. 测量页面加载时间和滚动流畅度
  5. 检查 API 分页参数
- **Expected Result**:
  - 标的分页加载（每页 20-50 个）
  - 页面加载时间 < 2 秒
  - 滚动流畅，无明显卡顿
  - API 支持分页参数（page, pageSize）
- **Evidence to Capture**:
  - 页面加载时间日志
  - 滚动性能截图
  - API 请求日志（分页参数）
- **Pass/Fail Criteria**:
  - Pass: 100+ 标的支持分页且性能良好
  - Fail: 加载缓慢或无法支持 100+ 标的
- **Residual Risk / Notes**:
  - 需要性能测试验证

#### TC-R2-009 多市场标的支持（A 股/港股/美股）
- **Source**: PRD R2 功能行为
- **Requirement**: 支持 A 股、港股、美股、ETF、基金等多市场标的
- **Priority**: P1
- **Type**: API + Web E2E
- **Preconditions**:
  - 用户已创建观察列表
- **Test Steps**:
  1. 添加 A 股标的"600519.SH"（贵州茅台）
  2. 添加港股标的"00700.HK"（腾讯控股）
  3. 添加美股标的"AAPL"（苹果）
  4. 验证各标的行情数据展示
  5. 检查 API 返回的市场标识
- **Expected Result**:
  - 三个市场的标的都能成功添加
  - 各标的展示正确的行情数据（货币单位、交易时间）
  - API 返回正确的 `market` 字段（CN/HK/US）
- **Evidence to Capture**:
  - 观察列表页面截图（多市场标的）
  - API 响应 JSON
- **Pass/Fail Criteria**:
  - Pass: 多市场标的都能正常添加和展示
  - Fail: 某个市场的标的不支持或数据错误
- **Residual Risk / Notes**:
  - 依赖各市场数据源 API
  - 需要验证不同市场的交易时间处理

---

### 3.3 R3: 标的动态推送

#### TC-R3-001 价格异动推送延迟 ≤ 15 分钟
- **Source**: PRD R3 验收标准
- **Requirement**: 价格异动推送延迟 ≤ 15 分钟
- **Priority**: P0
- **Type**: Web E2E + API
- **Preconditions**:
  - 用户已配置标的推送阈值（如涨跌幅 > 5%）
  - 标的在观察列表中
- **Test Steps**:
  1. 配置标的"AAPL"的推送阈值：涨跌幅 > 5%
  2. 记录当前时间 T1
  3. 模拟 AAPL 价格异动（涨跌幅 > 5%）
  4. 等待推送通知
  5. 记录收到推送的时间 T2
  6. 计算延迟 T2 - T1
- **Expected Result**:
  - 收到推送通知
  - 推送延迟 ≤ 15 分钟
  - 推送内容包含：标的名称、异动类型、涨跌幅、查看详情链接
- **Evidence to Capture**:
  - 推送通知截图
  - 时间日志（T1, T2, 延迟）
  - 推送内容详情
- **Pass/Fail Criteria**:
  - Pass: 推送延迟 ≤ 15 分钟且内容完整
  - Fail: 推送延迟超过 15 分钟或未收到推送
- **Residual Risk / Notes**:
  - 依赖行情数据源更新频率（可能延迟 15 分钟）
  - 需要验证推送服务性能

#### TC-R3-002 推送内容完整
- **Source**: PRD R3 验收标准
- **Requirement**: 推送内容包含标的名称、异动类型、简要描述、一键查看详情
- **Priority**: P0
- **Type**: Web E2E
- **Preconditions**:
  - 已触发价格异动
- **Test Steps**:
  1. 触发价格异动（涨跌幅 > 阈值）
  2. 收到推送通知
  3. 查看推送内容
  4. 点击"查看详情"链接
- **Expected Result**:
  - 推送内容包含：
    - 标的名称（如"Apple Inc."）
    - 异动类型（如"价格异动"）
    - 简要描述（如"涨跌幅 +6.5%，突破关键位"）
    - "查看详情"按钮
  - 点击后跳转到标的详情页
- **Evidence to Capture**:
  - 推送通知截图
  - 详情页截图
- **Pass/Fail Criteria**:
  - Pass: 推送内容完整且可跳转详情
  - Fail: 内容缺失或链接无效
- **Residual Risk / Notes**:
  - 无

#### TC-R3-003 推送服务故障时数据不丢失
- **Source**: PRD 验收标准 10.2
- **Requirement**: 推送服务故障时，异动数据保留在观察列表中，不丢失
- **Priority**: P1
- **Type**: API + Web E2E
- **Preconditions**:
  - Mock 推送服务不可用
- **Test Steps**:
  1. Mock 推送服务返回错误
  2. 触发价格异动
  3. 检查推送是否失败
  4. 进入观察列表页面
  5. 查看标的是否有异动标记
- **Expected Result**:
  - 推送失败，记录错误日志
  - 异动数据保存在数据库中
  - 观察列表中标的显示异动标记
  - 用户可手动查看异动详情
- **Evidence to Capture**:
  - 推送服务错误日志
  - 观察列表页面截图（异动标记）
  - 数据库记录
- **Pass/Fail Criteria**:
  - Pass: 异动数据不丢失且在观察列表中可见
  - Fail: 异动数据丢失
- **Residual Risk / Notes**:
  - 需要验证数据持久化逻辑

#### TC-R3-004 24h 去重：同一异动不重复推送
- **Source**: PRD R3 验收标准
- **Requirement**: 推送去重：同一异动 24 小时内不重复推送
- **Priority**: P1
- **Type**: API + Web E2E
- **Preconditions**:
  - 用户已配置推送阈值
- **Test Steps**:
  1. 触发价格异动（如 AAPL 涨跌幅 > 5%）
  2. 收到第一次推送
  3. 在 24 小时内再次触发相同异动
  4. 验证是否收到第二次推送
  5. 等待 24 小时后再次触发相同异动
  6. 验证是否收到推送
- **Expected Result**:
  - 第一次推送成功
  - 24 小时内不重复推送
  - 24 小时后可以再次推送
- **Evidence to Capture**:
  - 推送记录日志（时间戳）
  - 去重逻辑验证
- **Pass/Fail Criteria**:
  - Pass: 24h 内去重且 24h 后可再次推送
  - Fail: 重复推送或 24h 后仍不推送
- **Residual Risk / Notes**:
  - 需要验证去重逻辑的时间窗口计算

#### TC-R3-005 用户关闭推送后不再推送
- **Source**: PRD R3 验收标准
- **Requirement**: 用户可一键关闭某标的的推送
- **Priority**: P1
- **Type**: Web E2E + API
- **Preconditions**:
  - 用户已配置某标的的推送
- **Test Steps**:
  1. 进入标的详情页
  2. 点击"关闭推送"按钮
  3. 确认关闭操作
  4. 触发该标的的价格异动
  5. 验证是否收到推送
- **Expected Result**:
  - 推送已关闭
  - 触发异动后不收到推送
  - API `GET /api/price-alerts/:id` 返回 `enabled: false`
- **Evidence to Capture**:
  - 标的详情页截图
  - API 响应 JSON
  - 推送记录日志
- **Pass/Fail Criteria**:
  - Pass: 关闭推送后不再收到推送
  - Fail: 关闭后仍收到推送
- **Residual Risk / Notes**:
  - 无

#### TC-R3-006 推送准确率 ≥ 95%
- **Source**: PRD R3 验收标准
- **Requirement**: 推送准确率 ≥ 95%（误报率 ≤ 5%）
- **Priority**: P1
- **Type**: API
- **Preconditions**:
  - 已配置多个标的的推送阈值
- **Test Steps**:
  1. 准备 100 个测试场景（包含真实异动和非异动）
  2. 执行异动检测逻辑
  3. 统计推送结果：
    - 真实异动且推送：TP
    - 真实异动但未推送：FN
    - 非异动但推送：FP
    - 非异动且未推送：TN
  4. 计算准确率 = (TP + TN) / (TP + TN + FP + FN)
- **Expected Result**:
  - 准确率 ≥ 95%
  - 误报率（FP / (FP + TN)）≤ 5%
- **Evidence to Capture**:
  - 测试场景列表
  - 推送结果统计
  - 准确率计算
- **Pass/Fail Criteria**:
  - Pass: 准确率 ≥ 95%
  - Fail: 准确率 < 95%
- **Residual Risk / Notes**:
  - 需要大量测试数据
  - 需要定义"真实异动"的标准

---

### 3.4 R4: 深度研究任务

#### TC-R4-001 研究任务完成时间 ≤ 5 分钟
- **Source**: PRD R4 验收标准
- **Requirement**: 研究任务完成时间 ≤ 5 分钟
- **Priority**: P0
- **Type**: Web E2E + API
- **Preconditions**:
  - 用户已登录
- **Test Steps**:
  1. 在对话中输入"研究一下比亚迪"
  2. 记录开始时间 T1
  3. 观察研究进度展示
  4. 等待研报生成完成
  5. 记录完成时间 T2
  6. 计算耗时 T2 - T1
- **Expected Result**:
  - 研究任务在 5 分钟内完成
  - 研报包含 6 个模块
  - 研究过程实时展示进度
- **Evidence to Capture**:
  - 研究进度截图
  - 时间日志（T1, T2, 耗时）
  - 研报内容
- **Pass/Fail Criteria**:
  - Pass: 完成时间 ≤ 5 分钟
  - Fail: 完成时间 > 5 分钟
- **Residual Risk / Notes**:
  - 依赖数据源响应速度
  - 需要考虑 LLM 推理时间

#### TC-R4-002 研报包含 6 个模块
- **Source**: PRD R4 验收标准
- **Requirement**: 研报包含公司概况、财务分析、近期新闻、同业对比、估值分析、风险提示 6 个模块
- **Priority**: P0
- **Type**: Web E2E + API
- **Preconditions**:
  - 研究任务已完成
- **Test Steps**:
  1. 查看生成的研报
  2. 检查是否包含以下模块：
    - 公司概况（主营业务、行业地位、竞争优势）
    - 财务分析（近 3 年营收/利润/现金流、关键比率）
    - 近期新闻和公告汇总
    - 同业对比（3-5 家可比公司）
    - 估值分析（PE/PB/DCF，合理估值区间）
    - 风险提示
  3. 调用 `GET /api/research-reports/:id` 验证 API 响应
- **Expected Result**:
  - 研报包含全部 6 个模块
  - 每个模块内容完整
  - API 返回的 `sections` 字段包含 6 个键
- **Evidence to Capture**:
  - 研报页面截图（各模块）
  - API 响应 JSON
- **Pass/Fail Criteria**:
  - Pass: 6 个模块完整且内容正确
  - Fail: 缺少模块或内容为空
- **Residual Risk / Notes**:
  - 需要验证 AI 生成内容的质量

#### TC-R4-003 研报可导出为 PDF
- **Source**: PRD R4 验收标准
- **Requirement**: 研报可导出为 PDF
- **Priority**: P0
- **Type**: Web E2E
- **Preconditions**:
  - 研报已生成
- **Test Steps**:
  1. 查看研报页面
  2. 点击"导出 PDF"按钮
  3. 等待 PDF 生成
  4. 下载并打开 PDF 文件
  5. 验证 PDF 内容完整性
- **Expected Result**:
  - PDF 文件成功生成并下载
  - PDF 包含研报全部内容（6 个模块）
  - PDF 格式正确，可读性强
  - PDF 包含免责声明
- **Evidence to Capture**:
  - PDF 文件
  - 导出过程截图
- **Pass/Fail Criteria**:
  - Pass: PDF 导出成功且内容完整
  - Fail: 导出失败或内容缺失
- **Residual Risk / Notes**:
  - 需要验证 PDF 生成库

#### TC-R4-004 用户可追问研报中的任何部分
- **Source**: PRD R4 验收标准
- **Requirement**: 用户可追问研报中的任何部分
- **Priority**: P0
- **Type**: Web E2E
- **Preconditions**:
  - 研报已生成并展示
- **Test Steps**:
  1. 查看研报页面
  2. 点击"追问详情"按钮
  3. 在对话中输入"详细说说财务分析部分"
  4. 观察 Agent 回复
  5. 继续追问"DCF 模型的假设是什么"
- **Expected Result**:
  - 进入对话界面
  - Agent 能理解追问上下文
  - Agent 回复与研报内容相关
  - 支持多轮追问
- **Evidence to Capture**:
  - 对话截图
  - Agent 回复内容
- **Pass/Fail Criteria**:
  - Pass: Agent 能基于研报内容回答追问
  - Fail: Agent 无法理解追问或回复无关
- **Residual Risk / Notes**:
  - 依赖 LLM 上下文理解能力

#### TC-R4-005 研究过程实时展示进度
- **Source**: PRD R4 功能行为
- **Requirement**: 研究过程实时展示进度（AG-UI 流式）
- **Priority**: P0
- **Type**: Web E2E
- **Preconditions**:
  - 用户已触发研究任务
- **Test Steps**:
  1. 在对话中输入"研究一下宁德时代"
  2. 观察研究进度展示
  3. 验证是否展示以下步骤：
    - 拉取最新行情数据
    - 搜索近期新闻和公告
    - 解析最近财报
    - 对比同业公司
    - 生成估值分析
    - 汇总为结构化研报
  4. 验证每个步骤的状态（pending/running/succeeded）
- **Expected Result**:
  - 实时展示研究步骤列表
  - 每个步骤状态实时更新
  - 步骤完成后展示关键结果（如行情卡片、新闻列表）
- **Evidence to Capture**:
  - 研究进度截图（各步骤状态）
  - AG-UI 流式数据日志
- **Pass/Fail Criteria**:
  - Pass: 进度实时展示且状态正确
  - Fail: 进度不更新或状态错误
- **Residual Risk / Notes**:
  - 依赖 AG-UI 流式通信

#### TC-R4-006 任务失败保留中间步骤
- **Source**: PRD 验收标准 10.2
- **Requirement**: 深度研究任务失败时，保留已完成的中间步骤，允许重试
- **Priority**: P1
- **Type**: Web E2E + API
- **Preconditions**:
  - Mock 某个步骤失败（如财务数据获取失败）
- **Test Steps**:
  1. 触发研究任务
  2. Mock 某个步骤失败
  3. 观察任务状态
  4. 查看已完成的步骤
  5. 点击"重试"按钮
- **Expected Result**:
  - 任务状态标记为失败
  - 已完成的步骤数据保留
  - 可以从未失败的步骤重试
  - 不需要重新执行所有步骤
- **Evidence to Capture**:
  - 任务状态截图
  - 已完成步骤数据
  - 重试日志
- **Pass/Fail Criteria**:
  - Pass: 中间步骤保留且可重试
  - Fail: 中间步骤丢失或无法重试
- **Residual Risk / Notes**:
  - 需要验证任务状态管理逻辑

#### TC-R4-007 部分数据源不可用时降级
- **Source**: PRD 场景推导
- **Requirement**: 当部分数据源不可用时，研报应降级生成（标注缺失数据）
- **Priority**: P1
- **Type**: Web E2E + API
- **Preconditions**:
  - Mock 某个数据源不可用（如财报数据）
- **Test Steps**:
  1. Mock 财报数据 API 返回错误
  2. 触发研究任务
  3. 观察研报生成过程
  4. 查看最终研报内容
- **Expected Result**:
  - 研报正常生成
  - 财务分析模块标注"数据暂不可用"
  - 其他模块正常展示
  - 研报包含免责声明
- **Evidence to Capture**:
  - 研报截图（降级模块）
  - 数据源错误日志
- **Pass/Fail Criteria**:
  - Pass: 研报降级生成且标注缺失
  - Fail: 研报生成失败或未标注缺失
- **Residual Risk / Notes**:
  - 需要验证降级策略

#### TC-R4-008 标的代码歧义时确认交互
- **Source**: PRD 验收标准 10.3
- **Requirement**: 标的代码在多个市场存在时，Agent 询问用户确认
- **Priority**: P1
- **Type**: Web E2E
- **Preconditions**:
  - 用户输入的标的在多个市场存在（如"AAPL"在 US 和 HK 都有）
- **Test Steps**:
  1. 在对话中输入"研究一下 AAPL"
  2. 观察 Agent 回复
  3. 如果 Agent 列出候选标的，选择一个
  4. 验证研究是否继续
- **Expected Result**:
  - Agent 识别到歧义
  - 列出候选标的（如"AAPL (US)"、"AAPL (HK)"）
  - 用户选择后继续研究
- **Evidence to Capture**:
  - 对话截图（Agent 询问）
  - 用户选择后的研究进度
- **Pass/Fail Criteria**:
  - Pass: Agent 识别歧义并询问确认
  - Fail: Agent 直接选择或无法处理歧义
- **Residual Risk / Notes**:
  - 需要验证标的匹配逻辑

#### TC-R4-009 数据来源在研报中明确标注
- **Source**: PRD R4 验收标准
- **Requirement**: 数据来源在研报中明确标注
- **Priority**: P1
- **Type**: Web E2E
- **Preconditions**:
  - 研报已生成
- **Test Steps**:
  1. 查看研报内容
  2. 检查每个模块是否标注数据来源
  3. 验证数据来源链接是否有效
- **Expected Result**:
  - 每个模块标注数据来源（如"数据来源：Yahoo Finance"）
  - 数据来源链接可访问
  - 财报数据标注报告期
- **Evidence to Capture**:
  - 研报截图（数据来源标注）
- **Pass/Fail Criteria**:
  - Pass: 数据来源明确标注
  - Fail: 未标注数据来源
- **Residual Risk / Notes**:
  - 需要验证数据来源追踪逻辑

---

## 4. 可追溯性矩阵

| TC-ID | Source | Requirement | Scenario | Priority | Evidence Type |
|-------|--------|-------------|----------|----------|---------------|
| TC-R1-001 | PRD R1 验收标准 | 简报在用户首次打开应用时已生成 | Happy Path | P0 | screenshot + API response + logs |
| TC-R1-002 | PRD R1 验收标准 | 要点数量 3-5 条，每条 ≤ 50 字 | Happy Path | P0 | API response + screenshot |
| TC-R1-003 | PRD R1 验收标准 | 追问后 Agent 能基于简报内容继续展开分析 | Happy Path | P0 | screenshot + conversation log |
| TC-R1-004 | PRD R1 验收标准 | 生成失败时有降级提示 | Error Path | P1 | screenshot + logs |
| TC-R1-005 | PRD 场景推导 | 生成失败时保留上次简报 | Error Path | P1 | screenshot + API response |
| TC-R1-006 | PRD 场景推导 | 用户无观察列表时的简报内容 | Edge Case | P2 | API response + screenshot |
| TC-R1-007 | PRD 场景推导 | 多时区用户的简报生成 | Edge Case | P2 | API response + timestamps |
| TC-R2-001 | PRD R2 验收标准 | 列表创建操作即时生效 | Happy Path | P0 | screenshot + API response |
| TC-R2-002 | PRD R2 验收标准 | 列表删除操作即时生效 | Happy Path | P0 | screenshot + API response |
| TC-R2-003 | PRD R2 验收标准 | 标的添加后 ≤ 1 分钟展示最新行情 | Happy Path | P0 | screenshot + API response + timestamps |
| TC-R2-004 | PRD 场景推导 | 移除标的从观察列表 | Happy Path | P0 | screenshot + API response |
| TC-R2-005 | PRD R2 验收标准 | 行情数据 ≤ 1 分钟刷新 | Happy Path | P0 | screenshot + network logs |
| TC-R2-006 | PRD 场景推导 | 标的代码不存在时的提示 | Error Path | P1 | screenshot |
| TC-R2-007 | PRD 场景推导 | 网络断开时的缓存展示 | Error Path | P1 | screenshot + cache logs |
| TC-R2-008 | PRD R2 验收标准 + 10.3 | 100+ 标的分页加载 | Edge Case | P2 | screenshot + performance logs |
| TC-R2-009 | PRD R2 功能行为 | 多市场标的支持 | Happy Path | P1 | screenshot + API response |
| TC-R3-001 | PRD R3 验收标准 | 价格异动推送延迟 ≤ 15 分钟 | Happy Path | P0 | screenshot + timestamps + logs |
| TC-R3-002 | PRD R3 验收标准 | 推送内容完整 | Happy Path | P0 | screenshot |
| TC-R3-003 | PRD 验收标准 10.2 | 推送服务故障时数据不丢失 | Error Path | P1 | screenshot + logs + DB records |
| TC-R3-004 | PRD R3 验收标准 | 24h 去重 | Happy Path | P1 | logs + dedup verification |
| TC-R3-005 | PRD R3 验收标准 | 用户关闭推送后不再推送 | Happy Path | P1 | screenshot + API response + logs |
| TC-R3-006 | PRD R3 验收标准 | 推送准确率 ≥ 95% | Happy Path | P1 | test scenarios + statistics |
| TC-R4-001 | PRD R4 验收标准 | 研究任务完成时间 ≤ 5 分钟 | Happy Path | P0 | screenshot + timestamps |
| TC-R4-002 | PRD R4 验收标准 | 研报包含 6 个模块 | Happy Path | P0 | screenshot + API response |
| TC-R4-003 | PRD R4 验收标准 | 研报可导出为 PDF | Happy Path | P0 | PDF file + screenshot |
| TC-R4-004 | PRD R4 验收标准 | 用户可追问研报中的任何部分 | Happy Path | P0 | screenshot + conversation log |
| TC-R4-005 | PRD R4 功能行为 | 研究过程实时展示进度 | Happy Path | P0 | screenshot + AG-UI logs |
| TC-R4-006 | PRD 验收标准 10.2 | 任务失败保留中间步骤 | Error Path | P1 | screenshot + logs |
| TC-R4-007 | PRD 场景推导 | 部分数据源不可用时降级 | Error Path | P1 | screenshot + logs |
| TC-R4-008 | PRD 验收标准 10.3 | 标的代码歧义时确认交互 | Edge Case | P1 | screenshot |
| TC-R4-009 | PRD R4 验收标准 | 数据来源在研报中明确标注 | Happy Path | P1 | screenshot |

---

## 5. 自动化可行性评估

### 5.1 可自动化测试（约 60%）

| TC-ID | 自动化类型 | 工具 | 说明 |
|-------|-----------|------|------|
| TC-R1-001 | API 测试 | Playwright / Cypress | 定时任务触发 + API 验证 |
| TC-R1-002 | API 测试 | Jest / Vitest | 数据结构验证 |
| TC-R2-001 | API 测试 | Playwright / Cypress | CRUD 操作 |
| TC-R2-002 | API 测试 | Playwright / Cypress | CRUD 操作 |
| TC-R2-003 | API 测试 | Playwright / Cypress | 添加标的 + 行情验证 |
| TC-R2-004 | API 测试 | Playwright / Cypress | 移除标的 |
| TC-R2-005 | API 测试 | Playwright / Cypress | 定时刷新验证 |
| TC-R2-008 | 性能测试 | Lighthouse / k6 | 分页加载性能 |
| TC-R3-001 | API 测试 | 自定义脚本 | 推送延迟测量 |
| TC-R3-004 | API 测试 | 自定义脚本 | 去重逻辑验证 |
| TC-R4-001 | API 测试 | 自定义脚本 | 任务耗时测量 |
| TC-R4-002 | API 测试 | Jest / Vitest | 数据结构验证 |

### 5.2 需手动测试（约 40%）

| TC-ID | 原因 | 说明 |
|-------|------|------|
| TC-R1-003 | AI 内容质量 | 需要人工评估 Agent 回复质量 |
| TC-R1-006 | AI 内容质量 | 需要人工评估简报内容 |
| TC-R3-002 | 推送内容质量 | 需要人工评估推送文案 |
| TC-R3-006 | 大量测试数据 | 需要 100+ 测试场景 |
| TC-R4-003 | PDF 质量 | 需要人工评估 PDF 格式和内容 |
| TC-R4-004 | AI 内容质量 | 需要人工评估追问回复质量 |
| TC-R4-007 | 降级策略 | 需要人工评估降级内容 |
| TC-R4-009 | 数据来源标注 | 需要人工验证数据来源准确性 |

### 5.3 自动化建议

1. **API 测试**：使用 Playwright 或 Cypress 编写端到端 API 测试
2. **性能测试**：使用 k6 或 Lighthouse 进行性能基准测试
3. **AI 内容质量**：建立评分标准，定期人工抽检
4. **推送测试**：使用 Mock 推送服务进行自动化测试

---

## 6. 测试执行计划

### 6.1 执行顺序

**Week 2（后端 API 就绪后）：**
1. API 测试（R1-R4 的 P0 用例）
2. 数据模型验证
3. 耐久任务执行测试

**Week 3（前端实现就绪后）：**
1. Web E2E 测试（R1-R4 的 P0 用例）
2. UI 交互测试
3. 跨浏览器测试（Chrome/Safari/Firefox）

**Week 4（集成测试）：**
1. 端到端集成测试
2. 性能测试
3. 手动测试（AI 内容质量评估）

### 6.2 测试环境准备

- **开发环境**：用于单元测试和 API 测试
- **测试环境**：用于端到端测试和集成测试
- **Mock 服务**：用于模拟数据源和推送服务
- **测试数据**：准备 10+ 标的、3-5 个观察列表

### 6.3 测试工具

- **API 测试**：Playwright / Cypress
- **性能测试**：k6 / Lighthouse
- **Mock 服务**：WireMock / MockServer
- **测试管理**：本测试计划文档

---

## 7. 风险和依赖

### 7.1 风险

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 行情数据源不稳定 | 高 | 使用 Mock 数据进行测试，真实 API 作为补充 |
| AI 生成内容质量不稳定 | 中 | 建立评分标准，定期人工抽检 |
| 耐久任务执行时间不确定 | 中 | 调整时间配置，使用测试环境 |
| 推送服务性能问题 | 中 | 使用 Mock 推送服务进行压力测试 |

### 7.2 依赖

- 后端 API 就绪（Week 2）
- 前端实现就绪（Week 3）
- 数据源 API 配置完成
- 耐久任务引擎正常运行

---

## 8. 交付物

- [x] 测试计划文档（本文档）
- [ ] 测试用例执行记录（Week 2-4）
- [ ] 缺陷报告（Week 2-4）
- [ ] 测试报告（Week 4）

---

**文档结束**

> 下一步：Week 2 后端 API 就绪后开始执行测试。
