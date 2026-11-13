import type { Dictionary } from "../../types";

/** 交付物中心与溯源合规门（OPT-04 / OPT-05）。 */
const deliverables = {
  "deliverables.title": "Deliverables",
  "deliverables.subtitle":
    "Every output lands here as a draft. Review the numbers, approve, then send through the compliance gate.",
  "deliverables.search": "Search deliverables",
  "deliverables.filterAll": "All",
  "deliverables.loading": "Loading deliverables…",
  "deliverables.emptyTitle": "No deliverables yet",
  "deliverables.emptyDetail":
    "Scheduled briefings land here automatically. You can also create a report, minutes or one-pager as a draft.",
  "deliverables.create": "New deliverable",
  "deliverables.createTitle": "New deliverable",
  "deliverables.titleLabel": "Title",
  "deliverables.titlePlaceholder": "e.g. AAPL Q3 earnings takeaway",
  "deliverables.contentLabel": "Content",
  "deliverables.contentPlaceholder":
    "Write the deliverable. Numbers without a source will be flagged.",
  "deliverables.createRequired": "Add a title and content first.",
  "deliverables.created": "Created as a draft",

  "deliverables.kindBriefing": "Briefing",
  "deliverables.kindReport": "Report",
  "deliverables.kindMinutes": "Minutes",
  "deliverables.kindOnePager": "One-pager",
  "deliverables.kindReview": "Review",
  "deliverables.kindTable": "Table",
  "deliverables.kindCustom": "Custom",

  "deliverables.statusDraft": "Draft",
  "deliverables.statusInReview": "In review",
  "deliverables.statusApproved": "Approved",
  "deliverables.statusSent": "Sent",
  "deliverables.statusArchived": "Archived",

  "deliverables.metricNumbers": "Sourced numbers",
  "deliverables.metricSources": "Sources",
  "deliverables.unsourcedCount": "{count} unsourced",
  "deliverables.open": "Open",
  "deliverables.approve": "Approve",
  "deliverables.fixNumbers": "Fix numbers",
  "deliverables.submitReview": "Submit for review",
  "deliverables.resolveFirst": "Resolve {count} numbers first",
  "deliverables.sendWithGate": "Send through gate",
  "deliverables.share": "Share link",
  "deliverables.shareReady": "Read-only share link ready",
  "deliverables.shareLink": "Read-only share link",
  "deliverables.shareReadonlyNote":
    "Recipients can only read this version; the page always shows the disclaimer.",
  "deliverables.backToDraft": "Back to draft",
  "deliverables.archive": "Archive",
  "deliverables.reopen": "Reopen",
  "deliverables.exportAudit": "Export audit",
  "deliverables.submitted": "Sent for review",
  "deliverables.approved": "Approved by a human",
  "deliverables.reopened": "Moved back to draft",
  "deliverables.archived": "Archived",
  "deliverables.sent": "Sent with the compliance gate applied",

  "deliverables.contentTitle": "Content",
  "deliverables.edit": "Edit",
  "deliverables.cancelEdit": "Cancel",
  "deliverables.saveVersion": "Save new version",
  "deliverables.savedVersion": "New version saved",

  "deliverables.numbersTitle": "Number-level citations",
  "deliverables.numbersHint":
    "Tap an amber number to add a source, mark it as an estimate or remove it. Unresolved numbers block approval.",
  "deliverables.noNumbers": "No numeric claims detected in this version.",
  "deliverables.fixNumbersHint": "{count} number(s) still need a source or an explicit estimate.",
  "deliverables.numberSourced": "sourced",
  "deliverables.numberUnsourced": "no source",
  "deliverables.numberEstimate": "estimate",
  "deliverables.numberRemoved": "removed",
  "deliverables.resolveTitle": "Resolve “{number}”",
  "deliverables.resolveHint":
    "Traceability is a hard gate: add a source, explicitly mark it as an estimate, or remove the number.",
  "deliverables.addSource": "Add a source",
  "deliverables.sourceUrl": "Source URL",
  "deliverables.sourceExcerpt": "Original excerpt",
  "deliverables.sourceExcerptPlaceholder": "Paste the sentence that contains this number",
  "deliverables.saveSource": "Save source",
  "deliverables.markEstimate": "Mark as estimate",
  "deliverables.removeNumber": "Delete this number",
  "deliverables.sourceUrlInvalid": "Enter a full http(s) URL.",
  "deliverables.sourceExcerptRequired": "Paste an excerpt so the number can be reviewed later.",

  "deliverables.sourcesTitle": "Sources and backlinks",
  "deliverables.fetchedAt": "Fetched {date}",
  "deliverables.noCitations": "No number citations yet.",
  "deliverables.backlinks": "Generated from",

  "deliverables.versionsTitle": "Versions",
  "deliverables.compareLast": "Diff last version",
  "deliverables.diffTitle": "Changes from v{from} to v{to}",
  "deliverables.diffEmpty": "No text changes between these versions.",

  "deliverables.complianceTitle": "Compliance gate",
  "deliverables.compliancePending": "Running local compliance rules…",
  "deliverables.compliancePassed": "Rules passed and ready to send",
  "deliverables.complianceBlocked": "Compliance gate blocked",
  "deliverables.complianceLatency": "{ms} ms",
  "deliverables.unsourcedList": "Unsourced numbers: {list}",
  "deliverables.piiNote":
    "{count} piece(s) of client information will be redacted automatically at send time.",
  "deliverables.modelReviewNote":
    "Rules ran locally. Model-based double-check is not configured in this deployment, so no model pass is claimed.",

  "deliverables.sendTitle": "Send through compliance gate",
  "deliverables.sendHint":
    "Sending is always human-triggered. The gate injects the disclaimer, blocks prohibited promises and redacts client information.",
  "deliverables.recipient": "Recipient",
  "deliverables.recipientPlaceholder": "client@example.com",
  "deliverables.confirmSend": "Confirm send",

  "deliverables.auditTitle": "Audit trail",
  "deliverables.auditExported": "Audit CSV exported",
};

export default deliverables satisfies Dictionary;
