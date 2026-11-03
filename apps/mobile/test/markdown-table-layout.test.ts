import assert from "node:assert/strict";
import test from "node:test";
import { markdownTableWidths, markdownTextWidth } from "../src/markdown-table-layout.ts";

const priceLadder = [
  ["价位", "对应 2026E 扣非PE", "需要你相信什么"],
  ["18–18.8", "≈32x", "收入 2027 年确实回升。可小仓试，不是重仓价"],
  ["16.5–17", "≈28x", "中性情形的合理上沿，是我愿意开始买的区间"],
  ["14–15", "≈25x", "悲观情形也大部分被定价"],
];

test("a narrow price table keeps prose readable instead of squeezing all columns equally", () => {
  const widths = markdownTableWidths(priceLadder, 300);
  assert.equal(widths.length, 3);
  assert.ok(widths[2] > widths[1] && widths[1] > widths[0]);
  assert.ok(widths.reduce((sum, width) => sum + width, 0) > 300, "use horizontal overflow");
  assert.ok(widths[0] >= markdownTextWidth("18–18.8") * 14 + 28, "keep price ranges intact");
});

test("the same table fills a wide chat column without overflowing", () => {
  const widths = markdownTableWidths(priceLadder, 920);
  assert.equal(
    widths.reduce((sum, width) => sum + width, 0),
    920,
  );
  assert.ok(widths[2] > widths[0]);
});

test("CJK characters and explicit line breaks contribute to readable column widths", () => {
  assert.ok(markdownTextWidth("投资收益") > markdownTextWidth("1234"));
  assert.equal(markdownTextWidth("收入\n现金流质量"), markdownTextWidth("现金流质量"));
  assert.equal(markdownTextWidth("e\u0301"), markdownTextWidth("e"));
});

test("empty and incomplete streaming tables produce finite consistent columns", () => {
  assert.deepEqual(markdownTableWidths([], 320), []);
  const widths = markdownTableWidths([["项目", "数值", "备注"], ["收入"]], 0);
  assert.equal(widths.length, 3);
  assert.ok(widths.every((width) => Number.isFinite(width) && width > 0));
});

test("very long text is bounded while tables with many columns can still scroll", () => {
  const widths = markdownTableWidths(
    [
      ["来源", "说明"],
      [`https://example.com/${"x".repeat(2000)}`, "值"],
    ],
    300,
  );
  assert.ok(widths[0] <= 300);
  const many = markdownTableWidths([Array.from({ length: 12 }, () => "2026E")], 320);
  assert.equal(many.length, 12);
  assert.ok(many.reduce((sum, width) => sum + width, 0) > 320);
});

test("compact tables preserve the same readable layout with smaller cells", () => {
  const regular = markdownTableWidths(priceLadder, 0);
  const compact = markdownTableWidths(priceLadder, 0, true);
  assert.ok(compact.every((width, index) => width < regular[index]));
  assert.ok(compact[2] > compact[0]);
});
