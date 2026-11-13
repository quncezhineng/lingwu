import { Hono } from "hono";
import { z } from "zod";
import {
  createDeliverableSchema,
  deliverableListQuerySchema,
  resolveNumberSchema,
  sendDeliverableSchema,
  transitionDeliverableSchema,
  updateDeliverableSchema,
} from "./deliverables.ts";
import type { AgentService } from "./service.ts";

type Env = { Variables: { owner: string } };

const diffQuerySchema = z.object({
  from: z.coerce.number().int().min(1),
  to: z.coerce.number().int().min(1),
});

const exportQuerySchema = z.object({
  format: z.enum(["markdown", "html"]).default("markdown"),
});

/** 交付物中心与合规门，挂载在 `/api/deliverables`。 */
export function deliverableRoutes(service: AgentService): Hono<Env> {
  const app = new Hono<Env>();
  app.get("/", async (c) => {
    const query = deliverableListQuerySchema.parse({
      status: c.req.query("status"),
      kind: c.req.query("kind"),
      sourceType: c.req.query("sourceType"),
      sourceId: c.req.query("sourceId"),
      limit: c.req.query("limit"),
    });
    return c.json({ deliverables: await service.deliverables.list(c.get("owner"), query) });
  });
  app.post("/", async (c) => {
    const input = createDeliverableSchema.parse(await c.req.json());
    return c.json(await service.deliverables.create(c.get("owner"), input), 201);
  });
  app.get("/:id", async (c) =>
    c.json(await service.deliverables.get(c.get("owner"), c.req.param("id"))),
  );
  app.put("/:id", async (c) => {
    const input = updateDeliverableSchema.parse(await c.req.json());
    return c.json(await service.deliverables.update(c.get("owner"), c.req.param("id"), input));
  });
  app.get("/:id/versions", async (c) =>
    c.json({
      versions: await service.deliverables.versions(c.get("owner"), c.req.param("id")),
    }),
  );
  app.get("/:id/diff", async (c) => {
    const { from, to } = diffQuerySchema.parse({
      from: c.req.query("from"),
      to: c.req.query("to"),
    });
    return c.json(await service.deliverables.diff(c.get("owner"), c.req.param("id"), from, to));
  });
  app.get("/:id/audit", async (c) =>
    c.json({ audit: await service.deliverables.audits(c.get("owner"), c.req.param("id")) }),
  );
  app.get("/:id/export", async (c) => {
    const { format } = exportQuerySchema.parse({ format: c.req.query("format") });
    const body = await service.deliverables.export(c.get("owner"), c.req.param("id"), format);
    return c.body(body, 200, {
      "Content-Type":
        format === "html" ? "text/html; charset=utf-8" : "text/markdown; charset=utf-8",
      "Content-Disposition": `inline; filename="deliverable-${c.req.param("id")}.${format === "html" ? "html" : "md"}"`,
    });
  });
  app.post("/:id/submit", async (c) => {
    const input = transitionDeliverableSchema.parse(await c.req.json().catch(() => ({})));
    return c.json(await service.deliverables.submit(c.get("owner"), c.req.param("id"), input));
  });
  app.post("/:id/approve", async (c) => {
    const input = transitionDeliverableSchema.parse(await c.req.json().catch(() => ({})));
    return c.json(await service.deliverables.approve(c.get("owner"), c.req.param("id"), input));
  });
  app.post("/:id/reopen", async (c) => {
    const input = transitionDeliverableSchema.parse(await c.req.json().catch(() => ({})));
    return c.json(
      await service.deliverables.returnToDraft(c.get("owner"), c.req.param("id"), input),
    );
  });
  app.post("/:id/send", async (c) => {
    const input = sendDeliverableSchema.parse(await c.req.json());
    return c.json(await service.deliverables.send(c.get("owner"), c.req.param("id"), input));
  });
  app.post("/:id/numbers/resolve", async (c) => {
    const input = resolveNumberSchema.parse(await c.req.json());
    return c.json(
      await service.deliverables.resolveNumber(c.get("owner"), c.req.param("id"), input),
    );
  });
  app.get("/:id/compliance", async (c) =>
    c.json(await service.deliverables.compliance(c.get("owner"), c.req.param("id"))),
  );
  app.get("/:id/shares", async (c) =>
    c.json({ shares: await service.deliverables.shares(c.get("owner"), c.req.param("id")) }),
  );
  app.post("/:id/share", async (c) => {
    const share = await service.deliverables.share(c.get("owner"), c.req.param("id"));
    return c.json(
      {
        ...share,
        url: `${c.req.url.split("/api/deliverables/")[0]}/d/${share.id}`,
      },
      201,
    );
  });
  app.delete("/shares/:shareId", async (c) => {
    await service.deliverables.revokeShare(c.get("owner"), c.req.param("shareId"));
    return c.body(null, 204);
  });
  app.post("/:id/archive", async (c) => {
    const input = transitionDeliverableSchema.parse(await c.req.json().catch(() => ({})));
    return c.json(await service.deliverables.archive(c.get("owner"), c.req.param("id"), input));
  });
  return app;
}
