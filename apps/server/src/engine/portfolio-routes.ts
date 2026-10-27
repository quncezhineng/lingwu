import { Hono } from "hono";
import { z } from "zod";
import {
  addHoldingSchema,
  createPortfolioSchema,
  csvMappingSchema,
  updateHoldingSchema,
  updatePortfolioSchema,
} from "./portfolios.ts";
import type { AgentService } from "./service.ts";

type Env = { Variables: { owner: string } };

const csvSchema = z
  .string()
  .min(1)
  .max(1024 * 1024);
const importSchema = z.object({
  csv: csvSchema,
  /** Canonical field → header name in the uploaded CSV. */
  mapping: csvMappingSchema.optional(),
  portfolio_id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(100).optional(),
  base_currency: z.enum(["CNY", "USD", "HKD"]).optional(),
});

/** Portfolios and holdings, mounted at `/api/portfolios`. */
export function portfolioRoutes(service: AgentService): Hono<Env> {
  const app = new Hono<Env>();
  app.get("/", async (c) => c.json({ portfolios: await service.portfolios.list(c.get("owner")) }));
  app.post("/", async (c) => {
    const input = createPortfolioSchema.parse(await c.req.json());
    return c.json(await service.portfolios.create(c.get("owner"), input), 201);
  });

  // Register static import paths before `/:id` so they are not captured as ids.
  app.post("/import/preview", async (c) => {
    const { csv, mapping } = z
      .object({ csv: csvSchema, mapping: csvMappingSchema.optional() })
      .parse(await c.req.json());
    return c.json(service.portfolios.previewCsv(csv, mapping));
  });
  app.post("/import", async (c) => {
    const input = importSchema.parse(await c.req.json());
    return c.json(await service.portfolios.importCsv(c.get("owner"), input), 201);
  });

  app.get("/:id", async (c) =>
    c.json(await service.portfolios.get(c.get("owner"), c.req.param("id"))),
  );
  app.put("/:id", async (c) => {
    const input = updatePortfolioSchema.parse(await c.req.json());
    return c.json(await service.portfolios.update(c.get("owner"), c.req.param("id"), input));
  });
  app.delete("/:id", async (c) => {
    await service.portfolios.remove(c.get("owner"), c.req.param("id"));
    return c.body(null, 204);
  });
  app.get("/:id/summary", async (c) =>
    c.json(await service.portfolios.summary(c.get("owner"), c.req.param("id"))),
  );
  app.post("/:id/holdings", async (c) => {
    const input = addHoldingSchema.parse(await c.req.json());
    return c.json(
      await service.portfolios.addHolding(c.get("owner"), c.req.param("id"), input),
      201,
    );
  });
  app.put("/:id/holdings/:holdingId", async (c) => {
    const input = updateHoldingSchema.parse(await c.req.json());
    return c.json(
      await service.portfolios.updateHolding(
        c.get("owner"),
        c.req.param("id"),
        c.req.param("holdingId"),
        input,
      ),
    );
  });
  app.delete("/:id/holdings/:holdingId", async (c) => {
    await service.portfolios.removeHolding(
      c.get("owner"),
      c.req.param("id"),
      c.req.param("holdingId"),
    );
    return c.body(null, 204);
  });
  return app;
}
