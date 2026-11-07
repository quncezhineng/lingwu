import assert from "node:assert/strict";
import { test } from "node:test";
import { HindsightClient } from "../apps/server/src/engine/hindsight.ts";

test("bankId joins owner and agentId for isolation", () => {
  const client = new HindsightClient({ baseUrl: "http://localhost:8888" });
  assert.equal(client.bankId("owner-1", "agent-a"), "owner-1:agent-a");
  assert.equal(client.bankId("owner-1", "agent-b"), "owner-1:agent-b");
  assert.notEqual(client.bankId("owner-1", "agent-a"), client.bankId("owner-2", "agent-a"));
});

test("enabled is false without baseUrl, true when configured", () => {
  const previous = process.env.HINDSIGHT_BASE_URL;
  delete process.env.HINDSIGHT_BASE_URL;
  const off = new HindsightClient();
  assert.equal(off.enabled, false);
  const on = new HindsightClient({ baseUrl: "http://localhost:9999" });
  assert.equal(on.enabled, true);
  if (previous) process.env.HINDSIGHT_BASE_URL = previous;
});

test("recall short-circuits when disabled instead of calling out", async () => {
  const client = new HindsightClient();
  const result = await client.recall("owner", "agent", "query");
  assert.deepEqual(result, { query: "query", memories: [] });
});

test("retain is a no-op when disabled", async () => {
  const client = new HindsightClient();
  await client.retain("owner", "agent", "some content");
});

test("normalize handles recall results shape via a local server", async () => {
  // 起一个本地 HTTP 服务器模拟 Hindsight recall，验证请求路径、请求体与解析。
  const requests: { path: string; body: Record<string, unknown> }[] = [];
  const server = await import("node:http").then(
    ({ createServer }) =>
      new Promise<{ port: number; close: () => Promise<void> }>((resolve) => {
        const srv = createServer((req, res) => {
          let body = "";
          req.on("data", (chunk) => (body += chunk));
          req.on("end", () => {
            requests.push({ path: req.url ?? "", body: JSON.parse(body) });
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({
                results: [
                  { id: "m1", text: "Alice works at Google", score: 0.9 },
                  { id: "m2", content: "She prefers Slack", score: 0.5 },
                ],
              }),
            );
          });
        });
        srv.listen(0, "127.0.0.1", () => {
          const address = srv.address();
          const port = typeof address === "object" && address ? address.port : 0;
          resolve({
            port,
            close: () => new Promise((r) => srv.close(() => r())),
          });
        });
      }),
  );
  try {
    const client = new HindsightClient({ baseUrl: `http://127.0.0.1:${server.port}` });
    const result = await client.recall("owner", "agent", "hello");
    assert.equal(result.query, "hello");
    assert.equal(result.memories.length, 2);
    assert.equal(result.memories[0]?.id, "m1");
    assert.equal(result.memories[0]?.text, "Alice works at Google");
    assert.equal(result.memories[1]?.text, "She prefers Slack");
    // 校验请求路径（v1/default/banks/{bank_id}/memories/recall）与请求体（query）。
    assert.equal(requests[0]?.path, "/v1/default/banks/owner:agent/memories/recall");
    assert.deepEqual(requests[0]?.body, { query: "hello" });
  } finally {
    await server.close();
  }
});

test("retain posts to the correct endpoint with optional document_id", async () => {
  const requests: { path: string; body: Record<string, unknown> }[] = [];
  const server = await import("node:http").then(
    ({ createServer }) =>
      new Promise<{ port: number; close: () => Promise<void> }>((resolve) => {
        const srv = createServer((req, res) => {
          let body = "";
          req.on("data", (chunk) => (body += chunk));
          req.on("end", () => {
            requests.push({ path: req.url ?? "", body: JSON.parse(body) });
            res.setHeader("Content-Type", "application/json");
            res.end("{}");
          });
        });
        srv.listen(0, "127.0.0.1", () => {
          const address = srv.address();
          const port = typeof address === "object" && address ? address.port : 0;
          resolve({
            port,
            close: () => new Promise((r) => srv.close(() => r())),
          });
        });
      }),
  );
  try {
    const client = new HindsightClient({ baseUrl: `http://127.0.0.1:${server.port}` });
    await client.retain("owner", "agent", "some fact", "memory-1");
    assert.equal(requests[0]?.path, "/v1/default/banks/owner:agent/memories/retain");
    assert.deepEqual(requests[0]?.body, { content: "some fact", document_id: "memory-1" });
  } finally {
    await server.close();
  }
});

test("deleteDocument uses DELETE verb on the document endpoint", async () => {
  const requests: { method?: string; path: string }[] = [];
  const server = await import("node:http").then(
    ({ createServer }) =>
      new Promise<{ port: number; close: () => Promise<void> }>((resolve) => {
        const srv = createServer((req, res) => {
          req.resume();
          req.on("end", () => {
            requests.push({ method: req.method, path: req.url ?? "" });
            res.setHeader("Content-Type", "application/json");
            res.end("{}");
          });
        });
        srv.listen(0, "127.0.0.1", () => {
          const address = srv.address();
          const port = typeof address === "object" && address ? address.port : 0;
          resolve({
            port,
            close: () => new Promise((r) => srv.close(() => r())),
          });
        });
      }),
  );
  try {
    const client = new HindsightClient({ baseUrl: `http://127.0.0.1:${server.port}` });
    await client.deleteDocument("owner", "agent", "memory-1");
    assert.equal(requests[0]?.method, "DELETE");
    assert.equal(requests[0]?.path, "/v1/default/banks/owner:agent/documents/memory-1");
  } finally {
    await server.close();
  }
});
