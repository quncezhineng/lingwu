/**
 * SKILL.md 解析：把标准技能文件拆成「名称 / 用途 / 指令 / 输出要求」四个字段，
 * 与「我的技能」里手写创建出来的技能结构保持一致。
 *
 * 兼容两类写法：
 * - 通用 frontmatter：`name` / `description`
 * - 本仓库技能库常用的双语 frontmatter：`name_zh` / `name_en` / `description_zh` / `description_en`
 * 没有 frontmatter 时退回文件名与正文首段，尽量不让用户白传一次。
 */

const MAX_NAME = 40;
const MAX_PURPOSE = 120;
const MAX_INSTRUCTIONS = 4000;
const MAX_OUTPUT = 800;

export interface ParsedSkill {
  name: string;
  purpose: string;
  instructions: string;
  outputFormat: string;
}

export interface ParseSkillOptions {
  /** 文件名（不含扩展名），用作没有 frontmatter 和标题时的兜底名称。 */
  fallbackName?: string;
  /** 当前界面语言：决定优先取 `*_zh` 还是 `*_en` 字段。 */
  locale?: string;
}

/** 技能文件无法转成技能时的可展示错误。 */
export class SkillMarkdownError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SkillMarkdownError";
  }
}

function clip(value: string, limit: number): string {
  return value.trim().slice(0, limit);
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2)
  )
    return trimmed.slice(1, -1).trim();
  return trimmed;
}

/** 只认顶层 `key: value`，嵌套结构（列表、对象）不参与取值。 */
function splitFrontmatter(text: string): {
  values: Record<string, string>;
  body: string;
} {
  if (!text.startsWith("---")) return { values: {}, body: text };
  const match = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(text);
  if (!match) return { values: {}, body: text };
  const values: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    if (!line.trim() || line.trimStart().startsWith("#") || /^[ \t]/.test(line)) continue;
    const pair = /^([A-Za-z0-9_-]+)[ \t]*:[ \t]*(.*)$/.exec(line);
    if (!pair) continue;
    const value = unquote(pair[2]);
    if (value) values[pair[1].toLowerCase()] = value;
  }
  return { values, body: text.slice(match[0].length) };
}

/** 取正文里的首个标题：优先一级标题，没有再看任意级别。 */
function leadingHeading(body: string): string {
  const lines = body.split("\n").slice(0, 12);
  const h1 = lines.find((line) => /^#[ \t]+\S/.test(line));
  if (h1) return h1.replace(/^#[ \t]+/, "").trim();
  const any = lines.find((line) => /^#{2,6}[ \t]+\S/.test(line));
  return any ? any.replace(/^#{2,6}[ \t]+/, "").trim() : "";
}

/** 正文首段普通文字，用作没有 description 时的用途兜底。 */
function leadingParagraph(body: string): string {
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (/^#{1,6}[ \t]/.test(line)) continue;
    if (/^([>*|]|```|-{3,}$)/.test(line)) continue;
    if (/^[-*+][ \t]+\S/.test(line)) continue;
    return line;
  }
  return "";
}

/**
 * 去掉正文开头的一级标题：技能名已经在卡片上单独展示，
 * 指令里再保留标题只会让模型把标题重复一遍。
 * 双语文技文件常见的英文 H1（如 `# DCF Model Builder`）与中文 name_zh 并不一致，
 * 所以这里不比对名字，只要是开头的一级标题就去掉。
 */
function withoutLeadingTitle(body: string): string {
  const lines = body.replace(/^\n+/, "").split("\n");
  const index = lines.findIndex((line) => line.trim());
  if (index < 0) return "";
  if (!/^#[ \t]+\S/.test(lines[index].trim())) return lines.join("\n").trim();
  return lines
    .slice(index + 1)
    .join("\n")
    .trim();
}

export function parseSkillMarkdown(text: string, options: ParseSkillOptions = {}): ParsedSkill {
  const source = text.replace(/\r\n?/g, "\n").replace(/^\uFEFF/, "");
  if (!source.trim()) throw new SkillMarkdownError("技能文件是空的。");

  const { values, body } = splitFrontmatter(source);
  const zh = (options.locale ?? "").toLowerCase().startsWith("zh");
  const pick = (...keys: string[]): string => {
    for (const key of keys) {
      const value = values[key];
      if (value) return value;
    }
    return "";
  };
  const heading = leadingHeading(body);
  const name =
    clip(
      pick(zh ? "name_zh" : "name_en", "name", "title", zh ? "name_en" : "name_zh") ||
        heading ||
        options.fallbackName ||
        "",
      MAX_NAME,
    ) || "";
  if (!name) throw new SkillMarkdownError("技能文件里找不到名称，请在 frontmatter 里补 name。");

  const purpose = clip(
    pick(
      zh ? "description_zh" : "description_en",
      "description",
      zh ? "description_en" : "description_zh",
    ) || leadingParagraph(withoutLeadingTitle(body)),
    MAX_PURPOSE,
  );
  const instructions = clip(withoutLeadingTitle(body) || purpose, MAX_INSTRUCTIONS);
  if (!instructions)
    throw new SkillMarkdownError("技能文件里没有可用的指令内容，请在标题下补上正文。");
  const outputFormat = clip(pick("outputformat", "output_format", "output"), MAX_OUTPUT);
  return { name, purpose, instructions, outputFormat };
}

/** 从文件名推断技能名：去掉扩展名，`SKILL` / `skill` 这类泛称不算名字。 */
export function skillNameFromFile(fileName: string): string {
  const base = fileName.replace(/^.*[\\/]/, "").replace(/\.(md|markdown|txt)$/i, "");
  const trimmed = base.trim();
  if (!trimmed || /^skill$/i.test(trimmed)) return "";
  return trimmed;
}
