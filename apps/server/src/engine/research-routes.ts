import { Hono } from "hono";
import { z } from "zod";
import { findLatestResearchReport, listResearchReports, researchSymbolSchema } from "./research.ts";
import type { AgentService } from "./service.ts";

type Env = { Variables: { owner: string } };

const createResearchSchema = z.object({ symbol: researchSymbolSchema });

/** Deep research tasks and stored reports, mounted at `/api/research`. */
export function researchRoutes(service: AgentService): Hono<Env> {
  const app = new Hono<Env>();
  app.post("/", async (c) => {
    const { symbol } = createResearchSchema.parse(await c.req.json());
    const task = await service.createTask(c.get("owner"), {
      prompt: `研究 ${symbol}`,
      kind: "research",
      input: { symbol },
    });
    return c.json(task, 201);
  });
  app.get("/:symbol/history", async (c) => {
    const limit = z.coerce.number().int().min(1).max(20).default(10).parse(c.req.query("limit"));
    return c.json({
      reports: await listResearchReports(service.db, c.get("owner"), c.req.param("symbol"), limit),
    });
  });
  app.get("/:symbol", async (c) =>
    c.json({
      report: await findLatestResearchReport(service.db, c.get("owner"), c.req.param("symbol")),
    }),
  );
  return app;
}
