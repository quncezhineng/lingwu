/**
 * 文件本体的存储层抽象。
 *
 * 背景：上传的文件本体（PDF/图片等）原先直接写在 API 进程的持久盘
 * （`DATA_DIR/files` 与 `DATA_DIR/desktop-screens`）。记录库迁到托管 Postgres 后，
 * 丢数据的风险已经转移到「文件还留在容器磁盘上」：盘写满会传不进新文件，实例/磁盘
 * 一旦重建，旧文件也没有任何副本。这里把「文件字节存哪里」抽成接口：
 *
 * - 未配置 Supabase → 本地磁盘实现（本地开发默认，行为与改造前完全一致）；
 * - 配置了 Supabase → 存进 Supabase Storage 的对象桶，与 Render 磁盘解耦，
 *   天然多副本、可扩容，部署/扩容都不会动到文件。
 *
 * 本模块只负责字节；文件元数据（文件名、页数等）仍走数据库（`records` 表）。
 * 对象键沿用改造前的磁盘相对路径（如 `files/<id>.pdf`），因此历史文件读不到远端时
 * 可以原样回退到本地盘，迁移前后路径一一对应。
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import type { Config } from "./config.ts";

/** 对象桶名；迁移脚本与读取回填都认它。 */
export const BUCKET = "lingwu-files";
/** 上传超时。文件上限 10 MB，跨区上传给足时间。 */
const PUT_TIMEOUT_MS = 30_000;
/** 下载/删除的硬超时，避免请求卡住整个上传/查看流程。 */
const GET_TIMEOUT_MS = 15_000;

/** 文件字节的读写接口：调用方只依赖它，不关心最终落在磁盘还是对象存储。 */
export interface BlobStore {
  /** 覆盖写入一个对象。 */
  put(key: string, bytes: Uint8Array): Promise<void>;
  /** 仅当对象不存在时写入；已存在则返回 false（用于按操作键去重）。 */
  create(key: string, bytes: Uint8Array): Promise<boolean>;
  /**
   * 读取对象；不存在返回 null。
   * 返回类型定为 `Uint8Array<ArrayBuffer>`：字节可直接喂给 fetch 请求体或 Hono 响应体
   * （两者都要求 ArrayBuffer 支撑的视图，不接受 SharedArrayBuffer 支撑的视图）。
   */
  get(key: string): Promise<Uint8Array<ArrayBuffer> | null>;
  /** 删除对象；不存在也视为成功。 */
  remove(key: string): Promise<void>;
}

/** 本地磁盘实现：对象键直接映射到 `root` 下的相对路径（改造前的行为）。 */
export class LocalBlobStore implements BlobStore {
  constructor(private readonly root: string) {}

  /** 把相对键解析成 `root` 下的绝对路径，并挡住 `..` 之类的越界键。 */
  private pathFor(key: string): string {
    const base = resolve(this.root);
    const target = resolve(base, key);
    if (target !== base && !target.startsWith(`${base}${sep}`))
      throw new Error(`Invalid blob key: ${key}`);
    return target;
  }

  async put(key: string, bytes: Uint8Array): Promise<void> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await writeFile(path, bytes, { mode: 0o600 });
  }

  async create(key: string, bytes: Uint8Array): Promise<boolean> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    try {
      await writeFile(path, bytes, { mode: 0o600, flag: "wx" });
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
      throw error;
    }
  }

  async get(key: string): Promise<Uint8Array<ArrayBuffer> | null> {
    try {
      // `Uint8Array.from` 产出 ArrayBuffer 支撑的视图，类型上可直接作为响应体。
      return Uint8Array.from(await readFile(this.pathFor(key)));
    } catch {
      return null;
    }
  }

  async remove(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }
}

/**
 * Supabase Storage 实现。
 *
 * 直接用 service_role 密钥调 Storage REST API（与 supabase-data.ts / share-store.ts 一致，
 * 不引入 @supabase/supabase-js 依赖）。桶为私有，对象只经灵悟 API 中转，不对外暴露。
 *
 * `legacy` 是本地磁盘兜底：切存储之前落盘的历史文件还在，远端读不到时回退到这里，
 * 顺手回填远端，之后就不必再读本地盘。
 */
export class SupabaseBlobStore implements BlobStore {
  constructor(
    private readonly url: string,
    private readonly serviceRoleKey: string,
    private readonly legacy: BlobStore,
  ) {}

  private endpoint(path: string): string {
    return `${this.url.replace(/\/+$/, "")}${path}`;
  }

  private get authHeaders(): Record<string, string> {
    return { apikey: this.serviceRoleKey, Authorization: `Bearer ${this.serviceRoleKey}` };
  }

  /** 建桶只需一次；并发调用共享同一个 Promise，失败不缓存以便下次重试。 */
  private bucketReady?: Promise<void>;

  private ensureBucket(): Promise<void> {
    this.bucketReady ??= (async () => {
      const response = await fetch(this.endpoint("/storage/v1/bucket"), {
        method: "POST",
        headers: { ...this.authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }),
        signal: AbortSignal.timeout(GET_TIMEOUT_MS),
      });
      // 已存在（400/409）也算成功；其它状态码才抛出，让上层看到真实原因。
      if (response.ok || response.status === 400 || response.status === 409) return;
      throw new Error(`supabase storage bucket ${BUCKET}: ${response.status}`);
    })();
    this.bucketReady = this.bucketReady.catch((error: unknown) => {
      this.bucketReady = undefined;
      throw error;
    });
    return this.bucketReady;
  }

  private async upload(key: string, bytes: Uint8Array, upsert: boolean): Promise<Response> {
    await this.ensureBucket();
    return fetch(this.endpoint(`/storage/v1/object/${BUCKET}/${key}`), {
      method: "POST",
      headers: {
        ...this.authHeaders,
        "Content-Type": "application/octet-stream",
        "Cache-Control": "no-store",
        "x-upsert": upsert ? "true" : "false",
      },
      // Uint8Array 在 fetch 的 BodyInit 里要求 ArrayBuffer 支撑；用 Blob 包一层最稳妥
      // （与 supabase-auth.ts 上传头像的写法一致），也避免类型断言。
      body: new Blob([Uint8Array.from(bytes)], { type: "application/octet-stream" }),
      signal: AbortSignal.timeout(PUT_TIMEOUT_MS),
    });
  }

  async put(key: string, bytes: Uint8Array): Promise<void> {
    const response = await this.upload(key, bytes, true);
    if (response.ok) return;
    const detail = await response.text().catch(() => "");
    throw new Error(`supabase storage put ${key}: ${response.status} ${detail}`);
  }

  async create(key: string, bytes: Uint8Array): Promise<boolean> {
    const response = await this.upload(key, bytes, false);
    if (response.ok) return true;
    const detail = await response.text().catch(() => "");
    // Supabase 对「对象已存在」返回 400/409，正文含 Duplicate / already exists。
    if ((response.status === 400 || response.status === 409) && /exist|duplicate/i.test(detail))
      return false;
    throw new Error(`supabase storage create ${key}: ${response.status} ${detail}`);
  }

  async get(key: string): Promise<Uint8Array<ArrayBuffer> | null> {
    const response = await fetch(this.endpoint(`/storage/v1/object/${BUCKET}/${key}`), {
      headers: this.authHeaders,
      signal: AbortSignal.timeout(GET_TIMEOUT_MS),
    });
    // arrayBuffer() 返回标准 ArrayBuffer，包成视图后即是 ArrayBuffer 支撑、可作响应体。
    if (response.ok) return new Uint8Array(await response.arrayBuffer());
    // 400/404：远端没有这个对象，多半是切存储前的历史文件——回退本地并顺手回填。
    if (response.status === 400 || response.status === 404) {
      const legacy = await this.legacy.get(key);
      if (legacy) void this.put(key, legacy).catch(() => {});
      return legacy;
    }
    throw new Error(`supabase storage get ${key}: ${response.status}`);
  }

  async remove(key: string): Promise<void> {
    // 删除是尽力而为：与改造前一致，数据库记录先删，物理文件清理失败不影响用户。
    await fetch(this.endpoint(`/storage/v1/object/${BUCKET}`), {
      method: "DELETE",
      headers: { ...this.authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ prefixes: [key] }),
      signal: AbortSignal.timeout(GET_TIMEOUT_MS),
    }).catch(() => undefined);
    await this.legacy.remove(key).catch(() => undefined);
  }
}

/** 选中实现：配置了 Supabase 就用对象存储，否则退回本地磁盘（与改造前一致）。 */
export function createBlobStore(config: Config): BlobStore {
  const local = new LocalBlobStore(config.dataDir);
  const { supabaseUrl, supabaseServiceRoleKey } = config;
  if (!supabaseUrl || !supabaseServiceRoleKey) return local;
  return new SupabaseBlobStore(supabaseUrl, supabaseServiceRoleKey, local);
}
