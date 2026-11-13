import { Hono } from "hono";
import { z } from "zod";
import type { Config } from "../config.ts";
import {
  createDeliverableSchema,
  deliverableKinds,
  resolveNumberSchema,
  updateDeliverableSchema,
} from "./deliverables.ts";
import type { AgentService } from "./service.ts";

type Env = { Variables: { owner: string } };

const listQuerySchema = z.object({
  status: z.enum(["draft", "in_review", "approved", "sent", "archived"]).optional(),
  kind: z.enum(deliverableKinds).optional(),
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

const sendSchema = z.object({
  recipient: z.string().trim().max(200).optional(),
  disclaimer: z.string().trim().max(1000).optional(),
});

/** 交付物中心，挂载在 `/api/deliverables`。 */
export function deliverableRoutes(service: AgentService, config: Config): Hono<Env> {
  const app = new Hono<Env>();
  // 静态路径必须先于 `/:id` 注册。
  app.get("/audit/export", async (c) => {
    const deliverableId = z.string().uuid().optional().parse(c.req.query("deliverable_id"));
    const csv = await service.deliverables.auditCsv(c.get("owner"), deliverableId);
    return c.body(csv, 200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="deliverable-audit-${Date.now()}.csv"`,
    });
  });
  app.get("/", async (c) => {
    const query = listQuerySchema.parse({
      status: c.req.query("status"),
      kind: c.req.query("kind"),
      q: c.req.query("q"),
      limit: c.req.query("limit"),
    });
    return c.json({ deliverables: await service.deliverables.list(c.get("owner"), query) });
  });
  app.post("/", async (c) => {
    const input = createDeliverableSchema.parse(await c.req.json());
    return c.json(await service.deliverables.create(c.get("owner"), input), 201);
  });
  app.get("/:id", async (c) =>
    c.json(await service.deliverables.require(c.get("owner"), c.req.param("id"))),
  );
  app.put("/:id", async (c) => {
    const input = updateDeliverableSchema.parse(await c.req.json());
    return c.json(await service.deliverables.update(c.get("owner"), c.req.param("id"), input));
  });
  app.post("/:id/submit", async (c) =>
    c.json(await service.deliverables.submit(c.get("owner"), c.req.param("id"))),
  );
  app.post("/:id/approve", async (c) =>
    c.json(await service.deliverables.approve(c.get("owner"), c.req.param("id"))),
  );
  app.post("/:id/reopen", async (c) => {
    const body = z
      .object({ reason: z.string().trim().max(200).optional() })
      .parse(await c.req.json().catch(() => ({})));
    return c.json(
      await service.deliverables.returnToDraft(c.get("owner"), c.req.param("id"), body.reason),
    );
  });
  app.post("/:id/archive", async (c) =>
    c.json(await service.deliverables.archive(c.get("owner"), c.req.param("id"))),
  );
  app.post("/:id/send", async (c) => {
    const input = sendSchema.parse(await c.req.json().catch(() => ({})));
    return c.json(await service.deliverables.send(c.get("owner"), c.req.param("id"), input));
  });
  app.post("/:id/numbers/:numberId/resolve", async (c) => {
    const input = resolveNumberSchema.parse(await c.req.json());
    return c.json(
      await service.deliverables.resolveNumber(
        c.get("owner"),
        c.req.param("id"),
        c.req.param("numberId"),
        input,
      ),
    );
  });
  app.get("/:id/compliance", async (c) =>
    c.json(await service.deliverables.compliance(c.get("owner"), c.req.param("id"))),
  );
  app.get("/:id/diff", async (c) => {
    const query = z
      .object({
        from: z.coerce.number().int().min(1),
        to: z.coerce.number().int().min(1),
      })
      .parse({ from: c.req.query("from"), to: c.req.query("to") });
    return c.json(
      await service.deliverables.diff(c.get("owner"), c.req.param("id"), query.from, query.to),
    );
  });
  app.get("/:id/audit", async (c) =>
    c.json({
      audit: (await service.deliverables.require(c.get("owner"), c.req.param("id"))).audit,
    }),
  );
  app.post("/:id/share", async (c) => {
    const share = await service.deliverables.share(c.get("owner"), c.req.param("id"));
    const baseUrl = config.webUrl ?? config.publicUrl;
    return c.json({ ...share, url: `${baseUrl}/d/${share.id}` }, 201);
  });
  app.delete("/shares/:shareId", async (c) => {
    await service.deliverables.revokeShare(c.get("owner"), c.req.param("shareId"));
    return c.body(null, 204);
  });
  return app;
}
