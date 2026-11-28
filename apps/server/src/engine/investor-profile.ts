import { randomUUID } from "node:crypto";
import type {
  GoalKind,
  InvestmentProfile,
  InvestorProfileView,
  ProfileChangeProposal,
  ProfileProposalInput,
  ProfileRisk,
  ProfileTrust,
  ProfileTrustView,
  ProfileUpdateInput,
  RiskAppetite,
} from "../../../../packages/domain/src/investor.ts";
import {
  PROFILE_CONFIRM_REQUIRED_FIELDS,
  RISK_APPETITES,
} from "../../../../packages/domain/src/investor.ts";
import type { Store } from "../db.ts";
import { AppError } from "../errors.ts";

const PROFILE_KIND = "investment-profiles";
const PROFILE_ID = "profile";
const PROPOSAL_KIND = "profile-proposals";

/** 记录需要 id 字段满足 Store.put 主键约定。 */
type ProfileRecord = InvestmentProfile & { id: string };
type ProposalRecord = ProfileChangeProposal;

function emptyProfile(owner: string, now = new Date().toISOString()): InvestmentProfile {
  return {
    owner,
    goals: [],
    risk: { excludedSectors: [], excludedMarkets: [], source: "derived", updatedAt: now },
    scope: { markets: [], sectors: [] },
    habits: {},
    updatedAt: now,
  };
}

/** 某组字段的可信状态：用户确认过=user_confirmed，测评过期=stale，否则 derived。 */
function riskTrust(risk: ProfileRisk, now: Date): ProfileTrust {
  if (risk.assessmentExpiresAt && Date.parse(risk.assessmentExpiresAt) < now.getTime())
    return "stale";
  if (risk.confirmedAt || risk.source === "user") return "user_confirmed";
  return "derived";
}

/**
 * 投资档案（PRD A1）。
 *
 * 关键约束：风险偏好 / 期限 / 禁止行业三项强制用户确认；模型只能提议。
 * 缺字段时显式列出待确认项，绝不替用户假设。可信状态三档：user_confirmed / derived / stale。
 */
export class InvestorProfileService {
  constructor(private readonly db: Store) {}

  async get(owner: string): Promise<InvestmentProfile | null> {
    const record = await this.db.get<ProfileRecord>(owner, PROFILE_KIND, PROFILE_ID);
    if (!record) return null;
    const { id: _id, ...profile } = record;
    return profile;
  }

  /** 视图：永远返回一份可用档案（无则给空档），并给出可信状态与待确认项。 */
  async view(owner: string, now = new Date()): Promise<InvestorProfileView> {
    const stored = await this.get(owner);
    const profile = stored ?? emptyProfile(owner, now.toISOString());
    return {
      profile,
      trust: this.trustOf(profile, now),
      missingConfirmation: this.missingConfirmation(profile),
    };
  }

  private trustOf(profile: InvestmentProfile, now: Date): ProfileTrustView {
    const goalsConfirmed = profile.goals.some((goal) => goal.confirmedAt || goal.source === "user");
    const goalHasHorizon = profile.goals.some((goal) => goal.horizonMonths !== undefined);
    return {
      goals: goalsConfirmed && goalHasHorizon ? "user_confirmed" : "derived",
      risk: riskTrust(profile.risk, now),
      scope:
        profile.scope.markets.length > 0 || profile.scope.sectors.length > 0
          ? "user_confirmed"
          : "derived",
      habits: profile.habits.language || profile.habits.timeZone ? "user_confirmed" : "derived",
    };
  }

  /** 尚未确认的强制确认字段路径。 */
  private missingConfirmation(profile: InvestmentProfile): string[] {
    const missing: string[] = [];
    if (!profile.risk.appetite) missing.push("risk.appetite");
    if (!profile.goals.some((goal) => goal.horizonMonths !== undefined))
      missing.push("goals.horizon");
    if (profile.risk.excludedSectors.length === 0 && profile.risk.excludedMarkets.length === 0)
      missing.push("risk.excluded");
    return missing.filter((field) =>
      (PROFILE_CONFIRM_REQUIRED_FIELDS as readonly string[]).includes(field),
    );
  }

  /** 判断这次更新是否触碰了强制确认字段（与已存值不同才算）。 */
  private touchesConfirmRequired(current: InvestmentProfile, input: ProfileUpdateInput): boolean {
    if (input.risk?.appetite !== undefined && input.risk.appetite !== current.risk.appetite)
      return true;
    if (
      input.goals?.some(
        (goal) =>
          goal.horizonMonths !== undefined &&
          !current.goals.some(
            (existing) =>
              existing.kind === goal.kind &&
              existing.label === goal.label &&
              existing.horizonMonths === goal.horizonMonths,
          ),
      )
    )
      return true;
    if (
      input.risk?.excludedSectors !== undefined &&
      input.risk.excludedSectors.join("|") !== current.risk.excludedSectors.join("|")
    )
      return true;
    if (
      input.risk?.excludedMarkets !== undefined &&
      input.risk.excludedMarkets.join("|") !== current.risk.excludedMarkets.join("|")
    )
      return true;
    return false;
  }

  /**
   * 更新档案。触碰强制确认字段且未带 confirm=true 时返回 422 confirm_required，
   * 这是「模型不得直接改写风险偏好」的落点。
   */
  async update(owner: string, input: ProfileUpdateInput): Promise<InvestmentProfile> {
    const now = new Date();
    const stored = await this.get(owner);
    const current = stored ?? emptyProfile(owner, now.toISOString());

    if (!input.confirm && this.touchesConfirmRequired(current, input)) {
      throw new AppError(
        "风险偏好 / 期限 / 禁止行业需要显式确认后才能保存",
        422,
        "confirm_required",
      );
    }

    const stamp = now.toISOString();
    const next: InvestmentProfile = {
      ...current,
      owner,
      goals: input.goals
        ? input.goals.map((goal) => ({
            kind: goal.kind as GoalKind,
            label: goal.label,
            ...(goal.horizonMonths !== undefined ? { horizonMonths: goal.horizonMonths } : {}),
            ...(goal.amount ? { amount: goal.amount } : {}),
            source: goal.source ?? (input.confirm ? "user" : "derived"),
            ...(goal.confirmedAt
              ? { confirmedAt: goal.confirmedAt }
              : input.confirm
                ? { confirmedAt: stamp }
                : {}),
            updatedAt: goal.updatedAt ?? stamp,
          }))
        : current.goals,
      risk: input.risk
        ? this.mergeRisk(current.risk, input.risk, input.confirm === true, stamp)
        : current.risk,
      scope: input.scope ? { ...input.scope } : current.scope,
      habits: input.habits ? { ...current.habits, ...input.habits } : current.habits,
      updatedAt: stamp,
    };
    return this.persist(owner, next);
  }

  private mergeRisk(
    current: ProfileRisk,
    patch: NonNullable<ProfileUpdateInput["risk"]>,
    confirmed: boolean,
    stamp: string,
  ): ProfileRisk {
    const next: ProfileRisk = {
      ...current,
      ...(patch.appetite !== undefined ? { appetite: patch.appetite } : {}),
      ...(patch.maxDrawdownPercent !== undefined
        ? { maxDrawdownPercent: patch.maxDrawdownPercent }
        : {}),
      ...(patch.excludedSectors !== undefined ? { excludedSectors: patch.excludedSectors } : {}),
      ...(patch.excludedMarkets !== undefined ? { excludedMarkets: patch.excludedMarkets } : {}),
      ...(patch.assessmentExpiresAt !== undefined
        ? { assessmentExpiresAt: patch.assessmentExpiresAt }
        : {}),
      source: patch.source ?? (confirmed ? "user" : current.source),
      updatedAt: stamp,
    };
    // 用户显式确认后清掉 stale 标记并记录确认时间；强制确认项带 confirm 也在此落章。
    if (confirmed) {
      next.confirmedAt = stamp;
      delete next.staleAt;
    }
    return next;
  }

  private async persist(owner: string, profile: InvestmentProfile): Promise<InvestmentProfile> {
    const record: ProfileRecord = { ...profile, id: PROFILE_ID };
    await this.db.put(owner, PROFILE_KIND, record);
    return profile;
  }

  // ─── 模型提议（ProfileChangeProposal） ───

  async listProposals(owner: string): Promise<ProfileChangeProposal[]> {
    const items = await this.db.list<ProposalRecord>(owner, PROPOSAL_KIND);
    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async createProposal(owner: string, input: ProfileProposalInput): Promise<ProfileChangeProposal> {
    const proposal: ProfileChangeProposal = {
      id: randomUUID(),
      owner,
      field: input.field,
      label: input.label,
      ...(input.currentValue ? { currentValue: input.currentValue } : {}),
      proposedValue: input.proposedValue,
      rationale: input.rationale,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    return this.db.put(owner, PROPOSAL_KIND, proposal);
  }

  /** 审核提议：accept 则尽力落库（高风险字段按用户动作记 user），reject 只改状态。 */
  async reviewProposal(
    owner: string,
    id: string,
    action: "accept" | "reject",
  ): Promise<{ proposal: ProfileChangeProposal; profile: InvestmentProfile }> {
    const proposal = await this.db.get<ProposalRecord>(owner, PROPOSAL_KIND, id);
    if (!proposal) throw new AppError("Proposal not found", 404);
    if (proposal.status !== "pending") throw new AppError("Proposal already resolved", 409);

    let profile = (await this.get(owner)) ?? emptyProfile(owner);
    if (action === "accept") profile = await this.applyProposal(owner, proposal);

    const resolved: ProfileChangeProposal = {
      ...proposal,
      status: action === "accept" ? "accepted" : "rejected",
      resolvedAt: new Date().toISOString(),
    };
    await this.db.put(owner, PROPOSAL_KIND, resolved);
    return { proposal: resolved, profile };
  }

  private async applyProposal(
    owner: string,
    proposal: ProfileChangeProposal,
  ): Promise<InvestmentProfile> {
    const now = new Date().toISOString();
    const profile = (await this.get(owner)) ?? emptyProfile(owner, now);
    const value = proposal.proposedValue;
    const next: InvestmentProfile = { ...profile, updatedAt: now };

    if (
      proposal.field === "risk.appetite" &&
      (RISK_APPETITES as readonly string[]).includes(value)
    ) {
      next.risk = {
        ...profile.risk,
        appetite: value as RiskAppetite,
        source: "user",
        confirmedAt: now,
        updatedAt: now,
      };
    } else if (proposal.field === "risk.excludedSectors" || proposal.field === "risk.excluded") {
      next.risk = {
        ...profile.risk,
        excludedSectors: value
          .split(/[,，\s]+/)
          .map((item) => item.trim())
          .filter(Boolean),
        source: "user",
        confirmedAt: now,
        updatedAt: now,
      };
    } else if (proposal.field === "risk.maxDrawdownPercent") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        next.risk = { ...profile.risk, maxDrawdownPercent: parsed, updatedAt: now };
      }
    }
    return this.persist(owner, next);
  }
}
