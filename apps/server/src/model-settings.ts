import { z } from "zod";
import type {
  CustomModelInput,
  ModelLibrary,
  ModelLibraryEntry,
  ModelSettings,
} from "../../../packages/domain/src/model-settings.ts";
import { decryptSecret, encryptSecret } from "../../../packages/integrations/src/vault.ts";
import type { Config } from "./config.ts";
import type { Store } from "./db.ts";
import { AppError } from "./errors.ts";
import { type ModelChoice, modelChoices, modelProviders } from "./models.ts";

const inputSchema = z
  .object({
    provider: z.string().trim().min(1).max(50),
    model: z
      .string()
      .trim()
      .min(1)
      .max(150)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/),
    apiKey: z
      .string()
      .trim()
      .max(2048)
      .regex(/^[^\r\n]*$/)
      .optional(),
  })
  .strict();

interface SavedConnection {
  id: string;
  provider: string;
  /** Reference into the shared model catalogue, not a copy of provider parameters. */
  modelId: string;
  secret: string;
  updatedAt: string;
}

/** 用户自定义模型的存储集合；记录 id 就是模型 ID。 */
const MODEL_LIBRARY_KIND = "model-library";
/** 自定义模型在应用里的规格前缀；解析时据此找到对应记录。 */
export const CUSTOM_MODEL_PREFIX = "custom/";

interface CustomModelRecord {
  id: string;
  label?: string;
  /** 添加时选择的服务商展示名（如 DeepSeek）；纯自定义模型没有这一项。 */
  provider?: string;
  baseUrl: string;
  /** 加密后的密钥，与个人厂商配置同样的写后不可读。 */
  secret: string;
  enabled: boolean;
  updatedAt: string;
}

/** 模型 ID：与服务商目录里出现的字符集一致，同时用作自定义模型的记录 id。 */
const customModelIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(150)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/);

const customModelSchema = z
  .object({
    model: customModelIdSchema,
    label: z.string().trim().max(60).optional(),
    baseUrl: z.string().trim().min(1).max(300),
    apiKey: z
      .string()
      .trim()
      .max(2048)
      .regex(/^[^\r\n]*$/)
      .optional(),
    enabled: z.boolean().optional(),
  })
  .strict();

/** Private request-scoped credentials; never placed in workspace snapshots or task state. */
export interface ModelConnection {
  provider: string;
  protocol: "openai-chat-completions";
  apiKey: string;
  baseUrl: string;
}

export interface ResolvedModel {
  model?: string;
  connection?: ModelConnection;
  configured: boolean;
  source: ModelSettings["source"];
}

function canonicalUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash) return null;
    return url.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

export class ModelSettingsService {
  constructor(
    private readonly db: Store,
    private readonly config: Config,
  ) {}

  private saved(owner: string, provider = "deepseek") {
    return this.db.get<SavedConnection>(owner, "credentials", `model:${provider}`);
  }

  private encryptionKey() {
    if (!this.config.encryptionKey) throw new AppError("modelSettings.encryptionUnavailable", 503);
    return this.config.encryptionKey;
  }

  private provider(id = "deepseek") {
    const definition = modelProviders.find((item) => item.id === id && item.personal);
    if (!definition?.personal) throw new AppError("modelSettings.providerUnavailable", 422);
    const configuredBaseUrl =
      id === "deepseek" ? this.config.deepseekBaseUrl : process.env[`${id.toUpperCase()}_BASE_URL`];
    const normalized = canonicalUrl(configuredBaseUrl || definition.personal.defaultBaseUrl);
    if (
      !normalized ||
      (!normalized.startsWith("https://") &&
        !(this.config.mode === "sample" && normalized.startsWith("http://")))
    )
      throw new AppError("modelSettings.baseUrlNotAllowed", 422);
    const defaultModel = this.config.model?.startsWith(`${id}/`)
      ? this.config.model.slice(id.length + 1)
      : definition.models[0];
    return {
      id,
      protocol: definition.personal.protocol,
      modelLabels: definition.personal.modelLabels,
      label: definition.label,
      baseUrl: normalized,
      model: defaultModel,
      models: [...new Set([defaultModel, ...definition.models])],
    };
  }

  /**
   * 解析本次请求使用的模型。
   *
   * `requested` 是 Agent 自己的模型选择（`provider/model-id`）：命中用户的个人密钥就用个人连接，
   * 命中服务端密钥就用服务端连接；不可用时回落到用户默认模型，绝不让一次对话因为没有模型而失败。
   */
  async resolve(owner: string, requested?: string): Promise<ResolvedModel> {
    const choice = await this.db.get<{ model: string }>(owner, "settings", "model");
    const wanted = requested?.trim() || choice?.model;
    // 自定义模型自带端点与密钥，规格形如 `custom/<model-id>`。
    if (wanted?.startsWith(CUSTOM_MODEL_PREFIX)) {
      const record = await this.customRecord(owner, wanted.slice(CUSTOM_MODEL_PREFIX.length));
      const apiKey =
        record && this.config.encryptionKey
          ? decryptSecret(record.secret, this.config.encryptionKey)
          : "";
      if (record?.enabled && apiKey)
        return {
          model: `${CUSTOM_MODEL_PREFIX}${record.id}`,
          connection: {
            provider: "custom",
            protocol: "openai-chat-completions",
            baseUrl: record.baseUrl,
            apiKey,
          },
          configured: true,
          source: "personal",
        };
    }
    const saved = await this.saved(owner, wanted?.split("/")[0] ?? "deepseek");
    if (saved) {
      const provider = this.provider(saved.provider);
      const wantedModel = wanted?.startsWith(`${provider.id}/`)
        ? wanted.slice(provider.id.length + 1)
        : undefined;
      const modelId =
        wantedModel && provider.models.includes(wantedModel)
          ? wantedModel
          : provider.models.includes(saved.modelId)
            ? saved.modelId
            : provider.model;
      return {
        model: `${provider.id}/${modelId}`,
        connection: {
          provider: provider.id,
          protocol: provider.protocol,
          baseUrl: provider.baseUrl,
          apiKey: decryptSecret(saved.secret, this.encryptionKey()),
        },
        configured: true,
        source: "personal",
      };
    }
    const options = modelChoices(this.config);
    const offered = (spec?: string) =>
      Boolean(spec && options.some((option) => option.models.includes(spec)));
    const model = offered(wanted)
      ? wanted
      : offered(choice?.model)
        ? choice?.model
        : this.config.model;
    const provider = modelProviders.find((item) => item.id === model?.split("/")[0]);
    return {
      model,
      configured: Boolean(model && provider && process.env[provider.key]?.trim()),
      source: model ? "server" : "none",
    };
  }

  async choices(owner: string): Promise<ModelChoice[]> {
    if (this.config.agentBackend !== "model") return [];
    const choices = new Map(modelChoices(this.config).map((choice) => [choice.provider, choice]));
    for (const definition of modelProviders.filter((item) => item.personal)) {
      if (!(await this.saved(owner, definition.id))) continue;
      const provider = this.provider(definition.id);
      choices.set(provider.id, {
        provider: provider.id,
        label: provider.label,
        models: provider.models.map((model) => `${provider.id}/${model}`),
      });
    }
    // 只有启用的自定义模型会出现在选模型列表里；停用等于暂时不提供给 Agent 使用。
    const custom = (await this.customRecords(owner)).filter((record) => record.enabled);
    if (custom.length)
      choices.set("custom", {
        provider: "custom",
        label: "Custom",
        models: custom.map((record) => `${CUSTOM_MODEL_PREFIX}${record.id}`),
      });
    return [...choices.values()];
  }

  /** 自定义模型的展示名，用于把 `custom/<id>` 渲染成用户填写的名字。 */
  async customLabels(owner: string) {
    const records = await this.customRecords(owner);
    return Object.fromEntries(
      records.map((record) => [`${CUSTOM_MODEL_PREFIX}${record.id}`, record.label || record.id]),
    );
  }

  private customRecords(owner: string) {
    return this.db.list<CustomModelRecord>(owner, MODEL_LIBRARY_KIND);
  }

  private customRecord(owner: string, id: string) {
    return id
      ? this.db.get<CustomModelRecord>(owner, MODEL_LIBRARY_KIND, id)
      : Promise.resolve(null);
  }

  /**
   * 「模型管理」页的数据：内置模型只读，自定义模型可编辑、删除与启停。
   *
   * 内置模型来自服务端已配置的厂商目录，`provider` 保留厂商标识，由客户端决定展示方式。
   */
  async library(owner: string): Promise<ModelLibrary> {
    const labels = this.labels();
    const builtin: ModelLibraryEntry[] = modelChoices(this.config).flatMap((choice) =>
      choice.models.map((spec) => ({
        spec,
        label: labels[spec] ?? (spec.split("/").slice(1).join("/") || spec),
        provider: choice.provider,
        providerLabel: choice.label,
        builtin: true,
        enabled: true,
      })),
    );
    const custom = (await this.customRecords(owner))
      .map(
        (record): ModelLibraryEntry => ({
          spec: `${CUSTOM_MODEL_PREFIX}${record.id}`,
          label: record.label || record.id,
          provider: "custom",
          // 通过服务商预设添加的模型带上品牌名，纯自定义模型由客户端显示兜底文案。
          providerLabel: record.provider ?? "",
          builtin: false,
          enabled: record.enabled,
          baseUrl: record.baseUrl,
          hasApiKey: true,
          updatedAt: record.updatedAt,
        }),
      )
      .sort((a, b) => a.label.localeCompare(b.label));
    return {
      builtin,
      custom,
      canConfigure: Boolean(this.config.encryptionKey) && this.config.agentBackend === "model",
      effectiveModel: (await this.resolve(owner)).model,
    };
  }

  /**
   * 新增或更新一个自定义模型。
   *
   * 保存前必须能连通服务商并找到该模型，避免把打错的地址或模型 ID 存进去；
   * 已存在的模型视为编辑，密钥留空表示沿用原密钥。
   */
  async saveCustom(owner: string, raw: CustomModelInput) {
    if (this.config.agentBackend !== "model")
      throw new AppError("modelSettings.backendUnavailable", 400);
    this.encryptionKey();
    const input = customModelSchema.parse(raw);
    const baseUrl = this.customBaseUrl(input.baseUrl);
    const existing = await this.customRecord(owner, input.model);
    const apiKey =
      input.apiKey || (existing ? decryptSecret(existing.secret, this.encryptionKey()) : "");
    if (!apiKey) throw new AppError("modelSettings.apiKeyRequired", 422);
    await this.verify({ baseUrl, model: input.model, apiKey });
    await this.db.put<CustomModelRecord>(owner, MODEL_LIBRARY_KIND, {
      id: input.model,
      ...(input.label?.trim() ? { label: input.label.trim() } : {}),
      baseUrl,
      secret: encryptSecret(apiKey, this.encryptionKey()),
      enabled: input.enabled ?? existing?.enabled ?? true,
      updatedAt: new Date().toISOString(),
    });
    return this.library(owner);
  }

  /** 只切换启用状态：不重新校验端点，避免网络抖动阻塞一次开关操作。 */
  async setCustomEnabled(owner: string, id: string, enabled: boolean) {
    const record = await this.customRecord(owner, id);
    if (!record) throw new AppError("modelSettings.modelUnavailable", 404);
    await this.db.put<CustomModelRecord>(owner, MODEL_LIBRARY_KIND, {
      ...record,
      enabled,
      updatedAt: new Date().toISOString(),
    });
    return this.library(owner);
  }

  async removeCustom(owner: string, id: string) {
    const record = await this.customRecord(owner, id);
    if (!record) throw new AppError("modelSettings.modelUnavailable", 404);
    await this.db.remove(owner, MODEL_LIBRARY_KIND, id);
    // 默认模型指向被删除的自定义模型时一并清理，下次解析自动回落到服务端默认。
    const choice = await this.db.get<{ model: string }>(owner, "settings", "model");
    if (choice?.model === `${CUSTOM_MODEL_PREFIX}${id}`)
      await this.db.remove(owner, "settings", "model");
    return this.library(owner);
  }

  labels(): Record<string, string> {
    return Object.fromEntries(
      modelProviders.flatMap((provider) =>
        Object.entries(provider.personal?.modelLabels ?? {}).map(([model, label]) => [
          `${provider.id}/${model}`,
          label,
        ]),
      ),
    );
  }

  async read(owner: string, providerId?: string): Promise<ModelSettings> {
    const resolved = await this.resolve(owner);
    // 自定义模型没有厂商级配置页，回落到默认厂商，避免读到 `custom/` 时报「厂商不可用」。
    const personalProvider =
      resolved.source === "personal" ? resolved.model?.split("/")[0] : undefined;
    const requested =
      providerId ??
      (personalProvider && personalProvider !== "custom" ? personalProvider : undefined);
    const provider = this.provider(requested ?? "deepseek");
    const saved = await this.saved(owner, provider.id);
    const options = (definition: ReturnType<ModelSettingsService["provider"]>) =>
      definition.models.map((id) => ({
        id,
        label: definition.modelLabels?.[id] ?? id,
      }));
    return {
      provider: provider.id,
      providers: modelProviders
        .filter((item) => item.personal)
        .map((item) => {
          const definition = this.provider(item.id);
          return {
            id: definition.id,
            label: definition.label,
            baseUrl: definition.baseUrl,
            models: options(definition),
          };
        }),
      baseUrl: provider.baseUrl,
      model: saved && provider.models.includes(saved.modelId) ? saved.modelId : provider.model,
      modelOptions: options(provider),
      hasApiKey: Boolean(saved),
      canConfigure: Boolean(this.config.encryptionKey) && this.config.agentBackend === "model",
      source: resolved.source,
      effectiveModel: resolved.model,
      updatedAt: saved?.updatedAt,
    };
  }

  private async candidate(owner: string, raw: unknown) {
    if (this.config.agentBackend !== "model")
      throw new AppError("modelSettings.backendUnavailable", 400);
    this.encryptionKey();
    const input = inputSchema.parse(raw);
    const provider = this.provider(input.provider);
    const baseUrl = provider.baseUrl;
    const model = input.model.startsWith(`${provider.id}/`)
      ? input.model.slice(provider.id.length + 1)
      : input.model;
    if (!provider.models.includes(model)) throw new AppError("modelSettings.modelUnavailable", 422);
    const saved = await this.saved(owner, provider.id);
    const apiKey = input.apiKey || (saved ? decryptSecret(saved.secret, this.encryptionKey()) : "");
    if (!apiKey) throw new AppError("modelSettings.apiKeyRequired", 422);
    return { provider: input.provider, baseUrl, model, apiKey };
  }

  async test(owner: string, raw: unknown) {
    const candidate = await this.candidate(owner, raw);
    await this.verify(candidate);
    return { ok: true };
  }

  /** 自定义模型只接受可公网访问的 https 地址；sample 模式放开 http 便于本地联调。 */
  private customBaseUrl(raw: string) {
    const baseUrl = canonicalUrl(raw);
    if (
      !baseUrl ||
      (!baseUrl.startsWith("https://") &&
        !(this.config.mode === "sample" && baseUrl.startsWith("http://")))
    )
      throw new AppError("modelSettings.baseUrlNotAllowed", 422);
    return baseUrl;
  }

  /** 读取端点声明的模型列表；错误统一映射成文案，绝不回传服务商响应体。 */
  private async fetchModels(baseUrl: string, apiKey: string): Promise<string[]> {
    try {
      const response = await fetch(`${baseUrl}/models`, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
        redirect: "error",
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new AppError(
          response.status === 401 || response.status === 403
            ? "modelSettings.authenticationFailed"
            : response.status === 429
              ? "modelSettings.rateLimited"
              : "modelSettings.connectionFailed",
          422,
        );
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Empty response");
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.length;
          if (bytes > 1024 * 1024) throw new Error("Response too large");
          chunks.push(value);
        }
      } finally {
        await reader.cancel();
      }
      const payload = z
        .object({ data: z.array(z.object({ id: z.string() })) })
        .parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      return [...new Set(payload.data.map((item) => item.id).filter(Boolean))];
    } catch (error) {
      // Never surface provider bodies, URLs or SDK errors containing credentials.
      if (error instanceof AppError) throw error;
      throw new AppError("modelSettings.connectionFailed", 422);
    }
  }

  private async verify(candidate: { baseUrl: string; model: string; apiKey: string }) {
    const models = await this.fetchModels(candidate.baseUrl, candidate.apiKey);
    if (!models.includes(candidate.model))
      throw new AppError("modelSettings.modelUnavailable", 422);
  }

  /**
   * 读取某个端点可用的模型，供「添加模型」的第二步勾选。
   *
   * 只回模型 ID，不回服务商原始响应，避免把密钥或厂商报文带到客户端。
   */
  async discover(_owner: string, raw: unknown) {
    if (this.config.agentBackend !== "model")
      throw new AppError("modelSettings.backendUnavailable", 400);
    const input = z
      .object({
        baseUrl: z.string().trim().min(1).max(300),
        apiKey: z
          .string()
          .trim()
          .min(1)
          .max(2048)
          .regex(/^[^\r\n]*$/),
      })
      .strict()
      .parse(raw);
    return { models: await this.fetchModels(this.customBaseUrl(input.baseUrl), input.apiKey) };
  }

  /** 一次写入同一端点下的多个模型（同一密钥只校验一次）。 */
  async saveCustomBatch(owner: string, raw: unknown) {
    if (this.config.agentBackend !== "model")
      throw new AppError("modelSettings.backendUnavailable", 400);
    this.encryptionKey();
    const input = z
      .object({
        baseUrl: z.string().trim().min(1).max(300),
        apiKey: z
          .string()
          .trim()
          .min(1)
          .max(2048)
          .regex(/^[^\r\n]*$/),
        models: z.array(customModelIdSchema).min(1).max(50),
        provider: z.string().trim().max(40).optional(),
      })
      .strict()
      .parse(raw);
    const baseUrl = this.customBaseUrl(input.baseUrl);
    const models = [...new Set(input.models)];
    const available = await this.fetchModels(baseUrl, input.apiKey);
    if (models.some((model) => !available.includes(model)))
      throw new AppError("modelSettings.modelUnavailable", 422);
    const secret = encryptSecret(input.apiKey, this.encryptionKey());
    const updatedAt = new Date().toISOString();
    for (const model of models) {
      const existing = await this.customRecord(owner, model);
      await this.db.put<CustomModelRecord>(owner, MODEL_LIBRARY_KIND, {
        id: model,
        ...(existing?.label ? { label: existing.label } : {}),
        ...(input.provider ? { provider: input.provider } : {}),
        baseUrl,
        secret,
        enabled: existing?.enabled ?? true,
        updatedAt,
      });
    }
    return this.library(owner);
  }

  async save(owner: string, raw: unknown) {
    const candidate = await this.candidate(owner, raw);
    await this.verify(candidate);
    await this.db.put<SavedConnection>(owner, "credentials", {
      id: `model:${candidate.provider}`,
      provider: candidate.provider,
      modelId: candidate.model,
      secret: encryptSecret(candidate.apiKey, this.encryptionKey()),
      updatedAt: new Date().toISOString(),
    });
    await this.db.put(owner, "settings", {
      id: "model",
      model: `${candidate.provider}/${candidate.model}`,
    });
    return this.read(owner, candidate.provider);
  }

  async remove(owner: string, provider = "deepseek") {
    this.provider(provider);
    await this.db.remove(owner, "credentials", `model:${provider}`);
    const choice = await this.db.get<{ model: string }>(owner, "settings", "model");
    if (choice?.model.startsWith(`${provider}/`)) await this.db.remove(owner, "settings", "model");
    return this.read(owner, provider);
  }

  async select(owner: string, spec: string) {
    const options = await this.choices(owner);
    if (!options.some((option) => option.models.includes(spec)))
      throw new AppError(`${spec} is not available on this server`, 400);
    const providerId = spec.split("/")[0];
    const saved = await this.saved(owner, providerId);
    if (saved) {
      await this.verify({
        baseUrl: this.provider(providerId).baseUrl,
        model: spec.slice(providerId.length + 1),
        apiKey: decryptSecret(saved.secret, this.encryptionKey()),
      });
      await this.db.put(owner, "credentials", {
        ...saved,
        modelId: spec.slice(providerId.length + 1),
        updatedAt: new Date().toISOString(),
      });
    }
    await this.db.put(owner, "settings", { id: "model", model: spec });
    return { model: (await this.resolve(owner)).model };
  }
}
