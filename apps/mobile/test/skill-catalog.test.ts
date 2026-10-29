import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { skillCatalog, skillCategories } from "../src/skill-catalog.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

test("LingWu 技能目录完整且标识唯一", () => {
  assert.equal(skillCatalog.length, 184);
  assert.equal(new Set(skillCatalog.map((skill) => skill.id)).size, skillCatalog.length);
  assert.equal(new Set(skillCatalog.map((skill) => skill.sourceFolder)).size, skillCatalog.length);
});

test("每个 LingWu 技能都包含中英文展示信息", () => {
  for (const skill of skillCatalog) {
    assert.ok(skill.id.trim(), "技能缺少 ID");
    assert.ok(skill.titleZh.trim(), `${skill.id} 缺少中文名称`);
    assert.ok(skill.titleEn.trim(), `${skill.id} 缺少英文名称`);
    assert.ok(skill.descriptionZh.trim(), `${skill.id} 缺少中文简介`);
    assert.ok(skill.descriptionEn.trim(), `${skill.id} 缺少英文简介`);
    assert.equal(skill.categories.length, 1, `${skill.id} 应只有一个主分类`);
    assert.ok(skillCategories.includes(skill.categories[0]), `${skill.id} 分类不合法`);
    assert.match(skill.sourceFolder, /^skills\//);
    assert.ok(
      existsSync(resolve(repositoryRoot, skill.sourceFolder, "SKILL.md")),
      `${skill.id} 缺少本地技能文件`,
    );
  }
});

test("技能使用金融投研分类且每个分类均有内容", () => {
  const usedCategories = new Set(skillCatalog.map((skill) => skill.categories[0]));
  assert.deepEqual([...usedCategories].sort(), [...skillCategories].sort());
});
