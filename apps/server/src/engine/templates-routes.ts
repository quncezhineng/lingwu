import { Hono } from "hono";
import { z } from "zod";
import type { AgentService } from "./service.ts";
import {
  feedbackSchema,
  fromDeliverableSchema,
  matchTemplateSchema,
  updateTemplateSchema,
} from "./templates.ts";

type Env = { Variables: { owner: string } };

/** 我的模板，挂载在 `/api/templates`；内置能力不进入这里。 */
export function templateRoutes(service: AgentService): Hono<Env> {
  const app = new Hono<Env>();
  app.get("/", async (c) => c.json({ templates: await service.templates.list(c.get("owner")) }));
  app.get("/shared", async (c) =>
    c.json({ templates: await service.templates.listShared(c.get("owner")) }),
  );
  app.post("/from-deliverable", async (c) => {
    const owner = c.get("owner");
    const input = fromDeliverableSchema.parse(await c.req.json());
    const deliverable = await service.deliverables.get(owner, input.deliverable_id);
    return c.json(await service.templates.createFromDeliverable(owner, deliverable, input), 201);
  });
  app.post("/match", async (c) => {
    const input = matchTemplateSchema.parse(await c.req.json());
    return c.json({ matches: await service.templates.match(c.get("owner"), input) });
  });
  app.get("/:id", async (c) =>
    c.json(await service.templates.require(c.get("owner"), c.req.param("id"))),
  );
  app.put("/:id", async (c) => {
    const input = updateTemplateSchema.parse(await c.req.json());
    return c.json(await service.templates.update(c.get("owner"), c.req.param("id"), input));
  });
  app.put("/:id/shared", async (c) => {
    const body = z.object({ shared: z.boolean() }).parse(await c.req.json());
    return c.json(
      await service.templates.setShared(c.get("owner"), c.req.param("id"), body.shared),
    );
  });
  app.post("/:id/accept", async (c) => {
    const input = feedbackSchema.parse(await c.req.json());
    return c.json(await service.templates.accept(c.get("owner"), c.req.param("id"), input));
  });
  app.post("/:id/reject", async (c) => {
    const input = feedbackSchema.parse(await c.req.json());
    return c.json(await service.templates.reject(c.get("owner"), c.req.param("id"), input));
  });
  return app;
}
