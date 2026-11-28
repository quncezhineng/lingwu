import assert from "node:assert/strict";
import { test } from "node:test";
import { createStore } from "../apps/server/src/db.ts";
import { InvestorProfileService } from "../apps/server/src/engine/investor-profile.ts";
import { AppError } from "../apps/server/src/errors.ts";

const isConfirmRequired = (error: unknown): boolean =>
  error instanceof AppError && error.status === 422 && error.code === "confirm_required";

test("投资档案：空档返回可用视图并列出待确认项", async () => {
  const db = await createStore();
  try {
    const owner = "owner-profile-empty";
    const service = new InvestorProfileService(db);
    const view = await service.view(owner);
    assert.equal(view.profile.owner, owner);
    assert.deepEqual(view.profile.goals, []);
    assert.deepEqual(view.trust, {
      goals: "derived",
      risk: "derived",
      scope: "derived",
      habits: "derived",
    });
    assert.deepEqual(view.missingConfirmation, ["risk.appetite", "goals.horizon", "risk.excluded"]);
  } finally {
    await db.close();
  }
});

test("投资档案：风险偏好 / 期限 / 禁止行业必须显式确认，否则 422", async () => {
  const db = await createStore();
  try {
    const owner = "owner-profile-confirm";
    const service = new InvestorProfileService(db);

    await assert.rejects(
      () => service.update(owner, { risk: { appetite: "balanced" } }),
      isConfirmRequired,
    );
    await assert.rejects(
      () =>
        service.update(owner, { goals: [{ kind: "growth", label: "增值", horizonMonths: 60 }] }),
      isConfirmRequired,
    );
    await assert.rejects(
      () => service.update(owner, { risk: { excludedSectors: ["烟草"] } }),
      isConfirmRequired,
    );

    // 带 confirm 才落库，并把来源记为 user、记录确认时间。
    const saved = await service.update(owner, {
      confirm: true,
      risk: { appetite: "balanced", excludedSectors: ["烟草"] },
      goals: [{ kind: "growth", label: "增值", horizonMonths: 60 }],
    });
    assert.equal(saved.risk.appetite, "balanced");
    assert.equal(saved.risk.source, "user");
    assert.ok(saved.risk.confirmedAt);

    const view = await service.view(owner);
    assert.deepEqual(view.missingConfirmation, []);
    assert.equal(view.trust.goals, "user_confirmed");
    assert.equal(view.trust.risk, "user_confirmed");
  } finally {
    await db.close();
  }
});

test("投资档案：不改强制确认字段时无需 confirm 也能保存", async () => {
  const db = await createStore();
  try {
    const owner = "owner-profile-scope";
    const service = new InvestorProfileService(db);
    const saved = await service.update(owner, {
      scope: { markets: ["CN", "HK"], sectors: ["新能源"] },
      habits: { language: "zh-Hans" },
    });
    assert.deepEqual(saved.scope.markets, ["CN", "HK"]);
    const view = await service.view(owner);
    assert.equal(view.trust.scope, "user_confirmed");
    assert.equal(view.trust.habits, "user_confirmed");
    // 仍未确认风险偏好，待确认项应保留。
    assert.ok(view.missingConfirmation.includes("risk.appetite"));
  } finally {
    await db.close();
  }
});

test("投资档案：风险测评过期后按 stale 读", async () => {
  const db = await createStore();
  try {
    const owner = "owner-profile-stale";
    const service = new InvestorProfileService(db);
    await service.update(owner, {
      confirm: true,
      risk: { appetite: "balanced", assessmentExpiresAt: "2026-01-01T00:00:00.000Z" },
    });
    const view = await service.view(owner, new Date("2026-11-23T00:00:00.000Z"));
    assert.equal(view.trust.risk, "stale");
  } finally {
    await db.close();
  }
});

test("投资档案：模型只能提议，用户 accept 后才落库", async () => {
  const db = await createStore();
  try {
    const owner = "owner-profile-proposal";
    const service = new InvestorProfileService(db);
    const proposal = await service.createProposal(owner, {
      field: "risk.appetite",
      label: "风险偏好",
      currentValue: "balanced",
      proposedValue: "aggressive",
      rationale: "近一年回撤承受度上升",
    });
    assert.equal(proposal.status, "pending");
    assert.equal((await service.listProposals(owner)).length, 1);

    // 提议本身不改档案。
    assert.equal((await service.get(owner))?.risk.appetite, undefined);

    const accepted = await service.reviewProposal(owner, proposal.id, "accept");
    assert.equal(accepted.proposal.status, "accepted");
    assert.equal(accepted.profile.risk.appetite, "aggressive");
    assert.equal(accepted.profile.risk.source, "user");

    // 同一提议不能重复处理。
    await assert.rejects(
      () => service.reviewProposal(owner, proposal.id, "reject"),
      (error: unknown) => error instanceof AppError && error.status === 409,
    );
  } finally {
    await db.close();
  }
});

test("投资档案：reject 只改状态，不动档案", async () => {
  const db = await createStore();
  try {
    const owner = "owner-profile-reject";
    const service = new InvestorProfileService(db);
    const proposal = await service.createProposal(owner, {
      field: "risk.excludedSectors",
      label: "禁止行业",
      proposedValue: "博彩, 烟草",
      rationale: "用户画像推断",
    });
    const rejected = await service.reviewProposal(owner, proposal.id, "reject");
    assert.equal(rejected.proposal.status, "rejected");
    assert.ok(rejected.proposal.resolvedAt);
    assert.equal(await service.get(owner), null, "reject 后档案未落库");
  } finally {
    await db.close();
  }
});
