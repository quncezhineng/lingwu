import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseSkillMarkdown,
  SkillMarkdownError,
  skillNameFromFile,
} from "../src/skill-markdown.ts";

const bilingual = `---
name_en: dcf-model
description_en: Build a DCF model from filings.
name_zh: DCF估值模型
description_zh: 基于财报搭建 DCF 估值模型。
---

# DCF Model Builder

## Overview

Build projections and a terminal value.
`;

test("bilingual frontmatter follows the active locale", () => {
  const zh = parseSkillMarkdown(bilingual, { locale: "zh-Hans" });
  assert.equal(zh.name, "DCF估值模型");
  assert.equal(zh.purpose, "基于财报搭建 DCF 估值模型。");
  assert.equal(parseSkillMarkdown(bilingual, { locale: "en" }).name, "dcf-model");
  assert.equal(
    parseSkillMarkdown(bilingual, { locale: "en" }).purpose,
    "Build a DCF model from filings.",
  );
});

test("the leading title is dropped from the instructions", () => {
  const parsed = parseSkillMarkdown(bilingual, { locale: "zh-Hans" });
  assert.equal(parsed.instructions.startsWith("# DCF"), false);
  assert.equal(parsed.instructions.startsWith("## Overview"), true);
  assert.equal(parsed.instructions.includes("terminal value"), true);
});

test("plain frontmatter without locale suffixes still works", () => {
  const parsed = parseSkillMarkdown(
    [
      "---",
      "name: pdf-processing",
      "description: Extract tables from PDFs.",
      "---",
      "",
      "Body.",
    ].join("\n"),
    { locale: "zh-Hans" },
  );
  assert.equal(parsed.name, "pdf-processing");
  assert.equal(parsed.purpose, "Extract tables from PDFs.");
  assert.equal(parsed.instructions, "Body.");
});

test("a quoted description keeps its inner punctuation", () => {
  const parsed = parseSkillMarkdown(
    ["---", 'description: "Use S&P data, then format."', "---", "# Tear sheet", "Steps."].join(
      "\n",
    ),
  );
  assert.equal(parsed.name, "Tear sheet");
  assert.equal(parsed.purpose, "Use S&P data, then format.");
});

test("without frontmatter the heading and first paragraph stand in", () => {
  const parsed = parseSkillMarkdown(
    ["# Market Briefing", "", "Summarise the overnight tape.", "", "## Steps", "- read news"].join(
      "\n",
    ),
  );
  assert.equal(parsed.name, "Market Briefing");
  assert.equal(parsed.purpose, "Summarise the overnight tape.");
  assert.equal(parsed.instructions.startsWith("Summarise the overnight tape."), true);
});

test("the file name is the last resort for a name", () => {
  const parsed = parseSkillMarkdown("Run the screening once a day.", {
    fallbackName: "daily-screen",
  });
  assert.equal(parsed.name, "daily-screen");
  // 没有标题可去，正文原样成为指令。
  assert.equal(parsed.instructions, "Run the screening once a day.");
});

test("output format is read from the frontmatter when present", () => {
  const parsed = parseSkillMarkdown(
    ["---", "name: deck", "outputFormat: A 10-slide deck", "---", "Body."].join("\n"),
  );
  assert.equal(parsed.outputFormat, "A 10-slide deck");
});

test("empty or nameless files are rejected with a readable message", () => {
  assert.throws(() => parseSkillMarkdown("   "), SkillMarkdownError);
  assert.throws(() => parseSkillMarkdown(["---", "name:", "---", ""].join("\n")), {
    name: "SkillMarkdownError",
  });
});

test("file names lose their extension and generic SKILL stem", () => {
  assert.equal(skillNameFromFile("dcf-model.md"), "dcf-model");
  assert.equal(skillNameFromFile("skills/DCF Model.MARKDOWN"), "DCF Model");
  assert.equal(skillNameFromFile("SKILL.md"), "");
  assert.equal(skillNameFromFile("skill.md"), "");
});
