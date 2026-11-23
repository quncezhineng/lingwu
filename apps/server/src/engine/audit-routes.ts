import { Hono } from "hono";
import { agentActionQuerySchema } from "../../../../packages/domain/src/audit.ts";
import { AppError } from "../errors.ts";
import type { AgentService } from "./service.ts";

/**
 * 动作审计的 HTTP 入口（PRD R6）。
 *
 * 只读 + 撤销两个动作：审计日志不允许改写或删除，撤销也只是给条目打上
 * revoked 标记并尽力回滚真实对象，历史必须留着。
 */
export function auditRoutes(service: AgentService): Hono<{ Variables: { owner: string } }> {
  const app = new Hono<{ Variables: { owner: string } }>();

  app.get("/actions", async (c) => {
    const parsed = agentActionQuerySchema.safeParse({
      kind: c.req.query("kind") || undefined,
      symbol: c.req.query("symbol") || undefined,
      actor: c.req.query("actor") || undefined,
      includeRevoked: c.req.query("includeRevoked") ?? undefined,
      limit: c.req.query("limit") || undefined,
    });
    if (!parsed.success) throw new AppError("Invalid audit query", 422);
    return c.json(await service.actionLog.list(c.get("owner"), parsed.data));
  });

  app.get("/actions/:id", async (c) =>
    c.json(await service.actionLog.get(c.get("owner"), c.req.param("id"))),
  );

  app.post("/actions/:id/revoke", async (c) =>
    c.json(await service.actionLog.revoke(c.get("owner"), c.req.param("id"))),
  );

  return app;
}
