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

export { artifactChatBrief };
