import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createApp } from "../apps/server/src/app.ts";
import type { Config } from "../apps/server/src/config.ts";
import { createStore } from "../apps/server/src/db.ts";
import {
  classifyPdfFailure,
  createPdfHealth,
  parsePdfVersion,
} from "../apps/server/src/pdf-health.ts";

const errno = (message: string, extra: Record<string, unknown> = {}) =>
  Object.assign(new Error(message), extra);

test("reports available with the pdftotext version parsed from stderr", async () => {
  const health = createPdfHealth({
    runner: async () => ({ stdout: "", stderr: "pdftotext version 24.02.0\nCopyright" }),
    log: () => {},
  });
  const result = await health.refresh(true);
  assert.equal(result.status, "available");
  assert.equal(result.version, "24.02.0");
  assert.ok(result.checked_at);
});

test("classifies a missing pdftotext binary", async () => {
  const health = createPdfHealth({
    runner: async () => {
      throw errno("spawn pdftotext ENOENT", { code: "ENOENT" });
    },
    log: () => {},
  });
  const result = await health.refresh(true);
  assert.equal(result.status, "unavailable");
  assert.equal(result.reason, "binary_missing");
});

test("classifies a timed-out probe", async () => {
  const health = createPdfHealth({
    runner: async () => {
      throw errno("probe killed", { killed: true });
    },
    log: () => {},
  });
  const result = await health.refresh(true);
  assert.equal(result.reason, "timeout");
});

test("caches the snapshot within the TTL and force re-probes", async () => {
  let calls = 0;
  let now = 1_000;
  const health = createPdfHealth({
    runner: async () => {
      calls++;
      return { stdout: "", stderr: "pdftotext version 1.0.0" };
    },
    now: () => now,
    ttlMs: 1000,
    log: () => {},
  });
  await health.refresh();
  assert.equal(calls, 1);
  await health.refresh();
  assert.equal(calls, 1);
  now += 2000;
  await health.refresh();
  assert.equal(calls, 2);
  await health.refresh(true);
  assert.equal(calls, 3);
});

test("snapshot is available before the first probe finishes", () => {
  const health = createPdfHealth({ runner: async () => ({ stdout: "", stderr: "" }) });
  const snapshot = health.snapshot();
  assert.equal(snapshot.status, "unavailable");
  assert.equal(snapshot.reason, "error");
});

test("classifyPdfFailure and parsePdfVersion handle odd input", () => {
  assert.equal(classifyPdfFailure(errno("boom")).reason, "error");
  assert.equal(parsePdfVersion("", "pdftotext version 23.08.0"), "23.08.0");
  assert.equal(parsePdfVersion("version 1.2.3", ""), "1.2.3");
  assert.equal(parsePdfVersion("", ""), undefined);
});

test("health route exposes the pdf probe field", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lingwu-pdf-health-"));
  const db = await createStore({ dataDir: join(directory, "db") });
  const config: Config = {
    mode: "sample",
    port: 8787,
    host: "127.0.0.1",
    publicUrl: "http://localhost:8787",
    dataDir: directory,
    agentBackend: "model",
    intelligenceApiKey: "test-project-key-never-sent",
    googleRedirectUri: "http://localhost:8787/api/google/callback",
    allowedOrigins: ["http://localhost:8081"],
  };
  const server = await createApp(db, config);
  try {
    const response = await server.app.request("/api/health");
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      market_data: { akshare: { status: string } };
      pdf: { status: string };
    };
    assert.ok(body.market_data.akshare.status);
    assert.ok(["available", "unavailable"].includes(body.pdf.status));
  } finally {
    await server.agent.stop();
    await db.close();
    await rm(directory, { recursive: true, force: true });
  }
});
