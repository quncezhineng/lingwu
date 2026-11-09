import assert from "node:assert/strict";
import test from "node:test";
import { briefsForTasks, queuedBrief } from "../src/queued-brief.ts";

test("已排队说明拆成标题和正文", () => {
  const brief = queuedBrief("已排队（任务号 13860b36）。\n标的：赤峰黄金\n四个方面：");
  assert.equal(brief?.headline, "已排队（任务号 13860b36）。");
  assert.match(brief?.body ?? "", /^标的：赤峰黄金/);
});

test("普通回复不是已排队卡", () => {
  assert.equal(queuedBrief("需要先知道你指哪只股票。"), null);
});

test("按任务号前缀把说明挂到对应任务", () => {
  const taskId = "13860b36abcdef";
  const briefs = briefsForTasks([
    { role: "user", content: "分析赤峰黄金" },
    {
      role: "assistant",
      content: "",
      toolCalls: [{ id: "call-1", function: { name: "delegate_task" } }],
    },
    { role: "tool", toolCallId: "call-1", content: JSON.stringify({ id: taskId }) },
    {
      role: "assistant",
      content: "已排队（任务号 13860b36）。\n标的：赤峰黄金",
    },
  ]);
  assert.equal(briefs.get(taskId)?.headline, "已排队（任务号 13860b36）。");
});

test("紧凑工具调用也能对上任务", () => {
  const taskId = "c42ef19dffff";
  const briefs = briefsForTasks([
    { role: "user", content: "看走势" },
    { role: "assistant", content: "", toolCalls: [{ id: "call-2", name: "delegate_task" }] },
    { role: "tool", toolCallId: "call-2", content: JSON.stringify({ taskId }) },
    { role: "assistant", content: "已排队（任务号 c42ef19d）。\n只看价格" },
  ]);
  assert.equal(briefs.get(taskId)?.body, "只看价格");
});
