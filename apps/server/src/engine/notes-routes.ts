import { Hono } from "hono";
import { z } from "zod";
import { createNoteSchema, updateNoteSchema } from "./notes.ts";
import type { AgentService } from "./service.ts";

type Env = { Variables: { owner: string } };

const listQuerySchema = z.object({
  symbol: z.string().trim().max(24).optional(),
  type: z.enum(["BUY_REASON", "SELL_REASON", "RESEARCH", "THESIS"]).optional(),
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(200),
});

/** Investment notes and weekly thesis checks, mounted at `/api/notes`. */
export function noteRoutes(service: AgentService): Hono<Env> {
  const app = new Hono<Env>();
  // Static paths before `/:id`.
  app.get("/thesis-check/latest", async (c) => {
    const check = await service.notes.latestCheck(c.get("owner"));
    return c.json({ check, next_run: nextWeekStart(new Date()).toISOString() });
  });
  app.post("/thesis-check", async (c) => {
    const owner = c.get("owner");
    const check = await service.notes.runThesisCheck(owner, {
      notify: async (title, body, key) => service.notify(owner, title, body, undefined, key),
    });
    return c.json(check);
  });
  app.get("/", async (c) => {
    const query = listQuerySchema.parse({
      symbol: c.req.query("symbol"),
      type: c.req.query("type"),
      q: c.req.query("q"),
      limit: c.req.query("limit"),
    });
    return c.json({ notes: await service.notes.list(c.get("owner"), query) });
  });
  app.get("/:id/checks", async (c) => {
    const limit = z.coerce.number().int().min(1).max(100).default(20).parse(c.req.query("limit"));
    return c.json({
      checks: await service.notes.listChecks(c.get("owner"), c.req.param("id"), limit),
    });
  });
  app.post("/", async (c) => {
    const input = createNoteSchema.parse(await c.req.json());
    return c.json(await service.notes.create(c.get("owner"), input), 201);
  });
  app.put("/:id", async (c) => {
    const input = updateNoteSchema.parse(await c.req.json());
    return c.json(await service.notes.update(c.get("owner"), c.req.param("id"), input));
  });
  app.delete("/:id", async (c) => {
    await service.notes.remove(c.get("owner"), c.req.param("id"));
    return c.body(null, 204);
  });
  return app;
}

/** Next ISO-week Monday 00:00 UTC, used by the UI to show the next check time. */
export function nextWeekStart(now: Date): Date {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + (8 - day));
  return date;
}
