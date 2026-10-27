import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createApp } from "../apps/server/src/app.ts";
import type { Config } from "../apps/server/src/config.ts";
import { createStore } from "../apps/server/src/db.ts";
import {
  classifyProbeFailure,
  createMarketDataHealth,
  getMarketDataHealth,
} from "../apps/server/src/market-data-health.ts";

const errno = (message: string, extra: Record<string, unknown> = {}) =>
  Object.assign(new Error(message), extra);

test("reports disabled without running the helper", async () => {
  let calls = 0;
  const health = createMarketDataHealth({
    env: { MARKET_DATA_AKSHARE_ENABLED: "false" },
    runner: async () => {
      calls++;
      return "1.16.0\n";
    },
  });
  const result = await health.refresh(true);
  assert.equal(result.status, "disabled");
  assert.equal(calls, 0);
  assert.equal(health.snapshot().akshare.status, "disabled");
});

test("reports available with the imported akshare version", async () => {
  const health = createMarketDataHealth({
    env: {},
    runner: async () => "1.16.0\n",
    log: () => {},
  });
  const result = await health.refresh(true);
  assert.equal(result.status, "available");
  assert.equal(result.version, "1.16.0");
  assert.ok(result.checked_at);
});

test("classifies a missing python3 interpreter", async () => {
  const health = createMarketDataHealth({
    env: {},
    runner: async () => {
      throw errno("spawn python3 ENOENT", { code: "ENOENT" });
    },
    log: () => {},
  });
  const result = await health.refresh(true);
  assert.equal(result.status, "unavailable");
  assert.equal(result.reason, "python_missing");
});

test("classifies a missing akshare module", async () => {
  const health = createMarketDataHealth({
    env: {},
    runner: async () => {
      throw errno("ModuleNotFoundError: No module named 'akshare'");
    },
    log: () => {},
  });
  const result = await health.refresh(true);
  assert.equal(result.status, "unavailable");
  assert.equal(result.reason, "akshare_missing");
});

test("classifies a killed helper as a timeout", () => {
  assert.deepEqual(classifyProbeFailure(errno("Command failed", { killed: true })), {
    reason: "timeout",
    detail: "AKShare probe timed out",
  });
});

test("caches results until the ttl elapses or a forced refresh", async () => {
  let calls = 0;
  let clock = 0;
  const health = createMarketDataHealth({
    env: {},
    runner: async () => {
      calls++;
      return "1.0.0\n";
    },
    ttlMs: 1_000,
    now: () => clock,
    log: () => {},
  });
  await health.refresh(true);
  assert.equal(calls, 1);
  clock = 500;
  await health.refresh();
  assert.equal(calls, 1);
  clock = 1_500;
  await health.refresh();
  assert.equal(calls, 2);
  await health.refresh(true);
  assert.equal(calls, 3);
});

test("health route exposes the akshare self-check", async () => {
  process.env.MARKET_DATA_AKSHARE_ENABLED = "false";
  const directory = await mkdtemp(join(tmpdir(), "lingwu-health-"));
  const db = await createStore();
  try {
    const config = {
      mode: "sample",
      port: 8787,
      host: "127.0.0.1",
      publicUrl: "http://localhost:8787",
      dataDir: directory,
      agentBackend: "sample",
      intelligenceApiKey: "test-project-key-never-sent",
      allowedOrigins: ["http://localhost:8081"],
    } as Config;
    const { app } = await createApp(db, config);
    // Response is served from the cache; populate it once to keep the assertion deterministic.
    await getMarketDataHealth().refresh(true);
    const response = await app.request("/api/health");
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      ok: boolean;
      market_data: { akshare: { status: string } };
    };
    assert.equal(body.ok, true);
    assert.equal(body.market_data.akshare.status, "disabled");
  } finally {
    await db.close();
    await rm(directory, { recursive: true, force: true });
  }
});
