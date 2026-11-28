import { Hono } from "hono";
import { z } from "zod";
import type { InvestmentNote, ResearchReport } from "../../../../packages/domain/src/agent.ts";
import type { InvestorMutedTopic } from "../../../../packages/domain/src/investor.ts";
import {
  consentCreateSchema,
  consentUpdateSchema,
  deviceQuietOverrideInputSchema,
  type EventDecision,
  eventCandidateSchema,
  feedFeedbackSchema,
  profileProposalSchema,
  profileUpdateSchema,
  thesisEvidenceInputSchema,
} from "../../../../packages/domain/src/investor.ts";
import { AppError } from "../errors.ts";
import { missingConfirmations, profileTrust } from "./investor-profile.ts";
import type { AgentService } from "./service.ts";

const muteSchema = z.object({
  topic: z.string().trim().min(1).max(40),
  days: z.number().int().min(1).max(180).default(14),
});

const decisionSchema = z.enum(["push", "feed", "silent"]);

/**
 * 投研闭环的 HTTP 入口（PRD R2/R3/R4）。
 *
 * 约定：
 *   - 跟踪计划是"可重算"的派生数据，接口只读 + 显式 derive；
 *   - 信息流的负反馈（少推点）写进降噪偏好，直接作用于下一轮判级；
 *   - 论点判定不返回"没有依据的结论"，缺数据时 outcome=pending_confirmation。
 */
export function investorRoutes(service: AgentService): Hono<{ Variables: { owner: string } }> {
  const app = new Hono<{ Variables: { owner: string } }>();

  /** 当前生效的降噪项（到期自动失效）。 */
  app.get("/mutes", async (c) => c.json(await service.events.activeMutes(c.get("owner"))));

  app.post("/mutes", async (c) => {
    const body = muteSchema.parse(await c.req.json());
    const mute: InvestorMutedTopic = await service.events.mute(
      c.get("owner"),
      body.topic,
      body.days,
      "manual",
    );
    return c.json(mute, 201);
  });

  app.delete("/mutes/:topic", async (c) => {
    await service.events.unmute(c.get("owner"), c.req.param("topic"));
    return c.json({ ok: true });
  });

  app.get("/feed", async (c) => {
    const owner = c.get("owner");
    const decision = c.req.query("decision");
    const parsed = decision ? decisionSchema.safeParse(decision) : null;
    if (decision && !parsed?.success) throw new AppError("Invalid decision", 422);
    const limit = Number(c.req.query("limit") ?? 50);
    return c.json(
      await service.events.list(owner, {
        ...(parsed?.success ? { decision: parsed.data as EventDecision } : {}),
        ...(c.req.query("symbol") ? { symbol: c.req.query("symbol") } : {}),
        limit: Number.isFinite(limit) ? limit : 50,
        includeSilent: c.req.query("includeSilent") === "true",
      }),
    );
  });

  app.get("/feed/counts", async (c) => c.json(await service.events.counts(c.get("owner"))));

  /**
   * 判级效果统计：按 judgedBy 分组给出推送接收率与规则/模型分歧率。
   * 这是「judgeEvent 换模型」的验收口径，切 EVENT_JUDGE 前后都读它。
   */
  app.get("/feed/stats", async (c) => c.json(await service.events.stats(c.get("owner"))));

  app.post("/feed/:id/read", async (c) =>
    c.json(await service.events.markRead(c.get("owner"), c.req.param("id"))),
  );

  app.post("/feed/:id/feedback", async (c) => {
    const body = feedFeedbackSchema.parse(await c.req.json());
    return c.json(
      await service.events.feedback(c.get("owner"), c.req.param("id"), body.vote, body.scope),
    );
  });

  /** 事件接入：价格提醒、网页监控、外部 webhook 都可以把候选事件丢进来判级。 */
  app.post("/events", async (c) => {
    const candidate = eventCandidateSchema.parse(await c.req.json());
    return c.json(await service.events.ingest(c.get("owner"), candidate), 201);
  });

  /**
   * A4：立即按持仓与目标配置派生到期 / 首次亏损 / 配置偏离事件。
   * 幂等：同一分桶重复派生不会重复打扰；后台维护也会定期跑同一逻辑。
   */
  app.post("/events/derive", async (c) => {
    const ingested = await service.refreshInvestorEvents(c.get("owner"));
    return c.json({ ingested });
  });

  app.get("/tracking-plans", async (c) =>
    c.json(await service.trackingPlans.list(c.get("owner"), c.req.query("symbol") || undefined)),
  );

  app.post("/tracking-plans/derive", async (c) => {
    const body = z
      .object({ reportId: z.string().trim().min(1).max(120) })
      .parse(await c.req.json());
    const owner = c.get("owner");
    const report = await service.db.get<ResearchReport>(owner, "research_reports", body.reportId);
    if (!report) throw new AppError("Research report not found", 404);
    return c.json(
      await service.trackingPlans.derive(owner, report, {
        name: report.title.replace(/\s*深度研究\s*$/, "").trim(),
      }),
      201,
    );
  });

  app.get("/tracking-plans/:id", async (c) =>
    c.json(await service.trackingPlans.get(c.get("owner"), c.req.param("id"))),
  );

  app.post("/tracking-plans/:id/materialize", async (c) =>
    c.json(await service.trackingPlans.materialize(c.get("owner"), c.req.param("id"))),
  );

  app.post("/notes/:id/evidence", async (c) => {
    const body = thesisEvidenceInputSchema.parse(await c.req.json());
    return c.json(
      await service.thesisEvidence.attach(c.get("owner"), c.req.param("id"), body.evidence),
    );
  });

  /** 立即按绑定证据重判一条论点，返回最新记录（不覆盖用户手动确认）。 */
  app.post("/notes/:id/check", async (c) => {
    const owner = c.get("owner");
    const note = await service.db.get<InvestmentNote>(owner, "notes", c.req.param("id"));
    if (!note) throw new AppError("Note not found", 404);
    if (note.type !== "THESIS") throw new AppError("Only THESIS notes are checked", 422);
    const check = await service.thesisEvidence.check(owner, note);
    return c.json({ check, note: await service.db.get(owner, "notes", note.id) });
  });

  // ─── A1 投资档案 ───
  // 档案分「目标」与「风险约束」两组，附可信状态与待确认字段，前端据此引导确认。

  app.get("/profile", async (c) => {
    const owner = c.get("owner");
    const profile = await service.investorProfile.get(owner);
    return c.json({
      profile,
      trust: profileTrust(profile),
      missingConfirmation: missingConfirmations(profile),
    });
  });

  /**
   * 更新档案。试图改写「风险偏好 / 期限 / 禁止行业」而未带 confirm:true 时，
   * 服务端返回 422（code=confirm_required）——强制走「提议 → 用户确认」路径。
   */
  app.put("/profile", async (c) => {
    const input = profileUpdateSchema.parse(await c.req.json());
    return c.json(await service.investorProfile.update(c.get("owner"), input));
  });

  app.get("/profile/proposals", async (c) =>
    c.json(await service.investorProfile.listProposals(c.get("owner"))),
  );

  /** 模型或前端提出一条档案变更提议；高风险字段需用户确认后才落库。 */
  app.post("/profile/proposals", async (c) => {
    const input = profileProposalSchema.parse(await c.req.json());
    return c.json(await service.investorProfile.propose(c.get("owner"), input), 201);
  });

  app.post("/profile/proposals/:id/accept", async (c) =>
    c.json(await service.investorProfile.decideProposal(c.get("owner"), c.req.param("id"), true)),
  );

  app.post("/profile/proposals/:id/reject", async (c) =>
    c.json(await service.investorProfile.decideProposal(c.get("owner"), c.req.param("id"), false)),
  );

  // ─── A3 授权中心 ───
  // 每条授权回答：能用哪些数据 / 用来做什么 / 走什么渠道 / 多久一次。

  app.get("/consents", async (c) => c.json(await service.consents.list(c.get("owner"))));

  app.post("/consents", async (c) => {
    const input = consentCreateSchema.parse(await c.req.json());
    return c.json(await service.consents.create(c.get("owner"), input), 201);
  });

  /**
   * 当前生效的授权结论（判级用的策略闸）。前端用它展示「是否会主动提醒 / 是否在免打扰 /
   * 今日是否超上限」，也可带 deviceId 查询某设备的投放结论。
   */
  app.get("/consents/gate", async (c) => {
    const deviceId = c.req.query("deviceId");
    return c.json(
      await service.consents.resolveGate(c.get("owner"), {
        ...(deviceId ? { deviceId } : {}),
      }),
    );
  });

  app.put("/consents/:id", async (c) => {
    const input = consentUpdateSchema.parse(await c.req.json());
    return c.json(await service.consents.update(c.get("owner"), c.req.param("id"), input));
  });

  /** 撤回授权（软撤回，留痕）：撤回后立刻不再构成提醒授权。 */
  app.post("/consents/:id/revoke", async (c) =>
    c.json(await service.consents.revoke(c.get("owner"), c.req.param("id"))),
  );

  app.delete("/consents/:id", async (c) => {
    await service.consents.remove(c.get("owner"), c.req.param("id"));
    return c.body(null, 204);
  });

  /** 设备级免打扰覆盖（设备优先于账户级），仅影响该设备收到推送时的投放。 */
  app.put("/consents/:id/devices/:deviceId", async (c) => {
    const input = deviceQuietOverrideInputSchema.parse(await c.req.json());
    return c.json(
      await service.consents.setDeviceOverride(
        c.get("owner"),
        c.req.param("id"),
        c.req.param("deviceId"),
        input,
      ),
    );
  });

  app.delete("/consents/:id/devices/:deviceId", async (c) =>
    c.json(
      await service.consents.removeDeviceOverride(
        c.get("owner"),
        c.req.param("id"),
        c.req.param("deviceId"),
      ),
    ),
  );

  return app;
}
