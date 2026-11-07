/**
 * Vectorize Hindsight 记忆引擎客户端封装。
 *
 * Hindsight 提供三种核心操作：
 *   - retain(bank, content)：写入，抽取事实 + 实体链接 + 构图
 *   - recall(bank, query)：召回，四路检索（语义/BM25/图/时间）+ 交叉编码重排 + token 预算裁剪
 *   - reflect(bank, query)：推理，基于 mission/directives/disposition 生成带引用的回答
 *
 * Memory bank 是隔离单元（"one per user or agent, fully isolated"），这里把
 * `owner + agentId` 拼接成 bankId，实现「每个 Agent 一个 bank」的隔离。
 *
 * 本客户端只做 HTTP 透传，依赖方（AgentService / ConversationAgent）负责决定
 * 何时 retain / recall，并在 Hindsight 不可用时优雅降级到本地关键词召回。
 */
export interface HindsightConfig {
  /** Hindsight API 基地址。自托管默认 http://localhost:8888；Cloud 为 https://api.hindsight.vectorize.io。 */
  baseUrl: string;
  /** Cloud 必填；自托管可空。 */
  apiKey?: string;
}

export interface RecallMemory {
  id: string;
  text?: string;
  kind?: string;
  score?: number;
  metadata?: Record<string, unknown>;
}

export interface RecallResult {
  query: string;
  memories: RecallMemory[];
  /** 是否启用了本地降级（Hindsight 不可用）。 */
  degraded?: boolean;
}

const DEFAULT_BASE_URL = "http://localhost:8888";
const RETAIN_TIMEOUT_MS = 10_000;
const RECALL_TIMEOUT_MS = 10_000;

export class HindsightClient {
  readonly enabled: boolean;
  private readonly baseUrl: string;
  private readonly apiKey?: string;

  constructor(config?: Partial<HindsightConfig>) {
    const baseUrl = (config?.baseUrl ?? process.env.HINDSIGHT_BASE_URL ?? DEFAULT_BASE_URL)
      .trim()
      .replace(/\/+$/, "");
    const apiKey = config?.apiKey ?? process.env.HINDSIGHT_API_KEY?.trim();
    this.baseUrl = baseUrl;
    this.apiKey = apiKey || undefined;
    // 未显式配置（既没有 baseUrl 覆盖、也没有 API key / 环境变量）时视为未启用，
    // 让调用方直接走本地降级，避免对默认地址做无意义请求。
    this.enabled = Boolean(config?.baseUrl || process.env.HINDSIGHT_BASE_URL);
  }

  /** bank 命名：owner + agentId，保证跨用户 / 跨 Agent 隔离。 */
  bankId(owner: string, agentId: string): string {
    return `${owner}:${agentId}`;
  }

  /** 写入一条记忆（事实抽取 + 实体链接 + 构图）。失败抛出，由调用方决定降级。 */
  async retain(
    owner: string,
    agentId: string,
    content: string,
    documentId?: string,
  ): Promise<void> {
    if (!this.enabled) return;
    const body: Record<string, unknown> = { content };
    // document_id 让 retain 幂等：同 id 重写会先删旧版记忆再重新抽取（去重 + 更新）。
    if (documentId) body.document_id = documentId;
    await this.request(`/v1/default/banks/${this.bankId(owner, agentId)}/memories/retain`, body);
  }

  /** 删除一个 document 及其所有记忆（删除记忆时同步 Hindsight）。失败抛出。 */
  async deleteDocument(owner: string, agentId: string, documentId: string): Promise<void> {
    if (!this.enabled) return;
    await this.request(
      `/v1/default/banks/${this.bankId(owner, agentId)}/documents/${documentId}`,
      {},
      "DELETE",
    );
  }

  /** 召回相关记忆。失败抛出，由调用方降级到本地关键词召回。 */
  async recall(
    owner: string,
    agentId: string,
    query: string,
    budgetTokens?: number,
  ): Promise<RecallResult> {
    if (!this.enabled) return { query, memories: [] };
    const body: Record<string, unknown> = { query };
    if (budgetTokens) body.max_tokens = budgetTokens;
    const raw = await this.request<Record<string, unknown>>(
      `/v1/default/banks/${this.bankId(owner, agentId)}/memories/recall`,
      body,
    );
    return {
      query,
      memories: this.normalizeMemories(raw),
    };
  }

  /**
   * 尽力把 Hindsight 返回的内存规整成统一的 { id, text, kind, score } 列表。
   * Hindsight 的响应结构会因版本 / 配置不同而变化，这里做宽容解析：
   * 接受 { memories: [...] }、{ results: [...] } 或顶层数组。
   */
  private normalizeMemories(raw: Record<string, unknown>): RecallMemory[] {
    const candidates: unknown[] = Array.isArray(raw)
      ? raw
      : ((raw.memories as unknown[]) ??
        (raw.results as unknown[]) ??
        (raw.data as unknown[]) ??
        []);
    if (!Array.isArray(candidates)) return [];
    return candidates.map((item, index) => {
      const record =
        item && typeof item === "object"
          ? (item as Record<string, unknown>)
          : { id: String(index), text: String(item) };
      const id =
        typeof record.id === "string" || typeof record.id === "number"
          ? String(record.id)
          : record.memory_id !== undefined
            ? String(record.memory_id)
            : String(index);
      const text =
        typeof record.text === "string"
          ? record.text
          : typeof record.content === "string"
            ? record.content
            : undefined;
      return {
        id,
        text,
        kind: typeof record.kind === "string" ? record.kind : undefined,
        score: typeof record.score === "number" ? record.score : undefined,
        metadata: record.metadata as Record<string, unknown> | undefined,
      };
    });
  }

  private async request<T = unknown>(
    path: string,
    body: Record<string, unknown>,
    method: "POST" | "DELETE" = "POST",
  ): Promise<T> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;
    const timeout = path.includes("/recall") ? RECALL_TIMEOUT_MS : RETAIN_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(
          `Hindsight ${method} ${path} failed: ${response.status} ${detail.slice(0, 200)}`,
        );
      }
      return (await response.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }
}
