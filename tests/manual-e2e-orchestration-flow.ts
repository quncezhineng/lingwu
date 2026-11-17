/**
 * 端到端验证：完整对话流「宽泛投研请求 → submit_orchestration tool-call → DAG 拆解 →
 * 子任务调度执行 → 汇总」全链路，用真实 DeepSeek 模型。
 *
 * 与 manual-e2e-orchestration.ts 的区别：那个只测 synthesizeResearch 综合函数；
 * 这个驱动完整的 AgentService + TaskWorker，验证模型在真实 agent run 里
 * 是否真的会调用 submit_orchestration 工具（而不是直接 finish_task）。
 *
 * 运行：node --env-file=.env --import tsx tests/manual-e2e-orchestration-flow.ts
 */
import "../apps/server/src/config.ts";
import { createApp } from "../apps/server/src/app.ts";
import { readConfig } from "../apps/server/src/config.ts";
import { createStore } from "../apps/server/src/db.ts";
import type { AgentTask } from "../packages/domain/src/agent.ts";

const OWNER = "e2e-orchestration";

const MODEL = process.env.MODEL ?? "deepseek/deepseek-flash";
const API_KEY = process.env.DEEPSEEK_API_KEY?.trim();
if (!API_KEY) {
  console.error("❌ DEEPSEEK_API_KEY 未设置，无法跑真实模型。请在 .env 中配置。");
  process.exit(1);
}

// 宽泛的投研请求，需要多专家协作，应触发 submit_orchestration。
const PROMPT =
  "请对「宁德时代」做一份完整的投资研究报告，涵盖公司基本面、行业竞争格局、财务估值、以及主要风险。";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log(`\n=== 端到端验证：完整对话流（submit_orchestration tool-call）===`);
  console.log(`模型：${MODEL}`);
  console.log(`请求：${PROMPT}\n`);

  const config = readConfig();
  // 内存 PGlite，干净隔离，不碰 .lingwu/postgres 的真实数据。
  const db = await createStore();
  const { agent } = await createApp(db, config);

  try {
    await agent.ensure(OWNER);

    // 创建顶层投研任务（kind=agent，走通用模型路径，让模型判断是否拆解 DAG）。
    // 注意不能用 kind=research：那会走「符号研究」路径（需要 input.symbol），而非模型编排。
    const parent = await agent.createTask(OWNER, {
      kind: "agent",
      title: "宁德时代投资研究报告",
      prompt: PROMPT,
    });
    console.log(`✅ 顶层任务已创建：${parent.id}（status=${parent.status}）\n`);

    // 启动 worker：子任务复用 TaskWorker 的租约 + 状态机。
    agent.start();
    console.log("✅ TaskWorker 已启动，等待模型执行...\n");

    const deadline = Date.now() + 5 * 60 * 1000; // 最长等 5 分钟
    let orchestrationPlanIds: string[] = [];
    let subtaskCount = 0;
    let finalStatus = "";

    while (Date.now() < deadline) {
      await sleep(3000);

      // 观察点 1：是否已生成编排计划（证明 submit_orchestration tool-call 被触发）。
      const plans = await db.scan<{ id: string; status: string; nodes: unknown[] }>(
        "orchestration_plans",
      );
      orchestrationPlanIds = plans.map((p) => p.value.id);

      // 观察点 2：是否已生成子任务（orchestrationId 字段的 task）。
      const allTasks = await db.scan<AgentTask>("tasks");
      const subtasks = allTasks.filter((t) => t.value.orchestrationId);
      subtaskCount = subtasks.length;

      // 观察点 3：顶层任务终态。
      const top = await db.get<AgentTask>(OWNER, "tasks", parent.id);
      if (!top) break;
      finalStatus = top.status;

      // 每轮打印进度。
      console.log(
        `  [轮询] 顶层=${top.status} | 编排计划数=${orchestrationPlanIds.length} | 子任务数=${subtaskCount}`,
      );

      if (["succeeded", "failed", "cancelled"].includes(top.status)) break;
    }

    // 诊断：顶层任务失败/异常的 run-events 与 error，定位根因。
    const topNow = await db.get<AgentTask>(OWNER, "tasks", parent.id);
    if (topNow?.error) console.log(`\n⚠️ 顶层任务 error：${topNow.error}`);
    const events = await db.scan<{ taskId: string; kind: string; title: string; detail: string }>(
      "run-events",
    );
    for (const e of events.filter((e) => e.value.taskId === parent.id)) {
      console.log(`  EVENT [${e.value.kind}] ${e.value.title}: ${e.value.detail}`);
    }

    console.log("\n=== 验证结果 ===");

    // 检查 1：模型是否调用了 submit_orchestration（生成了编排计划）。
    const plans = await db.scan<{
      id: string;
      status: string;
      nodes: { id: string; status: string }[];
    }>("orchestration_plans");
    const check1 = plans.length > 0;
    console.log(
      `  ${check1 ? "✅" : "❌"} submit_orchestration 被触发（编排计划 ${plans.length} 个）`,
    );

    // 检查 2：DAG 是否拆解出多个节点（>1 个专家子任务）。
    const nodeCount = plans.reduce((sum, p) => sum + p.value.nodes.length, 0);
    const check2 = nodeCount > 1;
    console.log(`  ${check2 ? "✅" : "❌"} DAG 拆解出多个节点（共 ${nodeCount} 个）`);

    // 检查 3：是否生成了带编排字段的子任务。
    const allTasks = await db.scan<AgentTask>("tasks");
    const subtasks = allTasks.filter((t) => t.value.orchestrationId);
    const check3 = subtasks.length > 0;
    console.log(
      `  ${check3 ? "✅" : "❌"} 生成了子任务（${subtasks.length} 个，含 orchestrationId）`,
    );

    // 检查 4：顶层任务是否进入终态，且有结果或明确失败原因。
    const top = await db.get<AgentTask>(OWNER, "tasks", parent.id);
    const check4 = top?.status === "succeeded" || top?.status === "failed";
    console.log(
      `  ${check4 ? "✅" : "❌"} 顶层任务进入终态（status=${top?.status}，result 长度=${top?.result?.length ?? 0}）`,
    );

    // 汇总子任务状态，便于判断。
    console.log("\n=== 子任务终态明细 ===");
    for (const { value: t } of subtasks) {
      console.log(`  - ${t.title} → ${t.status}（agent=${t.assignedAgent}）`);
    }

    // 顶层结果预览。
    if (top?.result) {
      console.log("\n=== 顶层任务最终结果（前 1200 字）===");
      console.log("─".repeat(70));
      console.log(top.result.slice(0, 1200));
      console.log("─".repeat(70));
    }

    const allPass = check1 && check2 && check3 && check4;
    console.log(`\n${allPass ? "✅ 全部通过" : "⚠️ 部分检查未通过"}`);
    process.exit(allPass ? 0 : 1);
  } finally {
    await agent.stop();
    await db.close();
  }
}

main().catch((error) => {
  console.error("❌ 端到端验证失败：", error);
  process.exit(1);
});
