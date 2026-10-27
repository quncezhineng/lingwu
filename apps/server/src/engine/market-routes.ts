import { Hono } from "hono";
import { z } from "zod";
import type { AgentService } from "./service.ts";

type Env = { Variables: { owner: string } };

const batchSchema = z.object({
  symbols: z.array(z.string().trim().min(1).max(24)).min(1).max(50),
});

/** Market data helpers, mounted at `/api/market`. */
export function marketRoutes(service: AgentService): Hono<Env> {
  const app = new Hono<Env>();
  /** Batch quotes: deduplicated, request order preserved, per-symbol errors, overall 10s budget. */
  app.post("/quotes", async (c) => {
    const { symbols } = batchSchema.parse(await c.req.json());
    const quotes = await service.market.getBatchQuotes(symbols, { timeoutMs: 10_000 });
    return c.json({ quotes, generated_at: new Date().toISOString() });
  });
  return app;
}
