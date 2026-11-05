import assert from "node:assert/strict";
import { test } from "node:test";
import { localizedSymbolName } from "../src/symbol-names.ts";

test("中文界面把行情源的英文公司名换成中文名", () => {
  assert.equal(
    localizedSymbolName({ code: "600519.SS", name: "Kweichow Moutai Co., Ltd." }, "zh-Hans"),
    "贵州茅台",
  );
  assert.equal(
    localizedSymbolName({ code: "0700.HK", name: "Tencent Holdings Ltd." }, "zh-Hans"),
    "腾讯控股",
  );
  assert.equal(localizedSymbolName({ code: "AAPL", name: "Apple Inc." }, "zh-Hans"), "苹果");
});

test("英文界面显示英文名，即使行情源返回中文名", () => {
  assert.equal(
    localizedSymbolName({ code: "600519.SS", name: "贵州茅台" }, "en"),
    "Kweichow Moutai",
  );
  assert.equal(localizedSymbolName({ code: "AAPL", name: "Apple Inc." }, "en"), "Apple");
});

test("代码写法差异（港股补零、A 股 SS/SH 后缀）都能命中映射", () => {
  assert.equal(localizedSymbolName({ code: "700.HK", name: "Tencent" }, "zh-Hans"), "腾讯控股");
  assert.equal(localizedSymbolName({ code: "600519.SH", name: "Moutai" }, "zh-Hans"), "贵州茅台");
  assert.equal(localizedSymbolName({ code: "000858.SZ", name: "Wuliangye" }, "zh-Hans"), "五粮液");
});

test("未收录的代码回退行情源名称，不返回空字符串", () => {
  assert.equal(
    localizedSymbolName({ code: "UNKNOWN.XX", name: "Some Corp." }, "zh-Hans"),
    "Some Corp.",
  );
  assert.equal(localizedSymbolName({ code: "UNKNOWN.XX", name: "" }, "zh-Hans"), "");
});
