import { Hono } from "hono";
import { z } from "zod";
import { parseFinancialsSchema } from "./financials.ts";
import type { AgentService } from "./service.ts";

type Env = { Variables: { owner: string } };

/** Financial report parsing, mounted at `/api/financials`. */
export function financialRoutes(service: AgentService): Hono<Env> {
  const app = new Hono<Env>();
  app.post("/parse", async (c) => {
    const input = parseFinancialsSchema.parse(await c.req.json());
    return c.json(await service.financials.parse(c.get("owner"), input), 201);
  });
  app.get("/:symbol", async (c) =>
    c.json({ report: await service.financials.latest(c.get("owner"), c.req.param("symbol")) }),
  );
  app.get("/:symbol/history", async (c) => {
    const limit = z.coerce.number().int().min(1).max(20).default(10).parse(c.req.query("limit"));
    return c.json({
      reports: await service.financials.history(c.get("owner"), c.req.param("symbol"), limit),
    });
  });
  return app;
}
