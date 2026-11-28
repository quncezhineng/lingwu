import assert from "node:assert/strict";
import { test } from "node:test";
import { createStore } from "../apps/server/src/db.ts";
import {
  InvestorProfileService,
  missingConfirmations,
  profileTrust,
  riskyFieldsInUpdate,
} from "../apps/server/src/engine/investor-profile.ts";
import { AppError } from "../apps/server/src/errors.ts";
import type { InvestmentProfile } from "../packages/domain/src/investor.ts";

test("档案：不存在时惰性建一份空档案", async () => {
  const db = await createStore();
  try {
    const profile = await new InvestorProfileService(db).get("owner-p1");
    assert.equal(profile.id, "profile");
    assert.deepEqual(profile.goals, []);
    assert.equal(profile.risk.source, "derived");
  } finally {
    await db.close();
  }
});

test("档案：改写高风险字段未确认时拒绝（422 confirm_required）", async () => {
  const db = await createStore();
  try {
    const service = new InvestorProfileService(db);
    await assert.rejects(
      () => service.update("owner-p2", { confirm: false, risk: { appetite: "aggressive" } }),
      (error: unknown) =>
        error instanceof AppError && error.status === 422 && error.code === "confirm_required",
    );
  } finally {
    await db.close();
  }
});

test("档案：显式确认后高风险字段落库，待确认清单收敛为空", async () => {
  const db = await createStore();
  try {
    const service = new InvestorProfileService(db);
    assert.ok(missingConfirmations(await service.get("owner-p3")).length > 0);
    const { profile, missingConfirmation } = await service.update("owner-p3", {
      confirm: true,
      risk: { appetite: "balanced", excludedSectors: ["烟草"] },
      goals: [{ kind: "retirement", label: "退休", horizonMonths: 240, source: "user" }],
    });
    assert.equal(profile.risk.appetite, "balanced");
    assert.ok(profile.risk.confirmedAt);
    assert.deepEqual(missingConfirmation, []);
  } finally {
    await db.close();
  }
});

test("档案：低风险字段无需 confirm 直接改", async () => {
  const db = await createStore();
  try {
    const service = new InvestorProfileService(db);
    const { profile } = await service.update("owner-p4", {
      confirm: false,
      scope: { markets: ["CN", "HK"] },
    });
    assert.deepEqual(profile.scope.markets, ["CN", "HK"]);
  } finally {
    await db.close();
  }
});

test("档案提议：采纳高风险提议等价于用户确认", async () => {
  const db = await createStore();
  try {
    const service = new InvestorProfileService(db);
    const proposal = await service.propose("owner-p5", {
      field: "risk.appetite",
      proposed: "aggressive",
      reason: "你近期提高了权益仓位",
    });
    assert.equal(proposal.requiresConfirm, true);
    assert.equal(proposal.status, "pending");
    const { profile } = await service.decideProposal("owner-p5", proposal.id, true);
    assert.equal(profile?.risk.appetite, "aggressive");
    assert.equal((await service.listProposals("owner-p5"))[0]?.status, "accepted");
  } finally {
    await db.close();
  }
});

test("档案提议：驳回不改动档案", async () => {
  const db = await createStore();
  try {
    const service = new InvestorProfileService(db);
    const proposal = await service.propose("owner-p6", {
      field: "scope.markets",
      proposed: ["US"],
      reason: "你在看美股",
    });
    assert.equal(proposal.requiresConfirm, false);
    const result = await service.decideProposal("owner-p6", proposal.id, false);
    assert.equal(result.proposal.status, "rejected");
    assert.equal(result.profile, undefined);
    assert.deepEqual((await service.get("owner-p6")).scope.markets, []);
  } finally {
    await db.close();
  }
});

test("档案提议：非高风险字段可采纳", async () => {
  const db = await createStore();
  try {
    const service = new InvestorProfileService(db);
    const proposal = await service.propose("owner-p7", {
      field: "scope.sectors",
      proposed: ["半导体"],
      reason: "关注板块",
    });
    const { profile } = await service.decideProposal("owner-p7", proposal.id, true);
    assert.deepEqual(profile?.scope.sectors, ["半导体"]);
  } finally {
    await db.close();
  }
});

test("档案提议：重复决定同一条返回 409", async () => {
  const db = await createStore();
  try {
    const service = new InvestorProfileService(db);
    const proposal = await service.propose("owner-p8", {
      field: "scope.sectors",
      proposed: ["白酒"],
      reason: "关注板块",
    });
    await service.decideProposal("owner-p8", proposal.id, true);
    await assert.rejects(
      () => service.decideProposal("owner-p8", proposal.id, false),
      (error: unknown) => error instanceof AppError && error.status === 409,
    );
  } finally {
    await db.close();
  }
});

test("可信状态：无确认=derived，确认后=user_confirmed，过期=stale", () => {
  const base: InvestmentProfile = {
    id: "profile",
    owner: "o",
    goals: [],
    risk: {
      excludedSectors: [],
      excludedMarkets: [],
      source: "derived",
      updatedAt: "2026-11-01T00:00:00.000Z",
    },
    scope: { markets: [], sectors: [] },
    habits: {},
    updatedAt: "2026-11-01T00:00:00.000Z",
  };
  const at = new Date("2026-11-23T00:00:00.000Z");
  assert.equal(profileTrust(base, at).risk, "derived");
  assert.equal(
    profileTrust(
      { ...base, risk: { ...base.risk, source: "user", confirmedAt: "2026-11-01T00:00:00.000Z" } },
      at,
    ).risk,
    "user_confirmed",
  );
  assert.equal(
    profileTrust(
      {
        ...base,
        risk: {
          ...base.risk,
          source: "user",
          confirmedAt: "2026-11-01T00:00:00.000Z",
          staleAt: "2026-11-20T00:00:00.000Z",
        },
      },
      at,
    ).risk,
    "stale",
  );
});

test("riskyFieldsInUpdate：只识别三类高风险字段", () => {
  assert.deepEqual(riskyFieldsInUpdate({ confirm: false, risk: { appetite: "balanced" } }), [
    "risk.appetite",
  ]);
  assert.deepEqual(riskyFieldsInUpdate({ confirm: false, risk: { maxDrawdownPercent: 20 } }), []);
  assert.deepEqual(
    riskyFieldsInUpdate({
      confirm: false,
      goals: [{ kind: "growth", label: "g", horizonMonths: 12, source: "user" }],
    }),
    ["goals.horizon"],
  );
});
