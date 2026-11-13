import { createHash } from "node:crypto";
import type {
  DeliveryChannel,
  DeliveryLog,
  MonitorEvent,
} from "../../../../packages/domain/src/monitor.ts";
import type { Store } from "../db.ts";

export const DELIVERY_LOG_KIND = "delivery_logs";

export interface DeliveryMessage {
  ownerId: string;
  event: MonitorEvent;
  title: string;
  body: string;
}

/**
 * 推送通道适配器。本期只落地接口与投递日志：四个通道默认未配置凭证，
 * `send` 不会被调用，投递日志记为 `skipped / not_configured`。
 * 接入 APNs / FCM / 邮件 / 企微时，只需在对应适配器里实现 `send`。
 */
export interface DeliveryAdapter {
  channel: DeliveryChannel;
  providerId: string;
  configured(): boolean;
  send(message: DeliveryMessage): Promise<{ providerId?: string }>;
}

function stub(channel: DeliveryChannel, providerId: string, envKeys: string[]): DeliveryAdapter {
  return {
    channel,
    providerId,
    configured: () => envKeys.every((key) => Boolean(process.env[key])),
    send: async () => {
      throw new Error(`${providerId} delivery is not implemented yet`);
    },
  };
}

/** 默认通道表；凭证缺失即视为未配置，不会产生外呼。 */
export function defaultDeliveryAdapters(): DeliveryAdapter[] {
  return [
    stub("apns", "apns", ["APNS_KEY_ID", "APNS_TEAM_ID", "APNS_BUNDLE_ID", "APNS_PRIVATE_KEY"]),
    stub("fcm", "fcm", ["FCM_PROJECT_ID", "FCM_SERVICE_ACCOUNT_JSON"]),
    stub("email", "email", ["RESEND_API_KEY", "MAIL_FROM"]),
    stub("wecom", "wecom", ["WECOM_WEBHOOK_URL"]),
  ];
}

function logId(eventId: string, channel: DeliveryChannel): string {
  return createHash("sha256").update(`delivery:${eventId}:${channel}`).digest("hex");
}

export class DeliveryService {
  private readonly adapters: Map<DeliveryChannel, DeliveryAdapter>;

  constructor(
    private readonly db: Store,
    adapters: DeliveryAdapter[] = defaultDeliveryAdapters(),
  ) {
    this.adapters = new Map(adapters.map((adapter) => [adapter.channel, adapter]));
  }

  configuredChannels(): DeliveryChannel[] {
    return [...this.adapters.values()]
      .filter((adapter) => adapter.configured())
      .map((adapter) => adapter.channel);
  }

  /** 同一条事件在每个通道最多投一次；重复调用返回既有日志。 */
  async dispatch(
    message: DeliveryMessage,
    channels: DeliveryChannel[],
    now = new Date(),
  ): Promise<DeliveryLog[]> {
    const logs: DeliveryLog[] = [];
    let deliveredBy: DeliveryChannel | undefined;
    for (const channel of new Set(channels)) {
      const adapter = this.adapters.get(channel);
      if (!adapter) continue;
      const id = logId(message.event.id, channel);
      const existing = await this.db.get<DeliveryLog>(message.ownerId, DELIVERY_LOG_KIND, id);
      if (existing) {
        logs.push(existing);
        continue;
      }
      let log: DeliveryLog;
      if (deliveredBy) {
        // 同一条事件只外呼一次；其余通道留痕但不重复打扰。
        log = {
          id,
          ownerId: message.ownerId,
          eventId: message.event.id,
          channel,
          sentAt: now.toISOString(),
          providerId: adapter.providerId,
          result: "skipped",
          reason: "duplicated",
        };
      } else if (!adapter.configured()) {
        log = {
          id,
          ownerId: message.ownerId,
          eventId: message.event.id,
          channel,
          sentAt: now.toISOString(),
          providerId: adapter.providerId,
          result: "skipped",
          reason: "not_configured",
        };
      } else {
        try {
          const result = await adapter.send(message);
          log = {
            id,
            ownerId: message.ownerId,
            eventId: message.event.id,
            channel,
            sentAt: now.toISOString(),
            providerId: result.providerId ?? adapter.providerId,
            result: "sent",
          };
        } catch (error) {
          log = {
            id,
            ownerId: message.ownerId,
            eventId: message.event.id,
            channel,
            sentAt: now.toISOString(),
            providerId: adapter.providerId,
            result: "failed",
            reason: "error",
            error: error instanceof Error ? error.message : "Delivery failed",
          };
        }
        // 失败后允许回退到下一个已配置通道：一条事件最多成功外呼一次，
        // 但首个通道失败时仍会尝试后续通道，避免单一通道故障导致漏推。
        if (log.result === "sent") deliveredBy = channel;
      }
      logs.push(await this.db.put(message.ownerId, DELIVERY_LOG_KIND, log));
    }
    return logs;
  }
}
