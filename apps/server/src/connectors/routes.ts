import type { Hono } from "hono";
import { z } from "zod";
import type { Config } from "../config.ts";
import type { Store } from "../db.ts";
import {
  connectConnector,
  disconnectConnector,
  listConnectors,
  type FileReader,
} from "./service.ts";

const bodySchema = z.object({
  token: z.string().max(300).optional(),
  email: z.string().max(200).optional(),
  code: z.string().max(200).optional(),
  url: z.string().max(2000).optional(),
});

export function appConnectorRoutes(
  app: Hono<{ Variables: { owner: string } }>,
  deps: { db: Store; config: Config; files: FileReader },
) {
  app.get("/api/app-connectors", async (c) => {
    const items = await listConnectors(deps, c.get("owner"));
    return c.json({
      items,
      connectedCount: items.filter((item) => item.connected).length,
    });
  });
  app.post("/api/app-connectors/:slug/connect", async (c) => {
    const input = bodySchema.parse(await c.req.json().catch(() => ({})));
    return c.json(await connectConnector(deps, c.get("owner"), c.req.param("slug"), input));
  });
  app.post("/api/app-connectors/:slug/disconnect", async (c) =>
    c.json(await disconnectConnector(deps, c.get("owner"), c.req.param("slug"))),
  );
}
