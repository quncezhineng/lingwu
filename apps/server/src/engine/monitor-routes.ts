import { Hono } from "hono";
import { z } from "zod";
import type { InvestmentNote } from "../../../../packages/domain/src/agent.ts";
import { AppError } from "../errors.ts";
import {
  attentionBudgetSchema,
  createMonitorRuleSchema,
  ingestMonitorEventSchema,
  updateMonitorRuleSchema,
} from "./monitor-engine.ts";
import type { AgentService } from "./service.ts";

type Env = { Variables: { owner: string } };

const listQuerySchema = z.object({
  date: z.string().date().optional(),
  state: z.enum(["new", "delivered", "archived", "dismissed", "downgraded"]).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

/** 「盯」规则中心与事件流，挂载在 `/api/monitor`。 */
export function monitorRoutes(service: AgentService): Hono<Env> {
  const app = new Hono<Env>();
  app.get("/rules", async (c) =>
    c.json({ rules: await service.monitor.listRules(c.get("owner")) }),
  );
  app.post("/rules", async (c) => {
    const input = createMonitorRuleSchema.parse(await c.req.json());
    return c.json(await service.monitor.createRule(c.get("owner"), input), 201);
  });
  app.post("/rules/from-thesis/:id", async (c) => {
    const owner = c.get("owner");
    const note = (await service.notes.list(owner, { limit: 200 })).find(
      (item: InvestmentNote) => item.id === c.req.param("id"),
    );
    if (!note) throw new AppError("Note not found", 404);
    return c.json(await service.monitor.createThesisRule(owner, note), 201);
  });
  app.put("/rules/:id", async (c) => {
    const input = updateMonitorRuleSchema.parse(await c.req.json());
    return c.json(await service.monitor.updateRule(c.get("owner"), c.req.param("id"), input));
  });
  app.delete("/rules/:id", async (c) => {
    await service.monitor.removeRule(c.get("owner"), c.req.param("id"));
    return c.body(null, 204);
  });
  app.get("/events", async (c) => {
    const query = listQuerySchema.parse({
      date: c.req.query("date"),
      state: c.req.query("state"),
      limit: c.req.query("limit"),
    });
    return c.json({ events: await service.monitor.listEvents(c.get("owner"), query) });
  });
  app.get("/today", async (c) => c.json(await service.monitor.today(c.get("owner"))));
  app.post("/events", async (c) => {
    const input = ingestMonitorEventSchema.parse(await c.req.json());
    return c.json(await service.monitor.ingest(c.get("owner"), input), 201);
  });
  app.post("/events/:id/dismiss", async (c) =>
    c.json(await service.monitor.dismiss(c.get("owner"), c.req.param("id"))),
  );
  app.get("/deliveries", async (c) =>
    c.json({
      deliveries: await service.monitor.listDeliveries(
        c.get("owner"),
        z.string().uuid().optional().parse(c.req.query("event_id")),
      ),
    }),
  );
  app.get("/budget", async (c) =>
    c.json(
      await service.monitor.budget(
        c.get("owner"),
        z.string().date().optional().parse(c.req.query("date")),
      ),
    ),
  );
  app.put("/budget", async (c) => {
    const input = attentionBudgetSchema.parse(await c.req.json());
    return c.json(
      await service.monitor.setBudgetLimit(
        c.get("owner"),
        input.limit,
        z.string().date().optional().parse(c.req.query("date")),
      ),
    );
  });
  app.post("/check", async (c) =>
    c.json(await service.monitor.checkPriceRules(c.get("owner"), undefined, { force: true })),
  );
  return app;
}
