import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import { backgroundFailure } from "./log.ts";

type Row = { data: Record<string, unknown> };
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
    const result = await this.db.query(
      "SELECT DISTINCT jsonb_build_object('owner',owner) AS data FROM records WHERE kind=$1 ORDER BY data",
      [kind],
    );
    return result.rows.map((row) => (row.data as { owner: string }).owner);
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

export async function createStore(
  options: { dataDir?: string; databaseUrl?: string } = {},
): Promise<Store> {
  let database: Database;
  if (options.databaseUrl) {
    const pool = createPool(options.databaseUrl);
    database = { query: async (sql, params) => pool.query(sql, params), close: () => pool.end() };
  } else {
    if (options.dataDir) await mkdir(dirname(options.dataDir), { recursive: true, mode: 0o700 });
    const embedded = new PGlite(options.dataDir);
    await embedded.waitReady;
    database = {
      query: (sql, params) => embedded.query<Row>(sql, params),
      close: () => embedded.close(),
    };
  }
  await database.query(
    "CREATE TABLE IF NOT EXISTS records(owner text NOT NULL,kind text NOT NULL,id text NOT NULL,data jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(owner,kind,id))",
  );
  return new Store(database);
}
