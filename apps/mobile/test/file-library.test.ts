import assert from "node:assert/strict";
import { test } from "node:test";
import type { Artifact } from "../../../packages/domain/src";
import type { AgentArtifact } from "../../../packages/domain/src/agent.ts";
import {
  buildFileLibrary,
  fileSourceBucket,
  filterArtifacts,
  filterFileLibrary,
  groupArtifactsByAgent,
  markdownExcerpt,
  UNASSIGNED_AGENT_ID,
} from "../src/file-library.ts";

function file(id: string, createdAt: string): Artifact {
  return {
    id,
    name: `${id}.pdf`,
    mimeType: "application/pdf",
    size: 10,
    pageCount: 1,
    url: "",
    createdAt,
    source: "Test",
  };
}

function artifact(id: string, createdAt: string): AgentArtifact {
  return {
    id,
    taskId: `task-${id}`,
    kind: "report",
    title: id,
    summary: "",
    data: {},
    createdAt,
  };
}

test("the files library includes every generated research artifact without dropping files", () => {
  const library = buildFileLibrary(
    [file("older-file", "2026-10-24T08:00:00.000Z"), file("new-file", "2026-10-26T08:00:00.000Z")],
    [
      artifact("older-report", "2026-10-23T08:00:00.000Z"),
      artifact("new-report", "2026-10-25T08:00:00.000Z"),
    ],
  );

  assert.deepEqual(
    library.files.map((item) => item.id),
    ["new-file", "older-file"],
  );
  assert.deepEqual(
    library.artifacts.map((item) => item.id),
    ["new-report", "older-report"],
  );
});

test("research card excerpts remove Markdown syntax and stay bounded", () => {
  const excerpt = markdownExcerpt(
    "## 结论\n\n**已完成**，详见 [报告](https://example.com)。\n\n文件名 `report_2026_09.html`",
    60,
  );
  assert.equal(excerpt, "结论 已完成，详见 报告。 文件名 report_2026_09.html");
});

test("uploads are separated from analysis-generated files", () => {
  assert.equal(fileSourceBucket({ source: "Uploaded by you" }), "upload");
  assert.equal(fileSourceBucket({ source: " upload " }), "upload");
  assert.equal(fileSourceBucket({ source: "analysis" }), "analysis");
  assert.equal(fileSourceBucket({ source: "mail" }), "analysis");
});

test("file filters combine source, format and a case-insensitive name query", () => {
  const uploadedPdf = {
    ...file("annual-report", "2026-10-26T08:00:00.000Z"),
    name: "Annual Report.pdf",
    source: "Uploaded by you",
  };
  const generatedHtml = {
    ...file("market-notes", "2026-10-27T08:00:00.000Z"),
    name: "Market Notes.html",
    mimeType: "text/html",
    source: "analysis",
  };
  const generatedPdf = {
    ...file("earnings", "2026-10-28T08:00:00.000Z"),
    name: "Earnings.pdf",
    source: "analysis",
  };
  const uploadedMarkdown = {
    ...file("research-notes", "2026-10-28T09:00:00.000Z"),
    name: "Research Notes.md",
    mimeType: "text/markdown",
    source: "Uploaded by you",
  };
  const generatedWord = {
    ...file("board-pack", "2026-10-28T10:00:00.000Z"),
    name: "Board Pack.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    source: "analysis",
  };
  const files = [uploadedPdf, generatedHtml, generatedPdf, uploadedMarkdown, generatedWord];

  assert.deepEqual(
    filterFileLibrary(files, { source: "analysis", format: "all", query: "" }).map(
      (item) => item.id,
    ),
    ["market-notes", "earnings", "board-pack"],
  );
  assert.deepEqual(
    filterFileLibrary(files, { source: "all", format: "pdf", query: "REPORT" }).map(
      (item) => item.id,
    ),
    ["annual-report"],
  );
  assert.deepEqual(filterFileLibrary(files, { source: "upload", format: "html", query: "" }), []);
  assert.deepEqual(
    filterFileLibrary(files, { source: "upload", format: "markdown", query: "notes" }).map(
      (item) => item.id,
    ),
    ["research-notes"],
  );
  assert.deepEqual(
    filterFileLibrary(files, { source: "all", format: "word", query: "" }).map((item) => item.id),
    ["board-pack"],
  );
});

test("analysis outputs are grouped by the agent that produced them", () => {
  const agents = [
    { id: "analyst", name: "分析师", threadId: "thread-analyst" },
    { id: "scout", name: "侦察员", threadId: "thread-scout" },
  ];
  const tasks = [
    { id: "task-a1", threadId: "thread-analyst" },
    { id: "task-a2", threadId: "thread-analyst" },
    { id: "task-s1", threadId: "thread-scout" },
    // 无 threadId 也无系统产出标记的任务，归属不到具体智能体。
    { id: "task-cron" },
  ];
  const artifacts: AgentArtifact[] = [
    { ...artifact("a1", "2026-10-26T08:00:00.000Z"), taskId: "task-a1" },
    { ...artifact("a2", "2026-10-27T08:00:00.000Z"), taskId: "task-a2" },
    { ...artifact("s1", "2026-10-28T08:00:00.000Z"), taskId: "task-s1" },
    { ...artifact("cron", "2026-10-29T08:00:00.000Z"), taskId: "task-cron" },
  ];

  const groups = groupArtifactsByAgent(artifacts, tasks, agents, "未归属智能体");

  assert.deepEqual(
    groups.map((group) => [group.agentId, group.agentName]),
    [
      ["scout", "侦察员"],
      ["analyst", "分析师"],
      [UNASSIGNED_AGENT_ID, "未归属智能体"],
    ],
  );
  // 组内按时间倒序，未归属分组始终排在最后。
  assert.deepEqual(
    groups[1].artifacts.map((item) => item.id),
    ["a2", "a1"],
  );
  assert.deepEqual(
    groups[2].artifacts.map((item) => item.id),
    ["cron"],
  );
});

test("system-produced tasks without a thread group under 小悟 instead of unassigned", () => {
  const agents = [
    { id: "system-agent", name: "小悟", threadId: "thread-main" },
    { id: "analyst", name: "分析师", threadId: "thread-analyst" },
  ];
  const tasks = [
    // 后台定时市场简报、计划任务、多 Agent 编排根任务都没有发起对话线程，
    // 但产物由系统智能体统筹完成，应兜底归入小悟。
    { id: "task-brief", kind: "market_briefing" as const },
    { id: "task-plan", kind: "plan" as const },
    { id: "task-orch", orchestrationId: "plan-1" },
    { id: "task-mystery" },
  ];
  const artifacts: AgentArtifact[] = [
    { ...artifact("brief", "2026-11-22T08:00:00.000Z"), taskId: "task-brief" },
    { ...artifact("plan", "2026-11-21T08:00:00.000Z"), taskId: "task-plan" },
    { ...artifact("orch", "2026-11-20T08:00:00.000Z"), taskId: "task-orch" },
    { ...artifact("mystery", "2026-11-19T08:00:00.000Z"), taskId: "task-mystery" },
  ];

  const groups = groupArtifactsByAgent(artifacts, tasks, agents, "未归属智能体");

  assert.deepEqual(
    groups.map((group) => [group.agentId, group.agentName]),
    [
      ["system-agent", "小悟"],
      [UNASSIGNED_AGENT_ID, "未归属智能体"],
    ],
  );
  // 系统产出按时间倒序归入小悟，其余无法追溯的仍留在未归属分组。
  assert.deepEqual(
    groups[0].artifacts.map((item) => item.id),
    ["brief", "plan", "orch"],
  );
  assert.deepEqual(
    groups[1].artifacts.map((item) => item.id),
    ["mystery"],
  );
});

test("channel-produced artifacts group by channel instead of 小悟 or unassigned", () => {
  const agents = [
    { id: "system-agent", name: "小悟", threadId: "thread-main" },
    { id: "analyst", name: "分析师", threadId: "thread-analyst" },
  ];
  const tasks = [
    // 频道编排子任务：threadId 恰好匹配成员线程，但 input 带 channelId，应归频道而非小悟。
    { id: "task-c1", threadId: "thread-main", input: { channelId: "chan-1" } },
    // 频道编排根任务：没有 threadId，但也要按 input.channelId 归频道，而不是落小悟/未归属。
    { id: "task-c2", orchestrationId: "plan-1", input: { channelId: "chan-1" } },
    // 频道数据缺失时的兜底：用频道占位名展示。
    { id: "task-c3", threadId: "thread-main", input: { channelId: "chan-ghost" } },
    // 没有 channelId 的普通任务仍按线程归属智能体。
    { id: "task-plain", threadId: "thread-analyst" },
  ];
  const artifacts: AgentArtifact[] = [
    { ...artifact("c1", "2026-11-22T08:00:00.000Z"), taskId: "task-c1" },
    { ...artifact("c2", "2026-11-21T08:00:00.000Z"), taskId: "task-c2" },
    { ...artifact("c3", "2026-11-20T08:00:00.000Z"), taskId: "task-c3" },
    { ...artifact("plain", "2026-11-19T08:00:00.000Z"), taskId: "task-plain" },
  ];
  const channelLabels = new Map([["chan-1", "AI 产业研究频道"]]);

  const groups = groupArtifactsByAgent(
    artifacts,
    tasks,
    agents,
    "未归属智能体",
    channelLabels,
    "频道",
  );

  assert.deepEqual(
    groups.map((group) => [group.agentId, group.agentName]),
    [
      ["channel:chan-1", "AI 产业研究频道"],
      ["channel:chan-ghost", "频道"],
      ["analyst", "分析师"],
    ],
  );
  // 频道组内按时间倒序，且不再出现小悟 / 未归属分组。
  assert.deepEqual(
    groups[0].artifacts.map((item) => item.id),
    ["c1", "c2"],
  );
  assert.deepEqual(
    groups[2].artifacts.map((item) => item.id),
    ["plain"],
  );
});

test("artifact search matches the report title case-insensitively", () => {
  const items: AgentArtifact[] = [
    { ...artifact("alpha", "2026-10-26T08:00:00.000Z"), title: "NVIDIA 估值报告" },
    { ...artifact("beta", "2026-10-27T08:00:00.000Z"), title: "Market Briefing" },
  ];

  assert.deepEqual(
    filterArtifacts(items, { query: "nvidia" }).map((item) => item.id),
    ["alpha"],
  );
  assert.deepEqual(
    filterArtifacts(items, { query: "brief" }).map((item) => item.id),
    ["beta"],
  );
  assert.equal(filterArtifacts(items, { query: "  " }).length, 2);
  assert.deepEqual(filterArtifacts(items, { query: "missing" }), []);
});
