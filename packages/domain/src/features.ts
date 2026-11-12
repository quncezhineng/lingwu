/**
 * 用户可见的「目标」（Goal）功能。
 * 默认关闭：界面、助手工具和提示词都不再暴露目标。
 * 数据模型、存储和 `/api/agent/goals` 仍然保留。
 * 恢复时把这一处改成 `true`，然后重启网页和 API。
 * 类型写成 boolean，避免字面量 false 把恢复路径标成死代码。
 */
export const goalsEnabled: boolean = false;
