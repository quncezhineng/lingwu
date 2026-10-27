import { Hono } from "hono";
import { z } from "zod";
import type { AgentService } from "./service.ts";
import { addSymbolSchema, createWatchlistSchema, updateWatchlistSchema } from "./watchlists.ts";

type Env = { Variables: { owner: string } };

/** CRUD for watchlists, mounted at `/api/watchlists`. */
export function watchlistRoutes(service: AgentService): Hono<Env> {
  const app = new Hono<Env>();
  app.get("/", async (c) => c.json({ watchlists: await service.watchlists.list(c.get("owner")) }));
  app.post("/", async (c) => {
    const input = createWatchlistSchema.parse(await c.req.json());
    return c.json(await service.watchlists.create(c.get("owner"), input), 201);
  });
  app.put("/:id", async (c) => {
    const input = updateWatchlistSchema.parse(await c.req.json());
    return c.json(await service.watchlists.update(c.get("owner"), c.req.param("id"), input));
  });
  app.delete("/:id", async (c) => {
    await service.watchlists.remove(c.get("owner"), c.req.param("id"));
    return c.body(null, 204);
  });
  app.post("/:id/symbols", async (c) => {
    const input = addSymbolSchema.parse(await c.req.json());
    return c.json(await service.watchlists.addSymbol(c.get("owner"), c.req.param("id"), input));
  });
  app.delete("/:id/symbols/:symbolId", async (c) =>
    c.json(
      await service.watchlists.removeSymbol(
        c.get("owner"),
        c.req.param("id"),
        c.req.param("symbolId"),
      ),
    ),
  );
  app.get("/:id/summary", async (c) =>
    c.json(await service.watchlists.summary(c.get("owner"), c.req.param("id"))),
  );
  return app;
}

/** Symbol search, mounted at `/api/symbols`. */
export function symbolRoutes(service: AgentService): Hono<Env> {
  const app = new Hono<Env>();
  app.get("/search", async (c) => {
    const query = z
      .object({
        q: z.string().trim().min(1).max(64),
        limit: z.coerce.number().int().min(1).max(20).default(10),
      })
      .parse({ q: c.req.query("q"), limit: c.req.query("limit") });
    return c.json({ matches: await service.market.searchSymbols(query.q, query.limit) });
  });
  return app;
}
