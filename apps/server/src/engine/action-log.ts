import { createHash, randomUUID } from "node:crypto";
import type {
  AgentActionActor,
  AgentActionKind,
  AgentActionLogEntry,
  AgentActionOutcome,
  AgentActionQuery,
  AgentActionRefs,
  AgentActionTarget,
} from "../../../../packages/domain/src/audit.ts";
import type { Store } from "../db.ts";
import { AppError } from "../errors.ts";

/** 一条记录就是一次动作，kind 固定，按 id 取用。 */
const KIND = "agent_action_log";

/** 天然可撤销的动作类型：撤销 = 把创建出来的东西删掉/取消。 */
const REVOCABLE: Record<AgentActionKind, boolean> = {
  task: true,
  plan: true,
  alert: true,
  note: true,
  thesis: false,
  connector: false,
};

export interface RecordActionInput {
  kind: AgentActionKind;
  action: string;
  actor?: AgentActionActor;
  outcome?: AgentActionOutcome;
  target?: AgentActionTarget;
  refs?: AgentActionRefs;
  detail?: string;
  threadId?: string;
  /** 幂等键；同 key 的记录只保留一条（用于 createTask 这类可能被重放的入口）。 */
  key?: string;
  /** 显式覆盖"能不能撤"，缺省按 kind 推。 */
  revocable?: boolean;
}

export interface UndoResult {
  undone: boolean;
  note: string;
}

export interface ActionLogDeps {
  db: Store;
  /**
   * 真正执行撤销。undoed=false 时 note 要说清"为什么撤不掉"，让人看到原因，
   * 而不是点了没反应。抛错会被包成 409。
   */
  undo?: (owner: string, entry: AgentActionLogEntry) => Promise<UndoResult>;
  now?: () => Date;
}

function actionLogId(kind: AgentActionKind, key: string): string {
  return createHash("sha256").update(`${kind}:${key}`).digest("hex");
}

/**
 * Agent 动作审计（R6）。
 *
 * 设计上只做两件事：留痕、撤销。它不判断该不该做——那属于审批与判级；
 * 它保证"做过的都看得见，能撤的都撤得掉"，出事时能一条条回溯。
 */
export class ActionLogService {
  constructor(private readonly deps: ActionLogDeps) {}

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  async record(owner: string, input: RecordActionInput): Promise<AgentActionLogEntry> {
    const at = this.now().toISOString();
    const id = input.key ? actionLogId(input.kind, input.key) : randomUUID();
    const entry: AgentActionLogEntry = {
      id,
      at,
      kind: input.kind,
      action: input.action,
      actor: input.actor ?? "assistant",
      outcome: input.outcome ?? "ok",
      revocable: input.revocable ?? REVOCABLE[input.kind],
      ...(input.target ? { target: input.target } : {}),
      ...(input.refs ? { refs: input.refs } : {}),
      ...(input.detail ? { detail: input.detail } : {}),
      ...(input.threadId ? { threadId: input.threadId } : {}),
      ...(input.key ? { key: input.key } : {}),
    };
    // 同一个 key 重放时保留第一次的时间，避免"任务派发时间"被后续调用改写。
    const existing = input.key
      ? await this.deps.db.get<AgentActionLogEntry>(owner, KIND, id)
      : null;
    const value = existing ? { ...entry, at: existing.at } : entry;
    return this.deps.db.put(owner, KIND, value);
  }

  async list(owner: string, query: AgentActionQuery = {}): Promise<AgentActionLogEntry[]> {
    const items = await this.deps.db.list<AgentActionLogEntry>(owner, KIND);
    const limit = query.limit ?? 50;
    return items
      .filter((entry) => (query.includeRevoked ? true : entry.outcome !== "revoked"))
      .filter((entry) => (query.kind ? entry.kind === query.kind : true))
      .filter((entry) => (query.actor ? entry.actor === query.actor : true))
      .filter((entry) => (query.symbol ? entry.target?.symbol === query.symbol : true))
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, Math.max(1, Math.min(200, limit)));
  }

  async get(owner: string, id: string): Promise<AgentActionLogEntry> {
    const entry = await this.deps.db.get<AgentActionLogEntry>(owner, KIND, id);
    if (!entry) throw new AppError("Action not found", 404);
    return entry;
  }

  /**
   * 撤销一条动作。
   *
   * 不可撤销 / 已撤销 / 撤销失败都要给出明确说明（写进 revokeNote），
   * 不做"点了没反应"。撤销成功后条目本身保留，标记 outcome=revoked，
   * 审计日志不允许删除，只允许被标注。
   */
  async revoke(
    owner: string,
    id: string,
  ): Promise<{ entry: AgentActionLogEntry; undone: boolean; note: string }> {
    const entry = await this.get(owner, id);
    if (entry.outcome === "revoked")
      return {
        entry,
        undone: true,
        note: entry.revokeNote ? `之前已经撤销过：${entry.revokeNote}` : "这条动作已经撤销过了。",
      };
    if (!entry.revocable || !this.deps.undo)
      return { entry, undone: false, note: "这类动作不支持撤销，需要你手动处理。" };

    let result: UndoResult;
    try {
      result = await this.deps.undo(owner, entry);
    } catch (error) {
      const message = error instanceof Error ? error.message : "撤销失败";
      throw new AppError(message, 409);
    }
    if (!result.undone) return { entry, undone: false, note: result.note };
    const next = await this.deps.db.put(owner, KIND, {
      ...entry,
      outcome: "revoked" as const,
      revokedAt: this.now().toISOString(),
      revokeNote: result.note,
    });
    return { entry: next, undone: true, note: result.note };
  }
}
