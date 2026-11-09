import assert from "node:assert/strict";
import test from "node:test";
import { reportExcerpt } from "../src/report-excerpt.ts";

test("优先摘出结论段，而不是报告开头的过程说明", () => {
  const markdown = `# 赤峰黄金
检索了半年报和公告，过程较长。

## 结论
矿产金占比提升是利润弹性的来源。紫金入主后的资源注入仍待兑现。估值需分开看 A/H。

## 附录
更多表格。`;
  const excerpt = reportExcerpt(markdown);
  assert.match(excerpt, /^矿产金占比提升/);
  assert.doesNotMatch(excerpt, /检索了半年报/);
  assert.doesNotMatch(excerpt, /附录/);
});

test("跳过交办过程，摘出关键成果", () => {
  const markdown = `已按约束完成：未调用任何写入工具，报告全文直接交付。

检索共 3 次，取到半年报和三季报。

关键成果：
1) 净利降 42% 确认为 2026 年第三季度单季，不是 2025 年的数字。
2) 2026 年前三季度营收 100.87 亿，归母 22.85 亿。`;
  const excerpt = reportExcerpt(markdown);
  assert.match(excerpt, /^1\)/);
  assert.match(excerpt, /2026 年前三季度营收/);
  assert.doesNotMatch(excerpt, /已按约束|检索共/);
});

test("没有结论标题时用正文开头，并在句号处截断", () => {
  const long = `第一句已经写在开头。${"后续展开。".repeat(80)}`;
  const excerpt = reportExcerpt(long, 80);
  assert.match(excerpt, /^第一句已经写在开头。/);
  assert.ok(excerpt.endsWith("。"));
  assert.ok(excerpt.length <= 80);
});
