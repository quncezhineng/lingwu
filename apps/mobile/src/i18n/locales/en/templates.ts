import type { Dictionary } from "../../types";

/** 我的模板与内置能力（OPT-03）。 */
const templates = {
  "templates.title": "My templates",
  "templates.subtitle":
    "Turn any deliverable into a reusable template: structure, fields, voice and counterexamples are extracted automatically.",
  "templates.search": "Search templates",
  "templates.loading": "Loading templates…",

  "templates.tabMine": "My templates",
  "templates.tabTeam": "Team shared",
  "templates.tabBuiltIn": "Built-in skills",

  "templates.metricReuse": "Reuses",
  "templates.metricFirstEdit": "Edit at first reuse",
  "templates.metricLatestEdit": "Latest edit",
  "templates.metricReduction": "Editing saved",
  "templates.metricAccuracy": "Match accuracy",
  "templates.needsClarification":
    "Edits after reuse stay above 30% — the template wording may be unclear.",
  "templates.notClear": "May be unclear",
  "templates.sharedBadge": "Shared",

  "templates.cardStructure": "{count} sections",
  "templates.cardFields": "{count} fields",
  "templates.cardReuse": "{count} reuses",
  "templates.open": "View",
  "templates.use": "Use this",
  "templates.share": "Share with team",
  "templates.unshare": "Stop sharing",

  "templates.emptyTitle": "No templates yet",
  "templates.emptyDetail":
    "Open any deliverable and choose “Save as template” — that is the fastest path to your first one.",
  "templates.teamEmptyTitle": "No shared templates",
  "templates.teamEmptyDetail": "Templates your teammates share will appear here.",

  "templates.useTitle": "Use “{name}”",
  "templates.useHint":
    "A draft is created with the template's sample structure pre-filled. Edit as needed; changes feed back into the template's quality score.",
  "templates.createDraft": "Create draft",
  "templates.deliverableCreated": "Draft created from template",
  "templates.savedVersion": "Saved a new template version",

  "templates.edit": "Edit",
  "templates.cancelEdit": "Cancel",
  "templates.sharedNow": "Template shared with the team",
  "templates.unsharedNow": "Template is private again",

  "templates.name": "Template name",
  "templates.description": "Description",
  "templates.structure": "Structure",
  "templates.sectionTitle": "Section title",
  "templates.required": "Required",
  "templates.optional": "Optional",
  "templates.addSection": "Add section",
  "templates.newSection": "New section",

  "templates.fields": "Fields",
  "templates.fieldLabel": "Field",
  "templates.unit": "Unit",
  "templates.addField": "Add field",
  "templates.newField": "New field",
  "templates.noFields": "No required fields extracted.",

  "templates.voice": "Voice",
  "templates.toneFormal": "Formal",
  "templates.toneDirect": "Direct",
  "templates.toneConcise": "Concise",
  "templates.toneLabel": "Tone",
  "templates.languageLabel": "Language",
  "templates.units": "Units",
  "templates.conventions": "Conventions",

  "templates.counterexamples": "Counterexamples",
  "templates.removedLine": "Removed",
  "templates.rewrittenLine": "Rewritten",
  "templates.noCounterexamples": "No removed or rewritten lines detected.",
  "templates.versions": "Versions",
  "templates.saveVersion": "Save new version",

  "templates.matchTitle": "Which template fits this task?",
  "templates.matchHint":
    "Describe the task and LingWu ranks your templates with explicit match reasons. Pick one, or tell it “not this one” to correct the ranking.",
  "templates.matchTitlePlaceholder": "Deliverable title",
  "templates.matchPromptPlaceholder": "What are you asked to produce?",
  "templates.matchAction": "Find a template",
  "templates.score": "score {score}",
  "templates.notThis": "Not this one",

  "templates.builtInTitle": "Built-in capabilities",
  "templates.builtInHint":
    "{count} read-only skills ship with LingWu. They power the agent; user templates never mix with them.",
  "templates.builtInMore": "{count} more skills — refine your search to narrow it down.",
  "templates.builtInEmpty": "No built-in skill matches this search.",
} satisfies Dictionary;

export default templates;
