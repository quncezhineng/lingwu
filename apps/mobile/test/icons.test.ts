import assert from "node:assert/strict";
import test from "node:test";
import { ICON_KEY_VALUES, ICON_KEYS, ICON_NAMES } from "../src/icons/keys.ts";
import { LIBRARY_ICON_COUNT, LIBRARY_ICONS } from "../src/icons/library.ts";
import { PROJECT_ICONS } from "../src/icons/project.ts";

/**
 * 图标注册表完整性校验。
 *
 * 目的：防止新增导出名时忘记登记几何、来源标记写错，或设计库资产被意外改动。
 */

test("设计库图标数量与快照一致", () => {
  assert.equal(LIBRARY_ICON_COUNT, 40);
  assert.equal(Object.keys(LIBRARY_ICONS).length, LIBRARY_ICON_COUNT);
});

test("所有导出名都能解析到图标几何", () => {
  const missing = ICON_NAMES.filter(
    (name) => !LIBRARY_ICONS[ICON_KEYS[name]] && !PROJECT_ICONS[ICON_KEYS[name]],
  );
  assert.deepEqual(missing, []);
});

test("来源标记与所在注册表一致", () => {
  for (const [key, definition] of Object.entries(LIBRARY_ICONS)) {
    assert.equal(definition.source, "library", `${key} 应标记为 library`);
    assert.ok(definition.asset, `${key} 应保留设计库原始文件名`);
    assert.ok(definition.elements.length > 0, `${key} 至少要有一个几何元素`);
  }
  for (const [key, definition] of Object.entries(PROJECT_ICONS)) {
    assert.equal(definition.source, "project", `${key} 应标记为 project`);
    assert.equal(definition.asset, undefined, `${key} 是项目补齐图标，不应有设计库文件名`);
    assert.ok(definition.elements.length > 0, `${key} 至少要有一个几何元素`);
  }
});

test("设计库与项目补齐图标不存在同名重复", () => {
  const overlap = Object.keys(LIBRARY_ICONS).filter((key) => PROJECT_ICONS[key]);
  assert.deepEqual(overlap, []);
});

test("每个几何元素都带完整路径数据", () => {
  for (const registry of [LIBRARY_ICONS, PROJECT_ICONS]) {
    for (const [key, definition] of Object.entries(registry)) {
      for (const element of definition.elements) {
        if (element.tag === "path" || element.tag === "polyline" || element.tag === "polygon") {
          const value = element.tag === "path" ? element.d : element.points;
          assert.ok(value && value.trim().length > 0, `${key} 的 ${element.tag} 缺少路径数据`);
        }
        if (element.tag === "circle") {
          assert.ok(Number.isFinite(element.cx) && Number.isFinite(element.cy));
          assert.ok(element.r > 0, `${key} 的圆半径必须为正数`);
        }
        if (element.tag === "line") {
          for (const value of [element.x1, element.y1, element.x2, element.y2]) {
            assert.ok(Number.isFinite(value), `${key} 的直线坐标必须为数字`);
          }
        }
        if (element.tag === "rect") {
          assert.ok(Number.isFinite(element.x) && Number.isFinite(element.y));
          assert.ok(element.width > 0 && element.height > 0, `${key} 的矩形尺寸必须为正数`);
        }
      }
    }
  }
});

test("图标键不重复映射", () => {
  const counts = new Map<string, number>();
  for (const name of ICON_NAMES) {
    const key = ICON_KEYS[name];
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const duplicated = [...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key);
  // 允许多个导出名指向同一几何（如 Pencil 与 Edit3），但键值本身必须唯一存在于注册表。
  for (const key of duplicated) {
    assert.ok(LIBRARY_ICONS[key] || PROJECT_ICONS[key], `${key} 必须存在于某个注册表`);
  }
  assert.equal(ICON_KEY_VALUES.length, counts.size);
});
