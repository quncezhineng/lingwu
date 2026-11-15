import { randomUUID } from "node:crypto";
import {
  assertAcyclic,
  NODE_TERMINAL,
  type OrchestrationNode,
  type OrchestrationNodeStatus,
  type OrchestrationPlan,
  type OrchestrationPlanInput,
  PLAN_TERMINAL,
} from "../../../../packages/domain/src/orchestration.ts";
import type { Store } from "../db.ts";
import { backgroundFailure } from "../log.ts";

/**
 * 多 Agent 编排服务（M2）。
 *
 * 职责：把一个顶层投研任务拆解为 DAG 子任务，按拓扑序调度、解锁依赖、汇总成果。
 * 调度本身复用现有 TaskWorker（子任务以普通 AgentTask 落盘、走租约/状态机），
 * 本服务只负责「拆解 + 依赖 + 汇总」，不重造调度器。
 *
 * 依赖注入两个回调，避免与 Service 形成循环依赖：
 *   - createSubtask：把节点落成一个 AgentTask（复用 Service.createTask，带编排字段）
 *   - finalize：全部节点终态后，触发汇总 Agent 产出最终成果
 */
export interface OrchestratorDeps {
  /** 创建并落盘一个子任务，返回其 task id。 */
  createSubtask: (
    owner: string,
    plan: OrchestrationPlan,
    node: OrchestrationNode,
  ) => Promise<string>;
  /** 全部节点终态后，生成汇总成果并回填 plan.result。 */
  finalize: (owner: string, plan: OrchestrationPlan) => Promise<string | undefined>;
  /** 编排失败（fail-fast 或 finalize 异常）时，通知用户父任务失败。 */
  notifyFailed: (owner: string, plan: OrchestrationPlan, reason: string) => Promise<void>;
}

export class OrchestratorService {
  constructor(
    private readonly db: Store,
    private readonly deps: OrchestratorDeps,
  ) {}

  /** 顶层任务落盘前，先解析意图产出 DAG 计划（由编排者 Agent 调用）。 */
  async plan(owner: string, input: OrchestrationPlanInput): Promise<OrchestrationPlan> {
    assertAcyclic(input);
    const now = new Date().toISOString();
    const plan: OrchestrationPlan = {
      id: randomUUID(),
      parentTaskId: input.parentTaskId,
      nodes: input.nodes.map((n) => ({
        id: n.id,
        agentTemplate: n.agentTemplate,
        title: n.title,
        prompt: n.prompt,
        dependsOn: n.dependsOn,
        status: "pending",
      })),
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };
    await this.db.put(owner, "orchestration_plans", plan);
    return plan;
  }

  /** 提交计划：入度 0 的节点生成子任务置 queued，其余 pending 等待依赖。 */
  async submit(owner: string, plan: OrchestrationPlan): Promise<OrchestrationPlan> {
    await this.db.put(owner, "orchestration_plans", {
      ...plan,
      status: "running",
      updatedAt: new Date().toISOString(),
    });
    const ready = plan.nodes.filter((n) => n.dependsOn.length === 0);
    await this.enqueueReady(owner, plan, ready);
    return (await this.db.get<OrchestrationPlan>(owner, "orchestration_plans", plan.id)) ?? plan;
  }

  /**
   * 子任务终态回调（挂在 TaskWorker 的 settled 上）。
   * 解锁依赖该节点的下游节点；当所有节点终态后触发汇总。
   */
  async onNodeSettled(owner: string, planId: string, nodeId: string): Promise<void> {
    const plan = await this.db.get<OrchestrationPlan>(owner, "orchestration_plans", planId);
    if (!plan || PLAN_TERMINAL.has(plan.status)) return;

    const node = plan.nodes.find((n) => n.id === nodeId);
    if (!node || NODE_TERMINAL.has(node.status)) return;

    // 依据子任务实际落盘状态同步节点状态，并回填子任务结果（供前端按成员渲染回复）。
    const task = node.taskId
      ? await this.db.get<{ status: string; artifactIds?: string[]; result?: string }>(
          owner,
          "tasks",
          node.taskId,
        )
      : null;
    const nodeStatus: OrchestrationNodeStatus = task
      ? task.status === "succeeded"
        ? "succeeded"
        : task.status === "failed" || task.status === "cancelled"
          ? "failed"
          : node.status
      : node.status;
    if (!NODE_TERMINAL.has(nodeStatus)) return;

    const nodes = plan.nodes.map((n) =>
      n.id === nodeId
        ? {
            ...n,
            status: nodeStatus,
            artifactIds: task?.artifactIds ?? n.artifactIds,
            result: task?.result ?? n.result,
          }
        : n,
    );
    const updated: OrchestrationPlan = { ...plan, nodes, updatedAt: new Date().toISOString() };

    // 失败策略：fail-fast —— 该节点的所有下游标记 skipped。
    const failedIds = new Set(nodes.filter((n) => n.status === "failed").map((n) => n.id));
    let withSkips = nodes;
    if (failedIds.size > 0) {
      const skipped = new Set<string>();
      // 从失败节点出发，传播跳过其下游。
      const queue = [...failedIds];
      while (queue.length) {
        const id = queue.shift();
        if (!id) break;
        for (const n of withSkips) {
          if (n.dependsOn.includes(id) && !skipped.has(n.id) && !NODE_TERMINAL.has(n.status)) {
            skipped.add(n.id);
            queue.push(n.id);
          }
        }
      }
      withSkips = withSkips.map((n) =>
        skipped.has(n.id) ? { ...n, status: "skipped" as const } : n,
      );
    }

    // 解锁：依赖已全部成功的节点 → 生成子任务置 queued。
    const ready = withSkips.filter(
      (n) =>
        n.status === "pending" &&
        n.dependsOn.every((d) => withSkips.find((x) => x.id === d)?.status === "succeeded"),
    );
    await this.db.put(owner, "orchestration_plans", { ...updated, nodes: withSkips });

    if (ready.length > 0) await this.enqueueReady(owner, { ...updated, nodes: withSkips }, ready);

    await this.maybeFinalize(owner, planId);
  }

  /** 入度为 0 的节点 → 生成子任务，节点回填 taskId 并置 queued。 */
  private async enqueueReady(
    owner: string,
    plan: OrchestrationPlan,
    nodes: OrchestrationNode[],
  ): Promise<void> {
    for (const node of nodes) {
      try {
        const taskId = await this.deps.createSubtask(owner, plan, node);
        const latest = await this.db.get<OrchestrationPlan>(owner, "orchestration_plans", plan.id);
        if (!latest) return;
        const nextNodes = latest.nodes.map((n) =>
          n.id === node.id ? { ...n, taskId, status: "queued" as const } : n,
        );
        await this.db.put(owner, "orchestration_plans", {
          ...latest,
          nodes: nextNodes,
          updatedAt: new Date().toISOString(),
        });
      } catch (error) {
        backgroundFailure(`enqueue orchestration node ${node.id}`, error);
      }
    }
  }

  /** 所有节点终态 → 触发汇总，回填 plan.result 并置 succeeded/failed。 */
  private async maybeFinalize(owner: string, planId: string): Promise<void> {
    const plan = await this.db.get<OrchestrationPlan>(owner, "orchestration_plans", planId);
    if (!plan || PLAN_TERMINAL.has(plan.status)) return;
    if (!plan.nodes.every((n) => NODE_TERMINAL.has(n.status))) return;

    const allSucceeded = plan.nodes.every((n) => n.status === "succeeded");
    if (!allSucceeded) {
      await this.db.put(owner, "orchestration_plans", {
        ...plan,
        status: "failed",
        updatedAt: new Date().toISOString(),
      });
      await this.deps.notifyFailed(owner, plan, "One or more subtasks failed");
      return;
    }
    try {
      const result = await this.deps.finalize(owner, plan);
      await this.db.put(owner, "orchestration_plans", {
        ...plan,
        status: "succeeded",
        result,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      backgroundFailure(`finalize orchestration plan ${planId}`, error);
      await this.db.put(owner, "orchestration_plans", {
        ...plan,
        status: "failed",
        updatedAt: new Date().toISOString(),
      });
      await this.deps.notifyFailed(owner, plan, "Failed to synthesize the final result");
    }
  }
}
