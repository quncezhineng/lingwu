import { mkdir, rename, statfs } from "node:fs/promises";
import { dirname } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import { backgroundFailure } from "./log.ts";

/** 统一的行类型：records 的 data 列与 events 的自定义列都走它；字段用 `as`/`as unknown as` 取用。 */
type Row = { data?: unknown };
interface Database {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Row[] }>;
  close: () => Promise<void>;
}

export class Store {
  constructor(private readonly db: Database) {}
  async get<T = Record<string, unknown>>(
    owner: string,
    kind: string,
    id: string,
  ): Promise<T | null> {
    const result = await this.db.query(
      "SELECT data FROM records WHERE owner=$1 AND kind=$2 AND id=$3",
      [owner, kind, id],
    );
    return (result.rows[0]?.data as T | undefined) ?? null;
  }
  async list<T = Record<string, unknown>>(owner: string, kind: string): Promise<T[]> {
    const result = await this.db.query(
      "SELECT data FROM records WHERE owner=$1 AND kind=$2 ORDER BY updated_at DESC,id",
      [owner, kind],
    );
    return result.rows.map((row) => row.data as T);
  }
  /**
   * 分页读取某 owner 下某 kind 的记录，按 data->>'id' 升序，且 id 严格大于游标。
   * 用于存量迁移：游标即上次已处理的最大 id，天然支持断点续传、避免 OFFSET 深翻页。
   */
  async listAfter<T = Record<string, unknown>>(
    owner: string,
    kind: string,
    afterId: string | null,
    limit: number,
  ): Promise<T[]> {
    const result = await this.db.query(
      afterId
        ? `SELECT data FROM records WHERE owner=$1 AND kind=$2 AND data->>'id' > $3::text ORDER BY data->>'id' ASC LIMIT $4::int`
        : `SELECT data FROM records WHERE owner=$1 AND kind=$2 ORDER BY data->>'id' ASC LIMIT $3::int`,
      afterId ? [owner, kind, afterId, limit] : [owner, kind, limit],
    );
    return result.rows.map((row) => row.data as T);
  }
  async listByGoalId<T = Record<string, unknown>>(
    owner: string,
    kind: string,
    goalId: string,
  ): Promise<T[]> {
    const result = await this.db.query(
      "SELECT data FROM records WHERE owner=$1 AND kind=$2 AND data->>'goalId'=$3 ORDER BY updated_at DESC,id",
      [owner, kind, goalId],
    );
    return result.rows.map((row) => row.data as T);
  }
  async listByStatus<T = Record<string, unknown>>(
    owner: string,
    kind: string,
    status: string,
  ): Promise<T[]> {
    const result = await this.db.query(
      "SELECT data FROM records WHERE owner=$1 AND kind=$2 AND data->>'status'=$3 ORDER BY updated_at DESC,id",
      [owner, kind, status],
    );
    return result.rows.map((row) => row.data as T);
  }
  /** 按 data 里某个字符串字段过滤，用于「同一 owner 下按字段聚合」的场景（例如列出某用户的所有会话）。 */
  async listByField<T = Record<string, unknown>>(
    owner: string,
    kind: string,
    field: string,
    value: string,
  ): Promise<T[]> {
    const result = await this.db.query(
      `SELECT data FROM records WHERE owner=$1 AND kind=$2 AND data->>$3=$4 ORDER BY updated_at DESC,id`,
      [owner, kind, field, value],
    );
    return result.rows.map((row) => row.data as T);
  }
  async put<T extends { id: string }>(owner: string, kind: string, value: T): Promise<T> {
    await this.db.query(
      "INSERT INTO records(owner,kind,id,data) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(owner,kind,id) DO UPDATE SET data=excluded.data,updated_at=now()",
      [owner, kind, value.id, JSON.stringify(value)],
    );
    return value;
  }
  async remove(owner: string, kind: string, id: string): Promise<void> {
    await this.db.query("DELETE FROM records WHERE owner=$1 AND kind=$2 AND id=$3", [
      owner,
      kind,
      id,
    ]);
  }
  async compareAndSwap<T>(
    owner: string,
    kind: string,
    id: string,
    expected: Record<string, unknown>,
    patch: Record<string, unknown>,
  ): Promise<T | null> {
    const result = await this.db.query(
      "UPDATE records SET data=data || $5::jsonb,updated_at=now() WHERE owner=$1 AND kind=$2 AND id=$3 AND data @> $4::jsonb RETURNING data",
      [owner, kind, id, JSON.stringify(expected), JSON.stringify(patch)],
    );
    return (result.rows[0]?.data as T | undefined) ?? null;
  }
  // Update only the selected checkbox against the current row, preserving concurrent
  // additions, renames, reordering and other milestones' completion state.
  async setMilestoneDone<T>(
    owner: string,
    goalId: string,
    milestoneId: string,
    done: boolean,
    completedAt = new Date().toISOString(),
  ) {
    const result = await this.db.query(
      `UPDATE records SET data=jsonb_set(data, '{milestones}', (
        SELECT jsonb_agg(CASE WHEN item->>'id'=$3 THEN
          CASE WHEN $4::boolean
            THEN (item - 'completedAt') || jsonb_build_object('done', true, 'completedAt', $5::text)
            ELSE (item - 'completedAt') || jsonb_build_object('done', false)
          END
          ELSE item END ORDER BY ordinal)
        FROM jsonb_array_elements(data->'milestones') WITH ORDINALITY AS milestones(item, ordinal)
      )), updated_at=now()
      WHERE owner=$1 AND kind='goals' AND id=$2
        AND EXISTS (SELECT 1 FROM jsonb_array_elements(data->'milestones') item WHERE item->>'id'=$3)
      RETURNING data`,
      [owner, goalId, milestoneId, done, completedAt],
    );
    return (result.rows[0]?.data as T | undefined) ?? null;
  }
  async insertIfAbsent<T extends { id: string }>(
    owner: string,
    kind: string,
    value: T,
  ): Promise<T | null> {
    const result = await this.db.query(
      "INSERT INTO records(owner,kind,id,data) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT DO NOTHING RETURNING data",
      [owner, kind, value.id, JSON.stringify(value)],
    );
    return (result.rows[0]?.data as T | undefined) ?? null;
  }
  async scan<T>(kind: string): Promise<{ owner: string; value: T }[]> {
    const result = await this.db.query(
      "SELECT jsonb_build_object('owner',owner,'value',data) AS data FROM records WHERE kind=$1 ORDER BY updated_at ASC",
      [kind],
    );
    return result.rows.map((row) => row.data as { owner: string; value: T });
  }
  /**
   * 跨 owner 按 kind + id 取一条记录。
   *
   * 公开分享页访问者不知道记录属于谁，只能凭不可猜的随机 id 反查；
   * id 由服务端生成（高熵随机串），因此不需要再结合 owner 做隔离。
   */
  async getByKindAndId<T = Record<string, unknown>>(
    kind: string,
    id: string,
  ): Promise<{ owner: string; value: T } | null> {
    const result = await this.db.query(
      "SELECT jsonb_build_object('owner',owner,'value',data) AS data FROM records WHERE kind=$1 AND id=$2 LIMIT 1",
      [kind, id],
    );
    return (result.rows[0]?.data as { owner: string; value: T } | undefined) ?? null;
  }
  /** 某 kind 下去重后的 owner 列表（用于「对每个 owner 执行一次维护」的遍历）。 */
  async owners(kind: string): Promise<string[]> {
    // `ORDER BY owner` sorts the plain text column that is already in the DISTINCT
    // output, which works on both PGlite and real PostgreSQL. The previous
    // `ORDER BY data` referenced a jsonb alias that shadowed the table's `data`
    // column; real PostgreSQL rejects it with 42P10 (invalid_column_reference).
    const result = await this.db.query(
      "SELECT DISTINCT owner FROM records WHERE kind=$1 ORDER BY owner",
      [kind],
    );
    return result.rows.map((row) => (row as unknown as { owner: string }).owner);
  }
  async claim<T>(owner: string, id: string, status: string, now: string): Promise<T | null> {
    const result = await this.db.query(
      `UPDATE records AS action SET data=jsonb_set(data,'{status}',$4::jsonb),updated_at=now()
       WHERE owner=$1 AND kind='actions' AND id=$2 AND data->>'status'='awaiting_review'
       AND (data->>'expiresAt')::timestamptz>$3::timestamptz
       AND ($4::jsonb <> '"executing"'::jsonb OR data->>'taskId' IS NULL OR EXISTS (
         SELECT 1 FROM records task WHERE task.owner=action.owner AND task.kind='tasks'
         AND task.id=action.data->>'taskId' AND task.data->>'status' IN ('running','waiting_approval')
       )) RETURNING data`,
      [owner, id, now, JSON.stringify(status)],
    );
    return (result.rows[0]?.data as T | undefined) ?? null;
  }
  async recoverInterruptedActions(): Promise<void> {
    await this.db.query(
      `UPDATE records SET data=data || '{"status":"outcome_unknown","error":"Server restarted during execution. Check the provider before creating another action."}'::jsonb WHERE kind='actions' AND data->>'status'='executing'`,
    );
  }
  /**
   * 复核只在一段时间内等你的答复。过期的复核不再等任何人，交回给调用方收尾，
   * 免得它一直以「待确认」的身份点亮「通知」上的提示。
   */
  async expireStaleActions<T extends { taskId?: string }>(
    now: string,
  ): Promise<{ owner: string; value: T }[]> {
    const result = await this.db.query(
      `UPDATE records SET data=data || '{"status":"expired"}'::jsonb,updated_at=now()
       WHERE kind='actions' AND data->>'status'='awaiting_review'
       AND (data->>'expiresAt')::timestamptz <= $1::timestamptz
       RETURNING jsonb_build_object('owner',owner,'value',data) AS data`,
      [now],
    );
    return result.rows.map((row) => row.data as { owner: string; value: T });
  }
  async take<T>(owner: string, kind: string, id: string): Promise<T | null> {
    const result = await this.db.query(
      "DELETE FROM records WHERE owner=$1 AND kind=$2 AND id=$3 RETURNING data",
      [owner, kind, id],
    );
    return (result.rows[0]?.data as T | undefined) ?? null;
  }
  /**
   * 向事件日志追加一条事件（追加式，只进不出，P0「事件日志」基础设施）。
   *
   * 事件的版本号是该 stream 内从上一位+1 而来，用 `INSERT ... SELECT` 原子算出，
   * 两个并发追加会撞出相同的 version，靠 UNIQUE(stream_kind,stream_id,version)
   * 约束让后到者失败并重试——与 tasks 的 SQL 租约 CAS 同一套乐观并发哲学。
   *
   * 事件日志是旁路审计（append-only），不参与任务主状态的事务，写入失败仅记日志
   * 不影响任务执行——符合 PRD §7「并行双写灰度切换」的第一步。
   */
  async appendEvent(
    owner: string,
    streamKind: string,
    streamId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<{ seq: string; version: number }> {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const result = await this.db.query(
          `INSERT INTO events(owner,stream_kind,stream_id,version,event_type,payload)
           SELECT $1,$2,$3,COALESCE(MAX(version),0)+1,$4,$5::jsonb
           FROM events WHERE stream_kind=$2 AND stream_id=$3
           RETURNING seq,version`,
          [owner, streamKind, streamId, eventType, JSON.stringify(payload)],
        );
        const row = result.rows[0] as unknown as { seq?: string; version?: number };
        // 注意：INSERT...SELECT 某些实现里 max 没法拿到？不会——RETURNING 一定带版本号。
        return { seq: String(row.seq ?? ""), version: row.version ?? 0 };
      } catch (error) {
        // 唯一约束冲突（23505）= 并发追加撞了版本号，重算重试；其余错误原样抛出。
        if ((error as { code?: string }).code === "23505") continue;
        throw error;
      }
    }
    throw new Error("Could not append event: version conflicts exhausted");
  }
  /**
   * 按版本升序读回某个 stream 的完整事件流，用于审计与「读投影」重放。
   */
  async readEvents<
    T = Record<string, unknown>,
  >(streamKind: string, streamId: string): Promise<
    {
      owner: string;
      version: number;
      eventType: string;
      payload: T;
      occurredAt: string;
    }[]
  > {
    const result = await this.db.query(
      `SELECT owner,version,event_type as "eventType",payload,occurred_at as "occurredAt"
       FROM events WHERE stream_kind=$1 AND stream_id=$2 ORDER BY version ASC`,
      [streamKind, streamId],
    );
    return result.rows.map(
      (row) => row as unknown as {
        owner: string;
        version: number;
        eventType: string;
        payload: T;
        occurredAt: string;
      },
    );
  }
  /**
   * 「读投影」重建：把任务的事件流按顺序重放，合成当前状态（校验/恢复工具）。
   * records 表仍是任务的主读模型，本方法不写任何东西——用于排查与人工恢复。
   * 未知事件类型被忽略，保证向后兼容。返回 null 表示该任务没有事件。
   */
  async rebuildTask(owner: string, taskId: string): Promise<Record<string, unknown> | null> {
    const events = await this.readEvents("task", taskId);
    if (events.length === 0) return null;
    const state: Record<string, unknown> = {};
    for (const event of events) {
      const patch = event.payload as Record<string, unknown>;
      switch (event.eventType) {
        case "task_created":
          Object.assign(state, patch);
          break;
        case "task_claimed":
          Object.assign(state, {
            status: "running",
            leaseId: patch.leaseId,
            leaseUntil: patch.leaseUntil,
            attempts: patch.attempts,
          });
          break;
        case "task_checkpointed":
          Object.assign(state, patch);
          break;
        case "task_completed":
          Object.assign(state, { status: "succeeded", leaseId: null, leaseUntil: null }, patch);
          break;
        case "task_failed":
          Object.assign(state, { status: "failed", leaseId: null, leaseUntil: null }, patch);
          break;
        case "task_cancelled":
        case "task_paused":
        case "task_resumed":
        case "task_re_enqueued":
          Object.assign(state, { status: event.eventType === "task_paused" ? "paused" : "queued", leaseId: null, leaseUntil: null }, patch);
          break;
        default:
          break;
      }
    }
    return state;
  }
  close(): Promise<void> {
    return this.db.close();
  }
  async updateCredential(owner: string, connectionId: string, secret: string): Promise<boolean> {
    const result = await this.db.query(
      "UPDATE records SET data=jsonb_set(data,'{secret}',$3::jsonb),updated_at=now() WHERE owner=$1 AND kind='credentials' AND id='google' AND data->>'connectionId'=$2 RETURNING data",
      [owner, connectionId, JSON.stringify(secret)],
    );
    return result.rows.length === 1;
  }
}

/** Idle clients can be disconnected by a database restart; without a listener pg's `error` event crashes the process. */
export function createPool(connectionString: string) {
  const pool = new pg.Pool({ connectionString, max: 5 });
  pool.on("error", (error) => backgroundFailure("postgres pool", error));
  return pool;
}

/** 数据目录所在卷的剩余空间。磁盘写满时 WASM Postgres 只会抛不透明的 Aborted()，把余量补进日志才分得清原因。 */
async function freeSpace(path: string): Promise<string> {
  try {
    const stats = await statfs(path);
    return `${Math.round((stats.bavail * stats.bsize) / 1024 / 1024)} MiB`;
  } catch {
    return "未知";
  }
}

/**
 * 打开嵌入式 PGlite 数据目录，打不开时自愈。
 *
 * PGlite 把 Postgres 编译成 WASM 直接跑在数据目录上：进程被强杀、或宿主磁盘
 * （Render 持久盘是网络块存储）丢掉最后一次写入，都会让 `global/pg_control`
 * 残留成半截文件。此后每次启动 PGlite 都只抛出不透明的
 * `RuntimeError: Aborted(). Build with -sASSERTIONS for more info.`
 * ——Emscripten 不告诉我们具体原因（本地复现：控制文件损坏就是这个报错，其他
 * 损坏则报 `unreachable`）。数据目录在持久盘上重启不会自愈，服务会一直起不来。
 *
 * 这里把此前靠人工执行的恢复步骤自动化：损坏目录改名存档（**不删除**，留作取证
 * 或后续修复），换全新空目录重建。只自愈一次，重建后的空目录仍然打不开说明问题
 * 不在数据本身（磁盘写满/只读），此时带着磁盘余量抛出，交由调用方记录并退出。
 */
async function openEmbedded(dataDir: string | undefined): Promise<PGlite> {
  if (dataDir) await mkdir(dirname(dataDir), { recursive: true, mode: 0o700 });
  try {
    const embedded = new PGlite(dataDir);
    await embedded.waitReady;
    return embedded;
  } catch (error) {
    if (!dataDir) throw error;
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    const backup = `${dataDir}.corrupt-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    console.error(
      `[LingWu] 本地数据库打不开，已归档为 ${backup}（未删除）并改用全新目录重建 · 磁盘可用 ${await freeSpace(dataDir)} · ${detail.slice(0, 200)}`,
    );
    await rename(dataDir, backup).catch(() => undefined);
    await mkdir(dataDir, { recursive: true, mode: 0o700 });
    try {
      const embedded = new PGlite(dataDir);
      await embedded.waitReady;
      return embedded;
    } catch (retryError) {
      const retryDetail =
        retryError instanceof Error
          ? `${retryError.name}: ${retryError.message}`
          : String(retryError);
      console.error(
        `[LingWu] 重建后的空目录依然打不开，通常是磁盘写满或只读 · ${dataDir} · 磁盘可用 ${await freeSpace(dataDir)} · ${retryDetail.slice(0, 200)}`,
      );
      throw retryError;
    }
  }
}

export async function createStore(
  options: { dataDir?: string; databaseUrl?: string } = {},
): Promise<Store> {
  let database: Database;
  if (options.databaseUrl) {
    const pool = createPool(options.databaseUrl);
    database = { query: async (sql, params) => pool.query(sql, params), close: () => pool.end() };
  } else {
    const embedded = await openEmbedded(options.dataDir);
    database = {
      query: (sql, params) => embedded.query<Row>(sql, params),
      close: () => embedded.close(),
    };
  }
  await database.query(
    "CREATE TABLE IF NOT EXISTS records(owner text NOT NULL,kind text NOT NULL,id text NOT NULL,data jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(owner,kind,id))",
  );
  // P0「事件日志」：追加式事件流，version 是每个 stream 内的单调序号。
  // 唯一约束 (stream_kind,stream_id,version) 兜住并发追加，和 records 的 CAS 同一哲学。
  await database.query(
    "CREATE TABLE IF NOT EXISTS events(seq BIGSERIAL PRIMARY KEY,owner text NOT NULL,stream_kind text NOT NULL,stream_id text NOT NULL,version integer NOT NULL,event_type text NOT NULL,payload jsonb NOT NULL,occurred_at timestamptz NOT NULL DEFAULT now(),UNIQUE(stream_kind,stream_id,version))",
  );
  return new Store(database);
}
