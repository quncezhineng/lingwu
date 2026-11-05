/**
 * 价格提醒表单在「任务 → 定时 → 提醒」里创建的是盯盘任务（monitor），
 * 它的标的信息写在 `url`（Yahoo 报价页）和 `description` 里，没有独立字段。
 * 这里按这两处反查某个标的的提醒任务，供标的详情列出。
 */
import type { Monitor } from "../../../packages/domain/src/agent";

/** 先从 url 取报价代码：`https://finance.yahoo.com/quote/600519.SS` → `600519.SS`。 */
function quoteCodeOf(url: string): string {
  const marker = "/quote/";
  const index = url.toLowerCase().indexOf(marker);
  if (index < 0) return "";
  return (
    url
      .slice(index + marker.length)
      .split(/[/?#]/)[0]
      ?.toUpperCase() ?? ""
  );
}

export function monitorsForSymbol(
  monitors: readonly Monitor[],
  symbol: { code: string },
): Monitor[] {
  const code = symbol.code.trim().toUpperCase();
  const bare = code.replace(/\.[A-Z]+$/, "");
  return monitors.filter((monitor) => {
    // 已停止的盯盘视为移除，和「提醒」列表保持一致。
    if (monitor.status === "stopped") return false;
    const quoteCode = quoteCodeOf(monitor.url);
    if (quoteCode && (quoteCode === code || quoteCode === bare)) return true;
    const description = (monitor.description ?? "").toUpperCase();
    return !!code && description.includes(code);
  });
}
