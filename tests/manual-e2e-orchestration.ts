/**
 * 端到端验证脚本：用真实模型跑一遍「多 Agent 编排 → 汇总综合」的核心链路。
 *
 * 验证点：
 *  1. synthesizeResearch 能否用真实 DeepSeek 模型把多个专家片段综合成一篇完整研报。
 *  2. 输出是否结构化、是否只用了片段里的数据（不杜撰）。
 *
 * 运行：node --env-file=.env --import tsx tests/manual-e2e-orchestration.ts
 */
import { synthesizeResearch } from "../apps/server/src/engine/report-brief.ts";
import type { ModelConnection } from "../apps/server/src/model-settings.ts";

const MODEL = process.env.MODEL ?? "deepseek/deepseek-flash";
const API_KEY = process.env.DEEPSEEK_API_KEY?.trim();
const BASE_URL = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/v1";

if (!API_KEY) {
  console.error("❌ DEEPSEEK_API_KEY 未设置，无法跑真实模型。请在 .env 中配置。");
  process.exit(1);
}

const connection: ModelConnection = {
  provider: "deepseek",
  protocol: "openai-chat-completions",
  apiKey: API_KEY,
  baseUrl: BASE_URL,
};

// 模拟三个专家智能体的产出（分别对应编排 DAG 的三个子任务）。
const sections = [
  {
    title: "公司基本面",
    body: "比亚迪 2026 年前三季度营收 6200 亿元，同比增长 28%；归母净利润 380 亿元，同比增长 32%。新能源汽车销量 320 万辆，全球市占率约 22%。海外销量占比提升至 28%，主要增长来自东南亚和南美市场。毛利率 21.5%，同比提升 1.2 个百分点，得益于规模效应和电池自供比例提升。",
  },
  {
    title: "宏观与行业环境",
    body: "全球新能源汽车渗透率 2026 年预计达 25%，中国已超 50%，进入存量竞争阶段。欧洲关税政策存在不确定性，美国市场仍受限。碳酸锂价格从高点回落 60%，电池成本下降利好整车毛利。行业价格战仍在持续，头部集中度提升，中小车企出清加速。",
  },
  {
    title: "估值与风险",
    body: "当前股价对应 2026 年预期 PE 18 倍，处于近五年估值中枢下沿。主要风险：1) 国内价格战导致单车利润承压；2) 海外扩张面临关税与地缘政治风险；3) 智能化投入加大短期费用。机构一致预期 2027 年净利润增速放缓至 15%。",
  },
];

async function main() {
  console.log(`\n=== 端到端验证：synthesizeResearch ===`);
  console.log(`模型：${MODEL}`);
  console.log(`子任务片段数：${sections.length}\n`);

  const started = Date.now();
  const result = await synthesizeResearch({
    model: MODEL,
    connection,
    title: "比亚迪投资研究报告",
    sections,
    signal: AbortSignal.timeout(120_000),
  });
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  if (!result) {
    console.error("❌ synthesizeResearch 返回 null（综合失败或模型无输出）。");
    process.exit(1);
  }

  console.log(`✅ 综合成功（耗时 ${elapsed}s），输出 ${result.length} 字：\n`);
  console.log("─".repeat(70));
  console.log(result);
  console.log("─".repeat(70));

  // 简单质量检查：应包含结构化标题、不应包含杜撰的「检索次数/约束」等元话语。
  const checks = [
    { name: "包含结论/建议性内容", pass: /结论|建议|评级|目标价|观点/.test(result) },
    { name: "包含财务数据（营收/净利）", pass: /营收|净利|利润|毛利率/.test(result) },
    { name: "包含风险段落", pass: /风险/.test(result) },
    {
      name: "无元话语（不出现「检索 N 次」「已按约束完成」）",
      pass: !/检索.{0,4}次|已按约束|按约束完成|任务约束/.test(result),
    },
    { name: "非空且足够长（>200 字）", pass: result.length > 200 },
  ];
  console.log("\n=== 质量检查 ===");
  let allPass = true;
  for (const c of checks) {
    console.log(`  ${c.pass ? "✅" : "❌"} ${c.name}`);
    if (!c.pass) allPass = false;
  }
  console.log(`\n${allPass ? "✅ 全部通过" : "⚠️ 部分检查未通过"}`);
  process.exit(allPass ? 0 : 1);
}

main().catch((error) => {
  console.error("❌ 端到端验证失败：", error);
  process.exit(1);
});
