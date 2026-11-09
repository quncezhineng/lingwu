import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createApp } from "../apps/server/src/app.ts";
import { createStore } from "../apps/server/src/db.ts";
import { normalizeChatBrief } from "../apps/server/src/engine/report-brief.ts";
import { type AgentArtifact, artifactChatBrief } from "../packages/domain/src/agent.ts";

test("模型摘要去掉代码围栏，过短的结果不采用", () => {
  assert.equal(
    normalizeChatBrief("```\n三季度利润下降来自销量，不是去年同期的基数。\n```"),
    "三季度利润下降来自销量，不是去年同期的基数。",
  );
  assert.throws(() => normalizeChatBrief("太短"));
});

test("报告摘要只生成一次，并写回产物", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "lingwu-report-brief-"));
  const db = await createStore({ dataDir: join(directory, "db") });
  const server = await createApp(db, {
    mode: "sample",
    port: 8787,
    host: "127.0.0.1",
    publicUrl: "http://localhost:8787",
    dataDir: directory,
    agentBackend: "model",
    intelligenceApiKey: "test-project-key-never-sent",
    googleRedirectUri: "http://localhost:8787/api/google/callback",
    allowedOrigins: ["http://localhost:8081"],
  });
  t.after(async () => {
    await server.agent.stop();
    await db.close();
    await rm(directory, { recursive: true, force: true });
  });
  t.mock.method(server.workspace.models, "resolve", async () => ({
    model: "openai/fixture",
    configured: true,
    source: "server" as const,
  }));
  const owner = "local-user";
  const task = await server.agent.createTask(owner, {
    prompt: "分析赤峰黄金",
    title: "赤峰黄金",
  });
  const artifact = await server.agent.artifact(
    owner,
    task,
    "report",
    "赤峰黄金",
    "已按约束完成。检索共 3 次。关键成果：三季度归母净利下降 42%，公司归因于黄金销量下降。",
    { evidence: [] },
    "final",
  );
  let calls = 0;
  server.agent.summarizeForChat = async () => {
    calls += 1;
    return "三季度利润下降来自黄金销量，不是 2025 年的旧数据。";
  };
  const first = await server.agent.ensureChatBrief(owner, artifact.id);
  const second = await server.agent.ensureChatBrief(owner, artifact.id);
  assert.equal(calls, 1);
  assert.equal(artifactChatBrief(first.data), "三季度利润下降来自黄金销量，不是 2025 年的旧数据。");
  assert.equal(artifactChatBrief(second.data), artifactChatBrief(first.data));
  const stored = await db.get<AgentArtifact>(owner, "agent-artifacts", artifact.id);
  assert.equal(stored?.summary.startsWith("已按约束完成"), true);
});
