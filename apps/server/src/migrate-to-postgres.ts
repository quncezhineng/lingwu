/**
 * 把本地 PGlite 记录库（records / events 两张表）整体搬到托管 Postgres（Supabase）。
 *
 * 为什么需要它：切到 Supabase 后，应用只认 `DATABASE_URL` 指向的库；原先存在持久盘
 * PGlite 目录里的历史数据不会自动过去，用户看到的就是「更新一次又丢一次」。跑一次本
 * 脚本把存量搬过去，切换才是无缝的（代码侧早已支持 `DATABASE_URL`，见 `db.ts` 的
 * `createStore`）。
 *
 * 用法（在仓库根目录执行）：
 *   DATABASE_URL='postgresql://...' pnpm db:migrate
 *   DATABASE_URL='postgresql://...' pnpm db:migrate -- --from /path/to/.lingwu/postgres
 *
 * 幂等、可重复执行：
 *   - records 用主键 (owner,kind,id) upsert，同一条以源端数据覆盖；
 *   - events 用 UNIQUE(stream_kind,stream_id,version) 跳过已存在的版本，不会写重。
 */
import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { createPool, SCHEMA_STATEMENTS } from "./db.ts";

type RecordRow = { owner: string; kind: string; id: string; data: unknown };
type EventRow = {
  owner: string;
  stream_kind: string;
  stream_id: string;
  version: number;
  event_type: string;
  payload: unknown;
};

/** 解析 `--from <dir>`；缺省为 `$DATA_DIR/postgres`，与 index.ts 传给 createStore 的路径一致。 */
function sourceDir(argv: string[]): string {
  const index = argv.indexOf("--from");
  if (index >= 0 && argv[index + 1]) return resolve(argv[index + 1]);
  return resolve(process.env.DATA_DIR ?? ".lingwu", "postgres");
}

/** 连接串脱敏后再打印，避免把密码写进终端日志。 */
function mask(connectionString: string): string {
  return connectionString.replace(/\/\/[^@/]*@/, "//***@");
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error(
      "[迁移] 缺少 DATABASE_URL：请提供目标 Postgres 连接串（Supabase 控制台 Connect → Connection string）。",
    );
    process.exit(1);
  }
  const from = sourceDir(process.argv.slice(2));
  try {
    await access(from);
  } catch {
    console.error(
      `[迁移] 源 PGlite 目录不存在：${from}\n（默认读 $DATA_DIR/postgres，可用 -- --from <dir> 指定）`,
    );
    process.exit(1);
  }

  console.log(`[迁移] 源：PGlite ${from}`);
  console.log(`[迁移] 目标：${mask(databaseUrl)}`);

  const source = new PGlite(from);
  await source.waitReady;
  const target = createPool(databaseUrl);
  try {
    // 目标库若还没有 records/events 就先建表；已存在则整段跳过。
    // 跳过是有意为之：托管 Postgres（Supabase）上若两处并发建表，
    // `CREATE TABLE IF NOT EXISTS` 仍可能撞出 pg_type 唯一键（23505）而报错，
    // 先探测再决定是否建表能彻底避开这个坑。
    const existing = await target.query<{ records: string | null; events: string | null }>(
      "SELECT to_regclass('public.records') AS records, to_regclass('public.events') AS events",
    );
    if (existing.rows[0]?.records && existing.rows[0]?.events) {
      console.log("[迁移] 目标库已有 records/events 表，跳过建表。");
    } else {
      for (const statement of SCHEMA_STATEMENTS) await target.query(statement);
    }

    const records = await source.query<RecordRow>(
      "SELECT owner,kind,id,data FROM records ORDER BY updated_at ASC",
    );
    for (const row of records.rows) {
      await target.query(
        "INSERT INTO records(owner,kind,id,data) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(owner,kind,id) DO UPDATE SET data=excluded.data,updated_at=now()",
        [row.owner, row.kind, row.id, JSON.stringify(row.data)],
      );
    }

    const events = await source.query<EventRow>(
      "SELECT owner,stream_kind,stream_id,version,event_type,payload FROM events ORDER BY seq ASC",
    );
    let copiedEvents = 0;
    for (const row of events.rows) {
      const result = await target.query(
        "INSERT INTO events(owner,stream_kind,stream_id,version,event_type,payload) VALUES($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT(stream_kind,stream_id,version) DO NOTHING",
        [
          row.owner,
          row.stream_kind,
          row.stream_id,
          row.version,
          row.event_type,
          JSON.stringify(row.payload),
        ],
      );
      if (result.rowCount) copiedEvents += 1;
    }

    console.log(
      `[迁移] 完成：records ${records.rows.length} 条；events 新增 ${copiedEvents}/${events.rows.length} 条（已存在的版本自动跳过）。`,
    );
  } finally {
    await target.end();
    await source.close();
  }
}

await main();
