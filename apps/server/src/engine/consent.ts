import { randomUUID } from "node:crypto";
import type {
  Consent,
  ConsentCreateInput,
  ConsentGate,
  ConsentUpdateInput,
  DeviceQuietOverride,
  QuietHours,
} from "../../../../packages/domain/src/investor.ts";
import { DEFAULT_DAILY_PUSH_CAP } from "../../../../packages/domain/src/investor.ts";
import type { Store } from "../db.ts";
import { AppError } from "../errors.ts";

const CONSENT_KIND = "consents";

/** 授权记录内部多带一个 id 字段，满足 Store.put 的主键约定。 */
type ConsentRecord = Consent;

/**
 * 授权中心（PRD A3）。
 *
 * 五维授权：数据类别 / 用途 / 渠道 / 频率 / 有效期。判定两个问题：
 *   - 这条主动提醒被授权了吗（用途里有没有 remind）；
 *   - 现在能不能推（免打扰时段 / 每日上限，设备级 > 账户级）。
 * 撤回即停：撤回后的授权不再参与任何判定；使用可回看由 event-feed 的 consentId 承担。
 */
export class ConsentService {
  constructor(private readonly db: Store) {}

  async list(owner: string): Promise<Consent[]> {
    const items = await this.db.list<ConsentRecord>(owner, CONSENT_KIND);
    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async get(owner: string, id: string): Promise<Consent | null> {
    return this.db.get<ConsentRecord>(owner, CONSENT_KIND, id);
  }

  private async require(owner: string, id: string): Promise<Consent> {
    const consent = await this.get(owner, id);
    if (!consent) throw new AppError("Consent not found", 404);
    return consent;
  }

  /** 当前生效的授权：未撤回且在有效期内。 */
  async active(owner: string, now = new Date()): Promise<Consent[]> {
    const items = await this.list(owner);
    return items.filter((consent) => {
      if (consent.revokedAt) return false;
      if (consent.validFrom && Date.parse(consent.validFrom) > now.getTime()) return false;
      if (consent.validTo && Date.parse(consent.validTo) < now.getTime()) return false;
      return true;
    });
  }

  async create(owner: string, input: ConsentCreateInput): Promise<Consent> {
    const now = new Date().toISOString();
    const consent: Consent = {
      id: randomUUID(),
      owner,
      dataScope: [...new Set(input.dataScope)],
      purposes: [...new Set(input.purposes)],
      channels: [...new Set(input.channels)],
      frequency: input.frequency,
      validFrom: input.validFrom ?? now,
      ...(input.validTo ? { validTo: input.validTo } : {}),
      ...(input.quietHours ? { quietHours: input.quietHours } : {}),
      ...(input.dailyPushCap ? { dailyPushCap: input.dailyPushCap } : {}),
      createdAt: now,
      updatedAt: now,
    };
    return this.db.put(owner, CONSENT_KIND, consent);
  }

  async update(owner: string, id: string, input: ConsentUpdateInput): Promise<Consent> {
    const consent = await this.require(owner, id);
    if (consent.revokedAt) throw new AppError("Consent already revoked", 409);
    const next: Consent = {
      ...consent,
      ...(input.dataScope ? { dataScope: [...new Set(input.dataScope)] } : {}),
      ...(input.purposes ? { purposes: [...new Set(input.purposes)] } : {}),
      ...(input.channels ? { channels: [...new Set(input.channels)] } : {}),
      ...(input.frequency ? { frequency: input.frequency } : {}),
      updatedAt: new Date().toISOString(),
    };
    // null 显式清除字段，undefined 表示不改。
    if (input.validTo !== undefined) {
      if (input.validTo === null) delete next.validTo;
      else next.validTo = input.validTo;
    }
    if (input.quietHours !== undefined) {
      if (input.quietHours === null) delete next.quietHours;
      else next.quietHours = input.quietHours;
    }
    if (input.dailyPushCap !== undefined) {
      if (input.dailyPushCap === null) delete next.dailyPushCap;
      else next.dailyPushCap = input.dailyPushCap;
    }
    return this.db.put(owner, CONSENT_KIND, next);
  }

  /** 撤回：立刻置 revokedAt，后续判定不再生效（撤回即停）。 */
  async revoke(owner: string, id: string): Promise<Consent> {
    const consent = await this.require(owner, id);
    if (consent.revokedAt) return consent;
    return this.db.put(owner, CONSENT_KIND, {
      ...consent,
      revokedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  async remove(owner: string, id: string): Promise<void> {
    await this.require(owner, id);
    await this.db.remove(owner, CONSENT_KIND, id);
  }

  /** 写/覆盖某个设备的免打扰覆盖（设备级 > 账户级）。 */
  async setDeviceOverride(
    owner: string,
    id: string,
    override: Omit<DeviceQuietOverride, "updatedAt"> & { updatedAt?: string },
  ): Promise<Consent> {
    const consent = await this.require(owner, id);
    if (consent.revokedAt) throw new AppError("Consent already revoked", 409);
    const entry: DeviceQuietOverride = {
      ...override,
      updatedAt: override.updatedAt ?? new Date().toISOString(),
    };
    const others = (consent.deviceQuietOverrides ?? []).filter(
      (item) => item.deviceId !== entry.deviceId,
    );
    return this.db.put(owner, CONSENT_KIND, {
      ...consent,
      deviceQuietOverrides: [...others, entry],
      updatedAt: new Date().toISOString(),
    });
  }

  async clearDeviceOverride(owner: string, id: string, deviceId: string): Promise<Consent> {
    const consent = await this.require(owner, id);
    const others = (consent.deviceQuietOverrides ?? []).filter(
      (item) => item.deviceId !== deviceId,
    );
    return this.db.put(owner, CONSENT_KIND, {
      ...consent,
      deviceQuietOverrides: others,
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * 免打扰判定（PRD A3）：生效顺序 设备级 > 账户级 > 是否开市。
   *
   * `pushedToday` 由调用方给出当日已推送条数，用来判断是否超出 dailyPushCap。
   * 未配置任何授权时 configured=false，事件管线据此沿用既有行为。
   */
  async gate(
    owner: string,
    options: { now?: Date; deviceId?: string; pushedToday?: number } = {},
  ): Promise<ConsentGate> {
    const now = options.now ?? new Date();
    const active = await this.active(owner, now);
    const reminders = active.filter((consent) => consent.purposes.includes("remind"));
    const reasons: string[] = [];
    const configured = (await this.list(owner)).length > 0;

    if (reminders.length === 0) {
      reasons.push("没有开启「主动提醒」用途的授权，推送将降级为信息流。");
    }

    // 账户级：取所有生效授权里最严格的一条作为主设置。
    const accountQuiet = reminders.find((consent) => consent.quietHours)?.quietHours;
    let accountCap = DEFAULT_DAILY_PUSH_CAP;
    for (const consent of reminders) {
      if (consent.dailyPushCap !== undefined)
        accountCap = Math.min(accountCap, consent.dailyPushCap);
    }

    let quiet = accountQuiet ? inQuietHours(accountQuiet, now) : false;
    let quietSource: ConsentGate["quietSource"] = quiet ? "account" : undefined;
    let dailyPushCap = accountCap;

    // 设备级覆盖：只覆盖当前设备。
    if (options.deviceId) {
      const override = reminders
        .flatMap((consent) => consent.deviceQuietOverrides ?? [])
        .filter((item) => item.deviceId === options.deviceId)
        .at(-1);
      if (override) {
        if (override.quietHours) {
          quiet = inQuietHours(override.quietHours, now);
          quietSource = quiet ? "device" : undefined;
        }
        if (override.dailyPushCap !== undefined) dailyPushCap = override.dailyPushCap;
      }
    }

    if (quiet) reasons.push("当前处于免打扰时段，推送将降级为信息流。");
    const pushedToday = Math.max(0, options.pushedToday ?? 0);
    const remaining = Math.max(0, dailyPushCap - pushedToday);
    if (remaining === 0) reasons.push("今日推送额度已用完，后续只会进信息流。");

    return {
      configured,
      remind: reminders.length > 0,
      quiet,
      dailyPushCap,
      remaining,
      ...(quietSource ? { quietSource } : {}),
      ...(reminders[0] ? { consentId: reminders[0].id } : {}),
      reasons,
    };
  }
}

/** "HH:mm" 在指定时区的当前时间；用于判断是否落在免打扰区间。 */
export function localHHMM(now: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone,
    })
      .format(now)
      .slice(0, 5);
  } catch {
    // 时区无法识别时退回 UTC，避免整条判定抛错。
    return now.toISOString().slice(11, 16);
  }
}

/** 是否处于免打扰时段；支持跨零点的区间（22:00–07:00）。 */
export function inQuietHours(quietHours: QuietHours, now: Date): boolean {
  const { start, end } = quietHours;
  if (start === end) return false;
  const current = localHHMM(now, quietHours.timeZone);
  if (start < end) return current >= start && current < end;
  return current >= start || current < end;
}
