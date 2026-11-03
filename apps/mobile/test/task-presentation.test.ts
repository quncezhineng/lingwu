import assert from "node:assert/strict";
import test from "node:test";
import type { AgentTask } from "../../../packages/domain/src/agent.ts";
import {
  hasInternalTaskText,
  presentTask,
  serverToolOutcome,
  taskRequiresSetup,
} from "../src/task-presentation.ts";

test("a rejected tool call does not advertise a created task or expose its diagnostics", () => {
  const failure = {
    error:
      'Input validation failed for tool delegate_task: Invalid option: expected one of "agent"|"document"|"research"',
  };
  const options = { loading: false, requiresReceipt: true };
  for (const result of [
    failure,
    JSON.stringify(failure),
    failure.error,
    { id: "unconfirmed", ...failure },
    { success: false },
    undefined,
    {},
  ]) {
    const view = serverToolOutcome(result, options);
    assert.deepEqual(view, { state: "incomplete" });
    assert.doesNotMatch(JSON.stringify(view), /validation|delegate_task|unconfirmed/);
  }
  assert.match(
    failure.error,
    /Input validation/,
    "preserve the original tool result for diagnostics",
  );
});

test("only a complete receipt enables a saved resource link", () => {
  const options = { loading: false, requiresReceipt: true };
  assert.deepEqual(serverToolOutcome({ id: "task-1" }, options), {
    state: "saved",
    id: "task-1",
    taskId: "",
  });
  assert.deepEqual(serverToolOutcome(JSON.stringify({ taskId: "task-2" }), options), {
    state: "saved",
    id: "",
    taskId: "task-2",
  });
  assert.deepEqual(serverToolOutcome({ id: "task-1" }, { ...options, loading: true }), {
    state: "loading",
  });
  assert.equal(
    serverToolOutcome({ tasks: [] }, { ...options, requiresReceipt: false }).state,
    "saved",
    "read-only progress can open the workspace without creating a task",
  );
  assert.equal(serverToolOutcome({ id: "   " }, options).state, "incomplete");
});

function task(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: "task-1",
    title: "恒生电子价格提醒",
    prompt: "Private execution instructions",
    kind: "monitor",
    status: "queued",
    plan: [],
    evidence: [],
    input: {},
    state: {},
    createdAt: "2026-11-02T15:00:00.000Z",
    updatedAt: "2026-11-02T15:00:00.000Z",
    attempts: 0,
    artifactIds: [],
    ...overrides,
  };
}

test("incomplete legacy monitors cannot offer a misleading continue action", () => {
  const original = task({ status: "paused", input: {} });
  assert.equal(taskRequiresSetup(original), true);
  const linked = task({ input: { monitorId: "monitor-1" } });
  assert.equal(taskRequiresSetup(linked), false, "wait for the workspace if a link exists");
  assert.equal(taskRequiresSetup(linked, []), true, "the loaded workspace has no rule");
  assert.equal(taskRequiresSetup(linked, [{ id: "monitor-1", taskId: "other-task" }]), true);
  assert.equal(taskRequiresSetup(linked, [{ id: "monitor-1", taskId: linked.id }]), false);
  assert.equal(taskRequiresSetup(task({ kind: "agent", status: "paused" }), []), false);
});

test("a retrying monitor uses a neutral display state without exposing its error", () => {
  const original = task({ status: "scheduled", error: "Monitor not found" });
  const view = presentTask(original);
  assert.equal(view.statusOverride, "retryWaiting");
  assert.equal(view.status, "scheduled");
  assert.doesNotMatch(JSON.stringify(view), /Monitor not found|Private execution/);
  assert.equal(original.error, "Monitor not found", "keep the execution record intact");
});

test("active monitoring stays distinct from retries, pauses and incomplete setup", () => {
  for (const status of ["queued", "running", "scheduled"] as const) {
    assert.equal(
      presentTask(task({ status, input: { monitorId: "monitor-1" } })).statusOverride,
      "monitoring",
    );
  }
  for (const status of [
    "paused",
    "cancelled",
    "succeeded",
    "waiting_input",
    "waiting_approval",
  ] as const) {
    assert.notEqual(
      presentTask(task({ status, input: { monitorId: "monitor-1" } })).statusOverride,
      "monitoring",
    );
  }
  assert.notEqual(presentTask(task({ status: "scheduled" })).statusOverride, "monitoring");
  assert.notEqual(
    presentTask(task({ kind: "agent", status: "scheduled" })).statusOverride,
    "monitoring",
  );
  assert.notEqual(
    presentTask(
      task({ status: "running", error: "Page check failed", input: { monitorId: "monitor-1" } }),
    ).statusOverride,
    "monitoring",
  );
});

test("unfinished tasks keep their truthful status without returning failure details", () => {
  const view = presentTask(
    task({
      status: "failed",
      error: "Model run timed out after five minutes",
      result: "Partial error output",
    }),
  );
  assert.equal(view.status, "failed");
  assert.equal(view.statusOverride, "notCompleted");
  assert.equal(view.result, undefined);
  assert.equal(view.attention, undefined);
  assert.doesNotMatch(JSON.stringify(view), /timed out|Partial error/);
});

test("completed results containing internal environment or tool details stay out of the reading surface", () => {
  for (const text of [
    "报告完成，但文件未能写入 /workspace：Computer is not configured. Enable COMPUTER_ENABLED",
    "write_computer_file failed: connector unavailable",
    "TypeError: fetch failed",
    '{"errorInfo":{"message":"provider unavailable"}}',
    "Please configure DEEPSEEK_API_KEY",
    "Authorization: Bearer fake-test-token",
  ]) {
    assert.equal(hasInternalTaskText(text), true, text);
    assert.equal(presentTask(task({ status: "succeeded", result: text })).result, undefined, text);
  }
});

test("business results retain tables, source links and data-availability caveats", () => {
  const result =
    "## 经营情况\n\n| 项目 | 数值 |\n| --- | ---: |\n| 收入 | 21.44 亿 |\n\n现金流数据未获取，估值假设尚未经核对。API 接口服务收入见[年报](https://example.com)。";
  assert.equal(presentTask(task({ status: "succeeded", result })).result, result);
});

test("a waiting task has a simple attention signal and keeps useful questions for the detail form", () => {
  const question = "你想研究哪家公司？请提供名称或股票代码。";
  const view = presentTask(task({ status: "waiting_input", question }));
  assert.equal(view.attention, "input");
  assert.equal(view.question, question);
  assert.equal(presentTask(task({ status: "waiting_approval" })).attention, "review");
});

test("internal troubleshooting questions use the localized detail-form fallback", () => {
  const view = presentTask(
    task({
      status: "waiting_input",
      question: "Computer is not configured. Enable COMPUTER_ENABLED and continue.",
    }),
  );
  assert.equal(view.attention, "input");
  assert.equal(view.question, undefined);
});

test("sources, state, prompt and timeline data are excluded from the task view model", () => {
  const view = presentTask(
    task({
      evidence: [{ id: "source", kind: "web", title: "Raw source", excerpt: "Raw excerpt" }],
      state: { internal: "private diagnostic" },
      plan: [
        { id: "one", title: "Internal tool instructions", status: "succeeded", detail: "Raw log" },
        { id: "two", title: "Another step", status: "failed" },
      ],
    }),
  );
  assert.equal(view.completedSteps, 1);
  assert.equal(view.totalSteps, 2);
  for (const property of ["error", "prompt", "evidence", "events", "state", "plan"]) {
    assert.equal(Object.hasOwn(view, property), false, property);
  }
  assert.doesNotMatch(JSON.stringify(view), /Raw|private diagnostic|Internal tool instructions/);
});
