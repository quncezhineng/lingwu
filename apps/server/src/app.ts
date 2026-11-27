import "./config.ts";
import { randomBytes, randomUUID } from "node:crypto";
import { type Message, MessageSchema } from "@ag-ui/core";
import { CopilotKitIntelligence } from "@copilotkit/runtime/v2";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { z } from "zod";
import {
  type Channel,
  type ChannelMessage,
  calendarRangeSchema,
  channelHistoryPage,
  channelInputSchema,
  channelMessageInputSchema,
  channelUpdateSchema,
  DEFAULT_CHANNEL_AVATAR,
  deliverableSchema,
  emailDraftSchema,
  type OrchestrationPlan,
  proposalSchema,
  researchSpaceSchema,
} from "../../../packages/domain/src/index.ts";
import type { MarketDataService } from "../../../packages/integrations/src/market-data.ts";
import { ActionService } from "./actions.ts";
import { agentConfigured, makeRuntime } from "./agent.ts";
import {
  agentSpaceSchema,
  type MarketAgentRecord,
  type PersistedAgentSpace,
} from "./agent-space.ts";
import { createAuth } from "./auth.ts";
import { BrowserService } from "./browser.ts";
import { ChannelMirror } from "./channel-mirror.ts";
import { ComputerService, type DockerRunner } from "./computer.ts";
import { computerRoutes } from "./computer-routes.ts";
import { assertApiDeploymentConfig, type Config } from "./config.ts";
import { appConnectorRoutes } from "./connectors/routes.ts";
import { ConversationArchive } from "./conversation-archive.ts";
import {
  ConversationHistory,
  conversationHistoryPage,
  historyQuery,
  withMessageTimes,
} from "./conversation-history.ts";
import type { Store } from "./db.ts";
import { auditRoutes } from "./engine/audit-routes.ts";
import { briefingRoutes } from "./engine/briefing-routes.ts";
import { listChannelMessages, runChannelChat } from "./engine/channel-chat.ts";
import { financialRoutes } from "./engine/financial-routes.ts";
import { investorRoutes } from "./engine/investor-routes.ts";
import { marketRoutes } from "./engine/market-routes.ts";
import { noteRoutes } from "./engine/notes-routes.ts";
import { portfolioRoutes } from "./engine/portfolio-routes.ts";
import { priceAlertRoutes } from "./engine/price-alert-routes.ts";
import { researchRoutes } from "./engine/research-routes.ts";
import { agentRoutes } from "./engine/routes.ts";
import { AgentService } from "./engine/service.ts";
import { ConversationStream } from "./engine/stream.ts";
import { conversationStreamRoutes } from "./engine/stream-routes.ts";
import { symbolRoutes, watchlistRoutes } from "./engine/watchlist-routes.ts";
import { AppError } from "./errors.ts";
import { Files } from "./files.ts";
import { GoogleAuth } from "./google-auth.ts";
import { getMarketDataHealth } from "./market-data-health.ts";
import { applyModel, isOfferedModel } from "./models.ts";
import { resolveTaskNotifications } from "./notifications.ts";
import { getPdfHealth } from "./pdf-health.ts";
import { createRateLimitStore, rateLimit } from "./rate-limit.ts";
import type { SearchService } from "./search.ts";
import { shareApiRoutes, sharePageRoutes } from "./share-routes.ts";
import { createShareStore } from "./share-store.ts";
import { createSupabaseAuth, type SupabaseAuth } from "./supabase-auth.ts";
import { createSupabaseData } from "./supabase-data.ts";
import { WorkspaceService } from "./workspace.ts";

/**
 * 首页 / 侧栏预览每个会话时，只回最近这么多条消息。
 *
 * 「最近一条回复」在绝大多数情况下都落在这个窗口内，取整页历史既无必要又让响应体膨胀。
 */
const PREVIEW_SCAN = 30;

/** 频道消息裁剪：只留预览文案用得到的字段，工具过程、附件等大字段不回传。 */
function previewChannelMessage(message: ChannelMessage) {
  return { id: message.id, role: message.role, text: message.text, createdAt: message.createdAt };
}

/**
 * 单聊消息裁剪：role/content 足够算出预览；消息自带 createdAt 时一并保留（用于按活跃度排序）。
 *
 * 入参用 `unknown`：会话历史返回的是 Rich Threads 的 ThreadMessage，比 AG-UI 的
 * `Message` 宽（多了 activity 等形态），按字段安全取值即可。
 */
function previewAgentMessage(message: unknown) {
  const record = (message ?? {}) as {
    id?: unknown;
    role?: unknown;
    content?: unknown;
    createdAt?: unknown;
  };
  return {
    id: typeof record.id === "string" ? record.id : "",
    role: typeof record.role === "string" ? record.role : "",
    content: record.content,
    ...(typeof record.createdAt === "string" ? { createdAt: record.createdAt } : {}),
  };
}

/**
 * 云端「这条线程读不到」的两类信号：
 *   - 404 `THREAD_NOT_FOUND`：线程从没建过、或已被清理（例如换过 Intelligence 项目）；
 *   - 400 `VALIDATION_ERROR`：线程 id 不是标准 UUID（客户端占位 id，如主线程加载前的 `local`）。
 *
 * 读历史时这两类都按「没有历史」处理——首页预览、打开会话不该因为某条线程缺失而整体报错。
 * SDK 未导出 `PlatformRequestError` 类，只能按 `status` 属性判断（见 docs/timeline.md）。
 */
function isMissingCloudThread(error: unknown): boolean {
  const status =
    error && typeof error === "object" ? (error as { status?: unknown }).status : undefined;
  return status === 404 || status === 400;
}

/**
 * 把 agent-space 里「已公开」的智能体同步到跨用户可见的智能体市场。
 *
 * - 公开：写入一条市场快照（含发布者昵称，供市场页显示「@昵称」）；
 * - 撤回公开或删除智能体：同步移除对应快照；
 * - 内容没有变化时不重复写入，保留首次发布时间。
 *
 * 市场记录挂在发布者自己的 owner 下（kind=market-agents），读取端用 `scan`
 * 跨 owner 拉全量，因此这里不需要任何跨用户写权限。
 */
async function syncAgentMarket(
  db: Store,
  owner: string,
  state: PersistedAgentSpace,
  accounts: SupabaseAuth | undefined,
) {
  const published = state.agents.filter((agent) => !agent.system && agent.public === true);
  const existing = await db.list<MarketAgentRecord>(owner, "market-agents");
  const existingById = new Map(existing.map((record) => [record.id, record]));
  const wantedIds = new Set<string>();
  let ownerName: string | undefined;
  if (published.length > 0 && accounts) {
    const profile = await accounts.readProfile(owner);
    ownerName = profile.displayName;
  }
  // 账户级自建技能库按 id 建索引，供下面解析 Agent 的 skillRefs 引用。
  const libraryById = new Map((state.skillLibrary ?? []).map((skill) => [skill.id, skill]));
  // 技能内容键与移动端 heldCustomSkills 的去重键保持一致（name/purpose/instructions/outputFormat）：
  // 同一份内容的不同 id 算重复；内容可变而 id 不变，因此比较时不能只比 id。
  const skillContentKey = (skill: {
    name: string;
    purpose: string;
    instructions: string;
    outputFormat: string;
  }) => [skill.name, skill.purpose, skill.instructions, skill.outputFormat].join("\u0000");
  // 完整签名再带上 enabled，用于判断某条技能记录相对于市场快照是否真的变了。
  const skillSignature = (skill: { enabled: boolean } & Parameters<typeof skillContentKey>[0]) =>
    `${skill.enabled ? "1" : "0"}\u0000${skillContentKey(skill)}`;
  const now = new Date().toISOString();
  for (const agent of published) {
    const id = `${owner}:${agent.id}`;
    wantedIds.add(id);
    const previous = existingById.get(id);
    // 自建技能快照：先按 skillRefs 顺序从账户级技能库解析引用，再追加 agent.customSkills
    // 里不在引用中的残留副本，最后按内容去重并截断到市场记录 schema 的上限（60）。
    const customSkills: NonNullable<MarketAgentRecord["customSkills"]> = [];
    const referencedIds = new Set(agent.skillRefs ?? []);
    const seenKeys = new Set<string>();
    const maxCustomSkills = 60;
    const pushSkill = (skill: (typeof customSkills)[number]) => {
      if (customSkills.length >= maxCustomSkills) return;
      const key = skillContentKey(skill);
      if (seenKeys.has(key)) return;
      seenKeys.add(key);
      customSkills.push(skill);
    };
    for (const skillId of agent.skillRefs ?? []) {
      const skill = libraryById.get(skillId);
      if (skill) pushSkill(skill);
    }
    for (const skill of agent.customSkills ?? []) {
      if (referencedIds.has(skill.id)) continue;
      pushSkill(skill);
    }
    const next: MarketAgentRecord = {
      id,
      owner,
      ownerName,
      agentId: agent.id,
      name: agent.name,
      role: agent.role,
      persona: agent.persona,
      avatar: agent.avatar,
      // 公开的技能只含「从技能库添加的技能」：目录技能 id + 自建技能快照，
      // 模板预置的内部能力键（skills）不进入公开数据。
      installedSkills: [...(agent.installedSkills ?? [])],
      // 公开时同步自建技能完整快照（跨用户时对方看不到发布方的技能库，必须复制元数据）。
      customSkills,
      connectors: [...(agent.installedConnectors ?? [])],
      instructions: agent.instructions,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    };
    const unchanged =
      previous &&
      previous.ownerName === next.ownerName &&
      previous.name === next.name &&
      previous.role === next.role &&
      previous.persona === next.persona &&
      previous.avatar === next.avatar &&
      previous.instructions === next.instructions &&
      (previous.installedSkills ?? []).length === (next.installedSkills ?? []).length &&
      (previous.installedSkills ?? []).every(
        (skillId, index) => skillId === (next.installedSkills ?? [])[index],
      ) &&
      (previous.customSkills ?? []).length === (next.customSkills ?? []).length &&
      (previous.customSkills ?? []).every(
        (skill, index) =>
          skillSignature(skill) === skillSignature((next.customSkills ?? [])[index]),
      ) &&
      (previous.connectors ?? []).length === (next.connectors ?? []).length &&
      (previous.connectors ?? []).every((id, index) => id === (next.connectors ?? [])[index]);
    if (!unchanged) await db.put(owner, "market-agents", next);
  }
  for (const record of existingById.values()) {
    if (!wantedIds.has(record.id)) await db.remove(owner, "market-agents", record.id);
  }
}

/**
 * 广场读取前的自愈同步：
 *
 * 早期公开记录可能只带内部能力键 `skills`，缺少后来补上的
 * `installedSkills` / `customSkills` 快照。若只修「保存时同步」，历史上已经公开、
 * 但发布者没有再次编辑/公开过的智能体会继续挂着旧快照，导入方仍然拿不到自建技能。
 *
 * 这里按 owner 读取当前 `agent-space`，用现有 `syncAgentMarket` 规则重建/修正广场快照。
 * 这样市场列表天然具备“读时修复”能力：
 * - 已公开但快照陈旧：补齐目录技能 / 自建技能 / 连接器；
 * - 已公开但快照缺失：重新创建；
 * - 已撤回公开但旧快照残留：顺手移除。
 */
async function repairAgentMarketOnRead(db: Store, accounts: SupabaseAuth | undefined) {
  for (const owner of await db.owners("agent-settings")) {
    const saved = await db.get<(PersistedAgentSpace & { id: string }) | null>(
      owner,
      "agent-settings",
      "space",
    );
    if (!saved) continue;
    const { id: _id, ...state } = saved;
    await syncAgentMarket(db, owner, state, accounts);
  }
}

export async function createApp(
  db: Store,
  config: Config,
  options: {
    docker?: DockerRunner;
    market?: MarketDataService;
    search?: SearchService;
  } = {},
) {
  assertApiDeploymentConfig(config);
  const auth = await createAuth(db, config),
    files = new Files(db, config, auth),
    google = new GoogleAuth(db, config),
    workspace = new WorkspaceService(db, config, files, google),
    // 配置了 Supabase 项目就有账号体系；否则回退到单一共享访问密钥。
    accounts = createSupabaseAuth(config),
    // 操作行为日志与业务资源索引写入 Supabase（旁路，失败不影响主流程）。
    supabaseData = createSupabaseData(config);
  // 分享是「对外承诺长期有效」的链接，单独一套持久化：本地库 + Supabase 双写，
  // 避免数据目录重建后已发出去的链接集体失效（见 share-store.ts）。
  const shares = createShareStore({ db, config });
  const actions = new ActionService(db, {
    execute: (owner, input, connectionId, targetVersion) =>
      workspace.execute(owner, input, connectionId, targetVersion),
    prepare: (owner, input, connectionId) => workspace.prepare(owner, input, connectionId),
    connected: (owner) => workspace.connected(owner),
    connection: (owner) => workspace.connection(owner),
    decided: (owner, action) => resolveTaskNotifications(db, owner, action.taskId),
  });
  const browser = new BrowserService(db, config, auth, files);
  const computer = new ComputerService(db, config, options.docker);
  const agent = new AgentService(
    db,
    config,
    workspace,
    files,
    actions,
    browser,
    computer,
    options.market,
    options.search,
  );
  const intelligence = new CopilotKitIntelligence({ apiKey: config.intelligenceApiKey });
  const conversationStream = new ConversationStream(db);
  // 单聊消息的永久归档：CopilotKit 只管运行与回放窗口，正文副本落在自有库（自动进 Supabase）。
  const conversationArchive = new ConversationArchive(db);
  const conversationHistory = new ConversationHistory(
    async (owner, threadId) =>
      (await intelligence.getThreadMessages({ userId: owner, threadId })).messages,
    async (owner, threadId) => (await conversationStream.status(owner, threadId)).lastEventId,
  );
  const runtime = makeRuntime(
    config,
    agent,
    auth,
    intelligence,
    conversationStream,
    conversationArchive,
  );
  /**
   * 频道对话的旁路镜像：每轮结束后，把提问和成员回复额外复制一份送进 CopilotKit 云。
   *
   * 直接调用运行时自带的处理入口（与真实对话走同一条落库通道），不经过网络、也不新建会话；
   * 云端按传入的登录凭证识别用户。纯旁路：即发即忘、失败只记日志，频道照旧本地回复。
   */
  const channelMirror = new ChannelMirror(async (input, authorization) => {
    for (let attempt = 1; ; attempt += 1) {
      const response = await runtime.fetch(
        new Request("http://localhost/api/copilotkit/agent/channel-mirror/run", {
          method: "POST",
          headers: { "content-type": "application/json", authorization },
          body: JSON.stringify(input),
        }),
      );
      const detail = await response.text().catch(() => "");
      if (response.ok) return;
      // 同一线程同一时刻只允许一个 run；上一轮镜像可能还没跑完，稍后重试。
      if (attempt >= 3) throw new Error(`Channel mirror failed: ${response.status} ${detail}`);
      await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    }
  });
  /**
   * 读取线程正文，并补上会话流记录的发送时间。
   *
   * 正文由 Rich Threads 持久化、本身不带时间戳，所以每条回复下面的时间来自
   * 本服务转发流事件时记下的第一次出现时间（见 `ConversationStream.messageTimes`）。
   */
  const threadMessages = async (owner: string, threadId: string) => {
    let messages: Awaited<ReturnType<typeof conversationHistory.messages>>;
    try {
      messages = await conversationHistory.messages(owner, threadId);
    } catch (error) {
      // 线程在云端不存在（孤儿数据）或 id 非法（客户端占位 id，如 `local`）时按空历史处理，
      // 否则打开会话/读上下文会整体 502，前端每次轮询都刷一条 PlatformRequestError。
      if (isMissingCloudThread(error)) return [];
      throw error;
    }
    return withMessageTimes(messages, await conversationStream.messageTimes(owner, threadId));
  };
  // 启动时恢复上一次在 App 里选中的模型，让选择跨重启保留。
  // 若该厂商的密钥已被移除，则回退到 .env 的 MODEL，避免指向不可用的模型。
  const savedModel = await db.get<{ model?: string }>("system", "settings", "model");
  if (savedModel?.model && isOfferedModel(config, savedModel.model))
    applyModel(config, savedModel.model);
  const app = new Hono<{ Variables: { owner: string } }>();
  // 除显式白名单外，正式前端域名（PUBLIC_WEB_URL）与 API 域名也始终允许跨域。
  // 这样 Render 绑定自定义前端域名后，只要 PUBLIC_WEB_URL 已同步到该域名，
  // 登录等浏览器请求就不会因为漏配 ALLOWED_ORIGINS 而被拦成 “Failed to fetch”。
  const origins = new Set([
    ...config.allowedOrigins,
    new URL(config.publicUrl).origin,
    new URL(config.webUrl ?? config.publicUrl).origin,
  ]);
  app.use("*", async (c, next) => {
    const origin = c.req.header("origin");
    if (origin && !origins.has(origin)) return c.json({ error: "Origin is not allowed" }, 403);
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "no-referrer");
    c.header("Cache-Control", "no-store");
    await next();
  });
  app.use(
    "*",
    cors({
      origin: (origin) => (origins.has(origin) ? origin : undefined),
      allowHeaders: ["Content-Type", "Authorization", "Accept", "Last-Event-ID", "Cache-Control"],
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      credentials: true,
    }),
  );
  app.use(
    "*",
    bodyLimit({
      maxSize: 12 * 1024 * 1024,
      onError: (c) =>
        c.json({ error: "Request is too large; files must be 10 MB or smaller" }, 413),
    }),
  );
  app.use(
    "/api/*",
    rateLimit(Boolean(config.trustProxy), { maxRequests: config.rateLimitMaxRequests }),
  );
  app.onError((error, c) => {
    if (error instanceof z.ZodError)
      return c.json({ error: error.issues.map((i) => i.message).join("; ") }, 422);
    if (error instanceof AppError)
      return c.json(
        { error: error.message, ...(error.code ? { code: error.code } : {}) },
        error.status,
      );
    if (error.name === "PdfError" || error.name === "RecurringEventError")
      return c.json({ error: error.message }, 422);
    if (error instanceof SyntaxError) return c.json({ error: "Invalid request data" }, 400);
    // Provider and document errors are useful, but raw stack traces and token-bearing responses are not.
    console.error(`[LingWu] ${error.name}`);
    return c.json(
      {
        error:
          error.name === "PdfError" || error.name === "GoogleApiError"
            ? error.message
            : "Request failed. Check the server setup and try again.",
      },
      502,
    );
  });
  app.get("/api/health", (c) =>
    c.json({
      ok: true,
      mode: config.mode,
      // 每个用户是否各自注册登录（多用户），还是共用一个访问密钥（单用户）。
      authMode: accounts ? "supabase" : "access-key",
      agentConfigured: agentConfigured(config),
      browserConfigured: Boolean(config.workerUrl && config.workerToken),
      // 行情数据源自检：A 股缺 AKShare 时会静默回落到 Yahoo（延迟约 15 分钟），
      // 所以在健康检查里显式暴露状态，部署后据此判定 A 股链路是否完整。
      market_data: getMarketDataHealth().snapshot(),
      // 财报 PDF 解析依赖 pdftotext：缺失时解析接口返回 422，部署核对时看这个字段。
      pdf: getPdfHealth().snapshot(),
    }),
  );
  /** 登录风控：按客户端 IP 与邮箱账号两个维度限流，防暴力破解与撞库。 */
  const signInByIp = createRateLimitStore({
    windowMs: 60_000,
    maxRequests: 30,
    maxEntries: 100_000,
  });
  const signInByAccount = createRateLimitStore({
    windowMs: 60_000,
    maxRequests: 10,
    maxEntries: 100_000,
  });
  const clientIp = (c: { req: { header: (name: string) => string | undefined } }) => {
    if (config.trustProxy) {
      const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
      if (forwarded) return forwarded;
    }
    return c.req.header("x-real-ip") ?? "unknown";
  };
  const device = (c: { req: { header: (name: string) => string | undefined } }) =>
    c.req.header("user-agent")?.slice(0, 200) || undefined;
  const guardSignIn = (
    c: { req: { header: (name: string) => string | undefined } },
    email?: string,
  ) => {
    if (!signInByIp.take(clientIp(c), Date.now()))
      throw new AppError("Too many sign-in attempts. Try again in a minute.", 429);
    if (email && !signInByAccount.take(email, Date.now()))
      throw new AppError("Too many attempts for this account. Try again in a minute.", 429);
  };
  /** 旁路写入操作行为日志；未配置 Supabase 时静默跳过。 */
  const audit = (
    userId: string,
    action: string,
    c: { req: { header: (name: string) => string | undefined } },
  ) => {
    if (!supabaseData) return;
    void supabaseData.writeAuditLog({
      user_id: userId,
      action,
      ip: clientIp(c),
      user_agent: c.req.header("user-agent"),
    });
  };
  /**
   * 首次进入工作区时准备示例数据与智能体状态。
   * 所有数据都挂在 owner 名下，因此每个用户的对话完全独立。
   */
  const openWorkspace = async (owner: string) => {
    await workspace.ensureSample(owner, actions);
    await agent.ensure(owner);
    if (config.mode === "sample") await agent.refreshIdeas(owner);
  };
  /** 前端据此决定展示邮箱登录还是访问密钥输入框。 */
  app.get("/api/auth/config", (c) =>
    c.json({ mode: config.mode, authMode: accounts ? "supabase" : "access-key" }),
  );
  const accountSchema = z.object({
    email: z.email(),
    password: z.string().min(8, "Use a password with at least 8 characters").max(128),
    displayName: z.string().trim().min(1).max(80).optional(),
  });
  app.post("/api/auth/signup", async (c) => {
    if (!accounts) throw new AppError("This deployment does not enable user accounts", 400);
    const body = accountSchema.parse(await c.req.json());
    const email = body.email.trim().toLowerCase();
    guardSignIn(c, email);
    const user = await accounts.signUp({
      email,
      password: body.password,
      displayName: body.displayName,
    });
    await openWorkspace(user.id);
    const session = await auth.issue(user.id, user.email, device(c));
    audit(user.id, "signup", c);
    return c.json({ ...session, user: { id: user.id, email: user.email } }, 201);
  });
  app.post("/api/auth/signin", async (c) => {
    if (!accounts) throw new AppError("This deployment does not enable user accounts", 400);
    const body = accountSchema.omit({ displayName: true }).parse(await c.req.json());
    const email = body.email.trim().toLowerCase();
    guardSignIn(c, email);
    const user = await accounts.signIn({
      email,
      password: body.password,
    });
    await openWorkspace(user.id);
    const session = await auth.issue(user.id, user.email, device(c));
    audit(user.id, "signin", c);
    return c.json({ ...session, user: { id: user.id, email: user.email } });
  });
  app.post("/api/session", async (c) => {
    guardSignIn(c);
    const body = z.object({ accessKey: z.string().optional() }).parse(await c.req.json());
    const session = await auth.session(body.accessKey, device(c));
    await openWorkspace("local-user");
    return c.json(session);
  });
  /** 请求邮箱验证码（使用 Supabase Auth 的 Email OTP）。 */
  app.post("/api/auth/otp/request", async (c) => {
    if (!accounts) throw new AppError("This deployment does not enable email verification", 400);
    const body = z.object({ email: z.email() }).parse(await c.req.json());
    const email = body.email.trim().toLowerCase();
    guardSignIn(c, email);
    await accounts.sendOtp(email);
    return c.json({ ok: true });
  });
  /** 验证码登录：验证通过后返回会话（未注册邮箱自动建档）。 */
  app.post("/api/auth/otp/verify", async (c) => {
    if (!accounts) throw new AppError("This deployment does not enable email verification", 400);
    const body = z
      .object({ email: z.email(), code: z.string().regex(/^\d{6}$/) })
      .parse(await c.req.json());
    const email = body.email.trim().toLowerCase();
    guardSignIn(c, email);
    const user = await accounts.verifyOtp(email, body.code);
    await openWorkspace(user.id);
    const session = await auth.issue(user.id, user.email ?? email, device(c));
    audit(user.id, "signin_otp", c);
    return c.json({ ...session, user: { id: user.id, email: user.email ?? email } });
  });
  app.get("/api/google/callback", async (c) => {
    if (c.req.query("error"))
      return c.html("<h1>Google connection cancelled</h1><p>You can return to LingWu.</p>", 400);
    const state = c.req.query("state"),
      code = c.req.query("code");
    if (!state || !code) throw new AppError("Google callback is incomplete");
    await google.callback(state, code);
    return c.html(
      "<h1>Google is connected</h1><p>Return to LingWu and refresh your workspace.</p>",
    );
  });
  app.get("/api/app-connectors/oauth/callback", (c) =>
    c.html(
      "<h1>登录还没有完成</h1><p>这个连接的登录回调还没有登记。回到灵悟，按卡片上的说明使用密钥或个人地址。</p>",
      501,
    ),
  );
  app.use("/api/*", async (c, next) => {
    const signedRoute =
      /^\/api\/files\/[^/]+\/content$|^\/api\/browsers\/[^/]+\/(?:preview|console)$/.test(
        c.req.path,
      );
    const owner =
      signedRoute && c.req.query("signature")
        ? auth.verify(new URL(c.req.url))
        : await auth.owner(c.req.header("authorization"));
    c.set("owner", owner);
    await next();
  });
  appConnectorRoutes(app, { db, config, files });
  /**
   * 当前登录用户；账号模式下 owner 就是 Supabase 用户 uuid。
   * 供 App 的「我的」页面展示昵称、邮箱等个人信息。
   */
  app.get("/api/auth/me", async (c) => {
    const session = await auth.profile(c.req.header("authorization"));
    // 头像、昵称从 user_profiles 读取，邮箱来自会话；取不到就回退 null，不影响登录本身。
    const profile = accounts ? await accounts.readProfile(session.owner) : {};
    return c.json({
      id: session.owner,
      email: session.email ?? null,
      displayName: profile.displayName ?? null,
      bio: profile.bio ?? null,
      avatarUrl: profile.avatarUrl ?? null,
      // 登录方式：每个用户各自注册登录，还是整站共用一个访问密钥。
      authMode: accounts ? "supabase" : "access-key",
      mode: config.mode,
      expiresAt: session.expiresAt,
    });
  });
  /** 更新头像、昵称与个人简介。 */
  app.put("/api/auth/profile", async (c) => {
    const session = await auth.profile(c.req.header("authorization"));
    if (!accounts) throw new AppError("Profile editing requires an email account.", 400);
    const body = await c.req.parseBody();
    const nicknameRaw = body.nickname;
    const nickname =
      typeof nicknameRaw === "string" ? z.string().max(40).parse(nicknameRaw.trim()) : undefined;
    if (nickname !== undefined && !nickname)
      throw new AppError("Enter a nickname before saving.", 422);
    const bioRaw = body.bio;
    const bio = typeof bioRaw === "string" ? z.string().max(240).parse(bioRaw.trim()) : undefined;
    const avatarFile = body.avatar;
    const avatar = avatarFile instanceof File ? avatarFile : undefined;
    const removeAvatar = body.removeAvatar === "true";
    if (nickname === undefined && bio === undefined && !avatar && !removeAvatar)
      throw new AppError("Change your profile before saving.", 422);
    if (avatar) {
      if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(avatar.type))
        throw new AppError("Choose a JPG, PNG, WebP or GIF image.", 422);
      if (avatar.size > 5 * 1024 * 1024)
        throw new AppError("Avatar images must be 5 MB or smaller.", 413);
    }
    const profile = await accounts.updateProfile(session.owner, {
      nickname,
      bio,
      removeAvatar,
      avatar: avatar
        ? { bytes: new Uint8Array(await avatar.arrayBuffer()), mimeType: avatar.type }
        : undefined,
    });
    audit(session.owner, "profile_updated", c);
    return c.json({
      id: session.owner,
      email: session.email ?? null,
      displayName: profile.displayName ?? null,
      bio: profile.bio ?? null,
      avatarUrl: profile.avatarUrl ?? null,
      authMode: "supabase",
      mode: config.mode,
      expiresAt: session.expiresAt,
    });
  });
  /** 退出登录：作废当前会话令牌（Supabase 侧账号不受影响）。 */
  app.post("/api/auth/signout", async (c) => {
    const profile = await auth.profile(c.req.header("authorization")).catch(() => undefined);
    await auth.revoke(c.req.header("authorization"));
    if (profile) audit(profile.owner, "signout", c);
    return c.json({ ok: true });
  });
  /** 多端登录管理：列出当前用户的所有活跃会话。 */
  app.get("/api/auth/sessions", async (c) => {
    const session = await auth.profile(c.req.header("authorization"));
    const sessions = await auth.sessions(session.owner);
    return c.json({
      sessions: sessions.map((s) => ({
        id: s.id,
        device: s.device ?? null,
        createdAt: s.createdAt,
        lastSeenAt: s.lastSeenAt,
        expiresAt: s.expiresAt,
        current: s.id === session.sessionId,
      })),
    });
  });
  /** 远程下线：撤销指定会话（只能操作属于当前登录用户的会话）。 */
  app.post("/api/auth/sessions/:id/revoke", async (c) => {
    const session = await auth.profile(c.req.header("authorization"));
    const id = c.req.param("id");
    if (!(await auth.revokeSession(session.owner, id)))
      throw new AppError("Session not found", 404);
    audit(session.owner, "session_revoked", c);
    return c.json({ ok: true });
  });
  app.get("/api/workspace", async (c) => {
    const [snapshot, reachable] = await Promise.all([
      workspace.snapshot(c.get("owner"), c.req.query("q")),
      browser.reachable(),
    ]);
    snapshot.browsers = snapshot.browsers.map((s) => browser.decorate(c.get("owner"), s));
    // A configured worker that does not answer is offline, not ready.
    snapshot.connections = snapshot.connections.map((connection) =>
      connection.id === "browser" && connection.status === "connected" && !reachable
        ? { ...connection, status: "unavailable" }
        : connection,
    );
    return c.json(snapshot);
  });
  app.get("/api/agent-space", async (c) => {
    const saved = await db.get<PersistedAgentSpace & { id: string }>(
      c.get("owner"),
      "agent-settings",
      "space",
    );
    if (!saved) return c.json(null);
    const { id: _id, ...state } = saved;
    return c.json(state);
  });
  app.put("/api/agent-space", async (c) => {
    const owner = c.get("owner");
    const state = agentSpaceSchema.parse(await c.req.json());
    await db.put(owner, "agent-settings", { id: "space", ...state });
    // 已公开到市场的智能体会随空间一并同步（公开/撤回/改名/删除都走这里）。
    await syncAgentMarket(db, owner, state, accounts);
    return c.json({ ok: true });
  });
  // 智能体市场：任何登录用户都能读到所有人已公开的智能体（跨用户共享）。
  app.get("/api/market-agents", async (c) => {
    c.get("owner");
    await repairAgentMarketOnRead(db, accounts);
    const records = await db.scan<MarketAgentRecord>("market-agents");
    return c.json(records.map(({ value }) => value));
  });
  // ─── 多 Agent 群聊频道（M2）───
  app.get("/api/channels", async (c) => {
    const owner = c.get("owner");
    const channels = await db.list<Channel>(owner, "channels");
    return c.json(channels);
  });
  app.post("/api/channels", async (c) => {
    const owner = c.get("owner");
    const input = channelInputSchema.parse(await c.req.json());
    const now = new Date().toISOString();
    const channel: Channel = {
      id: randomUUID(),
      name: input.name,
      agentIds: input.agentIds,
      description: input.description,
      avatar: input.avatar ?? DEFAULT_CHANNEL_AVATAR,
      instructions: input.instructions ?? "",
      installedSkills: input.installedSkills ?? [],
      skillRefs: input.skillRefs ?? [],
      leaderId: input.agentIds.includes(input.leaderId ?? "") ? input.leaderId : input.agentIds[0],
      createdAt: now,
      updatedAt: now,
    };
    await db.put(owner, "channels", channel);
    return c.json(channel, 201);
  });
  app.patch("/api/channels/:id", async (c) => {
    const owner = c.get("owner");
    const id = c.req.param("id");
    const existing = await db.get<Channel>(owner, "channels", id);
    if (!existing) throw new AppError("Channel not found", 404);
    const patch = channelUpdateSchema.parse(await c.req.json());
    const next: Channel = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    if (next.leaderId && !next.agentIds.includes(next.leaderId)) next.leaderId = next.agentIds[0];
    await db.put(owner, "channels", next);
    return c.json(next);
  });
  app.delete("/api/channels/:id", async (c) => {
    const owner = c.get("owner");
    const id = c.req.param("id");
    const existing = await db.get<Channel>(owner, "channels", id);
    if (!existing) throw new AppError("Channel not found", 404);
    await db.remove(owner, "channels", id);
    return c.json({ ok: true });
  });
  /**
   * 频道群聊历史，按时间升序。
   * 不带 limit 时返回全部（设置页要汇总附件）。带 limit 时只返回最新一页，before 再往上翻。
   */
  app.get("/api/channels/:id/messages", async (c) => {
    const owner = c.get("owner");
    const id = c.req.param("id");
    if (!(await db.get<Channel>(owner, "channels", id)))
      throw new AppError("Channel not found", 404);
    const messages = await listChannelMessages(db, owner, id);
    const limit = c.req.query("limit");
    const before = c.req.query("before");
    if (limit === undefined && before === undefined) return c.json(messages);
    const query = historyQuery.parse({
      ...(limit === undefined ? {} : { limit }),
      ...(before === undefined ? {} : { before }),
    });
    const page = channelHistoryPage(messages, query);
    if ("missing" in page)
      throw new AppError(
        "The history position is no longer available. Reload the conversation.",
        409,
      );
    return c.json(page);
  });
  /**
   * 首页 / 侧栏的「最近消息」预览素材，一次请求返回所有频道与智能体。
   *
   * 列表页原先为每个频道、每个智能体各发一次请求（N+1）。每多一次请求就多一次登录
   * 会话校验和一次数据查询；数据库在海外时，刷新页面并发的大量请求会让这些跨区往返
   * 互相排队，明显变慢。这里把 N+1 收成一次：会话只校验一次、频道消息只查一次（再按
   * 频道分组）、智能体线程并发读取。返回的是裁剪过的消息，最终文案仍由客户端用既有
   * 纯函数计算，保证预览逻辑只有一份。
   */
  app.get("/api/home/previews", async (c) => {
    const owner = c.get("owner");
    const [space, channels, channelMessages] = await Promise.all([
      db.get<PersistedAgentSpace & { id: string }>(owner, "agent-settings", "space"),
      db.list<Channel>(owner, "channels"),
      db.list<ChannelMessage>(owner, "channel_messages"),
    ]);

    // 一条 SQL 取回全部频道消息，在内存里按 channelId 分组，避免每个频道查一次库。
    const grouped = new Map<string, ChannelMessage[]>();
    for (const message of channelMessages) {
      const list = grouped.get(message.channelId);
      if (list) list.push(message);
      else grouped.set(message.channelId, [message]);
    }
    const channelPreviews: Record<string, ReturnType<typeof previewChannelMessage>[]> = {};
    for (const channel of channels) {
      const ordered = (grouped.get(channel.id) ?? [])
        .slice()
        .sort((left, right) =>
          left.createdAt < right.createdAt ? -1 : left.createdAt > right.createdAt ? 1 : 0,
        );
      channelPreviews[channel.id] = ordered.slice(-PREVIEW_SCAN).map(previewChannelMessage);
    }

    // 智能体线程并发读取；单个线程读不到（云端暂时不可达 / 尚无会话）按「没有消息」处理，
    // 不能让一个线程的失败拖垮整页预览。
    const agentPreviews: Record<string, ReturnType<typeof previewAgentMessage>[]> = {};
    await Promise.all(
      (space?.agents ?? []).map(async (agent) => {
        try {
          const messages = await conversationHistory.messages(owner, agent.threadId);
          agentPreviews[agent.threadId] = messages.slice(-PREVIEW_SCAN).map(previewAgentMessage);
        } catch (error) {
          agentPreviews[agent.threadId] = [];
          // 线程缺失/非法（404/400）属于正常情况——Agent 还没聊过、或本地库重建后留下孤儿 threadId。
          // 这类不记日志，否则每次进首页都会刷一片 PlatformRequestError。
          if (isMissingCloudThread(error)) return;
          console.error({
            timestamp: new Date().toISOString(),
            context: { phase: "home previews", threadId: agent.threadId },
            error: error instanceof Error ? error.name : "Thread preview failed",
          });
        }
      }),
    );

    return c.json({ channels: channelPreviews, agents: agentPreviews });
  });
  /**
   * 频道群聊流式对话：用户消息落库后，各成员依次以对话方式回复（SSE）。
   * 事件：member_start / delta / tool / member_done / leader / done / error。
   */
  app.post("/api/channels/:id/chat", async (c) => {
    const owner = c.get("owner");
    const id = c.req.param("id");
    const channel = await db.get<Channel>(owner, "channels", id);
    if (!channel) throw new AppError("Channel not found", 404);
    const input = channelMessageInputSchema.parse(await c.req.json());
    const encoder = new TextEncoder();
    const abort = new AbortController();
    c.req.raw.signal.addEventListener("abort", () => abort.abort(), { once: true });
    return new Response(
      new ReadableStream<Uint8Array>({
        async start(controller) {
          let closed = false;
          const send = (event: string, data: unknown) => {
            if (closed) return;
            try {
              controller.enqueue(
                encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
              );
            } catch {
              closed = true;
            }
          };
          try {
            await runChannelChat(
              {
                db,
                config,
                files,
                models: workspace.models,
                market: agent.market,
                search: agent.search,
                browser,
                computer,
                workspace,
                service: agent,
                // 每轮结束后镜像进 CopilotKit 云；凭证沿用本次请求的登录态。
                mirror: (turn) => channelMirror.turn(turn, c.req.header("authorization") ?? ""),
              },
              owner,
              channel,
              input,
              (event) => send(event.type, event),
              abort.signal,
            );
          } catch (error) {
            send("error", {
              message: error instanceof Error ? error.message : String(error),
            });
          } finally {
            if (!closed) {
              closed = true;
              try {
                controller.close();
              } catch {
                // consumer already cancelled
              }
            }
          }
        },
        cancel() {
          abort.abort();
        },
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      },
    );
  });
  /** 列出当前用户最近的编排计划（含节点状态与汇总结果），供前端呈现多 Agent 协作进度。 */
  app.get("/api/orchestrations", async (c) => {
    const owner = c.get("owner");
    const plans = await db.list<OrchestrationPlan>(owner, "orchestration_plans");
    // 按创建时间倒序，最近的在前。
    plans.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return c.json(plans);
  });
  /** 查询单个编排计划的实时状态（节点 DAG + 汇总结果）。 */
  app.get("/api/orchestrations/:id", async (c) => {
    const owner = c.get("owner");
    const id = c.req.param("id");
    const plan = await db.get<OrchestrationPlan>(owner, "orchestration_plans", id);
    if (!plan) throw new AppError("Orchestration not found", 404);
    return c.json(plan);
  });
  /** Persist the user's marketplace install choice for a plugin, skill or connector. */
  app.put("/api/capabilities/:id", async (c) => {
    const id = z
      .string()
      .trim()
      .min(1)
      .max(240)
      .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/, "Invalid capability id")
      .parse(c.req.param("id"));
    const body = z
      .object({
        type: z.enum(["plugins", "skills", "connectors"]),
        installed: z.boolean(),
      })
      .parse(await c.req.json());
    return c.json({
      installedCapabilities: await workspace.setCapabilityInstalled(
        c.get("owner"),
        id,
        body.type,
        body.installed,
      ),
    });
  });
  /** 可选模型目录：只列出服务端已配置密钥的厂商，密钥本身永不下发到 App。 */
  app.get("/api/models", async (c) => {
    const owner = c.get("owner");
    return c.json({
      model: (await workspace.models.resolve(owner)).model ?? null,
      options: await workspace.models.choices(owner),
    });
  });
  app.get("/api/model/settings", async (c) =>
    c.json(await workspace.models.read(c.get("owner"), c.req.query("provider"))),
  );
  app.post("/api/model/settings/test", async (c) =>
    c.json(await workspace.models.test(c.get("owner"), await c.req.json())),
  );
  app.put("/api/model/settings", async (c) =>
    c.json(await workspace.models.save(c.get("owner"), await c.req.json())),
  );
  app.delete("/api/model/settings", async (c) =>
    c.json(await workspace.models.remove(c.get("owner"), c.req.query("provider"))),
  );
  /**
   * 切换当前模型。
   *
   * 仅保存当前用户的选择。每次新对话/任务执行按 owner 解析，不修改共享进程配置。
   */
  app.post("/api/model", async (c) => {
    const body = z.object({ model: z.string().trim().min(1).max(200) }).parse(await c.req.json());
    if (config.agentBackend !== "model")
      throw new AppError("This deployment does not run a switchable model backend", 400);
    return c.json(await workspace.models.select(c.get("owner"), body.model));
  });
  /** 「模型管理」：内置模型目录 + 用户自定义模型。 */
  app.get("/api/model/library", async (c) =>
    c.json(await workspace.models.library(c.get("owner"))),
  );
  app.put("/api/model/library", async (c) =>
    c.json(await workspace.models.saveCustom(c.get("owner"), await c.req.json())),
  );
  app.post("/api/model/library/discover", async (c) =>
    c.json(await workspace.models.discover(c.get("owner"), await c.req.json())),
  );
  app.post("/api/model/library/batch", async (c) =>
    c.json(await workspace.models.saveCustomBatch(c.get("owner"), await c.req.json())),
  );
  app.patch("/api/model/library", async (c) => {
    const body = z
      .object({
        model: z.string().trim().min(1).max(150),
        enabled: z.boolean(),
      })
      .parse(await c.req.json());
    return c.json(
      await workspace.models.setCustomEnabled(c.get("owner"), body.model, body.enabled),
    );
  });
  app.delete("/api/model/library", async (c) => {
    const model = z.string().trim().min(1).max(150).parse(c.req.query("model"));
    return c.json(await workspace.models.removeCustom(c.get("owner"), model));
  });
  app.route("/api/agent", agentRoutes(agent));
  app.route("/api/watchlists", watchlistRoutes(agent));
  app.route("/api/symbols", symbolRoutes(agent));
  app.route("/api/briefings", briefingRoutes(agent));
  app.route("/api/research", researchRoutes(agent));
  app.route("/api/price-alerts", priceAlertRoutes(agent));
  app.route("/api/portfolios", portfolioRoutes(agent));
  app.route("/api/notes", noteRoutes(agent));
  app.route("/api/investor", investorRoutes(agent));
  app.route("/api/audit", auditRoutes(agent));
  app.route("/api/financials", financialRoutes(agent));
  app.route("/api/market", marketRoutes(agent));
  app.route("/api/conversation/stream", conversationStreamRoutes(conversationStream));
  app.route("/api/computer", computerRoutes(computer, files));
  // 对话分享：`POST /api/shares` 需登录，`GET /s/:id` 是给收件人看的公开页面。
  app.route("/api/shares", shareApiRoutes({ shares, config }));
  app.route("/s", sharePageRoutes({ shares, config }));
  app.get("/api/calendars", async (c) => c.json(await workspace.calendars(c.get("owner"))));
  app.get("/api/calendar/events", async (c) => {
    const query = z
      .object({
        calendarId: z.string().min(1).max(1024).optional(),
        timeMin: z.iso.datetime({ offset: true }).optional(),
        timeMax: z.iso.datetime({ offset: true }).optional(),
      })
      .parse(c.req.query());
    if (query.timeMin && query.timeMax) calendarRangeSchema.parse(query);
    return c.json(await workspace.events(c.get("owner"), query));
  });
  app.get("/api/mail/threads/:id", async (c) =>
    c.json(await workspace.thread(c.get("owner"), c.req.param("id"))),
  );
  app.post("/api/actions", async (c) => {
    const input = proposalSchema.parse(await c.req.json());
    if (input.kind === "email.send")
      for (const id of input.data.attachmentIds) await files.get(c.get("owner"), id);
    return c.json(await actions.propose(c.get("owner"), input), 201);
  });
  app.post("/api/actions/:id/decide", async (c) => {
    const body = z
      .object({ hash: z.string(), decision: z.enum(["approve", "deny"]) })
      .parse(await c.req.json());
    return c.json(
      await actions.decide(c.get("owner"), c.req.param("id"), body.hash, body.decision),
    );
  });
  app.get("/api/drafts", async (c) => c.json(await db.list(c.get("owner"), "drafts")));
  app.post("/api/drafts", async (c) => {
    const body = emailDraftSchema
      .extend({ id: z.string().uuid().optional() })
      .parse(await c.req.json());
    const existing = body.id
      ? await db.get<{ createdAt: string }>(c.get("owner"), "drafts", body.id)
      : null;
    if (body.id && !existing) throw new AppError("Draft not found", 404);
    return c.json(
      await db.put(c.get("owner"), "drafts", {
        ...body,
        id: body.id ?? randomUUID(),
        createdAt: existing?.createdAt ?? new Date().toISOString(),
      }),
      201,
    );
  });
  app.get("/api/main-thread", async (c) => {
    const owner = c.get("owner");
    await db.insertIfAbsent(owner, "conversation-settings", {
      id: "main",
      threadId: randomUUID(),
      existing: false,
    });
    const main = await db.get<{
      id: string;
      threadId: string;
      existing?: boolean;
      initialized?: boolean;
    }>(owner, "conversation-settings", "main");
    if (!main) throw new AppError("Main conversation could not be loaded", 503);
    try {
      const current = await intelligence.getOrCreateThread({
        threadId: main.threadId,
        userId: owner,
        agentId: "default",
      });
      if (!current.created && main.initialized !== true) {
        const streamStatus = await conversationStream.status(owner, main.threadId);
        if (!streamStatus.active) {
          try {
            const currentMessages = await intelligence.getThreadMessages({
              threadId: main.threadId,
              userId: owner,
            });
            if (currentMessages.messages.length === 0) {
              const { threads } = await intelligence.listThreads({
                userId: owner,
                agentId: "default",
                limit: 20,
              });
              const candidates = threads
                .filter((thread) => thread.id !== main.threadId && !thread.archived)
                .sort(
                  (left, right) =>
                    Date.parse(right.updatedAt ?? "") - Date.parse(left.updatedAt ?? ""),
                )
                .slice(0, 3);
              for (const candidate of candidates) {
                try {
                  const history = await intelligence.getThreadMessages({
                    threadId: candidate.id,
                    userId: owner,
                  });
                  if (history.messages.length === 0) continue;
                  await db.put(owner, "conversation-settings", {
                    ...main,
                    threadId: candidate.id,
                    existing: true,
                    initialized: true,
                  });
                  console.info({
                    timestamp: new Date().toISOString(),
                    context: {
                      phase: "main-thread history recovery",
                      from: main.threadId,
                      to: candidate.id,
                      messages: history.messages.length,
                    },
                  });
                  return c.json({ threadId: candidate.id, existing: true });
                } catch {
                  // A single inaccessible thread must not block the remaining candidates.
                }
              }
            }
          } catch (error) {
            // Keep initialization pending so a transient provider failure can retry later.
            console.error({
              timestamp: new Date().toISOString(),
              context: { phase: "main-thread history check" },
              error: error instanceof Error ? error.name : "History check failed",
            });
          }
        }
        await db.put(owner, "conversation-settings", {
          ...main,
          initialized: true,
        });
      }
    } catch (error) {
      // getOrCreateThread 只在异常时抛错：线程不存在时会走创建成功路径。
      // 若平台返回 404/409，说明该 threadId 在云端存在但当前 userId 查不到
      // （孤儿/约束冲突数据），此时为该 owner 重建新主线程 id，避免永久 502；
      // 其余情况（平台故障或普通错误）保持原行为返回 502，不产生新 id。
      const status =
        error && typeof error === "object" ? (error as { status?: unknown }).status : undefined;
      if (status === 404 || status === 409) {
        const replacement = randomUUID();
        try {
          await intelligence.getOrCreateThread({
            threadId: replacement,
            userId: owner,
            agentId: "default",
          });
          await db.put(owner, "conversation-settings", {
            id: "main",
            threadId: replacement,
            existing: false,
          });
          return c.json({ threadId: replacement, existing: false });
        } catch (rebuildError) {
          console.error({
            timestamp: new Date().toISOString(),
            context: { phase: "main-thread rebuild", replacedThread: main.threadId },
            error: rebuildError instanceof Error ? rebuildError.name : "Thread rebuild failed",
          });
        }
      } else {
        console.error({
          timestamp: new Date().toISOString(),
          context: {
            phase: "main-thread connect",
            ...(typeof status === "number" ? { status } : {}),
          },
          error: error instanceof Error ? error.name : "Main thread unavailable",
        });
      }
      throw new AppError(
        "Main conversation is unavailable. Check the Rich Threads connection and try again.",
        502,
      );
    }
    return c.json({ threadId: main.threadId, existing: true });
  });
  app.get("/api/conversation/threads/:threadId/messages", async (c) => {
    const query = historyQuery.parse(c.req.query());
    return c.json(
      conversationHistoryPage(await threadMessages(c.get("owner"), c.req.param("threadId")), query),
    );
  });
  app.get("/api/conversation/threads/:threadId/context", async (c) =>
    c.json({
      messages: await threadMessages(c.get("owner"), c.req.param("threadId")),
    }),
  );
  app.get("/api/conversation", async (c) => {
    const saved = (await db.get<{ messages: Message[] }>(
      c.get("owner"),
      "conversations",
      "default",
    )) ?? { messages: [] };
    return c.json(
      c.req.query("limit") !== undefined || c.req.query("before") !== undefined
        ? conversationHistoryPage(saved.messages, historyQuery.parse(c.req.query()))
        : saved,
    );
  });
  app.put("/api/conversation", async (c) => {
    const body = await c.req.json();
    const messages = z.array(z.unknown()).max(1000).parse(body.messages);
    for (const message of messages) MessageSchema.parse(message);
    await db.put(c.get("owner"), "conversations", { id: "default", messages });
    return c.json({ ok: true });
  });
  app.post("/api/files", async (c) => {
    const data = await c.req.parseBody();
    const file = data.file;
    if (!(file instanceof File)) throw new AppError("Choose a supported document or image file");
    return c.json(
      await files.import(
        c.get("owner"),
        file.name,
        new Uint8Array(await file.arrayBuffer()),
        "Uploaded by you",
      ),
      201,
    );
  });
  app.get("/api/files/:id/content", async (c) => {
    const file = await files.get(c.get("owner"), c.req.param("id"));
    c.header("Content-Type", file.mimeType);
    c.header("X-Content-Type-Options", "nosniff");
    if (file.mimeType === "text/html") c.header("Content-Security-Policy", "sandbox");
    const inline =
      file.mimeType === "application/pdf" ||
      file.mimeType === "text/html" ||
      file.mimeType === "text/markdown" ||
      file.mimeType === "text/plain" ||
      file.mimeType === "text/csv" ||
      file.mimeType === "application/json" ||
      file.mimeType.startsWith("image/");
    c.header(
      "Content-Disposition",
      `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    );
    return c.body(await files.bytes(c.get("owner"), file.id));
  });
  app.post("/api/files/:id/fill", async (c) => {
    const body = z
      .object({ fields: z.record(z.string(), z.union([z.string(), z.boolean()])) })
      .parse(await c.req.json());
    return c.json(await files.fill(c.get("owner"), c.req.param("id"), body.fields), 201);
  });
  app.delete("/api/files/:id", async (c) => {
    await files.remove(c.get("owner"), c.req.param("id"));
    return c.json({ ok: true });
  });
  app.post("/api/mail/import-attachment", async (c) => {
    const body = z.object({ reference: z.string() }).parse(await c.req.json());
    return c.json(await workspace.importAttachment(c.get("owner"), body.reference), 201);
  });
  app.post("/api/google/connect", async (c) => {
    const body = z.object({ capability: z.enum(["read", "write"]) }).parse(await c.req.json());
    if (config.mode === "sample") {
      await db.put(c.get("owner"), "settings", {
        id: "google",
        enabled: true,
        connectionId: randomUUID(),
      });
      return c.json({ url: null, connected: true });
    }
    return c.json(await google.connect(c.get("owner"), body.capability === "write"));
  });
  app.post("/api/google/disconnect", async (c) => {
    if (config.mode === "sample")
      await db.put(c.get("owner"), "settings", { id: "google", enabled: false });
    else await google.disconnect(c.get("owner"));
    return c.json({ ok: true });
  });
  app.post("/api/browsers", async (c) => {
    const body = z.object({ url: z.url().max(4096) }).parse(await c.req.json());
    return c.json(await browser.create(c.get("owner"), body.url), 201);
  });
  app.get("/api/browsers/:id", async (c) => {
    const owner = c.get("owner");
    return c.json(browser.decorate(owner, await browser.get(owner, c.req.param("id"))));
  });
  app.post("/api/browsers/:id/navigate", async (c) => {
    const body = z.object({ url: z.url().max(4096) }).parse(await c.req.json());
    return c.json(await browser.navigate(c.get("owner"), c.req.param("id"), body.url));
  });
  app.post("/api/browsers/:id/close", async (c) =>
    c.json(await browser.close(c.get("owner"), c.req.param("id"))),
  );
  app.get("/api/browsers/:id/read", async (c) =>
    c.json(await browser.read(c.get("owner"), c.req.param("id"))),
  );
  app.post("/api/browsers/:id/reopen", async (c) => {
    const raw = await c.req.text();
    const body = z.object({ url: z.url().max(4096).optional() }).parse(raw ? JSON.parse(raw) : {});
    return c.json(await browser.reopen(c.get("owner"), c.req.param("id"), body.url));
  });
  app.post("/api/browsers/:id/import-downloads", async (c) =>
    c.json(await browser.imports(c.get("owner"), c.req.param("id"))),
  );
  app.get("/api/browsers/:id/preview", async (c) => {
    const response = await browser.preview(c.get("owner"), c.req.param("id"));
    c.header("Content-Type", "image/png");
    return c.body(await response.arrayBuffer());
  });
  app.get("/api/browsers/:id/console", async (c) => {
    await browser.get(c.get("owner"), c.req.param("id"));
    c.header(
      "Content-Security-Policy",
      "default-src 'self'; img-src 'self' blob:; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'",
    );
    return c.html(browser.console(c.get("owner"), c.req.param("id")));
  });
  app.post("/api/browsers/:id/console", async (c) => {
    await browser.input(c.get("owner"), c.req.param("id"), await c.req.json());
    return c.json({ ok: true });
  });
  app.all("/api/copilotkit/*", async (c) => {
    const configured =
      config.agentBackend === "model"
        ? (await workspace.models.resolve(c.get("owner"))).configured
        : agentConfigured(config);
    if (!configured)
      throw new AppError(
        "Configure a model and provider API key, or a valid AG-UI endpoint, to start chat",
        503,
      );
    const response = await runtime.fetch(c.req.raw);
    // Runtime 1.70 emits SSE strings; a WHATWG Response body requires byte chunks.
    const encoder = new TextEncoder();
    const body = response.body?.pipeThrough(
      new TransformStream({
        transform(chunk, controller) {
          controller.enqueue(typeof chunk === "string" ? encoder.encode(chunk) : chunk);
        },
      }),
    );
    return new Response(body, { status: response.status, headers: response.headers });
  });
  app.get("/", (c) =>
    c.json({ name: "LingWu", app: "http://localhost:8081", health: "/api/health" }),
  );
  return { app, auth, files, actions, workspace, agent, computer, conversationStream };
}
