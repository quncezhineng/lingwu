import assert from "node:assert/strict";
import test from "node:test";
import type { AgentTask } from "../../../packages/domain/src/agent.ts";
import { TASK_ANALYSIS_ACTIVE, taskStepCount } from "../src/task-analysis-logic.ts";

function makeTask(plan: AgentTask["plan"]): AgentTask {
  return {
    id: "task-1",
    title: "筛选高股息标的",
    prompt: "筛选高股息与现金流稳健的标的",
    kind: "research",
    status: "running",
    plan,
    evidence: [],
    input: {},
    state: {},
    createdAt: "2026-11-22T00:00:00.000Z",
    updatedAt: "2026-11-22T00:00:00.000Z",
    attempts: 0,
    actionId: null,
    error: null,
    artifactIds: [],
  };
}

test("分析中的状态集合只包含未进入终态的活动状态", () => {
  for (const status of ["queued", "running", "waiting_approval", "waiting_input"]) {
    assert.ok(TASK_ANALYSIS_ACTIVE.has(status as AgentTask["status"]), `${status} 应在分析中`);
  }
  for (const status of ["scheduled", "paused", "succeeded", "failed", "cancelled"]) {
    assert.ok(!TASK_ANALYSIS_ACTIVE.has(status as AgentTask["status"]), `${status} 不应在分析中`);
  }
});

test("没有步骤时返回 null", () => {
  assert.equal(taskStepCount(makeTask([])), null);
});

test("统计已完成步骤与总步骤数", () => {
  const count = taskStepCount(
    makeTask([
      { id: "s1", title: "取数", status: "succeeded" },
      { id: "s2", title: "建模", status: "running" },
      { id: "s3", title: "出稿", status: "pending" },
    ]),
  );
  assert.deepEqual(count, { done: 1, total: 3 });
});

test("全部成功时全部计入已完成", () => {
  const count = taskStepCount(
    makeTask([
      { id: "s1", title: "取数", status: "succeeded" },
      { id: "s2", title: "出稿", status: "succeeded" },
    ]),
  );
  assert.deepEqual(count, { done: 2, total: 2 });
});
