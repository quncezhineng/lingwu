import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import type { Config } from "./config.ts";
import { readConfig } from "./config.ts";
import type { Store } from "./db.ts";
import { createStore } from "./db.ts";
import { backgroundFailure, describeError } from "./log.ts";
import { getMarketDataHealth } from "./market-data-health.ts";
import { getPdfHealth } from "./pdf-health.ts";

const config = readConfig();
/**
 * PGlite 的 dist 是上万个字符挤在一行的产物。数据库初始化抛错时顶层 await 没人接住，
 * Node 会把那一整行源码打出来，真正的 `Error:` 被推到 100KB 之后，部署日志里等于看不见。
 * 这里把它收成一行，带上 DATA_DIR 与错误码，失败原因才读得出来。
 */
async function openStore(settings: Config): Promise<Store> {
  try {
    return await createStore({
      dataDir: `${settings.dataDir}/postgres`,
      databaseUrl: settings.databaseUrl,
    });
  } catch (error) {
    const detail = describeError(error);
    const code = (error as { code?: unknown } | null)?.code;
    console.error(
      `[LingWu] 数据库初始化失败 · DATA_DIR=${settings.dataDir}${settings.databaseUrl ? " · DATABASE_URL" : ""}` +
        `${code ? ` · code=${String(code)}` : ""} · node=${process.version} · ${detail.slice(0, 400)}`,
    );
    process.exit(1);
  }
}

const db = await openStore(config);
await db.recoverInterruptedActions();
const { app, agent, conversationStream } = await createApp(db, config);
if (config.taskWorkerEnabled) agent.start();
// Startup self-check: log whether python3 + akshare is usable so a deployment that
// silently falls back to Yahoo for A-shares is visible in logs, not only /api/health.
void getMarketDataHealth()
  .refresh(true)
  .catch((error) => backgroundFailure("startup self-check", error));
// Financial-report PDF uploads need poppler's pdftotext; probe at boot so the
// phase=pdf-self-check log and /api/health are populated before the first check.
void getPdfHealth()
  .refresh(true)
  .catch((error) => backgroundFailure("startup self-check", error));
const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, () =>
  console.log(`LingWu ${config.mode} API ready at ${config.publicUrl}`),
);
const shutdown = () => {
  server.close(() => {
    void agent
      .stop()
      .then(() => conversationStream.close())
      .then(() => db.close())
      .then(() => process.exit(0));
  });
  // SSE replies stay open by design, so `close()` alone would wait forever.
  (server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
