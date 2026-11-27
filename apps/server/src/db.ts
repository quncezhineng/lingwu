import { mkdir, readdir, rename, rm, statfs } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import { backgroundFailure, describeError } from "./log.ts";

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
  /**
   * 记录库里出现过的所有 owner（records 主键第一列，跨所有 kind）。
   *
   * 与 `owners(kind)` 的区别：那个只在某个 kind 内去重，适合「按 kind 维护」；
   * 这个不分 kind，用于「必须覆盖所有用户」的一次性任务，例如把 CopilotKit 里的
   * 存量单聊历史回填进归档。只读、去重。
   */
  async allOwners(): Promise<string[]> {
    const result = await this.db.query("SELECT DISTINCT owner FROM records ORDER BY owner");
    return result.rows.map((row) => (row as unknown as { owner: string }).owner);
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
  async readEvents<T = Record<string, unknown>>(
    streamKind: string,
    streamId: string,
  ): Promise<
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
      (row) =>
        row as unknown as {
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
          Object.assign(
            state,
            {
              status: event.eventType === "task_paused" ? "paused" : "queued",
              leaseId: null,
              leaseUntil: null,
            },
            patch,
          );
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

/**
 * 连接串是否需要补一个「加密」默认值。
 *
 * 托管 Postgres（Supabase、Render Postgres）一律要求 TLS，但控制台给出的连接串默认
 * **不带** `sslmode`；node-postgres 在这种情况下走明文，会被服务端直接拒绝。本机
 * （localhost/127.0.0.1/::1）通常没有 TLS，保持原样以不影响本地开发。若连接串里已显式
 * 写了 `sslmode`/`ssl`，一律以它为准（`parse()` 的结果会覆盖传入的 ssl 选项）。
 */
function needsDefaultTls(connectionString: string): boolean {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    // 不是标准 URL（如 libpq 的 key=value 形式），交给 pg 自行解析，不做假设。
    return false;
  }
  const host = url.hostname;
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return false;
  return !url.searchParams.has("sslmode") && !url.searchParams.has("ssl");
}

/** Idle clients can be disconnected by a database restart; without a listener pg's `error` event crashes the process. */
export function createPool(connectionString: string) {
  const pool = new pg.Pool({
    connectionString,
    max: 5,
    // 远程库默认启用 TLS，粘贴 Supabase 连接串即可跑通；想改成严格校验 CA，
    // 在连接串里显式加 `?sslmode=verify-full` 覆盖此默认值即可。
    ...(needsDefaultTls(connectionString) ? { ssl: { rejectUnauthorized: false } } : {}),
  });
  pool.on("error", (error) => backgroundFailure("postgres pool", error));
  return pool;
}

/** 归档目录命名：`<postgres 目录名>.corrupt-<时间戳>`，与历史人工归档（`postgres.corrupt-20261028`）保持一致。 */
const CORRUPT_SUFFIX = ".corrupt-";
/** 重建所需的余量下限：低于它 PGlite 初始化写不进去，只能继续腾空间。 */
const REBUILD_FREE_BYTES = 64 * 1024 * 1024;

/** 目录所在卷的剩余字节数；读不到返回 null。 */
async function freeBytes(path: string): Promise<number | null> {
  try {
    const stats = await statfs(path);
    return stats.bavail * stats.bsize;
  } catch {
    return null;
  }
}

/** 剩余空间的人类可读文本。磁盘写满时 WASM Postgres 只会抛不透明的 Aborted()，把余量补进日志才分得清原因。 */
async function freeSpace(path: string): Promise<string> {
  const bytes = await freeBytes(path);
  return bytes === null ? "未知" : `${Math.round(bytes / 1024 / 1024)} MiB`;
}

/**
 * 清理更早的损坏归档，只保留 `keep`（未指定时保留最新一份）。
 *
 * 归档是整份 WASM Postgres 数据目录的副本。历史上每次损坏都靠人工 `mv` 归档、
 * 从不清理，多份累积正是持久盘被写满的主要来源；磁盘写满又会反过来让 PGlite 写不
 * 进去、再次损坏，形成「损坏 → 归档 → 更满 → 再损坏」的循环。
 */
async function pruneArchives(parent: string, prefix: string, keep: string | null) {
  const names = (await readdir(parent).catch(() => [])).filter(
    (name) => name.startsWith(prefix) && name !== keep,
  );
  names.sort();
  const keepName = keep ?? names.pop();
  await Promise.all(
    names
      .filter((name) => name !== keepName)
      .map((name) =>
        rm(join(parent, name), { recursive: true, force: true }).catch(() => undefined),
      ),
  );
}

/**
 * 打开嵌入式 PGlite 数据目录，打不开时自愈。
 *
 * PGlite 把 Postgres 编译成 WASM 直接跑在数据目录上。**持久盘写满**（Render 上
 * 1 GB 的 `lingwu-data`）是首要诱因：写入中途失败会让 `global/pg_control` 残留成
 * 半截文件，此后每次启动都只抛不透明的
 * `RuntimeError: Aborted(). Build with -sASSERTIONS for more info.`
 * ——Emscripten 不告诉我们原因（本地复现：截断控制文件就是这个报错）。数据目录在
 * 持久盘上重启不会自愈，服务会一直起不来。
 *
 * 自愈步骤：把损坏目录改名归档（不删除，留作取证）→ 清理更早的归档腾出空间
 * （改名本身不释放空间，所以腾地方靠删旧归档）→ 换全新空目录重建。重建后仍打不开
 * 说明磁盘真的满了，此时连本次归档一并删除，优先保证服务能起来；再失败才抛错。
 */
async function openEmbedded(dataDir: string | undefined): Promise<PGlite> {
  if (!dataDir) {
    const embedded = new PGlite(dataDir);
    await embedded.waitReady;
    return embedded;
  }
  const parent = dirname(dataDir);
  const name = basename(dataDir);
  const prefix = `${name}${CORRUPT_SUFFIX}`;
  await mkdir(parent, { recursive: true, mode: 0o700 });
  // 每次启动先清理陈旧归档，只留最新一份；顺带把此前遗留的归档空间收回来。
  await pruneArchives(parent, prefix, null);
  try {
    const embedded = new PGlite(dataDir);
    await embedded.waitReady;
    return embedded;
  } catch (error) {
    const backup = `${prefix}${new Date().toISOString().replace(/[:.]/g, "-")}`;
    console.error(
      `[LingWu] 本地数据库打不开（磁盘可用 ${await freeSpace(parent)}），已把损坏目录归档为 ${backup} 并重建 · ${describeError(error).slice(0, 200)}`,
    );
    // 归档 = 改名，不占新空间；真正的空间来自清理更早的归档。
    await rename(dataDir, join(parent, backup)).catch(() => undefined);
    await pruneArchives(parent, prefix, backup);
    const remaining = await freeBytes(parent);
    if (remaining !== null && remaining < REBUILD_FREE_BYTES) {
      console.error(
        `[LingWu] 磁盘仅剩 ${Math.round(remaining / 1024 / 1024)} MiB，连本次损坏归档一并删除以腾出空间`,
      );
      await rm(join(parent, backup), { recursive: true, force: true }).catch(() => undefined);
    }
    await mkdir(dataDir, { recursive: true, mode: 0o700 });
    try {
      const embedded = new PGlite(dataDir);
      await embedded.waitReady;
      return embedded;
    } catch (retryError) {
      console.error(
        `[LingWu] 重建后的空目录依然打不开，通常是磁盘写满或只读 · ${dataDir} · 磁盘可用 ${await freeSpace(parent)} · ${describeError(retryError).slice(0, 200)}`,
      );
      throw retryError;
    }
  }
}

/**
 * 建表语句（records / events），幂等（IF NOT EXISTS）。
 *
 * 独立抽出来是为了让「建库」只有一个来源：`createStore` 启动时执行它，
 * 数据迁移脚本（`migrate-to-postgres.ts`）也执行它，避免两处 DDL 各写一份而漂移。
 * events 的 UNIQUE(stream_kind,stream_id,version) 兜住并发追加，和 records 的 CAS 同一哲学。
 */
export const SCHEMA_STATEMENTS = [
  "CREATE TABLE IF NOT EXISTS records(owner text NOT NULL,kind text NOT NULL,id text NOT NULL,data jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(owner,kind,id))",
  "CREATE TABLE IF NOT EXISTS events(seq BIGSERIAL PRIMARY KEY,owner text NOT NULL,stream_kind text NOT NULL,stream_id text NOT NULL,version integer NOT NULL,event_type text NOT NULL,payload jsonb NOT NULL,occurred_at timestamptz NOT NULL DEFAULT now(),UNIQUE(stream_kind,stream_id,version))",
] as const;

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
  for (const statement of SCHEMA_STATEMENTS) await database.query(statement);
  return new Store(database);
}
