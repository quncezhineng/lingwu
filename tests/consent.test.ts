import assert from "node:assert/strict";
import { test } from "node:test";
import { createStore } from "../apps/server/src/db.ts";
import {
  ConsentService,
  isConsentActive,
  isWithinQuietHours,
} from "../apps/server/src/engine/consent.ts";
import type { Consent, EventFeedItem } from "../packages/domain/src/investor.ts";

const now = () => new Date("2026-11-23T02:00:00.000Z");

function pushItem(id: string, day: string): EventFeedItem {
  return {
    id,
    type: "thesis_risk",
    symbol: "300750.SZ",
    title: id,
    body: "",
    decision: "push",
    score: 80,
    level1: "passed",
    reasons: [],
    dedupeKey: id,
    occurredAt: `${day}T01:00:00.000Z`,
    createdAt: `${day}T01:00:00.000Z`,
    read: false,
  };
}

test("免打扰时段：跨午夜窗口在指定时区内正确判定", () => {
  const quiet = { start: "22:00", end: "08:00", timeZone: "UTC" };
  assert.equal(isWithinQuietHours(quiet, new Date("2026-11-23T23:30:00.000Z")), true);
  assert.equal(isWithinQuietHours(quiet, new Date("2026-11-23T03:00:00.000Z")), true);
  assert.equal(isWithinQuietHours(quiet, new Date("2026-11-23T12:00:00.000Z")), false);
});

test("免打扰时段：start=end 视为零长度窗口，永不静默", () => {
  const quiet = { start: "08:00", end: "08:00", timeZone: "UTC" };
  assert.equal(isWithinQuietHours(quiet, new Date("2026-11-23T08:00:00.000Z")), false);
});

test("免打扰时段：非法时区不误伤（不静默）", () => {
  const quiet = { start: "22:00", end: "08:00", timeZone: "Not/AZone" };
  assert.equal(isWithinQuietHours(quiet, new Date("2026-11-23T23:30:00.000Z")), false);
});

test("授权生效判定：撤回 / 未生效 / 已过期都不生效", () => {
  const at = now();
  const base: Consent = {
    id: "c1",
    owner: "o",
    dataScope: ["portfolio"],
    purposes: ["remind"],
    channels: ["push"],
    frequency: "daily",
    validFrom: "2026-11-01T00:00:00.000Z",
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
  };
  assert.equal(isConsentActive(base, at), true);
  assert.equal(isConsentActive({ ...base, revokedAt: "2026-11-20T00:00:00.000Z" }, at), false);
  assert.equal(isConsentActive({ ...base, validFrom: "2026-12-01T00:00:00.000Z" }, at), false);
  assert.equal(isConsentActive({ ...base, validTo: "2026-11-20T00:00:00.000Z" }, at), false);
});

test("策略闸：没有任何提醒授权时 canRemind=false", async () => {
  const db = await createStore();
  try {
    const gate = await new ConsentService(db).resolveGate("owner-a", { now: now() });
    assert.deepEqual(gate, { canRemind: false, quietHours: false, pushCapReached: false });
  } finally {
    await db.close();
  }
});

test("策略闸：仅 research 用途不构成提醒授权", async () => {
  const db = await createStore();
  try {
    const owner = "owner-r";
    const service = new ConsentService(db);
    await service.create(owner, {
      dataScope: ["portfolio"],
      purposes: ["research"],
      channels: ["push"],
      frequency: "manual_only",
      validFrom: "2026-11-01T00:00:00.000Z",
    });
    assert.equal((await service.resolveGate(owner, { now: now() })).canRemind, false);
  } finally {
    await db.close();
  }
});

test("策略闸：授权 remind+push 后可提醒；免打扰与推送上限各自降级", async () => {
  const db = await createStore();
  try {
    const owner = "owner-b";
    const service = new ConsentService(db);
    const at = new Date("2026-11-23T23:30:00.000Z"); // UTC 23:30，落在 22:00-08:00 内
    const consent = await service.create(owner, {
      dataScope: ["portfolio", "holdings"],
      purposes: ["remind"],
      channels: ["push"],
      frequency: "daily",
      validFrom: "2026-11-01T00:00:00.000Z",
      quietHours: { start: "22:00", end: "08:00", timeZone: "UTC" },
      dailyPushCap: 2,
    });
    const gate = await service.resolveGate(owner, { now: at });
    assert.equal(gate.canRemind, true);
    assert.equal(gate.quietHours, true);
    assert.equal(gate.pushCapReached, false);
    assert.equal(gate.consentId, consent.id);

    // 今日已实际推送 2 条 → 达到上限。
    await db.put(owner, "event-feed", pushItem("push-0", "2026-11-23"));
    await db.put(owner, "event-feed", pushItem("push-1", "2026-11-23"));
    assert.equal((await service.resolveGate(owner, { now: at })).pushCapReached, true);
  } finally {
    await db.close();
  }
});

test("策略闸：设备级免打扰覆盖账户级（设备优先）", async () => {
  const db = await createStore();
  try {
    const owner = "owner-c";
    const service = new ConsentService(db);
    const at = new Date("2026-11-23T12:00:00.000Z"); // 账户级没有免打扰
    const consent = await service.create(owner, {
      dataScope: ["portfolio"],
      purposes: ["remind"],
      channels: ["push"],
      frequency: "daily",
      validFrom: "2026-11-01T00:00:00.000Z",
    });
    await service.setDeviceOverride(owner, consent.id, "phone-1", {
      quietHours: { start: "12:00", end: "13:00", timeZone: "UTC" },
    });
    assert.equal(
      (await service.resolveGate(owner, { now: at, deviceId: "phone-1" })).quietHours,
      true,
    );
    // 不带 deviceId 时按账户级（无免打扰）。
    assert.equal((await service.resolveGate(owner, { now: at })).quietHours, false);

    await service.removeDeviceOverride(owner, consent.id, "phone-1");
    assert.equal(
      (await service.resolveGate(owner, { now: at, deviceId: "phone-1" })).quietHours,
      false,
    );
  } finally {
    await db.close();
  }
});

test("撤回授权后立刻不再构成提醒授权", async () => {
  const db = await createStore();
  try {
    const owner = "owner-d";
    const service = new ConsentService(db);
    const consent = await service.create(owner, {
      dataScope: ["portfolio"],
      purposes: ["remind"],
      channels: ["push"],
      frequency: "daily",
      validFrom: "2026-11-01T00:00:00.000Z",
    });
    assert.equal((await service.resolveGate(owner, { now: now() })).canRemind, true);
    await service.revoke(owner, consent.id);
    assert.equal((await service.resolveGate(owner, { now: now() })).canRemind, false);
  } finally {
    await db.close();
  }
});

test("更新授权：null 清空免打扰与推送上限", async () => {
  const db = await createStore();
  try {
    const owner = "owner-e";
    const service = new ConsentService(db);
    const consent = await service.create(owner, {
      dataScope: ["portfolio"],
      purposes: ["remind"],
      channels: ["push"],
      frequency: "daily",
      validFrom: "2026-11-01T00:00:00.000Z",
      quietHours: { start: "22:00", end: "08:00", timeZone: "UTC" },
      dailyPushCap: 3,
    });
    const updated = await service.update(owner, consent.id, {
      quietHours: null,
      dailyPushCap: null,
    });
    assert.equal(updated.quietHours, undefined);
    assert.equal(updated.dailyPushCap, undefined);
  } finally {
    await db.close();
  }
});
