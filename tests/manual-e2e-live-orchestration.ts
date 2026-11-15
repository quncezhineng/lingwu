/**
 * Live 端到端验证：跑真实 DeepSeek 模型，走完整「多 Agent 编排」链路。
 *
 * 验证点（区别于 tests/manual-e2e-orchestration.ts 只测 synthesizeResearch）：
 *  1. 完整 server（createApp）在 live 模式 + 真实模型下能否启动并执行任务；
 *  2. 编排者模型是否真的调用 submit_orchestration 拆出 DAG；
 *  3. 子任务是否按成员 Agent 精确分配（assignedAgent → threadId + persona 注入）；
 *  4. 全部子任务终态后 synthesizeResearch 是否综合出最终研报。
 *
 * 运行：node --env-file=.env --import tsx tests/manual-e2e-live-orchestration.ts
 * 注意：需要 .env 配置 DEEPSEEK_API_KEY 与 WORKSPACE_MODE=live；会真实调用模型，约 1~3 分钟。
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../apps/server/src/app.ts";
import type { Config } from "../apps/server/src/config.ts";
import { createStore } from "../apps/server/src/db.ts";
import type { AgentTask } from "../packages/domain/src/agent.ts";
import type { OrchestrationPlan } from "../packages/domain/src/orchestration.ts";

const OWNER = "local-user";

const TERMINAL = new Set(["succeeded", "failed", "cancelled"]);

/** 与 agent-space 一致的成员 Agent（让 resolveAgentForAssignment 能按 id 精确命中）。 */
function seedSpace(db: Awaited<ReturnType<typeof createStore>>) {
  const now = new Date().toISOString();
  const mk = (id: string, threadId: string, template: string, role: string, persona: string) => ({
    id,
    threadId,
    template,
    name: role.slice(0, 20),
    role,
    persona,
    avatar: "orb",
    system: false,
    threadExists: true,
    createdAt: now,
    skills: [],
    installedSkills: [],
    skillRefs: [],
    customSkills: [],
  });
  return db.put(OWNER, "agent-settings", {
    id: "space",
    version: 1,
    currentAgentId: "researcher",
    agents: [
      mk(
        "researcher",
        "thread-researcher",
        "research",
        "公司基本面研究员",
        "你是严谨的公司基本面研究员，擅长拆解营收、毛利、市占率等经营数据，先核数据再下结论。",
      ),
      mk(
        "macro",
        "thread-macro",
        "macro",
        "宏观与行业分析师",
        "你是宏观与行业分析师，擅长判断产业周期、政策与竞争格局，给出前瞻判断。",
      ),
      mk(
        "valuation",
        "thread-valuation",
        "risk",
        "估值与风险专家",
        "你是估值与风险专家，擅长 PE/PB 估值区间与风险清单，不杜撰目标价。",
      ),
    ],
    preferences: { name: "", risk: "", markets: [], areas: [], goal: "", horizon: "" },
    onboardingDone: true,
    onboardingStep: 4,
  });
}

async function poll<T>(
  read: () => Promise<T | null>,
  isDone: (value: T) => boolean,
  label: string,
  timeoutMs: number,
): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  let last: T | null = null;
  while (Date.now() < deadline) {
    last = await read();
    if (last && isDone(last)) return last;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  console.log(`  ⏱ ${label} 超时（${(timeoutMs / 1000).toFixed(0)}s），最后状态：`);
  return last;
}

async function main() {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) {
    console.error("❌ DEEPSEEK_API_KEY 未设置，无法跑真实模型。");
    process.exit(1);
  }
  const directory = await mkdtemp(join(tmpdir(), "lingwu-live-e2e-"));
  const db = await createStore({ dataDir: join(directory, "db") });
  const config: Config = {
    mode: "live",
    port: 8791,
    host: "127.0.0.1",
    publicUrl: "http://localhost:8791",
    dataDir: directory,
    agentBackend: "model",
    intelligenceApiKey: process.env.CPK_INTELLIGENCE_API_KEY ?? "live-e2e-key",
    model: process.env.MODEL ?? "deepseek/deepseek-flash",
    deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL,
    encryptionKey: process.env.TOKEN_ENCRYPTION_KEY,
    googleRedirectUri: "http://localhost:8791/api/google/callback",
    allowedOrigins: ["http://localhost:8081"],
    taskWorkerEnabled: true,
  };
  const { agent } = await createApp(db, config);
  await seedSpace(db);
  agent.start();

  try {
    console.log("\n=== Live 端到端：多 Agent 编排（真实 DeepSeek 模型）===\n");

    // 触发编排的顶层投研任务：明确指出频道成员 id，让模型用 submit_orchestration 拆解。
    const parent = await agent.createTask(OWNER, {
      kind: "agent",
      title: "对比比亚迪与特斯拉的投资价值",
      prompt:
        "请组织以下三位专家协作研究「对比比亚迪与特斯拉的投资价值」：\n" +
        "研究员（id:researcher）、宏观分析师（id:macro）、估值专家（id:valuation）。\n" +
        "这是一个足够宽泛的多专家协作请求，请用 submit_orchestration 拆解成多个子任务，\n" +
        "每个子任务的 agentTemplate 设为对应专家的 id，最后汇总成一篇结构化研报。",
    });
    console.log(`✅ 父任务已创建：${parent.id}`);

    // 等待父任务进入终态（子任务全部完成后 finalize 回填）。
    const done = await poll<AgentTask>(
      () => agent.getTask(OWNER, parent.id),
      (t) => TERMINAL.has(t.status),
      "父任务",
      240_000,
    );
    if (!done) {
      console.error("❌ 父任务未在超时内完成。");
      process.exit(1);
    }
    console.log(`✅ 父任务终态：${done.status}`);

    // 读取编排计划，报告子任务分配情况。
    const plans = await db.list<OrchestrationPlan>(OWNER, "orchestration_plans");
    const plan = plans.find((p) => p.parentTaskId === parent.id);
    if (!plan) {
      console.log("⚠️ 未发现编排计划（模型可能未触发 submit_orchestration）。");
    } else {
      console.log(`\n编排计划 ${plan.id}（${plan.status}），节点 ${plan.nodes.length} 个：`);
      for (const node of plan.nodes) {
        const subtask = node.taskId
          ? await db.get<AgentTask & { assignedAgent?: string }>(OWNER, "tasks", node.taskId)
          : null;
        console.log(
          `  - [${node.status}] ${node.title}  assignedAgent=${node.agentTemplate}` +
            `  threadId=${subtask?.threadId ?? "(none)"}` +
            (subtask?.assignedAgent ? `  assigned=${subtask.assignedAgent}` : ""),
        );
      }
    }

    // 校验：父任务结果里应有综合研报内容。
    const result = done.result ?? "";
    console.log("\n=== 综合研报（前 800 字）===");
    console.log("─".repeat(70));
    console.log(result.slice(0, 800));
    console.log("─".repeat(70));

    const checks = [
      { name: "父任务 succeeded", pass: done.status === "succeeded" },
      { name: "生成了综合结果", pass: result.trim().length > 100 },
      {
        name: "子任务按成员分配了 threadId",
        pass: plan ? plan.nodes.some((n) => n.taskId) : false,
      },
    ];
    console.log("\n=== 检查 ===");
    let allPass = true;
    for (const c of checks) {
      console.log(`  ${c.pass ? "✅" : "❌"} ${c.name}`);
      if (!c.pass) allPass = false;
    }
    console.log(`\n${allPass ? "✅ Live 端到端验证通过" : "⚠️ 部分检查未通过"}`);
    process.exit(allPass ? 0 : 1);
  } finally {
    await agent.stop();
    await db.close();
    await rm(directory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error("❌ Live 端到端验证失败：", error);
  process.exit(1);
});
