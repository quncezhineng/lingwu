import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  type AgentArtifact,
  type AgentIdentity,
  type AgentMemory,
  type AgentMemoryV2,
  type AgentNotification,
  type AgentTask,
  type AgentWorkspace,
  artifactChatBrief,
  createTaskSchema,
  type DealHabits,
  defaultAgentName,
  type Evidence,
  type FinanceTerms,
  type Goal,
  goalInputSchema,
  type Idea,
  type MemoryKind,
  type Monitor,
  monitorInputSchema,
  type RunEvent,
} from "../../../../packages/domain/src/agent.ts";
import { goalsEnabled } from "../../../../packages/domain/src/features.ts";
import type {
  ActionProposal,
  Artifact,
  BrowserSession,
  Mail,
  ProposalInput,
} from "../../../../packages/domain/src/index.ts";
import { resolveMonitorCurrency } from "../../../../packages/domain/src/monitor-currency.ts";
import { MarketDataService } from "../../../../packages/integrations/src/market-data.ts";
import type { ActionService } from "../actions.ts";
import { agentIdForThread, agentModelForThread, type PersistedAgentSpace } from "../agent-space.ts";
import type { BrowserService } from "../browser.ts";
import { ComputerService } from "../computer.ts";
import type { Config } from "../config.ts";
import type { Store } from "../db.ts";
import { AppError } from "../errors.ts";
import type { Files } from "../files.ts";
import { backgroundFailure } from "../log.ts";
import { resolveTaskNotifications } from "../notifications.ts";
import { SearchService } from "../search.ts";
import type { WorkspaceService } from "../workspace.ts";
import { createBriefingScheduler } from "./briefing-scheduler.ts";
import { detectDealSignals } from "./deal-signal.ts";
import { DeliverablesService } from "./deliverables.ts";
import { analyzeSpending } from "./finance.ts";
import { FinancialsService } from "./financials.ts";
import { HindsightClient } from "./hindsight.ts";
import { generateMarketBriefing } from "./market-briefing.ts";
import { executeModelTask } from "./model.ts";
import { MonitorService } from "./monitor-engine.ts";
import { readMonitoredPrice } from "./monitor-price.ts";
import { NotesService } from "./notes.ts";
import {
  countPageDiff,
  describePageDiff,
  diffPage,
  pageLines,
  withoutRelativeTimes,
} from "./page-diff.ts";
import { PortfoliosService } from "./portfolios.ts";
import { type AlertNotifier, type PriceAlertRecord, PriceAlertsService } from "./price-alerts.ts";
import { summarizeReport } from "./report-brief.ts";
import { generateResearchReport, researchSymbolSchema } from "./research.ts";
import { WatchlistsService } from "./watchlists.ts";
import { LostLeaseError, type TaskContext, TaskWorker } from "./worker.ts";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
/** A change watch's last saved page: its hash, relative-time-free fingerprint and lines. */
type MonitorPage = { id: string; hash?: string; timelessHash?: string; lines: string[] };
const date = () => new Date().toISOString();
const terminal = new Set(["succeeded", "failed", "cancelled"]);
/** 存量记忆迁移每批处理的条数，控制单次 maintain tick 的耗时与内存。 */
const MIGRATION_BATCH_SIZE = 200;

/**
 * 计算下一次监控时间。每日/每周提醒按中国市场常用时区 Asia/Shanghai
 * 解释 timeOfDay；旧数据没有 schedule 时继续沿用 intervalMinutes。
 */
export function nextMonitorCheckAt(
  monitor: Pick<Monitor, "schedule" | "timeOfDay" | "weekday" | "intervalMinutes">,
  now = new Date(),
) {
  const schedule = monitor.schedule ?? "interval";
  if (schedule === "interval")
    return new Date(now.getTime() + monitor.intervalMinutes * 60000).toISOString();

  const [hour, minute] = (monitor.timeOfDay ?? "09:00").split(":").map(Number);
  const shanghaiOffset = 8 * 60 * 60000;
  const local = new Date(now.getTime() + shanghaiOffset);
  let dayOffset = 0;
  if (schedule === "weekly") {
    // JS 周日为 0；产品里 1=周一、7=周日。
    const currentWeekday = local.getUTCDay() || 7;
    dayOffset = ((monitor.weekday ?? 5) - currentWeekday + 7) % 7;
  }
  const candidate = new Date(
    Date.UTC(
      local.getUTCFullYear(),
      local.getUTCMonth(),
      local.getUTCDate() + dayOffset,
      hour,
      minute,
    ) - shanghaiOffset,
  );
  if (candidate.getTime() <= now.getTime())
    candidate.setUTCDate(candidate.getUTCDate() + (schedule === "weekly" ? 7 : 1));
  return candidate.toISOString();
}

export class AgentService {
  readonly worker: TaskWorker;
  readonly search: SearchService;
  readonly market: MarketDataService;
  readonly watchlists: WatchlistsService;
  readonly portfolios: PortfoliosService;
  readonly notes: NotesService;
  readonly financials: FinancialsService;
  readonly priceAlerts: PriceAlertsService;
  readonly monitors: MonitorService;
  readonly deliverables: DeliverablesService;
  /** 多 Agent 记忆引擎（Hindsight），未配置时降级为本地关键词召回。 */
  readonly memory: HindsightClient;
  private readonly briefings: ReturnType<typeof createBriefingScheduler>;
  private maintenance?: ReturnType<typeof setInterval>;
  private refreshing = false;
  private readonly briefInflight = new Map<string, Promise<AgentArtifact>>();
  constructor(
    readonly db: Store,
    readonly config: Config,
    readonly workspace: WorkspaceService,
    readonly files: Files,
    readonly actions: ActionService,
    readonly browser: BrowserService,
    readonly computer: ComputerService = new ComputerService(db, config),
    market: MarketDataService = new MarketDataService(),
    search?: SearchService,
  ) {
    this.search = search ?? new SearchService(db);
    this.market = market;
    this.watchlists = new WatchlistsService(db, market);
    this.portfolios = new PortfoliosService(db, market);
    this.notes = new NotesService(db);
    this.financials = new FinancialsService(db);
    this.priceAlerts = new PriceAlertsService(db, market);
    this.monitors = new MonitorService({
      db,
      market,
      holdings: (owner, portfolioId) => this.portfolios.holdings(owner, portfolioId),
      notify: (owner, title, body, key) => this.notify(owner, title, body, undefined, key),
    });
    this.deliverables = new DeliverablesService(db);
    this.memory = new HindsightClient({
      baseUrl: config.hindsightBaseUrl,
      apiKey: config.hindsightApiKey,
    });
    this.worker = new TaskWorker(db, (owner, task, context) => this.execute(owner, task, context), {
      settled: (owner, task) => this.publishOutcome(owner, task),
    });
    // Daily briefing: enqueue one durable task per owner per UTC date. Opt-in via
    // BRIEFING_SCHEDULE_ENABLED so tests and manual demo runs never spawn tasks.
    this.briefings = createBriefingScheduler({
      db,
      enqueue: (owner, date, attempt) =>
        this.createTask(
          owner,
          {
            kind: "market_briefing",
            title: `每日市场简报 · ${date}`,
            prompt:
              "Generate the daily market briefing from overnight indexes and the user's watchlists.",
            input: { date, scheduled_for: `${date}T00:00:00.000Z`, trigger: "schedule", attempt },
          },
          `market-briefing:${owner}:${date}:${attempt}`,
        ),
    });
  }
  start() {
    this.worker.start();
    // Maintenance is independent of the HTTP response and reconciles durable records.
    void this.maintain().catch((error) => backgroundFailure("initial maintenance", error));
    this.maintenance = setInterval(() => {
      void this.maintain().catch((error) => backgroundFailure("maintenance", error));
    }, 60000);
  }
  async stop() {
    if (this.maintenance) clearInterval(this.maintenance);
    this.maintenance = undefined;
    await this.worker.stop();
    while (this.refreshing) await new Promise((resolve) => setTimeout(resolve, 10));
  }
  private async maintain() {
    if (this.refreshing) return;
    this.refreshing = true;
    try {
      // 过期的复核不再等你的答复：收尾之后，它就不该继续点亮「通知」上的提示。
      for (const { owner, value } of await this.actions.expireStale())
        await resolveTaskNotifications(this.db, owner, value.taskId);
      // Recover publications if the process exited after committing an outcome.
      for (const { owner, value } of await this.db.scan<AgentTask>("tasks"))
        await this.publishOutcome(owner, value);
      for (const { owner, value } of await this.db.scan<Monitor>("monitors"))
        await this.activateMonitor(owner, value);
      for (const { owner, value } of await this.db.scan<PriceAlertRecord>("price_alerts")) {
        if (!PriceAlertsService.isDue(value)) continue;
        await this.priceAlerts
          .check(owner, value.id, this.alertNotifier(owner))
          .catch((error) => backgroundFailure("price alert check", error));
      }
      // L1/L2 monitor rules, dedupe/cooldown, quiet hours, budget and 19:00 digest.
      await this.monitors
        .runMaintenance()
        .catch((error) => backgroundFailure("monitor maintenance", error));
      // Daily briefing: durable task creation, idempotent per owner and UTC date.
      await this.briefings
        .runOnce()
        .catch((error) => backgroundFailure("briefing schedule", error));
      const thesisOwners = new Set(
        (await this.db.scan<{ id: string; type: string }>("notes")).map(({ owner }) => owner),
      );
      for (const owner of thesisOwners)
        await this.notes
          .runThesisCheck(owner, {
            notify: async (title, body, key) => this.notify(owner, title, body, undefined, key),
          })
          .catch((error) => backgroundFailure("thesis check", error));
      for (const { owner, value } of await this.db.scan<Idea>("ideas"))
        if (
          value.status === "accepted" &&
          value.taskId &&
          !(await this.db.get(owner, "tasks", value.taskId))
        )
          await this.decideIdea(owner, value.id, "accept").catch(async (error) => {
            backgroundFailure("recover accepted idea", error);
            await this.notify(
              owner,
              "Accepted idea needs attention",
              "Open the idea again after making room for another task.",
              undefined,
              `idea-recovery:${value.id}`,
            );
          });
      for (const { owner, value } of await this.db.scan<{ id: string; lastIdeasAt?: string }>(
        "agent-settings",
      )) {
        if (value.id !== "identity") continue;
        if (!value.lastIdeasAt || Date.now() - Date.parse(value.lastIdeasAt) > 15 * 60000)
          await this.refreshIdeas(owner).catch(async () => {
            await this.notify(
              owner,
              "Source refresh needs attention",
              "Reconnect the source or refresh Ideas to see the error.",
              undefined,
              `source-error:${Math.floor(Date.now() / 3600000)}`,
            );
          });
      }
      // 存量记忆迁移到 Hindsight：每 owner 每 tick 推进一小批，分批 + 断点续传。
      if (this.memory.enabled) {
        for (const owner of await this.db.owners("memories")) {
          await this.migrateMemories(owner).catch((error) =>
            backgroundFailure("memory migration", error),
          );
        }
      }
    } finally {
      this.refreshing = false;
    }
  }
  async ensure(owner: string) {
    await this.db.insertIfAbsent(owner, "agent-settings", {
      id: "identity",
      name: defaultAgentName,
      tone: "warm",
    });
  }
  async snapshot(owner: string): Promise<AgentWorkspace> {
    await this.ensure(owner);
    const [tasks, goals, monitors, ideas, memories, artifacts, notifications, identity] =
      await Promise.all([
        this.db.list<AgentTask>(owner, "tasks"),
        this.db.list<Goal>(owner, "goals"),
        this.db.list<Monitor>(owner, "monitors"),
        this.db.list<Idea>(owner, "ideas"),
        this.db.list<AgentMemory>(owner, "memories"),
        this.db.list<AgentArtifact>(owner, "agent-artifacts"),
        this.db.list<AgentNotification>(owner, "notifications"),
        this.db.get<AgentIdentity>(owner, "agent-settings", "identity"),
      ]);
    const heartbeat = await this.db.get<{ lastTickAt: string }>("system", "worker-status", "tasks");
    return {
      tasks,
      goals,
      monitors,
      ideas,
      memories,
      artifacts,
      notifications,
      identity: identity ?? { name: defaultAgentName, tone: "warm" },
      worker: {
        running:
          this.worker.running ||
          Boolean(heartbeat && Date.now() - Date.parse(heartbeat.lastTickAt) < 15000),
        lastTickAt: heartbeat?.lastTickAt ?? this.worker.lastTickAt,
      },
    };
  }
  async getTask(owner: string, id: string) {
    const task = await this.db.get<AgentTask>(owner, "tasks", id);
    if (!task) throw new AppError("Task not found", 404);
    return task;
  }
  async detail(owner: string, id: string) {
    const task = await this.getTask(owner, id);
    const files = (await this.db.list<Artifact>(owner, "files")).filter((file) =>
      task.artifactIds.includes(file.id),
    );
    const browsers = (await this.db.list<BrowserSession>(owner, "browsers")).filter((browser) =>
      [task.state.browserId, task.state.sessionId].includes(browser.id),
    );
    return {
      task,
      files: files.map((file) => this.files.signed(owner, file)),
      browsers: browsers.map((browser) => this.browser.decorate(owner, browser)),
      events: (await this.db.list<RunEvent>(owner, "run-events"))
        .filter((e) => e.taskId === id)
        .sort((a, b) => a.date.localeCompare(b.date)),
      artifacts: (await this.db.list<AgentArtifact>(owner, "agent-artifacts")).filter(
        (a) => a.taskId === id,
      ),
    };
  }
  async createTask(
    owner: string,
    raw: unknown,
    idempotencyKey?: string,
    held = false,
    threadId?: string,
  ) {
    const input = createTaskSchema.parse(raw);
    // Monitoring rules own their execution tasks. Direct delegation would create
    // an orphan task that cannot be checked or resumed without a real rule.
    if (input.kind === "monitor" && !held)
      throw new AppError(
        "Create this reminder through the monitoring setup before starting it.",
        422,
        "TASK_SETUP_REQUIRED",
      );
    const id = idempotencyKey ? hash(`task:${idempotencyKey}`) : randomUUID();
    const existing = await this.db.get<AgentTask>(owner, "tasks", id);
    if (existing) return existing;
    if (input.milestoneId && !input.goalId) throw new AppError("A milestone requires a goal", 422);
    const goal = input.goalId ? await this.db.get<Goal>(owner, "goals", input.goalId) : null;
    if (input.goalId && !goal) throw new AppError("Goal not found", 404);
    if (input.milestoneId && !goal?.milestones.some((m) => m.id === input.milestoneId))
      throw new AppError("Milestone not found in this goal", 404);
    if (
      (await this.db.list<AgentTask>(owner, "tasks")).filter((t) => !terminal.has(t.status))
        .length >= 100
    )
      throw new AppError("Finish or cancel some tasks before adding more", 409);
    const titles =
      input.kind === "document"
        ? [
            "Find the source document",
            "Fill a new copy",
            "Prepare a reply",
            "Wait for your decision",
            "Record the outcome",
          ]
        : input.kind === "monitor"
          ? ["Check the source", "Compare with the last observation", "Report a meaningful change"]
          : input.kind === "finance"
            ? ["Validate transactions", "Calculate the summary", "Save your tracker"]
            : input.kind === "market_briefing"
              ? ["Collect overnight market data", "Scan your watchlists", "Write the briefing"]
              : input.kind === "research"
                ? [
                    "Load market data",
                    "Gather news and peer quotes",
                    "Estimate a valuation range",
                    "Write the report",
                  ]
                : [
                    "Understand the outcome",
                    "Plan the work",
                    "Use connected tools",
                    "Return a result",
                  ];
    const task: AgentTask = {
      id,
      title: input.title ?? input.prompt.slice(0, 90),
      prompt: input.prompt,
      kind: input.kind,
      goalId: input.goalId,
      milestoneId: input.milestoneId,
      threadId: threadId || undefined,
      status: held || goal?.status === "paused" ? "paused" : "queued",
      plan: titles.map((title, i) => ({ id: String(i), title, status: "pending" })),
      evidence: [],
      input: input.input,
      state: {
        connectionId: (await this.workspace.connection(owner))?.id ?? null,
        ...(held && input.kind === "monitor" ? { initializingMonitor: true } : {}),
      },
      createdAt: date(),
      updatedAt: date(),
      attempts: 0,
      leaseId: null,
      leaseUntil: null,
      artifactIds: [],
    };
    await this.ensure(owner);
    await this.db.insertIfAbsent(owner, "tasks", task);
    return (await this.db.get<AgentTask>(owner, "tasks", id)) ?? task;
  }
  async control(owner: string, id: string, action: "pause" | "resume" | "cancel" | "retry") {
    const task = await this.getTask(owner, id);
    if (action === "cancel" && task.status === "succeeded")
      throw new AppError("This task is already complete", 409);
    if (action === "retry" && task.status !== "failed")
      throw new AppError("Only failed tasks can be retried", 409);
    if (action === "resume" && task.status !== "paused")
      throw new AppError("Only paused tasks can be resumed", 409);
    if (action === "pause" && (terminal.has(task.status) || task.status === "paused")) return task;
    if (task.kind === "monitor" && (action === "resume" || action === "retry")) {
      const monitorId = typeof task.input.monitorId === "string" ? task.input.monitorId : "";
      const monitor = monitorId ? await this.db.get<Monitor>(owner, "monitors", monitorId) : null;
      if (!monitor || monitor.taskId !== task.id)
        throw new AppError(
          "This reminder needs to be set up again before it can continue.",
          409,
          "TASK_SETUP_REQUIRED",
        );
      // Both UI entry points must activate the monitor before a worker can claim its task.
      await this.controlMonitor(owner, monitorId, "resume");
      const resumed = await this.getTask(owner, id);
      await this.db.put(owner, "run-events", {
        id: randomUUID(),
        taskId: id,
        kind: "status",
        date: date(),
        title: `Task ${resumed.status}`,
        detail: "Changed by you",
      });
      return resumed;
    }
    const status =
      action === "cancel"
        ? "cancelled"
        : action === "pause"
          ? "paused"
          : task.actionId
            ? "waiting_approval"
            : "queued";
    if (action === "retry" && task.actionId) {
      const a = await this.db.get<ActionProposal>(owner, "actions", task.actionId);
      if (a && a.status !== "succeeded")
        throw new AppError(
          "Check the reviewed action before retrying; its outcome may be uncertain. Start a new task when reconciled.",
          409,
        );
    }
    const updated = await this.db.compareAndSwap<AgentTask>(
      owner,
      "tasks",
      id,
      { status: task.status, leaseId: task.leaseId ?? null },
      {
        status,
        leaseId: null,
        leaseUntil: null,
        error: null,
        updatedAt: date(),
        result:
          action === "cancel"
            ? "Stopped by you."
            : action === "pause"
              ? "Paused. Resume when you're ready."
              : "",
      },
    );
    if (!updated) throw new AppError("Task changed; refresh and try again", 409);
    this.worker.abort(id);
    if (task.kind === "monitor")
      await this.db.compareAndSwap(
        owner,
        "monitors",
        String(task.input.monitorId),
        {},
        {
          status: action === "cancel" ? "stopped" : action === "pause" ? "paused" : "active",
          nextCheckAt: date(),
          // Clearing the error fences out a failure reconcile that read the task before this.
          ...(action === "resume" || action === "retry" ? { error: null } : {}),
        },
      );
    if (action === "cancel" && task.actionId) {
      const proposal = await this.db.get<ActionProposal>(owner, "actions", task.actionId);
      if (proposal?.status === "awaiting_review")
        await this.actions.decide(owner, proposal.id, proposal.hash, "deny");
    }
    // 取消和重试都是「这件事我已经处理过了」：留下的未读通知不再点亮「通知」上的提示。
    if (action === "cancel" || action === "retry")
      await resolveTaskNotifications(this.db, owner, id);
    await this.db.put(owner, "run-events", {
      id: randomUUID(),
      taskId: id,
      kind: "status",
      date: date(),
      title: `Task ${status}`,
      detail: "Changed by you",
    });
    return updated;
  }
  /** Stop work the user just cancelled from the chat stop button. */
  async cancelOpenThreadTasks(owner: string, threadId: string) {
    if (!threadId) return;
    const open = new Set<AgentTask["status"]>(["queued", "running", "scheduled"]);
    const tasks = await this.db.list<AgentTask>(owner, "tasks");
    for (const task of tasks) {
      if (task.threadId !== threadId || !open.has(task.status)) continue;
      try {
        await this.control(owner, task.id, "cancel");
      } catch (error) {
        if (error instanceof AppError && error.status === 409) continue;
        throw error;
      }
    }
  }
  async answer(
    owner: string,
    id: string,
    answer: string,
    fields?: Record<string, string | boolean>,
  ) {
    const task = await this.getTask(owner, id);
    if (task.status !== "waiting_input")
      throw new AppError("This task is not waiting for input", 409);
    const next = await this.db.compareAndSwap<AgentTask>(
      owner,
      "tasks",
      id,
      { status: "waiting_input" },
      {
        status: "queued",
        question: null,
        input: { ...task.input, ...(fields ? { fields } : {}) },
        state: {
          ...task.state,
          answer,
          answeredQuestion: task.question ?? null,
          answeredAt: date(),
        },
        updatedAt: date(),
      },
    );
    if (!next) throw new AppError("Task changed; refresh and try again", 409);
    // 用户已经补充了信息，这条任务要你回答的通知就算处理完了。
    await resolveTaskNotifications(this.db, owner, id);
    return next;
  }
  /**
   * 写入一条结构化记忆（多 Agent 记忆系统的统一入口）。
   *
   * 供 `remember_fact` / `write_memory` 工具与投融资决策规则兜底共用：
   *   - 幂等 id = sha256(agentId + kind + text)，insertIfAbsent 去重
   *   - 双写 Hindsight 记忆引擎（retain 失败静默降级，不阻断主流程）
   */
  async saveMemory(
    owner: string,
    input: {
      agentId: string;
      kind: MemoryKind;
      text: string;
      body?: string;
      source: string;
      category?: AgentMemory["category"];
      tags?: string[];
      financeTerms?: FinanceTerms;
      dealHabits?: DealHabits;
      taskId?: string;
      threadId?: string;
      artifactId?: string;
    },
  ): Promise<AgentMemoryV2> {
    const { agentId, kind, text } = input;
    // 自动沉淀 / 对话生成的记忆常不携带 category；按 kind 推断默认类别，
    // 避免记忆页面因缺失分类而全部回退到「关注领域」（前端兜底值）。
    const DEFAULT_CATEGORY_BY_KIND: Partial<Record<MemoryKind, AgentMemory["category"]>> = {
      fact: "关注领域",
      thesis: "关注标的",
      analysis: "分析习惯",
      decision: "投资目标",
    };
    const category = input.category ?? DEFAULT_CATEGORY_BY_KIND[kind];
    const value: AgentMemoryV2 = {
      id: createHash("sha256").update(`${agentId}:${kind}:${text}`).digest("hex"),
      agentId,
      kind,
      text,
      ...(input.body ? { body: input.body } : {}),
      source: input.source,
      ...(category ? { category } : {}),
      ...(input.tags?.length ? { tags: input.tags } : {}),
      ...(input.financeTerms ? { financeTerms: input.financeTerms } : {}),
      ...(input.dealHabits ? { dealHabits: input.dealHabits } : {}),
      ...(input.taskId ? { taskId: input.taskId } : {}),
      ...(input.threadId ? { threadId: input.threadId } : {}),
      ...(input.artifactId ? { artifactId: input.artifactId } : {}),
      createdAt: date(),
    };
    await this.db.insertIfAbsent(owner, "memories", value);
    // 双写 Hindsight：document_id = value.id 让 retain 幂等（同 id 重写覆盖，天然去重）。
    await this.memory.retain(owner, agentId, text, value.id).catch(() => {});
    return value;
  }

  /**
   * 删除一条记忆：从 records 移除，并同步删除 Hindsight 里对应的 document。
   * Hindsight 删除失败不阻断本地删除（静默降级，Hindsight 侧残留由迁移幂等兜底）。
   */
  async forgetMemory(owner: string, id: string): Promise<boolean> {
    const memory = await this.db.take<AgentMemoryV2>(owner, "memories", id);
    if (!memory) return false;
    const agentId = (memory.agentId ?? "").trim() || "default";
    await this.memory.deleteDocument(owner, agentId, id).catch(() => {});
    return true;
  }

  /**
   * 全局记忆中枢（右侧栏）：聚合所有 Agent 的记忆，附按 Agent / 类型分布。
   */
  async memoryHub(owner: string): Promise<{
    total: number;
    byAgent: Record<string, number>;
    byKind: Record<string, number>;
    recent: AgentMemoryV2[];
    memories: AgentMemoryV2[];
  }> {
    const memories = await this.db.list<AgentMemoryV2>(owner, "memories");
    const byAgent: Record<string, number> = {};
    const byKind: Record<string, number> = {};
    for (const memory of memories) {
      const agentId = memory.agentId?.trim() || "default";
      byAgent[agentId] = (byAgent[agentId] ?? 0) + 1;
      byKind[memory.kind ?? "fact"] = (byKind[memory.kind ?? "fact"] ?? 0) + 1;
    }
    // recent 按 createdAt 降序取前 10 条（list 已按 updated_at 降序，这里再按 createdAt 兜底）。
    const sorted = [...memories].sort((a, b) =>
      (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
    );
    return {
      total: memories.length,
      byAgent,
      byKind,
      recent: sorted.slice(0, 10),
      memories: sorted,
    };
  }

  /**
   * 单 Agent 专属记忆（左侧栏 Agent 详情页）。
   * 旧数据无 agentId 时归到 "default"，与写入/召回的回退口径一致。
   */
  async agentMemories(owner: string, agentId: string): Promise<AgentMemoryV2[]> {
    const memories = await this.db.list<AgentMemoryV2>(owner, "memories");
    const normalized = (m: AgentMemoryV2) => m.agentId?.trim() || "default";
    return memories
      .filter((m) => normalized(m) === agentId)
      .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  }

  /** Agent 空间里的 Agent 列表（供记忆中枢按名称展示归属）。 */
  async listAgents(owner: string): Promise<{ id: string; name: string }[]> {
    const saved = await this.db.get<PersistedAgentSpace & { id: string }>(
      owner,
      "agent-settings",
      "space",
    );
    return (
      saved?.agents.map((agent) => ({ id: agent.id, name: agent.name })) ?? [
        { id: "default", name: "Default" },
      ]
    );
  }

  /**
   * 存量记忆迁移到 Hindsight（M4）。
   *
   * 每次调用迁移一小批（MIGRATION_BATCH_SIZE 条），游标持久化到
   * kind="memory-migration"、id=owner 的记录里，支持断点续传与分批推进。
   *
   * 约束：
   *   - 仅在 Hindsight 已配置（memory.enabled）时执行，否则无意义直接返回。
   *   - 按 data->>'id' 升序推进游标，每条 retain 到 `owner:agentId` bank。
   *   - 单条 retain 失败不中断整批，累计 failedCount 供监控；游标仍推进，
   *     避免单条坏数据永久卡死迁移。
   *   - 返回值标识本批是否已完成全部存量（供调用方决定是否停止轮询）。
   */
  private async migrateMemories(owner: string): Promise<{ migrated: number; done: boolean }> {
    if (!this.memory.enabled) return { migrated: 0, done: true };
    const progress = await this.db.get<{ lastMigratedId?: string | null; failed?: number }>(
      owner,
      "memory-migration",
      "cursor",
    );
    const cursor = progress?.lastMigratedId ?? null;
    const batch = await this.db.listAfter<AgentMemoryV2>(
      owner,
      "memories",
      cursor,
      MIGRATION_BATCH_SIZE,
    );
    let migrated = 0;
    let failed = progress?.failed ?? 0;
    let lastId = cursor;
    for (const memory of batch) {
      const agentId = (memory.agentId ?? "").trim() || "default";
      try {
        // document_id = memory.id 让迁移幂等：重复迁移同一记忆会覆盖而非重复。
        await this.memory.retain(owner, agentId, memory.text, memory.id);
        migrated++;
      } catch (error) {
        failed++;
        backgroundFailure("memory migration retain", error);
      }
      lastId = memory.id;
    }
    // 推进游标：即使有失败也推进，坏数据不阻塞后续迁移。
    await this.db.put(owner, "memory-migration", {
      id: "cursor",
      lastMigratedId: lastId,
      failed,
      updatedAt: date(),
    });
    return { migrated, done: batch.length < MIGRATION_BATCH_SIZE };
  }

  async createGoal(owner: string, raw: unknown, id?: string) {
    const input = goalInputSchema.parse(raw);
    const goal: Goal = {
      id: id ?? randomUUID(),
      title: input.title,
      description: input.description,
      category: input.category,
      status: "active",
      milestones: input.milestones.map((title) => ({ id: randomUUID(), title, done: false })),
      createdAt: date(),
    };
    await this.db.insertIfAbsent(owner, "goals", goal);
    return (await this.db.get<Goal>(owner, "goals", goal.id)) ?? goal;
  }
  async updateGoal(
    owner: string,
    id: string,
    patch: { status?: Goal["status"]; milestones?: Goal["milestones"] },
  ) {
    const current = await this.db.get<Goal>(owner, "goals", id);
    if (!current) throw new AppError("Goal not found", 404);
    const milestones = patch.milestones?.map((milestone) => {
      const previous = current.milestones.find((item) => item.id === milestone.id);
      if (!milestone.done) return { id: milestone.id, title: milestone.title, done: false };
      if (milestone.completedAt) return milestone;
      return {
        ...milestone,
        completedAt: previous?.done && previous.completedAt ? previous.completedAt : date(),
      };
    });
    const saved = await this.db.compareAndSwap<Goal>(
      owner,
      "goals",
      id,
      {},
      {
        ...patch,
        ...(milestones ? { milestones } : {}),
      },
    );
    if (!saved) throw new AppError("Goal not found", 404);
    if (patch.status === "paused")
      for (const task of await this.db.listByGoalId<AgentTask>(owner, "tasks", id))
        if (!terminal.has(task.status) && task.status !== "paused")
          await this.control(owner, task.id, "pause");
    return saved;
  }
  async setMilestoneDone(owner: string, goalId: string, milestoneId: string, done: boolean) {
    const saved = await this.db.setMilestoneDone<Goal>(owner, goalId, milestoneId, done, date());
    if (!saved) throw new AppError("Goal or milestone not found", 404);
    return saved;
  }
  private async validateMonitorGoal(
    owner: string,
    goalId?: string,
    milestoneId?: string,
  ): Promise<Goal | null> {
    if (!goalId) return null;
    const goal = await this.db.get<Goal>(owner, "goals", goalId);
    if (!goal) throw new AppError("Goal not found", 404);
    if (milestoneId && !goal.milestones.some((milestone) => milestone.id === milestoneId))
      throw new AppError("Milestone not found in this goal", 404);
    return goal;
  }
  async createMonitor(owner: string, raw: unknown, idempotencyKey?: string) {
    const input = monitorInputSchema.parse(raw);
    const goalId = input.goalId ?? undefined;
    const milestoneId = input.milestoneId ?? undefined;
    await this.validateMonitorGoal(owner, goalId, milestoneId);
    if (input.condition === "price_below") {
      input.currency = resolveMonitorCurrency(input);
      if (!input.currency) throw new AppError("Choose CNY, HKD or USD for this price watch", 422);
    }
    const url = new URL(input.url);
    if (url.protocol === "sample:" && this.config.mode !== "sample")
      throw new AppError("Sample sources are unavailable in live workspaces", 422);
    if (!["https:", "http:", "sample:"].includes(url.protocol) || url.username || url.password)
      throw new AppError("Use a public HTTP(S) page", 422);
    if (url.protocol === "sample:" && input.url !== "sample://availability")
      throw new AppError("Unknown sample source", 422);
    const id = idempotencyKey ? hash(`monitor:${idempotencyKey}`) : randomUUID();
    const existing = await this.db.get<Monitor>(owner, "monitors", id);
    if (existing) {
      await this.activateMonitor(owner, existing);
      return existing;
    }
    const task = await this.createTask(
      owner,
      {
        kind: "monitor",
        title: input.title,
        prompt: `Watch ${input.url} for ${input.condition}${input.value ? `: ${input.value}` : ""}${input.description ? `. Context: ${input.description}` : ""}`,
        input: { monitorId: id },
        ...(goalId ? { goalId } : {}),
        ...(milestoneId ? { milestoneId } : {}),
      },
      `monitor:${id}`,
      true,
    );
    const { goalId: _goalId, milestoneId: _milestoneId, ...monitorInput } = input;
    const monitor: Monitor = {
      id,
      taskId: task.id,
      ...monitorInput,
      ...(goalId ? { goalId } : {}),
      ...(milestoneId ? { milestoneId } : {}),
      status: "active",
      nextCheckAt: date(),
      checks: 0,
    };
    await this.db.insertIfAbsent(owner, "monitors", monitor);
    await this.activateMonitor(owner, monitor);
    return monitor;
  }

  async updateMonitor(owner: string, id: string, raw: unknown) {
    const monitor = await this.db.get<Monitor>(owner, "monitors", id);
    if (!monitor) throw new AppError("Monitor not found", 404);
    if (monitor.status === "stopped")
      throw new AppError("Create a new watch to restart this stopped monitor", 409);
    const input = monitorInputSchema.parse(raw);
    const goalId = input.goalId === undefined ? monitor.goalId : (input.goalId ?? undefined);
    const milestoneId =
      input.goalId === undefined
        ? input.milestoneId === undefined
          ? monitor.milestoneId
          : (input.milestoneId ?? undefined)
        : goalId
          ? (input.milestoneId ?? undefined)
          : undefined;
    if (milestoneId && !goalId) throw new AppError("A milestone requires a goal", 422);
    await this.validateMonitorGoal(owner, goalId, milestoneId);
    if (input.condition === "price_below") {
      input.currency = resolveMonitorCurrency({
        ...input,
        currency: input.currency ?? monitor.currency,
      });
      if (!input.currency) throw new AppError("Choose CNY, HKD or USD for this price watch", 422);
    }
    const url = new URL(input.url);
    if (url.protocol === "sample:" && this.config.mode !== "sample")
      throw new AppError("Sample sources are unavailable in live workspaces", 422);
    if (!["https:", "http:", "sample:"].includes(url.protocol) || url.username || url.password)
      throw new AppError("Use a public HTTP(S) page", 422);
    if (url.protocol === "sample:" && input.url !== "sample://availability")
      throw new AppError("Unknown sample source", 422);

    // A changed target or condition invalidates the old baseline. Reset it before the
    // worker can compare the next response, otherwise the first check could be skipped.
    const { goalId: _previousGoalId, milestoneId: _previousMilestoneId, ...previous } = monitor;
    const { goalId: _inputGoalId, milestoneId: _inputMilestoneId, ...monitorInput } = input;
    const saved = await this.db.put<Monitor>(owner, "monitors", {
      ...previous,
      ...monitorInput,
      ...(goalId ? { goalId } : {}),
      ...(milestoneId ? { milestoneId } : {}),
      lastValue: "",
      lastHash: "",
      error: undefined,
      nextCheckAt: date(),
    });
    await this.db.remove(owner, "monitor-pages", monitor.id);
    const task = await this.getTask(owner, monitor.taskId);
    if (task) {
      await this.db.compareAndSwap(
        owner,
        "tasks",
        task.id,
        { updatedAt: task.updatedAt },
        {
          title: input.title,
          prompt: `Watch ${input.url} for ${input.condition}${input.value ? `: ${input.value}` : ""}${input.description ? `. Context: ${input.description}` : ""}`,
          goalId: goalId ?? null,
          milestoneId: milestoneId ?? null,
          state: { ...task.state, lastHash: null, matched: false, failures: 0, notice: null },
        },
      );
    }
    return saved;
  }

  private async activateMonitor(owner: string, monitor: Monitor) {
    if (monitor.status !== "active") return null;
    const task = await this.getTask(owner, monitor.taskId);
    if (task.status !== "paused") return null;
    if (task.state.resumingMonitor)
      return this.db.compareAndSwap(
        owner,
        "tasks",
        task.id,
        { status: "paused", state: { resumingMonitor: true } },
        {
          status: "queued",
          nextRunAt: date(),
          leaseId: null,
          leaseUntil: null,
          error: null,
          state: { ...task.state, resumingMonitor: false, failures: 0, notice: null },
        },
      );
    if (!task.state.initializingMonitor) return null;
    return this.db.compareAndSwap(
      owner,
      "tasks",
      task.id,
      { status: "paused", attempts: 0, state: { initializingMonitor: true } },
      {
        status: "queued",
        state: { ...task.state, initializingMonitor: false },
      },
    );
  }
  async controlMonitor(owner: string, id: string, action: "pause" | "resume" | "stop" | "check") {
    const monitor = await this.db.get<Monitor>(owner, "monitors", id);
    if (!monitor) throw new AppError("Monitor not found", 404);
    if (monitor.status === "stopped" && action !== "stop")
      throw new AppError("Create a new watch to restart this stopped monitor", 409);
    if (action === "pause" || action === "stop") {
      const status = action === "pause" ? "paused" : "stopped";
      const saved = await this.db.compareAndSwap<Monitor>(
        owner,
        "monitors",
        id,
        {},
        { status, nextCheckAt: date() },
      );
      const task = await this.getTask(owner, monitor.taskId);
      await this.control(owner, task.id, action === "pause" ? "pause" : "cancel");
      return saved ?? monitor;
    }
    let monitorStatus = monitor.status;
    for (let attempt = 0; attempt < 2; attempt++) {
      const task = await this.getTask(owner, monitor.taskId);
      if (task.status === "cancelled") break;
      if (task.status === "paused") {
        // Mark the paused task before activating the monitor so no worker can claim it in between.
        const marked = await this.db.compareAndSwap(
          owner,
          "tasks",
          task.id,
          { status: "paused", leaseId: task.leaseId ?? null },
          { state: { ...task.state, resumingMonitor: true } },
        );
        if (!marked) break;
        const activated = await this.db.compareAndSwap<Monitor>(
          owner,
          "monitors",
          id,
          { status: monitor.status },
          { status: "active", nextCheckAt: date(), error: null },
        );
        const saved = activated ?? (await this.db.get<Monitor>(owner, "monitors", id));
        if (saved?.status === "active" && (await this.activateMonitor(owner, saved))) return saved;
        const unmarked = await this.db.compareAndSwap(
          owner,
          "tasks",
          task.id,
          { status: "paused", state: { resumingMonitor: true } },
          { state: { ...task.state, resumingMonitor: false } },
        );
        // Another request or maintenance may have finished this resume first.
        if (!unmarked && saved?.status === "active") {
          const latest = await this.getTask(owner, task.id);
          if (["queued", "running", "scheduled"].includes(latest.status)) return saved;
        }
        if (activated)
          await this.db.compareAndSwap(
            owner,
            "monitors",
            id,
            { status: "active" },
            { status: monitor.status, error: monitor.error ?? null },
          );
        break;
      }
      // Only activate the monitor we read, so a concurrent stop is never undone.
      const saved = await this.db.compareAndSwap<Monitor>(
        owner,
        "monitors",
        id,
        { status: monitorStatus },
        { status: "active", nextCheckAt: date() },
      );
      if (!saved) break;
      monitorStatus = "active";
      this.worker.abort(task.id);
      const queued = await this.db.compareAndSwap(
        owner,
        "tasks",
        task.id,
        // updatedAt fences out a whole run finishing in between, which would move the baseline.
        { status: task.status, leaseId: task.leaseId ?? null, updatedAt: task.updatedAt },
        {
          status: "queued",
          nextRunAt: date(),
          leaseId: null,
          leaseUntil: null,
          error: null,
          state: { ...task.state, failures: 0, notice: null },
        },
      );
      if (queued) return saved;
    }
    throw new AppError("The watch changed while updating. Try again.", 409);
  }
  async refreshIdeas(owner: string) {
    const w = await this.workspace.snapshot(owner);
    const sentIds = new Set(
      w.mail.filter((mail) => /^Sent\b/i.test(mail.label)).map((mail) => mail.id),
    );
    const completedSources = new Set(
      (await this.db.listByStatus<AgentTask>(owner, "tasks", "succeeded"))
        .filter((task) => typeof task.input.messageId === "string")
        .map((task) => `${task.kind}:${task.input.messageId}`),
    );
    const obsolete = (kind: AgentTask["kind"], messageId: unknown) =>
      typeof messageId === "string" &&
      (sentIds.has(messageId) || completedSources.has(`${kind}:${messageId}`));
    // Retire earlier suggestions as well as preventing new duplicates. A concurrent
    // acceptance wins its own compare-and-swap and is never overwritten here.
    for (const idea of await this.db.listByStatus<Idea>(owner, "ideas", "new"))
      if (obsolete(idea.kind, idea.input.messageId))
        await this.db.compareAndSwap(
          owner,
          "ideas",
          idea.id,
          { status: "new" },
          { status: "dismissed" },
        );
    for (const mail of w.mail
      .filter(
        (m) =>
          !obsolete("document", m.id) &&
          m.attachments.length &&
          /form|permission|complete|fill|sign/i.test(`${m.subject} ${m.body}`),
      )
      .slice(0, 5)) {
      const id = hash(`document:${mail.id}:${mail.body}`);
      const idea: Idea = {
        id,
        title: `I can help with ${mail.subject}`,
        reason: `${mail.sender} sent a document that may need your attention. I can prepare it and a reply for your review.`,
        evidence: [this.mailEvidence(mail)],
        prompt: `Help complete the PDF from “${mail.subject}” and prepare a reply for review.`,
        kind: "document",
        input: { messageId: mail.id },
        status: "new",
        createdAt: date(),
      };
      await this.db.insertIfAbsent(owner, "ideas", idea);
    }
    for (const mail of w.mail
      .filter(
        (m) =>
          !obsolete("agent", m.id) &&
          /coffee|meet|available|schedule/i.test(`${m.subject} ${m.body}`),
      )
      .slice(0, 5)) {
      await this.db.insertIfAbsent(owner, "ideas", {
        id: hash(`coordination:${mail.id}`),
        title: `I can help coordinate ${mail.subject}`,
        reason: `${mail.sender} mentioned getting together. I can check your calendar and prepare a response for review.`,
        evidence: [this.mailEvidence(mail)],
        prompt: `Review the email “${mail.subject}”, check my calendar, and propose a next step. Ask me about missing preferences before preparing a reply.`,
        kind: "agent",
        input: { messageId: mail.id },
        status: "new",
        createdAt: date(),
      } satisfies Idea);
    }
    if (goalsEnabled)
      for (const goal of await this.db.listByStatus<Goal>(owner, "goals", "active"))
        if (!goal.milestones.length) {
          const id = hash(`goal:${goal.id}:${goal.description}`);
          await this.db.insertIfAbsent(owner, "ideas", {
            id,
            title: `Let's make a plan for ${goal.title}`,
            reason: "This goal has no milestones yet. A concrete plan will give it a next step.",
            evidence: [{ id: goal.id, kind: "user", title: goal.title, excerpt: goal.description }],
            prompt: `Create an actionable plan for ${goal.title}. ${goal.description}`,
            kind: "plan",
            input: { goalId: goal.id },
            status: "new",
            createdAt: date(),
          } satisfies Idea);
        }
    await this.ensure(owner);
    await this.db.compareAndSwap(owner, "agent-settings", "identity", {}, { lastIdeasAt: date() });
    return this.db.list<Idea>(owner, "ideas");
  }
  async decideIdea(owner: string, id: string, action: "accept" | "dismiss", prompt?: string) {
    let idea = await this.db.get<Idea>(owner, "ideas", id);
    if (!idea) throw new AppError("Idea not found", 404);
    if (idea.status === "dismissed" || (idea.status === "accepted" && action === "dismiss"))
      return idea;
    if (action === "dismiss")
      return this.db.compareAndSwap<Idea>(
        owner,
        "ideas",
        id,
        { status: "new" },
        { status: "dismissed" },
      );
    if (idea.status === "new") {
      // A task already working on (or done with) the same email is opened instead of copied.
      const { kind, input } = idea;
      const handling =
        typeof input.messageId === "string"
          ? (await this.db.list<AgentTask>(owner, "tasks")).find(
              (task) =>
                task.kind === kind &&
                task.input.messageId === input.messageId &&
                task.status !== "failed" &&
                task.status !== "cancelled",
            )
          : undefined;
      if (handling)
        return (
          (await this.db.compareAndSwap<Idea>(
            owner,
            "ideas",
            id,
            { status: "new" },
            { status: "accepted", taskId: handling.id },
          )) ?? this.db.get<Idea>(owner, "ideas", id)
        );
      const claimed = await this.db.compareAndSwap<Idea>(
        owner,
        "ideas",
        id,
        { status: "new" },
        {
          status: "accepted",
          taskId: hash(`task:idea:${id}`),
          prompt: prompt ?? idea.prompt,
        },
      );
      idea = claimed ?? (await this.db.get<Idea>(owner, "ideas", id));
      if (idea?.status !== "accepted") return idea;
    }
    if (idea.taskId && (await this.db.get(owner, "tasks", idea.taskId))) return idea;
    const linkedGoalId = typeof idea.input.goalId === "string" ? idea.input.goalId : undefined;
    const goalId =
      linkedGoalId ??
      (goalsEnabled
        ? (
            await this.createGoal(
              owner,
              { title: idea.title, description: idea.reason },
              hash(`idea-goal:${id}`),
            )
          ).id
        : undefined);
    const task = await this.createTask(
      owner,
      {
        title: idea.title,
        prompt: idea.prompt,
        kind: idea.kind,
        input: idea.input,
        ...(goalId ? { goalId } : {}),
      },
      `idea:${id}`,
    );
    await this.db.compareAndSwap(
      owner,
      "ideas",
      id,
      { status: "new" },
      { status: "accepted", taskId: task.id },
    );
    return this.db.get<Idea>(owner, "ideas", id);
  }
  private alertNotifier(owner: string): AlertNotifier {
    return async (title, body, key) => {
      const notification = await this.notify(owner, title, body, undefined, key);
      return { id: notification.id, title, body };
    };
  }
  async notify(
    owner: string,
    title: string,
    body: string,
    taskId?: string,
    key?: string,
  ): Promise<AgentNotification> {
    const value: AgentNotification = {
      id: key ? hash(key) : randomUUID(),
      taskId,
      title,
      body,
      createdAt: date(),
      read: false,
    };
    await this.db.insertIfAbsent(owner, "notifications", value);
    return (await this.db.get<AgentNotification>(owner, "notifications", value.id)) ?? value;
  }
  mailEvidence(mail: Mail): Evidence {
    return { id: mail.id, kind: "mail", title: mail.subject, excerpt: mail.body.slice(0, 400) };
  }
  async artifact(
    owner: string,
    task: AgentTask,
    kind: AgentArtifact["kind"],
    title: string,
    summary: string,
    data: Record<string, unknown>,
    key: string = kind,
  ) {
    const value: AgentArtifact = {
      id: hash(`${task.id}:${key}`),
      taskId: task.id,
      kind,
      title,
      summary,
      data,
      createdAt: date(),
    };
    await this.db.put(owner, "agent-artifacts", value);
    return value;
  }
  /** 用当前模型为报告写一段对话摘要，并写回产物。已有摘要时直接返回。 */
  async ensureChatBrief(owner: string, artifactId: string): Promise<AgentArtifact> {
    const key = `${owner}:${artifactId}`;
    const pending = this.briefInflight.get(key);
    if (pending) return pending;
    const run = this.writeChatBrief(owner, artifactId).finally(() => {
      this.briefInflight.delete(key);
    });
    this.briefInflight.set(key, run);
    return run;
  }
  /** 测试可替换，避免摘要测试打到真实模型。 */
  summarizeForChat = summarizeReport;
  private async writeChatBrief(owner: string, artifactId: string): Promise<AgentArtifact> {
    const current = await this.db.get<AgentArtifact>(owner, "agent-artifacts", artifactId);
    if (!current) throw new AppError("Report not found", 404);
    if (current.kind !== "report" && current.kind !== "research_report")
      throw new AppError("Only a finished report can be summarized", 422);
    if (artifactChatBrief(current.data)) return current;
    const task = await this.db.get<AgentTask>(owner, "tasks", current.taskId);
    const model = await this.workspace.models.resolve(
      owner,
      await agentModelForThread(this.db, owner, task?.threadId),
    );
    if (!model.configured || !model.model)
      throw new AppError("Configure a model before summarizing a report", 503);
    const brief = await this.summarizeForChat({
      model: model.model,
      connection: model.connection,
      title: current.title,
      body: current.summary,
      signal: AbortSignal.timeout(45_000),
    });
    const saved = await this.db.get<AgentArtifact>(owner, "agent-artifacts", artifactId);
    const next: AgentArtifact = {
      ...(saved ?? current),
      data: { ...(saved ?? current).data, chatBrief: brief },
    };
    await this.db.put(owner, "agent-artifacts", next);
    return next;
  }
  async prepare(
    owner: string,
    task: AgentTask,
    input: ProposalInput,
    key: string,
    context: TaskContext,
  ) {
    await context.guard();
    const connection = await this.workspace.connection(owner);
    if (connection?.id !== task.state.connectionId)
      throw new AppError(
        "Google connection changed during this task. Start a new task using the current account.",
        409,
      );
    const proposal = await this.actions.propose(owner, input, `${task.id}:${key}`, task.id);
    if (proposal.status === "succeeded") return proposal;
    if (proposal.status !== "awaiting_review" && proposal.status !== "executing")
      throw new AppError(
        `Reviewed action ${proposal.status}: ${proposal.error ?? "No further action was taken"}`,
        409,
      );
    try {
      await context.checkpoint({ actionId: proposal.id });
    } catch (error) {
      const current = await this.db.get<AgentTask>(owner, "tasks", task.id);
      if (
        proposal.status === "awaiting_review" &&
        (current?.status === "paused" || current?.status === "cancelled")
      )
        await this.actions.decide(owner, proposal.id, proposal.hash, "deny");
      throw error;
    }
    if (proposal.status === "awaiting_review")
      await context.event(
        "approval",
        proposal.title,
        `Review prepared for ${proposal.account ?? "the connected account"}`,
      );
    return proposal;
  }
  private async execute(
    owner: string,
    task: AgentTask,
    context: TaskContext,
  ): Promise<Partial<AgentTask>> {
    await context.event(
      "status",
      task.attempts === 1 ? "Started working" : "Resumed work",
      task.prompt,
    );
    if (task.actionId) {
      const action = await this.db.get<ActionProposal>(owner, "actions", task.actionId);
      if (!action) throw new Error("The linked review could not be found");
      if (action.status === "succeeded") {
        await context.event("result", "Approved action completed", action.result);
        if (task.kind === "document")
          return this.finish(task, context, action.result ?? "Reply completed");
        task = await context.checkpoint({
          state: { ...task.state, approvalResult: action.result },
          actionId: null,
        });
      } else if (action.status !== "awaiting_review" && action.status !== "executing")
        throw new Error(
          `Reviewed action ${action.status}: ${action.error ?? "No further action was taken"}`,
        );
      else return { status: "waiting_approval" };
    }
    if (task.kind === "document") return this.document(owner, task, context);
    if (task.kind === "monitor") {
      try {
        return await this.observe(owner, task, context);
      } catch (error) {
        if (error instanceof LostLeaseError || context.signal.aborted) throw error;
        await context.guard();
        const failures = Number(task.state.failures ?? 0) + 1;
        // Each streak of failures (after a success or a resume) gets its own alerts.
        const failureStreak = Number(task.state.failureStreak ?? 0) + (failures === 1 ? 1 : 0);
        const detail = error instanceof Error ? error.message : "Page check failed";
        const nextCheckAt = new Date(
          Date.now() + Math.min(60, 2 ** failures) * 60000,
        ).toISOString();
        await this.db.compareAndSwap(
          owner,
          "monitors",
          String(task.input.monitorId),
          { status: "active" },
          { error: detail, nextCheckAt },
        );
        await context.event(
          "error",
          failures >= 5 ? "Watch paused after repeated failures" : "Check failed; retry scheduled",
          detail,
        );
        return {
          status: failures >= 5 ? "paused" : "scheduled",
          error: detail,
          nextRunAt: nextCheckAt,
          state: {
            ...task.state,
            failures,
            resumingMonitor: false,
            failureStreak,
            notice: {
              title: "Watch needs attention",
              body: detail,
              key: `watch-error:${task.id}:${failureStreak}:${failures >= 5 ? "paused" : "retry"}`,
            },
          },
        };
      }
    }
    if (task.kind === "research") {
      const symbol = researchSymbolSchema.parse(String(task.input.symbol ?? ""));
      const report = await generateResearchReport(
        owner,
        symbol,
        { db: this.db, market: this.market, search: this.search },
        (step, detail) => context.event("step", step, detail),
      );
      const artifact = await this.artifact(
        owner,
        task,
        "research_report",
        report.title,
        `${report.symbol_code} · ${report.sections.news.length} news · ${report.sections.peer_comparison.length} peers`,
        report as unknown as Record<string, unknown>,
      );
      task = await context.checkpoint({ artifactIds: [artifact.id] });
      return this.finish(task, context, `${report.title}\n\n${report.sections.company_overview}`);
    }
    if (task.kind === "market_briefing") {
      await context.event("step", "Collecting overnight market data and watchlist moves");
      const briefing = await generateMarketBriefing(owner, {
        db: this.db,
        market: this.market,
      });
      const artifact = await this.artifact(
        owner,
        task,
        "market_briefing",
        `Daily market briefing · ${briefing.date}`,
        briefing.summary.join(" · "),
        {
          date: briefing.date,
          summary: briefing.summary,
          content: briefing.content,
          market_data: briefing.market_data,
          symbol_updates: briefing.symbol_updates,
        },
      );
      task = await context.checkpoint({ artifactIds: [artifact.id] });
      return this.finish(task, context, briefing.summary.join("\n"));
    }
    if (task.kind === "finance") {
      await context.event("step", "Analyzing the imported transactions");
      const csv = z.string().parse(task.input.csv);
      const data = analyzeSpending(csv);
      const artifact = await this.artifact(
        owner,
        task,
        "finance",
        "Spending tracker",
        `${data.count} transactions · ${data.spending.toFixed(2)} spent`,
        data,
      );
      task = await context.checkpoint({
        artifactIds: [artifact.id],
        evidence: [
          {
            id: task.id,
            kind: "user",
            title: "Your transaction CSV",
            excerpt: `${data.count} rows; ${data.period.from} through ${data.period.to}`,
          },
        ],
      });
      return this.finish(task, context, artifact.summary);
    }
    return executeModelTask(this, owner, task, context);
  }
  async finish(task: AgentTask, context: TaskContext, result: string) {
    await context.guard();
    await context.event("result", "Work completed", result);
    return {
      status: "succeeded" as const,
      result,
      plan: task.plan.map((s) => ({ ...s, status: "succeeded" as const })),
    };
  }
  private async publishOutcome(owner: string, saved: AgentTask) {
    const task = await this.getTask(owner, saved.id);
    if (task.status === "succeeded") {
      await this.notify(
        owner,
        task.title,
        task.result ?? "Work completed",
        task.id,
        `task-done:${task.id}`,
      );
      // 投融资决策规则兜底：模型未主动 write_memory 时，从任务结果捕捉决策信号落一条 decision 记忆。
      if (task.result) {
        const signals = detectDealSignals(task.result);
        if (signals.length > 0) {
          const stage = signals[0]?.stage ?? "决策";
          const agentId = task.threadId
            ? ((await agentIdForThread(this.db, owner, task.threadId)) ?? "default")
            : "default";
          await this.saveMemory(owner, {
            agentId,
            kind: "decision",
            text: `${task.title}: ${task.result.slice(0, 160)}`,
            body: task.result,
            source: "Task result (deal signal)",
            dealHabits: { stage },
            taskId: task.id,
            threadId: task.threadId,
          });
        }
      }
      if (goalsEnabled && task.goalId && !task.milestoneId) {
        for (let attempt = 0; attempt < 8; attempt++) {
          const goal = await this.db.get<Goal>(owner, "goals", task.goalId);
          if (!goal || goal.milestones.some((m) => m.id === task.id)) break;
          if (
            await this.db.compareAndSwap(
              owner,
              "goals",
              goal.id,
              { milestones: goal.milestones },
              {
                milestones: [
                  ...goal.milestones,
                  { id: task.id, title: task.title, done: true, completedAt: date() },
                ],
              },
            )
          )
            break;
        }
      }
    } else if (task.status === "failed") {
      await this.notify(
        owner,
        "Task needs attention",
        task.error ?? task.title,
        task.id,
        `task-error:${task.id}:${task.attempts}`,
      );
    } else if (task.status === "waiting_input") {
      await this.notify(
        owner,
        "Your details are needed",
        task.question ?? task.title,
        task.id,
        `input:${task.id}:${hash(task.question ?? "")}`,
      );
    } else if (task.status === "waiting_approval") {
      await this.notify(
        owner,
        "Ready for your review",
        task.title,
        task.id,
        `review:${task.actionId}`,
      );
    }
    const notice = z
      .object({ title: z.string(), body: z.string(), key: z.string() })
      .safeParse(task.state.notice);
    if ((task.status === "scheduled" || (task.status === "paused" && task.error)) && notice.success)
      await this.notify(owner, notice.data.title, notice.data.body, task.id, notice.data.key);
    // A watch pauses after repeated failures only once that task outcome has committed.
    if (task.kind === "monitor" && task.status === "paused" && task.error)
      await this.db.compareAndSwap(
        owner,
        "monitors",
        String(task.input.monitorId),
        { status: "active", error: task.error },
        { status: "paused" },
      );
  }
  private async document(
    owner: string,
    task: AgentTask,
    ctx: TaskContext,
  ): Promise<Partial<AgentTask>> {
    let source = task.state.source as { mail: Mail; fileId: string } | undefined;
    if (!source) {
      const w = await this.workspace.snapshot(owner);
      const mail = w.mail.find((m) => m.id === task.input.messageId);
      if (!mail) throw new Error("Choose a current email with a PDF attachment to start this task");
      const ref = mail.attachments[0];
      if (!ref) throw new Error("This email has no PDF attachment");
      await ctx.guard();
      let file: Artifact;
      try {
        file = await this.files.get(owner, ref);
      } catch (error) {
        if (!(error instanceof AppError && error.status === 404)) throw error;
        file = await this.workspace.importAttachment(owner, ref);
      }
      source = { mail, fileId: file.id };
      task = await ctx.checkpoint({
        state: { ...task.state, source },
        evidence: [this.mailEvidence(mail)],
        plan: task.plan.map((s, i) => ({ ...s, status: i === 0 ? "succeeded" : "pending" })),
      });
      await ctx.event("step", "Found the document", file.name);
    }
    const fields = z
      .record(z.string(), z.union([z.string(), z.boolean()]))
      .optional()
      .parse(task.input.fields);
    if (!fields || !Object.keys(fields).length) {
      const file = await this.files.get(owner, source.fileId);
      const names = file.fields
        ?.filter((f) => f.type !== "unsupported")
        .map((f) => f.name)
        .join(", ");
      if (!names)
        throw new Error(
          "This PDF has no supported fillable fields. Open it in Files to review it.",
        );
      return {
        status: "waiting_input",
        question: `Enter the form values you want to use. Supported fields: ${names}. The original PDF will stay intact.`,
        state: {
          ...task.state,
          source,
          missingFields: file.fields?.filter((f) => f.type !== "unsupported"),
        },
      };
    }
    let filledId = typeof task.state.filledId === "string" ? task.state.filledId : undefined;
    if (!filledId) {
      await ctx.guard();
      const filled = await this.files.fill(owner, source.fileId, fields, `document:${task.id}`);
      filledId = filled.id;
      task = await ctx.checkpoint({
        state: { ...task.state, source, filledId },
        artifactIds: [filledId],
        plan: task.plan.map((s, i) => ({ ...s, status: i <= 1 ? "succeeded" : "pending" })),
      });
      await ctx.event("step", "Saved a filled copy", filled.name);
    }
    const input: ProposalInput = {
      kind: "email.send",
      data: {
        to: [source.mail.from],
        cc: [],
        bcc: [],
        subject: /^re:/i.test(source.mail.subject)
          ? source.mail.subject
          : `Re: ${source.mail.subject}`,
        body:
          typeof task.input.reply === "string"
            ? task.input.reply
            : "Hello,\n\nPlease find the completed form attached.\n\nThank you.",
        attachmentIds: [filledId],
        threadId: source.mail.threadId,
        replyToMessageId: source.mail.id,
      },
    };
    const proposal = await this.prepare(owner, task, input, "document-reply", ctx);
    return {
      status: "waiting_approval",
      actionId: proposal.id,
      plan: task.plan.map((s, i) => ({
        ...s,
        status: i < 3 ? "succeeded" : i === 3 ? "waiting" : "pending",
      })),
    };
  }
  private async observe(
    owner: string,
    task: AgentTask,
    ctx: TaskContext,
  ): Promise<Partial<AgentTask>> {
    const monitor = await this.db.get<Monitor>(owner, "monitors", String(task.input.monitorId));
    if (!monitor) throw new Error("Monitor not found");
    if (monitor.status !== "active")
      return { status: monitor.status === "paused" ? "paused" : "cancelled" };
    let observation: { url: string; title: string; text: string; sessionId?: string };
    if (monitor.url === "sample://availability") {
      if (this.config.mode !== "sample") throw new Error("Sample source unavailable");
      const page = await this.db.get<{ text: string }>(owner, "sample-pages", "availability");
      observation = {
        url: monitor.url,
        title: "Sample dinner availability",
        text: page?.text ?? "No tables available. Check again later.",
      };
    } else {
      await ctx.guard();
      observation = await this.browser.observe(
        owner,
        monitor.url,
        typeof task.state.sessionId === "string" ? task.state.sessionId : undefined,
        ctx.signal,
      );
    }
    const text = observation.text.replace(/\s+/g, " ").trim();
    // 证据摘要保留原始换行结构（折叠空白但不折叠整行），
    // 让来源卡片中的 Markdown 块级语法（标题/列表/引用）能正常渲染。
    const excerpt = observation.text
      .replace(/[ \t]+/g, " ")
      .replace(/ +\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    const currentHash = hash(text);
    const currency =
      monitor.condition === "price_below" ? resolveMonitorCurrency(monitor) : undefined;
    if (monitor.condition === "price_below" && !currency)
      throw new Error("Choose a currency before this price watch can continue");
    const observedPrice = currency ? readMonitoredPrice(observation.text, currency) : undefined;
    const previousHash =
      typeof task.state.lastHash === "string" ? task.state.lastHash : monitor.lastHash;
    const matched =
      monitor.condition === "change"
        ? Boolean(previousHash && previousHash !== currentHash)
        : monitor.condition === "contains"
          ? text.toLowerCase().includes(monitor.value.toLowerCase())
          : observedPrice !== undefined && observedPrice < Number(monitor.value);
    const previouslyMatched = Boolean(task.state.matched);
    // For change watches, keep the page lines and a relative-time-free fingerprint of the whole text.
    const change = monitor.condition === "change";
    const lines = change ? pageLines(observation.text) : [];
    const timelessHash = change ? hash(withoutRelativeTimes(text)) : undefined;
    const savedPage =
      matched && change
        ? await this.db.get<MonitorPage>(owner, "monitor-pages", monitor.id)
        : undefined;
    // Saved lines can run ahead of a lost task outcome; use them only for the committed baseline.
    const baseline = savedPage?.hash === previousHash ? savedPage : undefined;
    // Only relative times changed anywhere on the page ("3 minutes ago"): keep watching quietly.
    const quiet = Boolean(baseline?.timelessHash && baseline.timelessHash === timelessHash);
    const shouldNotify =
      matched && !quiet && (monitor.condition === "change" || !previouslyMatched);
    const diff = baseline && shouldNotify ? diffPage(baseline.lines, lines) : undefined;
    // Empty when the change is past the saved lines; the alert then quotes the page instead.
    const changes = diff ? describePageDiff(diff) : "";
    // A notification-worthy observation is a new event, even when the page text is
    // identical to an earlier one (a change back to a seen state, or a condition that
    // cleared and reappeared). Commit its sequence with the outcome so publication
    // retries still deduplicate on the same saved notice key.
    const alertSequence = Number(task.state.alertSequence ?? 0) + (shouldNotify ? 1 : 0);
    const nextCheckAt = nextMonitorCheckAt(monitor);
    await ctx.guard();
    // Worker lease is checked before each publication; monitor control also invalidates that lease.
    const savedMonitor = await this.db.compareAndSwap(
      owner,
      "monitors",
      monitor.id,
      {
        status: "active",
        checks: monitor.checks,
        nextCheckAt: monitor.nextCheckAt,
        url: monitor.url,
        condition: monitor.condition,
        value: monitor.value,
      },
      {
        checks: monitor.checks + 1,
        lastCheckedAt: date(),
        lastHash: currentHash,
        lastValue: text.slice(0, 1000),
        nextCheckAt,
        error: null,
      },
    );
    if (!savedMonitor) throw new LostLeaseError();
    if (change)
      await this.db.put(owner, "monitor-pages", {
        id: monitor.id,
        hash: currentHash,
        timelessHash,
        lines,
      });
    await ctx.event(
      "observation",
      previousHash ? "Checked for changes" : "Saved the first observation",
      text.slice(0, 1000),
    );
    if (shouldNotify) {
      await ctx.guard();
      await ctx.event("result", "A meaningful change was found", changes || text.slice(0, 500));
    }
    const count = diff ? countPageDiff(diff) : "";
    return {
      status: "scheduled",
      nextRunAt: nextCheckAt,
      result: shouldNotify
        ? count
          ? `Change found: ${count}. A notification is ready.`
          : "Change found. A notification is ready."
        : "Watching. I'll check again on schedule.",
      state: {
        ...task.state,
        sessionId: observation.sessionId,
        lastHash: currentHash,
        resumingMonitor: false,
        matched,
        alertSequence,
        failures: 0,
        notice: shouldNotify
          ? {
              title: monitor.title,
              body: changes
                ? `Changed at ${observation.url}\n${changes}`
                : `Condition met at ${observation.url}: ${text.slice(0, 240)}`,
              key: `monitor:${monitor.id}:${alertSequence}:${currentHash}`,
            }
          : null,
      },
      error: null,
      evidence: [
        {
          id: monitor.id,
          kind: "web",
          title: observation.title,
          url: observation.url,
          excerpt: excerpt.slice(0, 600),
        },
      ],
      plan: task.plan.map((s) => ({ ...s, status: "succeeded" })),
    };
  }
}
