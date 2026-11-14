import assert from "node:assert/strict";
import test from "node:test";
import { monitorIntervalOptions } from "../src/monitor-text.ts";

test("新建自动化只提供三档预设", () => {
  assert.deepEqual(monitorIntervalOptions(15), [15, 60, 360]);
  assert.deepEqual(monitorIntervalOptions(undefined), [15, 60, 360]);
});

test("已保存的 30 分钟间隔会出现在编辑选项里", () => {
  assert.deepEqual(monitorIntervalOptions(30), [15, 30, 60, 360]);
});

test("预设本身不重复", () => {
  assert.deepEqual(monitorIntervalOptions(60), [15, 60, 360]);
  assert.deepEqual(monitorIntervalOptions(360), [15, 60, 360]);
});
