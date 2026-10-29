import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { skillCatalog } from "../src/skill-catalog.ts";

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
    assert.ok(skill.categories.length > 0, `${skill.id} 缺少分类`);
    assert.match(skill.sourceFolder, /^skills\//);
    assert.ok(
      existsSync(resolve(repositoryRoot, skill.sourceFolder, "SKILL.md")),
      `${skill.id} 缺少本地技能文件`,
    );
  }
});
