import type { AgentTask, Monitor } from "../../../packages/domain/src/agent";

/** Only a saved receipt can advertise successful creation or a destination.
 * Raw diagnostics remain in the transcript, outside this presentation model. */
export function serverToolOutcome(
  result: unknown,
  { loading, requiresReceipt }: { loading: boolean; requiresReceipt: boolean },
) {
  if (loading) return { state: "loading" as const };
  let value = result;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      value = undefined;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    return { state: "incomplete" as const };
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  const taskId = typeof record.taskId === "string" ? record.taskId.trim() : "";
  if (
    record.error ||
    record.isError === true ||
    record.success === false ||
    (requiresReceipt && !id && !taskId)
  )
    return { state: "incomplete" as const };
  return { state: "saved" as const, id, taskId };
}

/** 监控任务由「自动化」页代表，任务列表不再重复展示。 */
export function listedWorkTasks<T extends { kind: string }>(tasks: readonly T[]): T[] {
  return tasks.filter((task) => task.kind !== "monitor");
}

export function taskRequiresSetup(
  task: AgentTask,
  monitors?: readonly Pick<Monitor, "id" | "taskId">[],
): boolean {
  if (task.kind !== "monitor") return false;
  const monitorId = typeof task.input.monitorId === "string" ? task.input.monitorId : "";
  if (!monitorId.trim()) return true;
  return (
    monitors !== undefined &&
    !monitors.some((item) => item.id === monitorId && item.taskId === task.id)
  );
}

/** Internal diagnostics belong to the execution record, never the task's reading surface. */
export function hasInternalTaskText(value: string): boolean {
  return [
    /\bmonitor not found\b/i,
    /\bmodel run timed out\b/i,
    /\b(?:TypeError|ReferenceError|SyntaxError|Traceback|ECONNREFUSED|ETIMEDOUT|ENOTFOUND)\b/i,
    /\bHTTP\s*[45]\d\d\b/i,
    /\/(?:workspace|private\/tmp|tmp|var\/folders)(?:\b|\/)/i,
    /\b(?:COMPUTER_ENABLED|TOKEN_ENCRYPTION_KEY|[A-Z_]+_API_KEY)\b/,
    /\b(?:start_computer|write_computer_file|export_computer_file|finish_task|delegate_task)\b/,
    /\b(?:computer|browser|model|provider|connector)\s+(?:is\s+)?(?:not configured|unavailable|not enabled|failed)\b/i,
    /["']?(?:errorInfo|stackTrace|stack_trace|request_id|status_code)["']?\s*:/i,
    /\bsk-[A-Za-z0-9_-]{12,}\b/,
    /\bBearer\s+[A-Za-z0-9_.-]+/i,
  ].some((pattern) => pattern.test(value));
}

/** An explicit view model prevents prompts, errors, sources and logs leaking into cards. */
export function presentTask(task: AgentTask) {
  const monitoring =
    task.kind === "monitor" &&
    ["queued", "running", "scheduled"].includes(task.status) &&
    !task.error &&
    !taskRequiresSetup(task);
  return {
    title: task.title,
    status: task.status,
    updatedAt: task.updatedAt,
    completedSteps: task.plan.filter((step) => step.status === "succeeded").length,
    totalSteps: task.plan.length,
    statusOverride:
      task.status === "failed"
        ? ("notCompleted" as const)
        : task.status === "scheduled" && task.error
          ? ("retryWaiting" as const)
          : monitoring
            ? ("monitoring" as const)
            : undefined,
    attention:
      task.status === "waiting_input"
        ? ("input" as const)
        : task.status === "waiting_approval"
          ? ("review" as const)
          : undefined,
    question:
      task.status === "waiting_input" && task.question && !hasInternalTaskText(task.question)
        ? task.question
        : undefined,
    result:
      task.status === "succeeded" && task.result && !hasInternalTaskText(task.result)
        ? task.result
        : undefined,
  };
}
