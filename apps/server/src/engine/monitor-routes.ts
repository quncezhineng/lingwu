import { Hono } from "hono";
import { z } from "zod";
import type { ActionProposal } from "../../../../packages/domain/src/index.ts";
import { AppError } from "../errors.ts";
import {
  createMonitorRuleSchema,
  dismissMonitorEventSchema,
  ingestMonitorEventSchema,
  updateBudgetSchema,
  updateMonitorRuleSchema,
} from "./monitor-engine.ts";
import { thesisReviewDue } from "./notes.ts";
import type { AgentService } from "./service.ts";

type Env = { Variables: { owner: string } };

const eventQuerySchema = z.object({
  date: z.string().date().optional(),
  state: z.enum(["new", "delivered", "archived", "dismissed"]).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

const tickSchema = z.object({
  ruleId: z.string().trim().min(1).max(200).optional(),
  force: z.boolean().default(true),
  /** 手动补跑/回放用的时刻；缺省为当前时间。 */
  at: z.iso.datetime({ offset: true }).optional(),
});

function approvalSummary(action: ActionProposal) {
  return {
    id: action.id,
    title: action.title,
    kind: action.kind,
    status: action.status,
    expires_at: action.expiresAt,
  };
}

/** Today 聚合：监控事件 + 预算 + 论点回检 + 待审批，一次读回首页所需内容。 */
export async function buildToday(service: AgentService, owner: string, now = new Date()) {
  const base = await service.monitors.today(owner, now);
  const [notes, actions] = await Promise.all([
    service.notes.list(owner, { type: "THESIS", limit: 200 }),
    service.db.list<ActionProposal>(owner, "actions"),
  ]);
  const active = notes.filter((note) => note.status === "ACTIVE");
  const review = active
    .map((note) => ({ note, due: thesisReviewDue(note, now) }))
    .filter((item) => item.due !== "later")
    .sort((left, right) => {
      if (left.due !== right.due) return left.due === "overdue" ? -1 : 1;
      return (left.note.horizon?.to ?? "").localeCompare(right.note.horizon?.to ?? "");
    })
    .map(({ note, due }) => ({
      id: note.id,
      symbol_code: note.symbol_code,
      title: note.title ?? note.content.slice(0, 60),
      horizon: note.horizon,
      confidence: note.confidence,
      due,
    }));
  return {
    ...base,
    theses: { active, review },
    approvals: actions.filter((action) => action.status === "awaiting_review").map(approvalSummary),
  };
}

/** 规则、事件、预算与 Today 聚合，挂载在 `/api/monitors`。 */
export function monitorRoutes(service: AgentService): Hono<Env> {
  const app = new Hono<Env>();
  app.get("/rules", async (c) =>
    c.json({ rules: await service.monitors.listRules(c.get("owner")) }),
  );
  app.post("/rules", async (c) => {
    const input = createMonitorRuleSchema.parse(await c.req.json());
    return c.json(await service.monitors.createRule(c.get("owner"), input), 201);
  });
  app.put("/rules/:id", async (c) => {
    const input = updateMonitorRuleSchema.parse(await c.req.json());
    return c.json(await service.monitors.updateRule(c.get("owner"), c.req.param("id"), input));
  });
  app.delete("/rules/:id", async (c) => {
    await service.monitors.removeRule(c.get("owner"), c.req.param("id"));
    return c.body(null, 204);
  });
  app.post("/rules/:id/control", async (c) => {
    const { action } = z
      .object({ action: z.enum(["pause", "resume", "check"]) })
      .parse(await c.req.json());
    const owner = c.get("owner");
    const id = c.req.param("id");
    if (action === "pause") return c.json(await service.monitors.pauseRule(owner, id));
    if (action === "resume") return c.json(await service.monitors.resumeRule(owner, id));
    return c.json(await service.monitors.tick(owner, { ruleId: id, force: true }));
  });
  app.get("/events", async (c) => {
    const query = eventQuerySchema.parse({
      date: c.req.query("date"),
      state: c.req.query("state"),
      limit: c.req.query("limit"),
    });
    return c.json({ events: await service.monitors.listEvents(c.get("owner"), query) });
  });
  app.post("/events", async (c) => {
    const input = ingestMonitorEventSchema.parse(await c.req.json());
    return c.json(await service.monitors.ingestEvent(c.get("owner"), input), 201);
  });
  app.post("/events/:id/dismiss", async (c) => {
    const body = dismissMonitorEventSchema.parse(await c.req.json().catch(() => ({})));
    return c.json(
      await service.monitors.dismissEvent(c.get("owner"), c.req.param("id"), body.reason),
    );
  });
  app.get("/budget", async (c) => c.json(await service.monitors.budget(c.get("owner"))));
  app.put("/budget", async (c) => {
    const body = updateBudgetSchema.parse(await c.req.json());
    return c.json(await service.monitors.setBudgetLimit(c.get("owner"), body.limit));
  });
  app.post("/tick", async (c) => {
    const body = tickSchema.parse(await c.req.json().catch(() => ({})));
    const now = body.at ? new Date(body.at) : new Date();
    const result = await service.monitors.tick(c.get("owner"), {
      now,
      force: body.force,
      ...(body.ruleId ? { ruleId: body.ruleId } : {}),
    });
    await service.monitors.runDigest(c.get("owner"), now).catch(() => undefined);
    return c.json(result);
  });
  app.get("/today", async (c) => c.json(await buildToday(service, c.get("owner"))));
  return app;
}

/** `/api/today` 的短入口，返回与 `/api/monitors/today` 相同的聚合。 */
export function todayRoutes(service: AgentService): Hono<Env> {
  const app = new Hono<Env>();
  app.get("/", async (c) => c.json(await buildToday(service, c.get("owner"))));
  app.get("/events/:id", async (c) => {
    const event = await service.monitors
      .listEvents(c.get("owner"), { limit: 500 })
      .then((events) => events.find((item) => item.id === c.req.param("id")));
    if (!event) throw new AppError("Monitor event not found", 404);
    return c.json(event);
  });
  return app;
}
