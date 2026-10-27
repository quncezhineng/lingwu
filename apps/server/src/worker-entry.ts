import { createApp } from "./app.ts";
import { readConfig } from "./config.ts";
import { createStore } from "./db.ts";
import { backgroundFailure } from "./log.ts";
import { getMarketDataHealth } from "./market-data-health.ts";
import { getPdfHealth } from "./pdf-health.ts";

const config = readConfig();
if (!config.databaseUrl)
  throw new Error(
    "A separate task worker requires DATABASE_URL. Embedded PGlite runs inside the API process.",
  );
const db = await createStore({ databaseUrl: config.databaseUrl });
const { agent } = await createApp(db, config);
agent.start();
// The worker generates briefings and quotes; log A-share helper availability here too.
void getMarketDataHealth()
  .refresh(true)
  .catch((error) => backgroundFailure("startup self-check", error));
// Financial-report PDF uploads need poppler's pdftotext; probe at boot so the
// phase=pdf-self-check log and /api/health are populated before the first check.
void getPdfHealth()
  .refresh(true)
  .catch((error) => backgroundFailure("startup self-check", error));
console.log("LingWu task worker running");
let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  await agent.stop();
  await db.close();
  process.exit(0);
};
process.on("SIGINT", () => {
  void stop().catch(() => process.exit(1));
});
process.on("SIGTERM", () => {
  void stop().catch(() => process.exit(1));
});
