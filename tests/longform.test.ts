import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type TestContext, test } from "node:test";
import { createStore, type Store } from "../apps/server/src/db.ts";
import {
  foldLongformReply,
  longformContextLine,
  readArtifact,
  saveLongformArtifact,
  threadLongformContext,
} from "../apps/server/src/engine/longform.ts";
import { type AgentArtifact, artifactChatBrief } from "../packages/domain/src/agent.ts";
import {
  clipBrief,
  isLongformReply,
  LONGFORM_CHARS,
  longformBriefOf,
  longformOutline,
  longformReference,
  longformTitle,
} from "../packages/domain/src/longform.ts";

const OWNER = "owner-longform";

/** 一篇结构完整、字数过线的报告：标题、章节、可命中的数字段落。 */
const REPORT = [
  "# 宁德时代三季度跟踪",
  "",
  "## 一、核心结论",
  "",
  `储能出货超预期，海外订单能见度提升到明年二季度。${"动力电池价格战在二线厂商先停，龙头份额反而回升。".repeat(58)}`,
  "",
  "## 二、财务与估值",
  "",
  "三季度毛利率 32.4%，环比提升 1.8 个百分点；经营现金流 286 亿元。",
  "",
  `资本开支同比下滑，折旧压力在明年释放。${"海外产能爬坡慢于预期，但单位成本已经低于国内。".repeat(24)}`,
  "",
  "## 三、风险",
  "",
  "欧洲碳关税落地节奏、以及大客户自建产能是两条主要风险线。",
].join("\n");

async function withDb(t: TestContext): Promise<Store> {
  const directory = await mkdtemp(join(tmpdir(), "lingwu-longform-"));
  const db = await createStore({ dataDir: join(directory, "db") });
  t.after(() => rm(directory, { recursive: true, force: true }));
  return db;
}

test("长文判定：字数、结构与代码块", () => {
  assert.equal(isLongformReply("在的，我看一下。"), false);
  assert.equal(REPORT.length >= LONGFORM_CHARS, true);
  assert.equal(isLongformReply(REPORT), true);

  // 字数接近硬线但已有三个章节：已经是文档，不等到 2000 字才折叠。
  const structured = `# 结论\n\n${"一句话结论。".repeat(170)}\n\n## 依据\n\n${"依据说明。".repeat(170)}\n\n## 风险\n\n${"风险提示。".repeat(10)}`;
  assert.equal(structured.length < LONGFORM_CHARS, true);
  assert.equal(structured.length >= 1800, true);
  assert.equal(isLongformReply(structured), true);

  // 同样字数、没有结构的纯段落不折叠。
  const prose = "这是一段连贯的分析，没有小标题。".repeat(115);
  assert.equal(prose.length >= 1800 && prose.length < LONGFORM_CHARS, true);
  assert.equal(isLongformReply(prose), false);

  // 代码块里的 # 是注释，不算章节结构。
  const code = `说明文字。${"补充说明。".repeat(360)}\n\n\`\`\`\n# not a heading\n## also not\n\`\`\``;
  assert.equal(code.length >= 1800, true);
  assert.equal(isLongformReply(code), false);
});

test("标题与大纲：优先标题行，跳过代码块", () => {
  assert.equal(longformTitle(REPORT, "兜底标题"), "宁德时代三季度跟踪");
  assert.deepEqual(longformOutline(REPORT), [
    "宁德时代三季度跟踪",
    "一、核心结论",
    "二、财务与估值",
    "三、风险",
  ]);
  assert.equal(longformTitle("没有标题的一段话。", "兜底标题"), "没有标题的一段话。");
  assert.equal(longformTitle("   ", "兜底标题"), "兜底标题");
  assert.deepEqual(longformOutline("```\n# 代码里的井号\n```\n\n# 真标题"), ["真标题"]);
});

test("降级摘要停在句号，额度用不完就整段返回", () => {
  assert.equal(clipBrief("短句。"), "短句。");
  const long = `${"第一句说明结论。".repeat(10)}`;
  const clipped = clipBrief(long, 40);
  assert.equal(clipped.length <= 40, true);
  assert.equal(clipped.endsWith("。"), true);
});

test("引用行带 artifact id、字数与章节，模型据此决定回读", () => {
  const line = longformReference({
    id: "abc123",
    title: "宁德时代三季度跟踪",
    chars: 3200,
    outline: ["一、核心结论", "二、财务与估值"],
  });
  assert.equal(line.includes("abc123"), true);
  assert.equal(line.includes("3200 字"), true);
  assert.equal(line.includes("一、核心结论"), true);
  assert.equal(line.includes("read_artifact"), true);
});

test("短回复不落卡片，长回复落全文并可按段回读", async (t) => {
  const db = await withDb(t);
  assert.equal(
    await saveLongformArtifact({
      db,
      owner: OWNER,
      text: "很短的一句话。",
      scope: { threadId: "t1", messageId: "m1" },
      fallbackTitle: "兜底",
    }),
    null,
  );

  const artifact = await saveLongformArtifact({
    db,
    owner: OWNER,
    text: REPORT,
    scope: { threadId: "t1", messageId: "m1" },
    fallbackTitle: "兜底",
  });
  assert.ok(artifact);
  // 全文进产物，摘要另有字段，不从 summary 截取。
  assert.equal(artifact.summary, REPORT);
  assert.equal(artifact.threadId, "t1");
  assert.equal(artifact.messageId, "m1");
  assert.equal(artifact.taskId, "thread:t1");
  assert.equal(artifactChatBrief(artifact.data), "");
  assert.equal(longformBriefOf(artifact).length > 0, true);

  const whole = await readArtifact({ db, owner: OWNER, id: artifact.id });
  assert.ok(!("error" in whole));
  assert.equal(whole.totalChars, REPORT.length);
  assert.equal(whole.text, REPORT);

  // 分页：读到哪儿由调用方决定，nextOffset 可续。
  const first = await readArtifact({ db, owner: OWNER, id: artifact.id, limit: 200 });
  assert.ok(!("error" in first));
  assert.equal(first.text.length, 200);
  assert.equal(first.truncated, true);
  assert.equal(first.nextOffset, 200);

  const second = await readArtifact({
    db,
    owner: OWNER,
    id: artifact.id,
    offset: first.nextOffset ?? 0,
    limit: 200,
  });
  assert.ok(!("error" in second));
  assert.equal(second.text, REPORT.slice(200, 400));

  // 关键词检索：只回命中段落及其相邻段，整篇不倒回上下文。
  const hit = await readArtifact({ db, owner: OWNER, id: artifact.id, query: "毛利率" });
  assert.ok(!("error" in hit));
  assert.equal(hit.text.includes("32.4%"), true);
  assert.equal(hit.text.length < REPORT.length, true);

  const miss = await readArtifact({ db, owner: OWNER, id: artifact.id, query: "不存在的词" });
  assert.ok(!("error" in miss));
  assert.equal(miss.text.includes("No paragraph mentions"), true);

  const missing = await readArtifact({ db, owner: OWNER, id: "nope" });
  assert.equal("error" in missing, true);
});

test("折叠时写入模型摘要；摘要失败退回兜底，正文不受影响", async (t) => {
  const db = await withDb(t);
  const folded = await foldLongformReply({
    db,
    owner: OWNER,
    text: REPORT,
    scope: { threadId: "t2", messageId: "m2", channelId: "c1" },
    fallbackTitle: "兜底",
    summarize: async () => "储能出货超预期，毛利率环比改善，海外产能是明年主要变量。",
  });
  assert.ok(folded);
  assert.equal(folded.brief, "储能出货超预期，毛利率环比改善，海外产能是明年主要变量。");
  const stored = await db.get<AgentArtifact>(OWNER, "agent-artifacts", folded.artifact.id);
  assert.equal(artifactChatBrief(stored?.data), folded.brief);

  const degraded = await foldLongformReply({
    db,
    owner: OWNER,
    text: REPORT,
    scope: { threadId: "t3", messageId: "m3" },
    fallbackTitle: "兜底",
    summarize: async () => {
      throw new Error("model down");
    },
  });
  assert.ok(degraded);
  assert.equal(degraded.brief.length > 0, true);
  assert.equal(degraded.brief.length < REPORT.length, true);
});

test("线程上下文只给摘要与卡片引用，不重复全文", async (t) => {
  const db = await withDb(t);
  assert.equal(await threadLongformContext(db, OWNER, "empty-thread"), "");

  const artifact = await saveLongformArtifact({
    db,
    owner: OWNER,
    text: REPORT,
    scope: { threadId: "t4", messageId: "m4" },
    fallbackTitle: "兜底",
  });
  assert.ok(artifact);
  const context = await threadLongformContext(db, OWNER, "t4");
  assert.equal(context.includes(artifact.id), true);
  assert.equal(context.includes("read_artifact"), true);
  assert.equal(context.includes(longformContextLine(artifact)), true);
  assert.equal(context.includes(REPORT), false);
  // 其他线程不该看到这张卡。
  assert.equal(await threadLongformContext(db, OWNER, "other-thread"), "");
});
