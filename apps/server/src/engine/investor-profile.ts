import { randomUUID } from "node:crypto";
import type {
  GoalKind,
  InvestmentProfile,
  ProfileChangeProposal,
  ProfileGoal,
  ProfileMarket,
  ProfileProposalInput,
  ProfileRisk,
  ProfileTrust,
  ProfileUpdateInput,
  RiskAppetite,
} from "../../../../packages/domain/src/investor.ts";
import { PROFILE_CONFIRM_REQUIRED_FIELDS } from "../../../../packages/domain/src/investor.ts";
import type { Store } from "../db.ts";
import { AppError } from "../errors.ts";

const PROFILE_KIND = "investor_profiles";
const PROPOSAL_KIND = "profile_proposals";
/** 每账户一份档案，固定 id。 */
const PROFILE_ID = "profile";

/** 高风险字段的中文名，用于 422 文案。 */
const RISK_FIELD_LABELS: Record<string, string> = {
  "risk.appetite": "风险偏好",
  "risk.excluded": "禁止行业 / 市场",
  "goals.horizon": "投资期限",
};

/**
 * A1 投资档案。
 *
 * 档案分两组：目标（goals）与风险约束（risk）。其中「风险偏好 / 投资期限 /
 * 禁止行业」三项是高风险字段——**模型只能提议，用户显式确认后才能落库**。
 * 其余字段（scope/habits 等）由用户直接改。
 */
export class InvestorProfileService {
  constructor(private readonly db: Store) {}

  /** 读取档案；不存在时惰性建一份空档案（幂等，并发安全）。 */
  async get(owner: string): Promise<InvestmentProfile> {
    const existing = await this.db.get<InvestmentProfile>(owner, PROFILE_KIND, PROFILE_ID);
    if (existing) return existing;
    const created = defaultProfile(owner);
    const inserted = await this.db.insertIfAbsent(owner, PROFILE_KIND, created);
    if (inserted) return inserted;
    return (await this.db.get<InvestmentProfile>(owner, PROFILE_KIND, PROFILE_ID)) ?? created;
  }

  /**
   * 更新档案。
   *
   * 未带 `confirm: true` 却试图改写三项高风险字段时一律拒绝（422），
   * 强制走「模型提议 → 用户确认」的路径。
   */
  async update(
    owner: string,
    input: ProfileUpdateInput,
  ): Promise<{ profile: InvestmentProfile; missingConfirmation: string[] }> {
    const risky = riskyFieldsInUpdate(input);
    if (risky.length > 0 && !input.confirm) {
      const labels = risky.map((field) => RISK_FIELD_LABELS[field] ?? field).join("、");
      throw new AppError(
        `以下字段属于高风险，需要你显式确认后才能修改：${labels}`,
        422,
        "confirm_required",
      );
    }

    const current = await this.get(owner);
    const at = new Date().toISOString();

    const goals: ProfileGoal[] = input.goals
      ? input.goals.map((goal) => ({
          kind: goal.kind as GoalKind,
          label: goal.label,
          ...(goal.horizonMonths !== undefined ? { horizonMonths: goal.horizonMonths } : {}),
          ...(goal.amount ? { amount: goal.amount } : {}),
          source: goal.source,
          ...(goal.source === "user" && input.confirm ? { confirmedAt: at } : {}),
          updatedAt: at,
        }))
      : current.goals;

    const risk: ProfileRisk = input.risk
      ? {
          ...current.risk,
          ...(input.risk.appetite !== undefined ? { appetite: input.risk.appetite } : {}),
          ...(input.risk.maxDrawdownPercent !== undefined
            ? { maxDrawdownPercent: input.risk.maxDrawdownPercent }
            : {}),
          ...(input.risk.excludedSectors !== undefined
            ? { excludedSectors: input.risk.excludedSectors }
            : {}),
          ...(input.risk.excludedMarkets !== undefined
            ? { excludedMarkets: input.risk.excludedMarkets }
            : {}),
          ...(input.risk.assessmentExpiresAt !== undefined
            ? { assessmentExpiresAt: input.risk.assessmentExpiresAt }
            : {}),
          ...(input.risk.staleAt !== undefined ? { staleAt: input.risk.staleAt } : {}),
          source: "user",
          ...(input.confirm ? { confirmedAt: at } : {}),
          updatedAt: at,
        }
      : current.risk;

    const profile: InvestmentProfile = {
      ...current,
      goals,
      risk,
      scope: input.scope
        ? {
            ...current.scope,
            ...(input.scope.markets ? { markets: input.scope.markets as ProfileMarket[] } : {}),
            ...(input.scope.sectors ? { sectors: input.scope.sectors } : {}),
            ...(input.scope.style !== undefined ? { style: input.scope.style } : {}),
          }
        : current.scope,
      habits: input.habits ? { ...current.habits, ...input.habits } : current.habits,
      updatedAt: at,
    };
    const saved = await this.db.put(owner, PROFILE_KIND, profile);
    return { profile: saved, missingConfirmation: missingConfirmations(saved) };
  }

  /** 模型（或前端）提议一次档案变更；只落一条 pending 提议，不改档案。 */
  async propose(owner: string, input: ProfileProposalInput): Promise<ProfileChangeProposal> {
    const at = new Date().toISOString();
    const proposal: ProfileChangeProposal = {
      id: randomUUID(),
      owner,
      field: input.field,
      proposed: input.proposed,
      reason: input.reason,
      requiresConfirm: isConfirmRequired(input.field),
      status: "pending",
      createdAt: at,
    };
    return this.db.put(owner, PROPOSAL_KIND, proposal);
  }

  async listProposals(owner: string): Promise<ProfileChangeProposal[]> {
    const items = await this.db.list<ProfileChangeProposal>(owner, PROPOSAL_KIND);
    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /**
   * 采纳 / 驳回一条提议。采纳时按字段路径把 proposed 应用到档案；
   * 高风险字段的采纳等价于「用户确认」，因此带 confirm: true。
   */
  async decideProposal(
    owner: string,
    id: string,
    accept: boolean,
  ): Promise<{ proposal: ProfileChangeProposal; profile?: InvestmentProfile }> {
    const proposal = await this.db.get<ProfileChangeProposal>(owner, PROPOSAL_KIND, id);
    if (!proposal) throw new AppError("Proposal not found", 404);
    if (proposal.status !== "pending") throw new AppError("Proposal already decided", 409);

    const at = new Date().toISOString();
    if (!accept) {
      const rejected = await this.db.put(owner, PROPOSAL_KIND, {
        ...proposal,
        status: "rejected" as const,
        decidedAt: at,
      });
      return { proposal: rejected };
    }

    const update = proposalToUpdate(proposal);
    const { profile } = await this.update(owner, update);
    const accepted = await this.db.put(owner, PROPOSAL_KIND, {
      ...proposal,
      status: "accepted" as const,
      decidedAt: at,
    });
    return { proposal: accepted, profile };
  }
}

/** 新建档案时的默认值：全部为空，来源标 derived，等用户填。 */
function defaultProfile(owner: string): InvestmentProfile {
  const at = new Date().toISOString();
  return {
    id: PROFILE_ID,
    owner,
    goals: [],
    risk: { excludedSectors: [], excludedMarkets: [], source: "derived", updatedAt: at },
    scope: { markets: [], sectors: [] },
    habits: {},
    updatedAt: at,
  };
}

/** 本次更新里出现的高风险字段（不带 confirm 时据此拒绝）。 */
export function riskyFieldsInUpdate(input: ProfileUpdateInput): string[] {
  const fields: string[] = [];
  if (input.risk?.appetite !== undefined) fields.push("risk.appetite");
  if (input.risk?.excludedSectors !== undefined || input.risk?.excludedMarkets !== undefined)
    fields.push("risk.excluded");
  if (input.goals?.some((goal) => goal.horizonMonths !== undefined)) fields.push("goals.horizon");
  return fields;
}

/** 仍需用户确认的高风险字段：风险偏好 / 期限未确认，或风险约束未确认。 */
export function missingConfirmations(profile: InvestmentProfile): string[] {
  const missing: string[] = [];
  if (!profile.risk.appetite || !profile.risk.confirmedAt) missing.push("risk.appetite");
  if (!profile.risk.confirmedAt) missing.push("risk.excluded");
  if (!profile.goals.some((goal) => goal.confirmedAt && goal.horizonMonths !== undefined))
    missing.push("goals.horizon");
  return missing;
}

function isConfirmRequired(field: string): boolean {
  return (PROFILE_CONFIRM_REQUIRED_FIELDS as readonly string[]).includes(field);
}

/** 在某时刻判定档案各组字段的可信状态（用户已确认 / 系统推断 / 已过期）。 */
export function profileTrust(
  profile: InvestmentProfile,
  now = new Date(),
): { risk: ProfileTrust; goals: ProfileTrust } {
  const stale =
    profile.risk.staleAt !== undefined && Date.parse(profile.risk.staleAt) <= now.getTime();
  const risk: ProfileTrust = stale
    ? "stale"
    : profile.risk.confirmedAt
      ? "user_confirmed"
      : "derived";
  const goals: ProfileTrust = profile.goals.some((goal) => goal.confirmedAt)
    ? "user_confirmed"
    : "derived";
  return { risk, goals };
}

/** 把一条提议翻译成一次档案更新（采纳时使用）。 */
function proposalToUpdate(proposal: ProfileChangeProposal): ProfileUpdateInput {
  switch (proposal.field) {
    case "risk.appetite":
      return { confirm: true, risk: { appetite: proposal.proposed as RiskAppetite } };
    case "risk.excluded": {
      const proposed = (proposal.proposed ?? {}) as {
        excludedSectors?: string[];
        excludedMarkets?: ProfileMarket[];
      };
      return { confirm: true, risk: proposed };
    }
    case "goals.horizon": {
      const goals = (proposal.proposed ?? []) as {
        kind: GoalKind;
        label: string;
        horizonMonths?: number;
      }[];
      return {
        confirm: true,
        goals: goals.map((goal) => ({ ...goal, source: "derived" as const })),
      };
    }
    case "scope.markets":
      return { confirm: false, scope: { markets: proposal.proposed as ProfileMarket[] } };
    case "scope.sectors":
      return { confirm: false, scope: { sectors: (proposal.proposed ?? []) as string[] } };
    default:
      throw new AppError(`无法自动应用该提议字段：${proposal.field}`, 422);
  }
}
