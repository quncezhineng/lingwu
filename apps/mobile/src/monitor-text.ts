/**
 * 提醒（盯盘）任务的文案：触发条件与运行频率。
 *
 * 抽成独立模块，供「任务 → 定时 → 提醒」列表与标的详情复用，
 * 避免两边对同一条提醒给出不同描述。
 */
import type { Monitor } from "../../../packages/domain/src/agent";
import { monitorPriceLabel } from "../../../packages/domain/src/monitor-currency";
import type { TranslationFn, TranslationKey } from "./i18n";

export const WEEKDAYS = [
  { value: 1, labelKey: "agent.weekdayMonday" },
  { value: 2, labelKey: "agent.weekdayTuesday" },
  { value: 3, labelKey: "agent.weekdayWednesday" },
  { value: 4, labelKey: "agent.weekdayThursday" },
  { value: 5, labelKey: "agent.weekdayFriday" },
  { value: 6, labelKey: "agent.weekdaySaturday" },
  { value: 7, labelKey: "agent.weekdaySunday" },
] as const satisfies ReadonlyArray<{ value: number; labelKey: TranslationKey }>;

export function monitorConditionText(monitor: Monitor, t: TranslationFn) {
  return monitor.condition === "change"
    ? t("agent.watchForPageChange")
    : monitor.condition === "contains"
      ? t("agent.watchForText", { value: monitor.value })
      : t("agent.priceBelow", { value: monitorPriceLabel(monitor) });
}

/** 编辑表单里始终提供的检查间隔（分钟）。 */
export const MONITOR_INTERVAL_PRESETS = [15, 60, 360] as const;

/**
 * 编辑「按间隔」时的可选项。已保存的间隔不在预设里时（例如系统写成 30 分钟）
 * 仍要出现并可以被选中，否则三项都不亮，看起来像还没配完。
 */
export function monitorIntervalOptions(currentMinutes: number | undefined): number[] {
  const options = new Set<number>(MONITOR_INTERVAL_PRESETS);
  if (
    currentMinutes != null &&
    Number.isInteger(currentMinutes) &&
    currentMinutes >= 1 &&
    currentMinutes <= 10080
  ) {
    options.add(currentMinutes);
  }
  return [...options].sort((a, b) => a - b);
}

export function monitorScheduleText(monitor: Monitor, t: TranslationFn) {
  if (monitor.schedule === "daily")
    return t("agent.scheduleDailyAt", { time: monitor.timeOfDay ?? "09:00" });
  if (monitor.schedule === "weekly") {
    const weekday = WEEKDAYS.find((item) => item.value === (monitor.weekday ?? 5));
    return t("agent.scheduleWeeklyAt", {
      weekday: t(weekday?.labelKey ?? "agent.weekdayFriday"),
      time: monitor.timeOfDay ?? "09:00",
    });
  }
  return t("agent.checkingEvery", { minutes: monitor.intervalMinutes });
}
