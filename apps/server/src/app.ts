import "./config.ts";
import { randomUUID } from "node:crypto";
import { MessageSchema } from "@ag-ui/core";
import { CopilotKitIntelligence } from "@copilotkit/runtime/v2";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { z } from "zod";
import {
  calendarRangeSchema,
  emailDraftSchema,
  proposalSchema,
} from "../../../packages/domain/src/index.ts";
import type { MarketDataService } from "../../../packages/integrations/src/market-data.ts";
import { ActionService } from "./actions.ts";
import { agentConfigured, makeRuntime } from "./agent.ts";
import { createAuth } from "./auth.ts";
import { BrowserService } from "./browser.ts";
import { ComputerService, type DockerRunner } from "./computer.ts";
import { computerRoutes } from "./computer-routes.ts";
import { assertApiDeploymentConfig, type Config } from "./config.ts";
import type { Store } from "./db.ts";
import { briefingRoutes } from "./engine/briefing-routes.ts";
import { financialRoutes } from "./engine/financial-routes.ts";
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
import { createSupabaseAuth } from "./supabase-auth.ts";
import { createSupabaseData } from "./supabase-data.ts";
import { WorkspaceService } from "./workspace.ts";

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
  const runtime = makeRuntime(config, agent, auth, intelligence, conversationStream);
  // 启动时恢复上一次在 App 里选中的模型，让选择跨重启保留。
  // 若该厂商的密钥已被移除，则回退到 .env 的 MODEL，避免指向不可用的模型。
  const savedModel = await db.get<{ model?: string }>("system", "settings", "model");
  if (savedModel?.model && isOfferedModel(config, savedModel.model))
    applyModel(config, savedModel.model);
  const app = new Hono<{ Variables: { owner: string } }>();
  const origins = new Set([...config.allowedOrigins, new URL(config.publicUrl).origin]);
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
  app.use("/api/*", rateLimit(Boolean(config.trustProxy)));
  app.onError((error, c) => {
    if (error instanceof z.ZodError)
      return c.json({ error: error.issues.map((i) => i.message).join("; ") }, 422);
    if (error instanceof AppError) return c.json({ error: error.message }, error.status);
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
  app.route("/api/agent", agentRoutes(agent));
  app.route("/api/watchlists", watchlistRoutes(agent));
  app.route("/api/symbols", symbolRoutes(agent));
  app.route("/api/briefings", briefingRoutes(agent));
  app.route("/api/research", researchRoutes(agent));
  app.route("/api/price-alerts", priceAlertRoutes(agent));
  app.route("/api/portfolios", portfolioRoutes(agent));
  app.route("/api/notes", noteRoutes(agent));
  app.route("/api/financials", financialRoutes(agent));
  app.route("/api/market", marketRoutes(agent));
  app.route("/api/conversation/stream", conversationStreamRoutes(conversationStream));
  app.route("/api/computer", computerRoutes(computer, files));
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
  app.get("/api/conversation", async (c) =>
    c.json((await db.get(c.get("owner"), "conversations", "default")) ?? { messages: [] }),
  );
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
