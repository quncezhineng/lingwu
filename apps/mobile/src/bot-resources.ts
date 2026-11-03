import type { Artifact } from "../../../packages/domain/src";
import type { AgentWorkspace } from "../../../packages/domain/src/agent";
import type { AgentDefinition } from "./agent-space-model";

/** Keep the Bot overview and its independent resource pages on the same scope. */
export function selectBotResources(
  bot: Pick<AgentDefinition, "system" | "threadId">,
  data?: Pick<AgentWorkspace, "tasks" | "artifacts" | "monitors">,
  files: readonly Artifact[] = [],
) {
  const tasks = (data?.tasks ?? []).filter(
    (task) => task.threadId === bot.threadId || (!task.threadId && bot.system),
  );
  const taskIds = new Set(tasks.map((task) => task.id));
  const fileIds = new Set(tasks.flatMap((task) => task.artifactIds));
  return {
    tasks,
    artifacts: (data?.artifacts ?? []).filter((artifact) => taskIds.has(artifact.taskId)),
    monitors: (data?.monitors ?? []).filter(
      (monitor) => monitor.status !== "stopped" && taskIds.has(monitor.taskId),
    ),
    files: files.filter((file) => fileIds.has(file.id)),
  };
}
