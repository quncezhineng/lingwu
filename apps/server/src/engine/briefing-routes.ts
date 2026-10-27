import { Hono } from "hono";
import { z } from "zod";
import { AppError } from "../errors.ts";
import { findBriefing, findLatestBriefing, generateMarketBriefing } from "./market-briefing.ts";
import type { AgentService } from "./service.ts";

type Env = { Variables: { owner: string } };

const today = () => new Date().toISOString().slice(0, 10);

/** Daily market briefing, mounted at `/api/briefings`. */
export function briefingRoutes(service: AgentService): Hono<Env> {
  const app = new Hono<Env>();
  app.get("/today", async (c) => {
    const briefing = await findBriefing(service.db, c.get("owner"), today());
    if (!briefing) throw new AppError("No briefing for today yet", 404);
    return c.json(briefing);
  });
  app.get("/latest", async (c) => {
    const briefing = await findLatestBriefing(service.db, c.get("owner"));
    return c.json({
      briefing,
      is_today: briefing?.date === today(),
      today: today(),
    });
  });
  app.post("/generate", async (c) => {
    const body = z
      .object({ force: z.boolean().default(false) })
      .parse(await c.req.json().catch(() => ({})));
    return c.json(
      await generateMarketBriefing(
        c.get("owner"),
        { db: service.db, market: service.market },
        body,
      ),
    );
  });
  return app;
}
