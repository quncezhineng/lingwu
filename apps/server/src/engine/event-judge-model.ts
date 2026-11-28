import type { EventCandidateInput } from "../../../../packages/domain/src/investor.ts";
import { EVENT_TYPE_LABELS } from "../../../../packages/domain/src/investor.ts";
import type { ModelConnection } from "../model-settings.ts";
import {
  applyDecisionPolicy,
  FEED_SCORE,
  hasExplicitAlert,
  type JudgeResult,
  PUSH_SCORE,
  type TriageContext,
} from "./event-triage.ts";
import { completeText } from "./tanstack-agent.ts";

/**
 * 二级判级的「轻量模型」实现（PRD 的 Open Question）。
 *
 * 规则打分能解释但不会读内容：一条「公司下调指引」的公告和一条「公司发布
 * ESG 报告」的公告在规则眼里完全一样。这里让模型只做一件事——读标题与正文，
 * 给出一个 0..100 的打扰分值。**决定权仍留在 applyDecisionPolicy**：
 * 分档线、显式提醒优先、静默时段降级都不交给模型，所以 reasons/score/decision
 * 三个字段与规则版同形，A/B 时可以直接比推送接收率。
 */
const SYSTEM = [
  "你是个人投研助手的第二级消息判级器，只判断一件事：这条消息现在值不值得打断用户。",
  "用户已经在第一级筛过了：这条事件确实和他持仓、自选、论点或提醒有关。你要判断的是「现在」的打扰价值。",
  "打分参考（不是硬规则，可以综合权衡）：",
  "  · 与用户的关系强度：持仓占比越高、或在跟踪的论点里被这条直接推翻，分越高；",
  "  · 是否会改变结论：能证伪论点、改变盈利预期、触发用户设的价位的，分高；纯情绪面、纯转载、重复表述的分低；",
  "  · 时效性：几天内要发生的财报、马上生效的公告分高；已经过去的旧闻分低；",
  "  · 信息量：有具体数字、具体原因、具体影响的分高；只有标题和形容词的分低。",
  "打扰是有成本的：宁可让用户自己来信息流里看，也不要为了显得勤奋而推。默认偏保守。",
  "输出一个 JSON 对象，不要 Markdown、不要解释，形如：",
  '{"score": 0, "reasons": ["...", "..."]}',
  "score 是 0 到 100 的整数。reasons 写 2 到 3 条，每条不超过 40 字，用中文，" +
    "直接说这条为什么值得/不值得打扰，不要复述标题，不要写「用户」「本条」。",
].join("\n");

const MAX_REASON_CHARS = 80;
const MAX_REASONS = 4;
/** 判级本身是"低成本高并发"的活，慢过这个时间就按规则走，别拖住事件入库。 */
export const JUDGE_TIMEOUT_MS = 8_000;

function contextLines(candidate: EventCandidateInput, context: TriageContext): string[] {
  const entry = context.universe.get(candidate.symbol);
  const lines = [`事件类型：${EVENT_TYPE_LABELS[candidate.type]}`, `标的：${candidate.symbol}`];
  if (entry?.name) lines.push(`名称：${entry.name}`);
  if (entry?.holding) lines.push(`关系：持仓，占组合约 ${(entry.weight * 100).toFixed(0)}%`);
  else if (entry?.watchlist) lines.push("关系：自选，未持仓");
  if (entry?.thesis) lines.push("关系：该标的有在跟踪的投资论点");
  if (entry?.alert) lines.push("关系：用户为它显式设置了价格提醒");
  if (candidate.magnitudePercent !== undefined)
    lines.push(`异动幅度：${candidate.magnitudePercent.toFixed(2)}%`);
  if (candidate.thresholdValue !== undefined) lines.push(`触发阈值：${candidate.thresholdValue}`);
  if (candidate.daysUntil !== undefined) lines.push(`距离事件发生：${candidate.daysUntil} 天`);
  if (context.quiet) lines.push("当前时段：休市 / 静默时段（推送会被降级为信息流）");
  return lines;
}

/** 规则版给出的结论一起喂给模型：让它知道自己是在补判，而不是从零开始。 */
export function judgePrompt(
  candidate: EventCandidateInput,
  context: TriageContext,
  rules: JudgeResult,
): string {
  return [
    "## 事件",
    ...contextLines(candidate, context),
    "",
    `标题：${candidate.title}`,
    candidate.body ? `正文：${candidate.body.slice(0, 1200)}` : "正文：（无）",
    "",
    "## 规则判级（可参考，也可以不同意）",
    `分值 ${rules.score}，结论 ${rules.decision}`,
    ...rules.reasons.slice(0, 4).map((reason) => `- ${reason}`),
  ].join("\n");
}

/**
 * 解析模型输出，容忍 ```json 包裹、前后废话和多余的键。
 *
 * 解析失败返回 null 由调用方降级，绝不猜一个分值——猜出来的分会污染 A/B 数据。
 */
export function parseJudgeReply(raw: string): { score: number; reasons: string[] } | null {
  const text = raw.trim();
  if (!text) return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const record = parsed as { score?: unknown; reasons?: unknown };
  const score = typeof record.score === "number" ? record.score : Number(record.score);
  if (!Number.isFinite(score)) return null;
  const reasons = Array.isArray(record.reasons)
    ? record.reasons
        .filter((reason): reason is string => typeof reason === "string")
        .map((reason) => reason.trim().replace(/\s+/g, " "))
        .filter(Boolean)
        .map((reason) => reason.slice(0, MAX_REASON_CHARS))
        .slice(0, MAX_REASONS)
    : [];
  if (reasons.length === 0) return null;
  return { score, reasons };
}

export interface ModelJudgeInput {
  model: string;
  connection?: ModelConnection;
  candidate: EventCandidateInput;
  context: TriageContext;
  /** 规则版结论：作为参照喂给模型，也作为失败时的兜底。 */
  rules: JudgeResult;
  pushScore?: number;
  feedScore?: number;
  signal?: AbortSignal;
}

/**
 * 用轻量模型判一次级。模型不可用、超时、输出不合规时返回 null，由调用方降级到规则。
 *
 * 返回值已包含最终决定（走 applyDecisionPolicy），与 judgeEvent 的输出同形。
 */
export async function judgeEventWithModel(input: ModelJudgeInput): Promise<JudgeResult | null> {
  const raw = await completeText({
    model: input.model,
    connection: input.connection,
    system: SYSTEM,
    prompt: judgePrompt(input.candidate, input.context, input.rules),
    // 判级不该拖住事件入库：没给 signal 时自己兜一个短超时，超时即降级规则。
    signal: input.signal ?? AbortSignal.timeout(JUDGE_TIMEOUT_MS),
  });
  const parsed = parseJudgeReply(raw);
  if (!parsed) return null;
  return applyDecisionPolicy({
    score: parsed.score,
    // 模型只写"为什么"，分值怎么分档由死规则决定，理由里补上分档说明。
    reasons: [`模型判级：${parsed.reasons.join("；")}`],
    explicitAlert: hasExplicitAlert(input.candidate, input.context),
    quiet: input.context.quiet,
    // A3：模型判级同样要过授权策略闸，否则会绕过「未授权 / 免打扰 / 超上限」的降级。
    consent: input.context.consent,
    pushScore: input.pushScore ?? PUSH_SCORE,
    feedScore: input.feedScore ?? FEED_SCORE,
  });
}
