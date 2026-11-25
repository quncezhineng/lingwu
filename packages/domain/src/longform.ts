/**
 * 长文折叠：把「一屏读不完」的回复收成摘要 + 卡片引用。
 *
 * 一段完整研报动辄数千字。整篇留在 chat 流里有两个代价：版面被一段文字占满，
 * 下一轮又会把它整段拼回上下文，把真正有用的历史挤出去。所以约定：
 *
 * - 超过阈值的长文落成产物卡片（独立页面），聊天流里只保留一段摘要 + 卡片引用；
 * - 摘要撑不起追问时，模型用 `read_artifact` 按需回读原文或检索片段。
 *
 * 这里只放纯函数：服务端与前端共用同一套判定与引用格式，避免两边阈值漂移。
 */
import { type AgentArtifact, artifactChatBrief } from "./agent.ts";

/** 超过这个字符数即视为长文，需要折叠成卡片。 */
export const LONGFORM_CHARS = 2000;
/** 明显是结构化长文（多级标题 / 大表格）时，字符阈值可以更低。 */
export const LONGFORM_STRUCTURED_CHARS = 1800;
/** 聊天流里保留的摘要目标长度，与 report-brief 的成品长度一致。 */
export const LONGFORM_BRIEF_CHARS = 280;
/** 上下文清单里列出的章节数上限：够模型判断「要读哪一段」即可。 */
export const LONGFORM_OUTLINE_LIMIT = 8;

export interface LongformHeading {
  level: number;
  title: string;
}

/** 去掉行内 Markdown 标记，只留可读文字。 */
function plainInline(value: string): string {
  return value
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_~`]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** 扫出正文里的标题行。代码块里的 # 是内容，不是结构，必须跳过。 */
export function scanHeadings(text: string): LongformHeading[] {
  const headings: LongformHeading[] = [];
  let fenced = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("```")) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const match = /^(#{1,6})\s+(.+?)\s*#*$/.exec(line);
    const hashes = match?.[1];
    const title = match?.[2];
    if (!hashes || !title) continue;
    const plain = plainInline(title);
    if (plain) headings.push({ level: hashes.length, title: plain });
  }
  return headings;
}

/** 表格行数：连续竖线行说明这里在摆数据，短正文也可能值得单独成卡。 */
function tableRows(text: string): number {
  let rows = 0;
  let fenced = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("```")) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    if (line.startsWith("|") && line.split("|").length >= 3) rows += 1;
  }
  return rows;
}

/**
 * 这段回复要不要折叠成卡片。
 *
 * 硬线是 2000 字；接近硬线但结构上已经是一篇「文档」（三个以上章节 / 密集
 * 表格）时也会提前折叠。日常问答、代码片段、短清单都不会命中。
 */
export function isLongformReply(text: string): boolean {
  const body = text.trim();
  if (body.length >= LONGFORM_CHARS) return true;
  if (body.length < LONGFORM_STRUCTURED_CHARS) return false;
  return scanHeadings(body).length >= 3 || tableRows(body) >= 12;
}

/** 卡片标题：优先第一个标题行，其次第一行有内容的文字。 */
export function longformTitle(text: string, fallback: string): string {
  const heading = scanHeadings(text)[0]?.title;
  if (heading) return heading.slice(0, 60);
  const first = text
    .split(/\r?\n/)
    .map((line) => plainInline(line.replace(/^[-*>+\d.\s]+/, "")))
    .find((line) => line.length > 0);
  if (!first) return fallback;
  return first.slice(0, 60);
}

/** 章节大纲：模型据此决定「读哪一段」，不必先读全文。 */
export function longformOutline(text: string, limit = LONGFORM_OUTLINE_LIMIT): string[] {
  const seen = new Set<string>();
  const outline: string[] = [];
  for (const heading of scanHeadings(text)) {
    if (seen.has(heading.title)) continue;
    seen.add(heading.title);
    outline.push(heading.title);
    if (outline.length >= limit) break;
  }
  return outline;
}

/**
 * 模型摘要不可用时的降级摘要。
 *
 * 停在句号，不把半句话留在卡片上；没有句号就按长度硬切。它只是「先把这一段
 * 收起来」的临时文本，后续 `POST /artifacts/:id/brief` 会用模型结果覆盖。
 */
export function clipBrief(text: string, limit = LONGFORM_BRIEF_CHARS): string {
  const body = text
    .trim()
    .replace(/^```[a-z]*\n?/i, "")
    .replace(/\n?```$/i, "")
    .trim();
  if (body.length <= limit) return body;
  const window = body.slice(0, limit);
  const end = Math.max(
    window.lastIndexOf("。"),
    window.lastIndexOf("."),
    window.lastIndexOf("！"),
    window.lastIndexOf("？"),
    window.lastIndexOf("\n"),
  );
  return (end >= Math.floor(limit * 0.4) ? window.slice(0, end + 1) : window).trimEnd();
}

/**
 * 卡片摘要：模型写的短摘要优先，其次折叠时的兜底摘要，最后才截取全文。
 *
 * 三级兜底是为了「摘要永远拿得到」——卡片生成是同步动作，模型摘要可能是稍后
 * 才补上的，中间这段时间不能拿整篇正文顶上。服务端拼上下文、前端折叠正文都走
 * 这一个函数，两边看到的是同一段摘要。
 */
export function longformBriefOf(artifact: AgentArtifact): string {
  const written = artifactChatBrief(artifact.data);
  if (written) return written;
  const fallback = artifact.data.fallbackBrief;
  if (typeof fallback === "string" && fallback.trim()) return fallback.trim();
  return clipBrief(artifact.summary);
}

export interface LongformReferenceInput {
  id: string;
  title: string;
  /** 正文字数，用于让模型判断值不值得回读。 */
  chars: number;
  outline?: readonly string[];
}

/**
 * 上下文里的一行卡片引用。
 *
 * 这行是「信息不丢」的关键：摘要之后紧跟卡片 id、全文长度与章节，模型看到它就
 * 知道自己手上只有摘要，需要细节时该调 `read_artifact`，而不是凭印象编。
 */
export function longformReference(input: LongformReferenceInput): string {
  const outline = (input.outline ?? []).filter(Boolean);
  const sections = outline.length
    ? `；章节：${outline.slice(0, LONGFORM_OUTLINE_LIMIT).join(" / ")}`
    : "";
  return `《${input.title}》（artifact ID: ${input.id}，全文 ${input.chars} 字${sections}。需要原文细节时调用 read_artifact 读取）`;
}
