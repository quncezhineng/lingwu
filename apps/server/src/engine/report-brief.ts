import { artifactChatBrief } from "../../../../packages/domain/src/agent.ts";
import type { ModelConnection } from "../model-settings.ts";
import { completeText } from "./tanstack-agent.ts";

const SYSTEM = [
  "你是投研助理，要把一份已经写完的报告收成对话里能直接读的短摘要。",
  "只使用报告里已经写出的事实、数字和判断，不补充报告没有的信息，也不改写数字。",
  "使用报告本身的语言。先写结论，再写两三句会改变这个结论的依据。",
  "不要复述研究过程、检索次数、任务约束，也不要写“已按约束完成”。",
  "不要照抄报告开头，不要用标题、编号清单或 Markdown。",
  "整段控制在 280 个字以内。",
].join("");

/** 收成一段能放进对话的纯文本。过长时停在句号，避免把整篇报告倒回对话。 */
export function normalizeChatBrief(raw: string): string {
  const text = raw
    .trim()
    .replace(/^```[a-z]*\n?/i, "")
    .replace(/\n?```$/i, "")
    .replace(/^["“]|["”]$/g, "")
    .trim();
  if (text.length < 20) throw new Error("The model returned an empty summary");
  if (text.length <= 700) return text;
  const window = text.slice(0, 700);
  const end = Math.max(
    window.lastIndexOf("。"),
    window.lastIndexOf("."),
    window.lastIndexOf("！"),
    window.lastIndexOf("？"),
  );
  return end >= 80 ? window.slice(0, end + 1) : window.trimEnd();
}

export async function summarizeReport(input: {
  model: string;
  connection?: ModelConnection;
  title: string;
  body: string;
  signal?: AbortSignal;
}): Promise<string> {
  const text = await completeText({
    model: input.model,
    connection: input.connection,
    system: SYSTEM,
    prompt: `标题：${input.title}\n\n报告正文：\n${input.body}`,
    signal: input.signal,
  });
  return normalizeChatBrief(text);
}

const SYNTHESIS_SYSTEM = [
  "你是投研团队的负责人，要把多个专家智能体分别产出的研究片段综合成一篇完整、自洽的投资研究报告。",
  "每个片段前会标注它负责的维度（如公司基本面、宏观环境、财务分析、估值、风险）。",
  "整合时：保留各片段的量化数据与关键判断，消除重复，统一口径与语气，按「结论 → 公司/行业概况 → 财务与估值 → 风险 → 投资建议」组织成结构化的 Markdown 报告。",
  "只使用片段里已经给出的事实、数字和判断，不杜撰片段没有的数据。若片段间有矛盾，如实指出分歧而不是强行统一。",
  "用中文输出。",
].join("");

/** 把多个子任务的产出综合成一篇完整研报。无模型或输入为空时返回 null，由调用方降级。 */
export async function synthesizeResearch(input: {
  model: string;
  connection?: ModelConnection;
  title: string;
  sections: { title: string; body: string }[];
  signal?: AbortSignal;
}): Promise<string | null> {
  if (input.sections.length === 0) return null;
  const prompt =
    `研究主题：${input.title}\n\n以下是各专家智能体的研究片段：\n\n` +
    input.sections
      .map((section, i) => `【片段 ${i + 1} · ${section.title}】\n${section.body}`)
      .join("\n\n---\n\n") +
    `\n\n请综合以上片段，产出一篇完整的投资研究报告。`;
  const text = await completeText({
    model: input.model,
    connection: input.connection,
    system: SYNTHESIS_SYSTEM,
    prompt,
    signal: input.signal,
  });
  return text.trim() || null;
}

export { artifactChatBrief };
