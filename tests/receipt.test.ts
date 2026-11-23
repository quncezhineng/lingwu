import assert from "node:assert/strict";
import { test } from "node:test";
import type { BaseEvent } from "@ag-ui/core";
import { EventType } from "@ag-ui/core";
import { publishReceipt, receiptForTask } from "../apps/server/src/engine/receipt.ts";
import type { AgentTask } from "../packages/domain/src/agent.ts";

function task(patch: Partial<AgentTask> = {}): AgentTask {
  return {
    id: "t1",
    title: "研究 英伟达",
    prompt: "研究 英伟达",
    kind: "research",
    status: "queued",
    plan: [
      { id: "0", title: "Load market data", status: "pending" },
      { id: "1", title: "Gather news and peer quotes", status: "pending" },
      { id: "2", title: "Estimate a valuation range", status: "pending" },
      { id: "3", title: "Write the report", status: "pending" },
    ],
    evidence: [],
    state: { connectionId: null },
    createdAt: "2026-11-23T02:00:00.000Z",
    updatedAt: "2026-11-23T02:00:00.000Z",
    enqueuedAt: "2026-11-23T02:00:00.000Z",
    attempts: 0,
    leaseId: null,
    leaseUntil: null,
    artifactIds: [],
    ...patch,
  } as AgentTask;
}

test("回执文案：先接住，再说清分几步，最后给出交付承诺", () => {
  const text = receiptForTask(task());
  assert.ok(text.startsWith("好，我去办：研究 英伟达。"));
  assert.match(text, /个股研究分 4 步跑/);
  assert.match(text, /出结果我在这儿叫你。/);
});

test("回执文案：超长标题截断，未知类型有兜底说法", () => {
  const text = receiptForTask(
    task({ title: "把".repeat(200), kind: "unknown_kind" as AgentTask["kind"], plan: [] }),
  );
  assert.ok(text.length < 160);
  assert.match(text, /已经在跑/);
});

test("回执：向会话流补一条独立消息（START → CONTENT → END），用同一个 messageId", async () => {
  const published: BaseEvent[] = [];
  const ok = await publishReceipt({
    stream: {
      publish: async (_owner: string, _threadId: string, _runId: string, event: BaseEvent) => {
        published.push(event);
        return event as never;
      },
    } as never,
    owner: "owner",
    threadId: "thread-1",
    runId: "run-1",
    text: "好，我去办：研究 英伟达。",
  });

  assert.equal(ok, true);
  assert.equal(published.length, 3);
  assert.equal(published[0].type, EventType.TEXT_MESSAGE_START);
  assert.equal(published[1].type, EventType.TEXT_MESSAGE_CONTENT);
  assert.equal(published[2].type, EventType.TEXT_MESSAGE_END);
  const ids = new Set(published.map((event) => (event as { messageId?: string }).messageId));
  assert.equal(ids.size, 1);
  const messageId = [...ids][0];
  assert.ok(messageId?.startsWith("receipt-"));
  assert.equal((published[1] as { delta?: string }).delta, "好，我去办：研究 英伟达。");
});

test("回执：没有会话流或没有 threadId 时安静跳过", async () => {
  assert.equal(await publishReceipt({ owner: "o", threadId: "t", runId: "r", text: "x" }), false);
  let called = false;
  const skipped = await publishReceipt({
    stream: {
      publish: async () => {
        called = true;
        return {} as never;
      },
    } as never,
    owner: "o",
    threadId: "   ",
    runId: "r",
    text: "x",
  });
  assert.equal(skipped, false);
  assert.equal(called, false);
});

test("回执：写入失败不抛错，派发流程不受影响", async () => {
  const ok = await publishReceipt({
    stream: {
      publish: async () => {
        throw new Error("ledger down");
      },
    } as never,
    owner: "o",
    threadId: "t",
    runId: "r",
    text: "x",
  });
  assert.equal(ok, false);
});
