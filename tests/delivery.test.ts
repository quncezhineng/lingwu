import assert from "node:assert/strict";
import test from "node:test";
import { createStore } from "../apps/server/src/db.ts";
import { type DeliveryAdapter, DeliveryService } from "../apps/server/src/delivery/index.ts";
import type { MonitorEvent } from "../packages/domain/src/monitor.ts";

function event(): MonitorEvent {
  return {
    id: "event-1",
    ownerId: "alice",
    ruleId: "rule-1",
    kind: "ANNOUNCEMENT",
    layer: "L2",
    level: "MUST_KNOW",
    severity: "high",
    payload: { symbol: "AAPL" },
    dedupeKey: "rule-1:ANNOUNCEMENT:AAPL",
    detectedAt: "2026-11-13T12:00:00.000Z",
    marketDate: "2026-11-13",
    state: "delivered",
    occurrences: 1,
  };
}

function adapter(channel: "apns" | "fcm" | "wecom", sent: string[]): DeliveryAdapter {
  return {
    channel,
    providerId: `test-${channel}`,
    configured: () => channel !== "wecom",
    send: async () => {
      sent.push(channel);
      return { providerId: `provider-${channel}` };
    },
  };
}

test("one event is pushed through one configured channel and logged once per channel", async () => {
  const db = await createStore();
  const sent: string[] = [];
  const service = new DeliveryService(db, [adapter("apns", sent), adapter("fcm", sent)]);
  const envelope = event();
  try {
    const logs = await service.dispatch(
      { ownerId: "alice", event: envelope, title: "AAPL 公告", body: "回购" },
      ["apns", "fcm"],
      new Date("2026-11-13T12:00:00.000Z"),
    );
    assert.deepEqual(sent, ["apns"]);
    assert.deepEqual(
      logs.map((log) => `${log.channel}:${log.result}:${log.reason ?? ""}`),
      ["apns:sent:", "fcm:skipped:duplicated"],
    );
    const stored = await db.list("alice", "delivery_logs");
    assert.equal(stored.length, 2);

    const replay = await service.dispatch(
      { ownerId: "alice", event: envelope, title: "AAPL 公告", body: "回购" },
      ["apns", "fcm"],
      new Date("2026-11-13T12:05:00.000Z"),
    );
    assert.equal(replay.length, 2);
    assert.deepEqual(sent, ["apns"]);
  } finally {
    await db.close();
  }
});

test("channels without credentials are skipped, never sent", async () => {
  const db = await createStore();
  const sent: string[] = [];
  const service = new DeliveryService(db, [adapter("wecom", sent)]);
  try {
    const logs = await service.dispatch(
      { ownerId: "alice", event: event(), title: "AAPL 公告", body: "回购" },
      ["wecom"],
    );
    assert.deepEqual(sent, []);
    assert.equal(logs[0]?.result, "skipped");
    assert.equal(logs[0]?.reason, "not_configured");
  } finally {
    await db.close();
  }
});
