/**
 * 分享记录的持久化。
 *
 * 分享是一条**对外承诺长期有效**的链接，不能和工作区数据一样只放在单库 PGlite 里：
 * 本地已经出现过三次数据目录被判损坏后整体重建（`.lingwu/postgres.corrupt-*`），
 * 每次重建都会让已经发出去的分享链接永久失效。所以分享改成「Supabase 为主、本地为兜底」：
 *
 * - 写入：先写本地（同一实例内立刻可读），再写 Supabase；只有两边都失败才算失败。
 * - 读取：先查本地，未命中再查 Supabase，命中后回填本地——数据目录重建过也能自动补回来，
 *   之后的读取也不必再走网络。
 *
 * 未配置 Supabase 时退化成纯本地，行为与改造前一致。
 */
import type { Config } from "./config.ts";
import type { Store } from "./db.ts";
import { backgroundFailure } from "./log.ts";

/** 分享记录。`id` 同时是数据库主键与 URL 路径段。 */
export interface ShareRecord {
  id: string;
  /** 用户提问；可能为空（例如会话首条就是助手消息）。 */
  question: string;
  /** 助手回复的原始 Markdown。 */
  answer: string;
  createdAt: string;
}

/** 分享的读写接口：路由层只依赖它，不关心记录最终落在哪。 */
export interface ShareStore {
  /** 落一条分享。`owner` 是创建者，回填本地时用来还原归属。 */
  put(owner: string, record: ShareRecord): Promise<void>;
  /** 按 id 取一条分享；不存在返回 null。公开页调用，调用方未必有 owner。 */
  get(id: string): Promise<ShareRecord | null>;
}

/** 本地库里的集合名（改造前就存在，保持一致以免历史记录读不到）。 */
const SHARES_KIND = "shares";
/** Supabase 表名。与 `lingwu_audit_logs` / `lingwu_resources` 同前缀。 */
const SHARE_TABLE = "lingwu_shares";
/** 远端读写的硬超时：分享页是对外页面，宁可降级到本地也不让请求挂住。 */
const REMOTE_TIMEOUT_MS = 5000;

/** 远端返回的一行（snake_case），要求带 owner 以便回填本地。 */
type RemoteShare = { owner: string; value: ShareRecord };

/**
 * Supabase 侧的分享表客户端。
 *
 * 直接用 service_role 密钥调 PostgREST：表上启用了 RLS 且只放开 select，
 * 服务端写入靠 service_role 绕过策略，与账号体系那边的做法一致。
 */
class SupabaseShares {
  constructor(
    private readonly url: string,
    private readonly serviceRoleKey: string,
  ) {}

  private endpoint(path: string): string {
    return `${this.url.replace(/\/+$/, "")}${path}`;
  }

  private get headers(): Record<string, string> {
    return {
      apikey: this.serviceRoleKey,
      Authorization: `Bearer ${this.serviceRoleKey}`,
      "Content-Type": "application/json",
    };
  }

  /** 写入一条分享；主键冲突时覆盖（同一 id 重试不会报错）。 */
  async put(owner: string, record: ShareRecord): Promise<boolean> {
    try {
      const response = await fetch(this.endpoint(`/rest/v1/${SHARE_TABLE}`), {
        method: "POST",
        headers: {
          ...this.headers,
          // merge-duplicates = upsert；写入是用户点「分享」时的一次性动作，幂等更稳妥。
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify({
          id: record.id,
          owner,
          question: record.question,
          answer: record.answer,
          created_at: record.createdAt,
        }),
        signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /** 按 id 读取一条分享；网络故障、表未建、行不存在都按「没有」处理。 */
  async get(id: string): Promise<RemoteShare | null> {
    try {
      const query = new URLSearchParams({
        id: `eq.${id}`,
        select: "id,owner,question,answer,created_at",
        limit: "1",
      });
      const response = await fetch(this.endpoint(`/rest/v1/${SHARE_TABLE}?${query.toString()}`), {
        headers: { ...this.headers, Accept: "application/json" },
        signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS),
      });
      if (!response.ok) return null;
      const rows: unknown = await response.json();
      if (!Array.isArray(rows) || !rows.length) return null;
      return parseRemoteShare(rows[0]);
    } catch {
      return null;
    }
  }
}

/** 把 PostgREST 返回的一行转成 `ShareRecord`；形状不对就当没有。 */
function parseRemoteShare(row: unknown): RemoteShare | null {
  if (!row || typeof row !== "object") return null;
  const fields = row as Record<string, unknown>;
  const { id, answer } = fields;
  if (typeof id !== "string" || !id) return null;
  if (typeof answer !== "string" || !answer) return null;
  return {
    owner: typeof fields.owner === "string" && fields.owner ? fields.owner : "local-user",
    value: {
      id,
      question: typeof fields.question === "string" ? fields.question : "",
      answer,
      // PostgREST 把 timestamptz 序列化成带时区的 ISO 串，直接透传即可。
      createdAt: typeof fields.created_at === "string" ? fields.created_at : "",
    },
  };
}

/** 仅在配置了 Supabase 项目时启用远端表，否则纯本地。 */
function remoteShares(config: Config): SupabaseShares | undefined {
  const { supabaseUrl, supabaseServiceRoleKey } = config;
  if (!supabaseUrl || !supabaseServiceRoleKey) return undefined;
  return new SupabaseShares(supabaseUrl, supabaseServiceRoleKey);
}

/** 组装分享存储：本地库 + 可选的 Supabase 持久层。 */
export function createShareStore(deps: { db: Store; config: Config }): ShareStore {
  const { db, config } = deps;
  const remote = remoteShares(config);
  return {
    async put(owner, record) {
      // 本地先写：同一实例内立刻可读，也顺便兜住远端故障。
      const localError = await db.put(owner, SHARES_KIND, record).then(
        () => null,
        (error: unknown) => error,
      );
      if (!remote) {
        if (localError) throw localError;
        return;
      }
      if (await remote.put(owner, record)) return;
      // 远端没写进去：本地已经存住就不打扰用户，只留后台日志。
      if (localError) throw localError;
      backgroundFailure("share.persist", new Error(`share ${record.id} stayed local only`));
    },

    async get(id) {
      const local = await db.getByKindAndId<ShareRecord>(SHARES_KIND, id);
      if (local) return local.value;
      if (!remote) return null;
      const found = await remote.get(id);
      if (!found) return null;
      // 回填本地：数据目录被重建过也能自动补回来，后续读取不再走网络。
      void db
        .put(found.owner, SHARES_KIND, found.value)
        .catch((error: unknown) => backgroundFailure("share.backfill", error));
      return found.value;
    },
  };
}
