import { randomUUID } from "node:crypto";
import { EventType } from "@ag-ui/core";
import type { AgentTask } from "../../../../packages/domain/src/agent.ts";
import { backgroundFailure } from "../log.ts";
import type { ConversationStream } from "./stream.ts";

/**
 * R1 秒回回执：长任务派发时先说一句「好，我去办」。
 *
 * 为什么不让模型自己说：模型说完这句话要等一整轮工具结果 + 生成，用户盯着的
 * 是空白输入框；而派发动作本身在几十毫秒内就完成了。回执由服务端在派发那一刻
 * 直接补进会话流，不经过模型，所以是"秒回"。
 *
 * 这条回执只进本服务的会话账本（客户端按 extraDrafts 显示成一条助手气泡），
 * 不写线程正文：它是即时确认，不是结论；任务真跑完的结果仍由 worker 产出。
 */
const KIND_LABELS: Record<string, string> = {
  agent: "托管任务",
  document: "单据处理",
  finance: "账单整理",
  monitor: "监控检查",
  market_briefing: "盘前简报",
  research: "个股研究",
  plan: "多步计划",
};

/** 回执文案：一句话确认 + 一句可核对的规模，不写会过期的细节。 */
export function receiptForTask(task: Pick<AgentTask, "title" | "kind" | "plan">): string {
  const title = task.title.trim().replace(/\s+/g, " ").slice(0, 60);
  const kind = KIND_LABELS[task.kind] ?? "任务";
  const steps = task.plan?.length ?? 0;
  const scope = steps > 0 ? `${kind}分 ${steps} 步跑` : `${kind}已经在跑`;
  return `好，我去办：${title}。${scope}，出结果我在这儿叫你。`;
}

export interface ReceiptInput {
  stream?: ConversationStream;
  owner: string;
  threadId: string;
  runId: string;
  text: string;
}

/**
 * 往会话流里补一条完整的助手文本消息（START → CONTENT → END）。
 *
 * 用独立 messageId 保证它是一条独立气泡，不会和模型这一轮的正式回复串在一起。
 * 任何失败都只记日志：回执是锦上添花，不能因为它让派发失败。
 */
export async function publishReceipt(input: ReceiptInput): Promise<boolean> {
  if (!input.stream || !input.threadId.trim()) return false;
  const messageId = `receipt-${randomUUID()}`;
  try {
    await input.stream.publish(input.owner, input.threadId, input.runId, {
      type: EventType.TEXT_MESSAGE_START,
      messageId,
      role: "assistant",
    });
    await input.stream.publish(input.owner, input.threadId, input.runId, {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId,
      delta: input.text,
    });
    await input.stream.publish(input.owner, input.threadId, input.runId, {
      type: EventType.TEXT_MESSAGE_END,
      messageId,
    });
    return true;
  } catch (error) {
    backgroundFailure("conversation.receipt", error);
    return false;
  }
}
