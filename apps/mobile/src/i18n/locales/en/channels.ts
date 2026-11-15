import type { Dictionary } from "../../types";

/** 多 Agent 群聊频道文案（命名空间：channels）。 */
const channels = {
  "channels.heading": "Channels",
  "channels.create": "New channel",
  "channels.createConfirm": "Create channel",
  "channels.loading": "Loading channels…",
  "channels.emptyTitle": "No channels yet",
  "channels.emptyDetail": "Create a channel to bring several Agents together for joint research.",
  "channels.nameLabel": "Channel name",
  "channels.descriptionLabel": "Goal (optional)",
  "channels.descriptionPlaceholder": "e.g. Research new-energy companies",
  "channels.membersLabel": "Members",
  "channels.nameRequired": "Give the channel a name.",
  "channels.minMembers": "Pick at least two Agents.",
  "channels.deleteTitle": "Delete channel",
  "channels.deleteAction": "Delete",
  "channels.deleteConfirm": "Delete this channel? The Agents themselves are kept.",
  "channels.researchLabel": "Research request",
  "channels.researchPlaceholder": "e.g. Compare BYD and Tesla's valuation outlook",
  "channels.researchAction": "Start research",
  "channels.researchStarted":
    "Research started — the experts are collaborating. Check the results in Tasks shortly.",
  "channels.researchRunning": "Experts collaborating",
  "channels.researchDone": "Research complete",
  "channels.researchFailed": "Research failed",
  "channels.researchNodeProgress": "{done}/{total} expert tasks",
  "channels.chatEmptyTitle": "Start a research request",
  "channels.chatEmptyDetail":
    "Send a message and the channel members each contribute their expertise to collaborate on the research.",
  "channels.composerPlaceholder": "Ask the channel or start research…",
  "channels.sending": "Coordinating experts…",
  "channels.researchRequired": "Describe what you want the channel to research.",
  "channels.roleUnset": "member",
  "channels.noGoal": "no shared goal set",
  "channels.researchPrompt":
    "This is a multi-agent research collaboration request that MUST be divided among the channel's expert members — do NOT complete it yourself sequentially. Channel members (name (role) → id):\n{roster}\nChannel goal: {description}. {instructionsContext}Immediately call submit_orchestration to decompose the question below into a DAG of sub-tasks, setting each node's agentTemplate to the matching member's id (the value after → above, matched exactly — do not use a generic template name), and have these experts work in parallel or in dependency order. Then synthesize a structured report: {topic}",
  "channels.chatHint":
    "Messages here are shared with every member Agent. Send a research request to start the collaboration.",
  "channels.researchProgressTitle": "Research in progress",
  "channels.researchProgressDetail":
    "The orchestrator is coordinating the channel members; it will synthesize a report when done.",
  "channels.planRunning": "Coordinating",
  "channels.planSucceeded": "Completed",
  "channels.planFailed": "Failed",
  "channels.nodePending": "Waiting",
  "channels.nodeQueued": "Queued",
  "channels.nodeRunning": "Working",
  "channels.nodeSucceeded": "Done",
  "channels.nodeFailed": "Failed",
  "channels.nodeSkipped": "Skipped",
  "channels.resultLabel": "Final report",
  "channels.instructionsContext":
    "Channel shared instructions (all members must follow): {instructions}\n",
  "channels.instructionsHint":
    "Channel-level shared instructions, injected into every member Agent's context on each research run.",
  "channels.settingsProfile": "Profile",
  "channels.settingsTitle": "Channel details",
  "channels.openSettings": "Channel details",
  "channels.settingsInstructions": "Instructions",
  "channels.settingsSkills": "Skills",
  "channels.settingsTasks": "Tasks",
  "channels.settingsFiles": "Files",
  "channels.settingsMemory": "Memory",
  "channels.filesEmpty":
    "This channel has no files or reports yet. They will appear here after a research run.",
  "channels.memoryHint":
    "Channel-specific memories: only this channel's members read them as shared context during runs. Other channels cannot see them.",
  "channels.memberCount": "{count} members",
  "channels.skillsHint":
    "A channel's capabilities come from its member Agents; this shows the union of member skills (read-only).",
  "channels.skillsEmpty": "Members have no skills yet.",
  "channels.tasksEmpty":
    "This channel has no research tasks yet. Go back to the channel chat and start one.",
  "channels.instructionsEmpty": "No shared instructions set yet.",
} satisfies Dictionary;

export default channels;
