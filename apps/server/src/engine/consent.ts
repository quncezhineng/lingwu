import { randomUUID } from "node:crypto";
import type {
  Consent,
  ConsentCreateInput,
  ConsentGate,
  ConsentUpdateInput,
  DeviceQuietOverride,
  DeviceQuietOverrideInput,
  EventFeedItem,
  QuietHours,
} from "../../../../packages/domain/src/investor.ts";
import { DEFAULT_DAILY_PUSH_CAP } from "../../../../packages/domain/src/investor.ts";
import type { Store } from "../db.ts";
import { AppError } from "../errors.ts";
import { FEED_KIND } from "./event-triage.ts";

const CONSENT_KIND = "consents";

/**
 * A3 授权中心。
 *
 * 一次授权记录回答四件事：能用哪些数据（dataScope）、用来做什么（purposes）、
 * 走什么渠道（channels）、多久一次（frequency）。判级时只关心其中一条：
 * 是否授权了「主动提醒（remind + push）」，以及此刻是否处于免打扰时段、
 * 今日推送是否已达上限——这三条构成 ConsentGate，交给 event-triage 做降级。
 */
export class ConsentService {
  constructor(private readonly db: Store) {}

  async list(owner: string): Promise<Consent[]> {
    const items = await this.db.list<Consent>(owner, CONSENT_KIND);
    return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async require(owner: string, id: string): Promise<Consent> {
    const consent = await this.db.get<Consent>(owner, CONSENT_KIND, id);
    if (!consent) throw new AppError("Consent not found", 404);
    return consent;
  }

  async create(owner: string, input: ConsentCreateInput): Promise<Consent> {
    const at = new Date().toISOString();
    const consent: Consent = {
      id: randomUUID(),
      owner,
      dataScope: input.dataScope,
      purposes: input.purposes,
      channels: input.channels,
      frequency: input.frequency,
      validFrom: input.validFrom ?? at,
      ...(input.validTo ? { validTo: input.validTo } : {}),
      ...(input.quietHours ? { quietHours: input.quietHours } : {}),
      ...(input.dailyPushCap !== undefined ? { dailyPushCap: input.dailyPushCap } : {}),
      createdAt: at,
      updatedAt: at,
    };
    return this.db.put(owner, CONSENT_KIND, consent);
  }

  /** 部分更新；`null` 表示清空该字段（validTo / quietHours / dailyPushCap）。 */
  async update(owner: string, id: string, input: ConsentUpdateInput): Promise<Consent> {
    const current = await this.require(owner, id);
    const next: Consent = {
      ...current,
      ...(input.dataScope ? { dataScope: input.dataScope } : {}),
      ...(input.purposes ? { purposes: input.purposes } : {}),
      ...(input.channels ? { channels: input.channels } : {}),
      ...(input.frequency ? { frequency: input.frequency } : {}),
      ...(input.validTo !== undefined
        ? input.validTo === null
          ? { validTo: undefined }
          : { validTo: input.validTo }
        : {}),
      ...(input.quietHours !== undefined
        ? input.quietHours === null
          ? { quietHours: undefined }
          : { quietHours: input.quietHours }
        : {}),
      ...(input.dailyPushCap !== undefined
        ? input.dailyPushCap === null
          ? { dailyPushCap: undefined }
          : { dailyPushCap: input.dailyPushCap }
        : {}),
      updatedAt: new Date().toISOString(),
    };
    return this.db.put(owner, CONSENT_KIND, next);
  }

  /** 撤回授权（软撤回，留痕）：撤回后立刻不再构成提醒授权。 */
  async revoke(owner: string, id: string): Promise<Consent> {
    const current = await this.require(owner, id);
    const at = new Date().toISOString();
    return this.db.put(owner, CONSENT_KIND, { ...current, revokedAt: at, updatedAt: at });
  }

  async remove(owner: string, id: string): Promise<void> {
    await this.require(owner, id);
    await this.db.remove(owner, CONSENT_KIND, id);
  }

  /**
   * 写入某台设备的免打扰覆盖（设备级优先于账户级）。
   * 只影响该设备收到推送时的投放，不改账户级设置本身。
   */
  async setDeviceOverride(
    owner: string,
    id: string,
    deviceId: string,
    input: DeviceQuietOverrideInput,
  ): Promise<Consent> {
    const current = await this.require(owner, id);
    const at = new Date().toISOString();
    const override: DeviceQuietOverride = {
      deviceId,
      ...(input.label ? { label: input.label } : {}),
      ...(input.quietHours !== undefined
        ? input.quietHours === null
          ? {}
          : { quietHours: input.quietHours }
        : {}),
      ...(input.dailyPushCap !== undefined
        ? input.dailyPushCap === null
          ? {}
          : { dailyPushCap: input.dailyPushCap }
        : {}),
      updatedAt: at,
    };
    const others = (current.deviceQuietOverrides ?? []).filter(
      (item) => item.deviceId !== deviceId,
    );
    return this.db.put(owner, CONSENT_KIND, {
      ...current,
      deviceQuietOverrides: [...others, override],
      updatedAt: at,
    });
  }

  async removeDeviceOverride(owner: string, id: string, deviceId: string): Promise<Consent> {
    const current = await this.require(owner, id);
    const remaining = (current.deviceQuietOverrides ?? []).filter(
      (item) => item.deviceId !== deviceId,
    );
    return this.db.put(owner, CONSENT_KIND, {
      ...current,
      deviceQuietOverrides: remaining.length > 0 ? remaining : undefined,
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * 解析判级策略闸：把「有没有提醒授权 / 是否免打扰 / 今日是否超上限」三件事
   * 合成一个 ConsentGate，交给事件判级做降级。没有任何生效授权时返回 canRemind=false。
   */
  async resolveGate(
    owner: string,
    options: { now?: Date; deviceId?: string } = {},
  ): Promise<ConsentGate> {
    const now = options.now ?? new Date();
    const reminding = (await this.list(owner)).filter(
      (consent) =>
        isConsentActive(consent, now) &&
        consent.purposes.includes("remind") &&
        consent.channels.includes("push"),
    );
    if (reminding.length === 0) {
      return { canRemind: false, quietHours: false, pushCapReached: false };
    }
    const primary = reminding[0] as Consent;
    const override = options.deviceId ? findDeviceOverride(reminding, options.deviceId) : undefined;
    const quiet = override?.quietHours ?? primary.quietHours;
    const cap = override?.dailyPushCap ?? primary.dailyPushCap ?? DEFAULT_DAILY_PUSH_CAP;
    const pushCapReached = (await this.countPushesToday(owner, now)) >= cap;
    return {
      canRemind: true,
      quietHours: quiet ? isWithinQuietHours(quiet, now) : false,
      pushCapReached,
      consentId: primary.id,
    };
  }

  /** 今日已实际推送（decision=push 且已建通知）的条目数。 */
  private async countPushesToday(owner: string, now: Date): Promise<number> {
    const day = now.toISOString().slice(0, 10);
    const items = await this.db.list<EventFeedItem>(owner, FEED_KIND);
    return items.filter((item) => item.decision === "push" && item.createdAt.slice(0, 10) === day)
      .length;
  }
}

/** 授权是否此刻生效：未撤回、已过生效日、未过期。 */
export function isConsentActive(consent: Consent, now: Date): boolean {
  if (consent.revokedAt) return false;
  if (Date.parse(consent.validFrom) > now.getTime()) return false;
  if (consent.validTo && Date.parse(consent.validTo) <= now.getTime()) return false;
  return true;
}

/** 在多条授权里找匹配该设备的覆盖项（越靠前优先级越高）。 */
function findDeviceOverride(
  consents: Consent[],
  deviceId: string,
): DeviceQuietOverride | undefined {
  for (const consent of consents) {
    const match = consent.deviceQuietOverrides?.find((item) => item.deviceId === deviceId);
    if (match) return match;
  }
  return undefined;
}

/** "HH:MM" → 当天的分钟数。 */
function minutesOfDay(value: string): number {
  const [hour, minute] = value.split(":");
  return Number(hour) * 60 + Number(minute);
}

/** 取某个时区下的当前本地时间（分钟数）。 */
function localMinutes(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  // 某些环境下 24 点会返回 "24"，归一到 0。
  return (hour % 24) * 60 + minute;
}

/**
 * 当前是否落在免打扰时段。
 *
 * 支持跨午夜（如 22:00–08:00）：start > end 时，命中 start 之后或 end 之前都算静默。
 * start === end 视为零长度窗口，永不静默。
 */
export function isWithinQuietHours(quiet: QuietHours, now: Date): boolean {
  const start = minutesOfDay(quiet.start);
  const end = minutesOfDay(quiet.end);
  if (start === end) return false;
  let current: number;
  try {
    current = localMinutes(now, quiet.timeZone);
  } catch {
    // 非法时区：不静默，宁可不打扰失败也不误伤推送。
    return false;
  }
  return start < end ? current >= start && current < end : current >= start || current < end;
}
