import assert from "node:assert/strict";
import { test } from "node:test";
import { createStore } from "../apps/server/src/db.ts";
import { ConsentService, inQuietHours, localHHMM } from "../apps/server/src/engine/consent.ts";
import type { ConsentCreateInput } from "../packages/domain/src/investor.ts";

const base: ConsentCreateInput = {
  dataScope: ["holdings", "market_data"],
  purposes: ["research", "remind"],
  channels: ["in_app"],
  frequency: "daily",
};

test("授权中心：创建 / 列表 / 查询，空授权时 gate 不强制降级", async () => {
  const db = await createStore();
  try {
    const owner = "owner-consent-crud";
    const service = new ConsentService(db);

    const empty = await service.gate(owner);
    assert.equal(empty.configured, false);
    assert.equal(empty.remind, false);
    assert.equal(empty.dailyPushCap, 5);
    assert.equal(empty.remaining, 5);
    assert.equal(empty.consentId, undefined);

    const created = await service.create(owner, base);
    assert.ok(created.id);
    assert.deepEqual(created.purposes, ["research", "remind"]);
    // 去重后落库。
    const deduped = await service.create(owner, {
      ...base,
      dataScope: ["holdings", "holdings", "market_data"],
    });
    assert.deepEqual(deduped.dataScope, ["holdings", "market_data"]);

    const list = await service.list(owner);
    assert.equal(list.length, 2);
    assert.equal((await service.get(owner, created.id))?.id, created.id);

    const gate = await service.gate(owner);
    assert.equal(gate.configured, true);
    assert.equal(gate.remind, true);
    assert.ok(gate.consentId);
  } finally {
    await db.close();
  }
});

test("授权中心：没有 remind 用途时降级为信息流", async () => {
  const db = await createStore();
  try {
    const owner = "owner-consent-noremind";
    const service = new ConsentService(db);
    await service.create(owner, { ...base, purposes: ["research"] });
    const gate = await service.gate(owner);
    assert.equal(gate.configured, true);
    assert.equal(gate.remind, false);
    assert.ok(gate.reasons.some((reason) => reason.includes("主动提醒")));
  } finally {
    await db.close();
  }
});

test("授权中心：active 排除已撤回与有效期外的记录", async () => {
  const db = await createStore();
  try {
    const owner = "owner-consent-active";
    const now = new Date("2026-11-23T02:00:00.000Z");
    const service = new ConsentService(db);

    const live = await service.create(owner, {
      ...base,
      validFrom: "2026-11-01T00:00:00.000Z",
    });
    const future = await service.create(owner, {
      ...base,
      validFrom: "2027-01-01T00:00:00.000Z",
    });
    const expired = await service.create(owner, {
      ...base,
      validTo: "2026-01-01T00:00:00.000Z",
    });
    const revoked = await service.create(owner, base);
    await service.revoke(owner, revoked.id);

    const active = await service.active(owner, now);
    assert.deepEqual(
      active.map((consent) => consent.id),
      [live.id],
    );
    assert.ok(!active.some((consent) => consent.id === future.id));
    assert.ok(!active.some((consent) => consent.id === expired.id));
    assert.ok(!active.some((consent) => consent.id === revoked.id));
  } finally {
    await db.close();
  }
});

test("授权中心：update 用 null 显式清除字段，撤回后禁止修改", async () => {
  const db = await createStore();
  try {
    const owner = "owner-consent-update";
    const service = new ConsentService(db);
    const created = await service.create(owner, {
      ...base,
      validTo: "2027-01-01T00:00:00.000Z",
      quietHours: { start: "22:00", end: "07:00", timeZone: "Asia/Shanghai" },
      dailyPushCap: 3,
    });

    const updated = await service.update(owner, created.id, {
      purposes: ["remind"],
      validTo: null,
      quietHours: null,
      dailyPushCap: null,
    });
    assert.equal(updated.validTo, undefined);
    assert.equal(updated.quietHours, undefined);
    assert.equal(updated.dailyPushCap, undefined);
    assert.deepEqual(updated.purposes, ["remind"]);

    await service.revoke(owner, created.id);
    await assert.rejects(
      () => service.update(owner, created.id, { frequency: "weekly" }),
      (error: Error & { status?: number }) => error.status === 409,
    );
  } finally {
    await db.close();
  }
});

test("授权中心：设备级免打扰覆盖账户级（设备级 > 账户级）", async () => {
  const db = await createStore();
  try {
    const owner = "owner-consent-device";
    const service = new ConsentService(db);
    // 账户级：22:00–07:00（Asia/Shanghai）。
    const consent = await service.create(owner, {
      ...base,
      validFrom: "2026-11-01T00:00:00.000Z",
      quietHours: { start: "22:00", end: "07:00", timeZone: "Asia/Shanghai" },
      dailyPushCap: 4,
    });
    // 2026-11-23T16:00:00Z = 上海 00:00，落在账户级免打扰区间。
    const night = new Date("2026-11-23T16:00:00.000Z");
    const accountGate = await service.gate(owner, { now: night });
    assert.equal(accountGate.quiet, true);
    assert.equal(accountGate.quietSource, "account");

    // 设备级改为 09:00–17:00：同一时刻（上海 00:00）不在区间内，覆盖账户级。
    await service.setDeviceOverride(owner, consent.id, {
      deviceId: "phone-1",
      quietHours: { start: "09:00", end: "17:00", timeZone: "Asia/Shanghai" },
      dailyPushCap: 2,
    });
    const deviceGate = await service.gate(owner, { now: night, deviceId: "phone-1" });
    assert.equal(deviceGate.quiet, false);
    assert.equal(deviceGate.quietSource, undefined);
    assert.equal(deviceGate.dailyPushCap, 2);

    // 清除设备覆盖后回到账户级。
    await service.clearDeviceOverride(owner, consent.id, "phone-1");
    const restored = await service.gate(owner, { now: night, deviceId: "phone-1" });
    assert.equal(restored.quiet, true);
    assert.equal(restored.quietSource, "account");
    assert.equal(restored.dailyPushCap, 4);
  } finally {
    await db.close();
  }
});

test("授权中心：达到每日上限时剩余额度为 0 并给出原因", async () => {
  const db = await createStore();
  try {
    const owner = "owner-consent-cap";
    const service = new ConsentService(db);
    await service.create(owner, { ...base, dailyPushCap: 2 });
    const gate = await service.gate(owner, { pushedToday: 2 });
    assert.equal(gate.remaining, 0);
    assert.ok(gate.reasons.some((reason) => reason.includes("额度已用完")));
  } finally {
    await db.close();
  }
});

test("授权中心：撤回即停，撤回后 gate 不再放行提醒", async () => {
  const db = await createStore();
  try {
    const owner = "owner-consent-revoke";
    const service = new ConsentService(db);
    const consent = await service.create(owner, base);
    assert.equal((await service.gate(owner)).remind, true);
    await service.revoke(owner, consent.id);
    const gate = await service.gate(owner);
    assert.equal(gate.configured, true);
    assert.equal(gate.remind, false);
    // 记录仍在列表里，只是不再生效（可回看）。
    assert.equal((await service.list(owner)).length, 1);
    await service.remove(owner, consent.id);
    assert.equal((await service.list(owner)).length, 0);
  } finally {
    await db.close();
  }
});

test("免打扰区间：支持跨零点，起止相同视为不设限", () => {
  const quiet = { start: "22:00", end: "07:00", timeZone: "Asia/Shanghai" };
  assert.equal(inQuietHours(quiet, new Date("2026-11-23T16:00:00.000Z")), true); // 上海 00:00
  assert.equal(inQuietHours(quiet, new Date("2026-11-23T02:00:00.000Z")), false); // 上海 10:00
  assert.equal(
    inQuietHours({ start: "09:00", end: "09:00", timeZone: "Asia/Shanghai" }, new Date()),
    false,
  );
  assert.equal(localHHMM(new Date("2026-11-23T02:00:00.000Z"), "Asia/Shanghai"), "10:00");
  // 无法识别的时区退回 UTC，不抛错。
  assert.equal(localHHMM(new Date("2026-11-23T02:34:00.000Z"), "Not/AZone"), "02:34");
});
