import { Hono } from "hono";
import {
  createPriceAlertSchema,
  type PriceAlertRecord,
  updatePriceAlertSchema,
} from "./price-alerts.ts";
import type { AgentService } from "./service.ts";

type Env = { Variables: { owner: string } };

/** Price alerts, mounted at `/api/price-alerts`. */
export function priceAlertRoutes(service: AgentService): Hono<Env> {
  const app = new Hono<Env>();
  app.get("/", async (c) => c.json({ alerts: await service.priceAlerts.list(c.get("owner")) }));
  app.post("/", async (c) => {
    const input = createPriceAlertSchema.parse(await c.req.json());
    return c.json(await service.priceAlerts.create(c.get("owner"), input), 201);
  });
  app.put("/:id", async (c) => {
    const input = updatePriceAlertSchema.parse(await c.req.json());
    return c.json(await service.priceAlerts.update(c.get("owner"), c.req.param("id"), input));
  });
  app.delete("/:id", async (c) => {
    await service.priceAlerts.remove(c.get("owner"), c.req.param("id"));
    return c.body(null, 204);
  });
  app.post("/:id/check", async (c) => {
    const owner = c.get("owner");
    const result = await service.priceAlerts.check(
      owner,
      c.req.param("id"),
      async (title, body, key) => {
        // Return the stored notification so clients receive the real primary key.
        const notification = await service.notify(owner, title, body, undefined, key);
        return { id: notification.id, title, body };
      },
    );
    return c.json(result);
  });
  return app;
}

export type { PriceAlertRecord };
