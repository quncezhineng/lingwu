import assert from "node:assert/strict";
import { test } from "node:test";
import { createStore } from "../apps/server/src/db.ts";
import { OrchestratorService } from "../apps/server/src/engine/orchestrator.ts";
import {
  assertAcyclic,
  type OrchestrationPlan,
  type OrchestrationPlanInput,
  orchestrationPlanInputSchema,
} from "../packages/domain/src/orchestration.ts";

function planInput(parentTaskId = "parent"): OrchestrationPlanInput {
  return {
    parentTaskId,
    nodes: [
      { id: "a", agentTemplate: "research", title: "研究 A", prompt: "研究 A", dependsOn: [] },
      { id: "b", agentTemplate: "macro", title: "宏观 B", prompt: "宏观 B", dependsOn: [] },
      {
        id: "c",
        agentTemplate: "research",
        title: "汇总 C",
        prompt: "汇总 C",
        dependsOn: ["a", "b"],
      },
    ],
  };
}

test("assertAcyclic accepts a valid DAG and rejects cycles", () => {
  assertAcyclic(planInput());
  assert.throws(() =>
    assertAcyclic({
      parentTaskId: "p",
      nodes: [
        { id: "a", agentTemplate: "x", title: "a", prompt: "a", dependsOn: ["b"] },
        { id: "b", agentTemplate: "x", title: "b", prompt: "b", dependsOn: ["a"] },
      ],
    }),
  );
  assert.throws(() =>
    assertAcyclic({
      parentTaskId: "p",
      nodes: [{ id: "a", agentTemplate: "x", title: "a", prompt: "a", dependsOn: ["missing"] }],
    }),
  );
  assert.throws(() =>
    assertAcyclic({
      parentTaskId: "p",
      nodes: [{ id: "a", agentTemplate: "x", title: "a", prompt: "a", dependsOn: ["a"] }],
    }),
  );
});

test("submit enqueues only zero-indegree nodes", async () => {
  const db = await createStore();
  try {
    const created: string[] = [];
    const svc = new OrchestratorService(db, {
      createSubtask: async (_owner, _plan, node) => {
        created.push(node.id);
        return `task-${node.id}`;
      },
      finalize: async () => undefined,
      notifyFailed: async () => undefined,
    });
    const plan = await svc.plan("owner", planInput());
    await svc.submit("owner", plan);

    assert.deepEqual(created.sort(), ["a", "b"]);
    const saved = await db.get<OrchestrationPlan>("owner", "orchestration_plans", plan.id);
    assert.equal(saved?.status, "running");
    const c = saved?.nodes.find((n) => n.id === "c");
    assert.equal(c?.status, "pending");
    const a = saved?.nodes.find((n) => n.id === "a");
    assert.equal(a?.status, "queued");
    assert.equal(a?.taskId, "task-a");
  } finally {
    await db.close();
  }
});

test("onNodeSettled unlocks downstream and finalizes when all succeed", async () => {
  const db = await createStore();
  try {
    const finalized: string[] = [];
    // createSubtask 直接落一个 succeeded 任务（带产物），便于模拟已完成的子任务。
    const svc = new OrchestratorService(db, {
      createSubtask: async (owner, _plan, node) => {
        await db.put(owner, "tasks", {
          id: `task-${node.id}`,
          title: node.title,
          prompt: node.prompt,
          kind: "agent",
          status: "succeeded",
          plan: [],
          evidence: [],
          input: {},
          state: {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          attempts: 1,
          leaseId: null,
          leaseUntil: null,
          artifactIds: [`artifact-${node.id}`],
          result: `result-${node.id}`,
        });
        return `task-${node.id}`;
      },
      finalize: async (_owner, plan) => {
        finalized.push("done");
        // 共享工作区：断言每个成功节点的产物已回填到 plan。
        const a = plan.nodes.find((n) => n.id === "a");
        const b = plan.nodes.find((n) => n.id === "b");
        const c = plan.nodes.find((n) => n.id === "c");
        assert.deepEqual(a?.artifactIds, ["artifact-a"]);
        assert.deepEqual(b?.artifactIds, ["artifact-b"]);
        assert.deepEqual(c?.artifactIds, ["artifact-c"]);
        return "merged";
      },
      notifyFailed: async () => undefined,
    });

    const plan = await svc.plan("owner", planInput());
    await svc.submit("owner", plan);
    // a、b 已被 enqueue（并落成 succeeded 任务），c 仍 pending。
    // 模拟 a、b 终态回调，解锁 c。
    await svc.onNodeSettled("owner", plan.id, "a");
    await svc.onNodeSettled("owner", plan.id, "b");

    const after = await db.get<OrchestrationPlan>("owner", "orchestration_plans", plan.id);
    const c = after?.nodes.find((n) => n.id === "c");
    assert.equal(c?.status, "queued");
    assert.equal(c?.taskId, "task-c");

    // c 终态回调 → 全部成功 → finalize。
    await svc.onNodeSettled("owner", plan.id, "c");
    const done = await db.get<OrchestrationPlan>("owner", "orchestration_plans", plan.id);
    assert.equal(done?.status, "succeeded");
    assert.equal(done?.result, "merged");
    assert.deepEqual(finalized, ["done"]);
  } finally {
    await db.close();
  }
});

test("a failed node skips its downstream and marks the plan failed", async () => {
  const db = await createStore();
  try {
    const failedNotifications: string[] = [];
    const svc = new OrchestratorService(db, {
      createSubtask: async (owner, _plan, node) => {
        // a 失败，b 成功，c 依赖 a、b。
        await db.put(owner, "tasks", {
          id: `task-${node.id}`,
          title: node.title,
          prompt: node.prompt,
          kind: "agent",
          status: node.id === "a" ? "failed" : "succeeded",
          plan: [],
          evidence: [],
          input: {},
          state: {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          attempts: 1,
          leaseId: null,
          leaseUntil: null,
          artifactIds: [],
          error: node.id === "a" ? "boom" : undefined,
        });
        return `task-${node.id}`;
      },
      finalize: async () => "should-not-run",
      notifyFailed: async (_owner, _plan, reason) => {
        failedNotifications.push(reason);
      },
    });
    const plan = await svc.plan("owner", planInput());
    await svc.submit("owner", plan);
    await svc.onNodeSettled("owner", plan.id, "a");
    await svc.onNodeSettled("owner", plan.id, "b");

    const after = await db.get<OrchestrationPlan>("owner", "orchestration_plans", plan.id);
    const c = after?.nodes.find((n) => n.id === "c");
    assert.equal(c?.status, "skipped");
    assert.equal(after?.status, "failed");
    // 编排失败应触发一次失败通知（而非逐条子任务通知）。
    assert.deepEqual(failedNotifications, ["One or more subtasks failed"]);
  } finally {
    await db.close();
  }
});

test("submit_orchestration schema (parentTaskId omitted) parses model DAG output", () => {
  // 模型调用 submit_orchestration 时传 nodes（不含 parentTaskId，由服务端回填）。
  const schema = orchestrationPlanInputSchema.omit({ parentTaskId: true });
  const parsed = schema.parse({
    nodes: [
      { id: "a", agentTemplate: "research", title: "研究 A", prompt: "研究 A", dependsOn: [] },
      { id: "c", agentTemplate: "macro", title: "汇总 C", prompt: "汇总 C", dependsOn: ["a"] },
    ],
  });
  assert.equal(parsed.nodes.length, 2);
  assert.deepEqual(parsed.nodes[1].dependsOn, ["a"]);
  // dependsOn 有默认值：缺失时回退为空数组。
  const defaulted = schema.parse({
    nodes: [{ id: "a", agentTemplate: "research", title: "a", prompt: "a" }],
  });
  assert.deepEqual(defaulted.nodes[0].dependsOn, []);
  // 空节点数组 / 缺 title 应拒绝。
  assert.throws(() => schema.parse({ nodes: [] }));
  assert.throws(() =>
    schema.parse({
      nodes: [{ id: "a", agentTemplate: "research", title: "", prompt: "a" }],
    }),
  );
});
