import type { Dictionary } from "../../types";

/** 我的模板与内置能力（OPT-03）。 */
const templates = {
  "templates.title": "我的模板",
  "templates.subtitle": "任意交付物都能反推成模板：结构、字段、口径与反例都会自动提取。",
  "templates.search": "搜索模板",
  "templates.loading": "正在读取模板…",

  "templates.tabMine": "我的口径",
  "templates.tabTeam": "团队共享",
  "templates.tabBuiltIn": "内置能力",

  "templates.metricReuse": "复用次数",
  "templates.metricFirstEdit": "首次改动率",
  "templates.metricLatestEdit": "最近改动率",
  "templates.metricReduction": "节省改动",
  "templates.metricAccuracy": "命中准确率",
  "templates.needsClarification": "复用后人工改动仍超过 30%，口径可能不清晰。",
  "templates.notClear": "口径待清晰",
  "templates.sharedBadge": "已共享",

  "templates.cardStructure": "{count} 个章节",
  "templates.cardFields": "{count} 个字段",
  "templates.cardReuse": "复用 {count} 次",
  "templates.open": "查看",
  "templates.use": "用这个模板",
  "templates.share": "共享给团队",
  "templates.unshare": "取消共享",

  "templates.emptyTitle": "还没有模板",
  "templates.emptyDetail": "打开任意交付物，点「存为模板」——这是最快的第一步。",
  "templates.teamEmptyTitle": "还没有团队共享模板",
  "templates.teamEmptyDetail": "同事共享的模板会出现在这里。",

  "templates.useTitle": "使用「{name}」",
  "templates.useHint": "会用模板的样例结构生成一份草稿；按需修改即可，改动率会回流到模板质量分。",
  "templates.createDraft": "生成草稿",
  "templates.deliverableCreated": "已按模板生成草稿",
  "templates.savedVersion": "已保存新版本",

  "templates.edit": "编辑",
  "templates.cancelEdit": "取消编辑",
  "templates.sharedNow": "已共享给团队",
  "templates.unsharedNow": "已取消共享",

  "templates.name": "模板名称",
  "templates.description": "说明",
  "templates.structure": "结构",
  "templates.sectionTitle": "章节标题",
  "templates.required": "必需",
  "templates.optional": "可选",
  "templates.addSection": "添加章节",
  "templates.newSection": "新章节",

  "templates.fields": "字段",
  "templates.fieldLabel": "字段名",
  "templates.unit": "单位",
  "templates.addField": "添加字段",
  "templates.newField": "新字段",
  "templates.noFields": "没有提取到必需字段。",

  "templates.voice": "口径",
  "templates.toneFormal": "正式",
  "templates.toneDirect": "直接",
  "templates.toneConcise": "精简",
  "templates.toneLabel": "语气",
  "templates.languageLabel": "语言",
  "templates.units": "单位",
  "templates.conventions": "写作约定",

  "templates.counterexamples": "反例",
  "templates.removedLine": "已删除",
  "templates.rewrittenLine": "已改写",
  "templates.noCounterexamples": "没有识别到被删除或改写的句子。",
  "templates.versions": "版本",
  "templates.saveVersion": "保存新版本",

  "templates.matchTitle": "这份任务该用哪个模板？",
  "templates.matchHint":
    "描述任务，灵悟会给出模板排序并解释命中理由；选中即可复用，点「不是这个」可以纠正匹配。",
  "templates.matchTitlePlaceholder": "交付物标题",
  "templates.matchPromptPlaceholder": "你要产出什么？",
  "templates.matchAction": "找模板",
  "templates.score": "匹配分 {score}",
  "templates.notThis": "不是这个",

  "templates.builtInTitle": "内置能力",
  "templates.builtInHint": "{count} 条只读技能随灵悟内置，驱动智能体工作；用户模板不会与它们混排。",
  "templates.builtInMore": "还有 {count} 条，缩小搜索范围可继续查看。",
  "templates.builtInEmpty": "没有匹配的内置能力。",
} satisfies Dictionary;

export default templates;
