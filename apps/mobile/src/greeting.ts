import type { TranslationKey } from "./i18n/locales/en";

/** 按用户设备所在时区读取当前小时，读取失败时退回运行时本地时间。 */
export function userLocalHour(date: Date, timeZone?: string): number {
  try {
    const hour = Number.parseInt(
      new Intl.DateTimeFormat("en-US", {
        hour: "2-digit",
        hourCycle: "h23",
        timeZone,
      }).format(date),
      10,
    );
    if (hour >= 0 && hour < 24) return hour;
  } catch {
    // Some runtimes can lack a named time zone; Date already holds local time.
  }
  return date.getHours();
}

export function greetingKeyForHour(hour: number): TranslationKey {
  if (hour >= 5 && hour < 12) return "workbench.greetingMorning";
  if (hour >= 12 && hour < 18) return "workbench.greetingAfternoon";
  return "workbench.greetingEvening";
}
