import { z } from "zod";
import type { ModelSettings } from "../../../packages/domain/src/model-settings.ts";
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

  async resolve(owner: string): Promise<ResolvedModel> {
    const choice = await this.db.get<{ model: string }>(owner, "settings", "model");
    const selectedProvider = choice?.model.split("/")[0] ?? "deepseek";
    const saved = await this.saved(owner, selectedProvider);
    if (saved) {
      const provider = this.provider(saved.provider);
      return {
        model: `${provider.id}/${provider.models.includes(saved.modelId) ? saved.modelId : provider.model}`,
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
    const model =
      choice && options.some((option) => option.models.includes(choice.model))
        ? choice.model
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
    return [...choices.values()];
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
    const provider = this.provider(
      providerId ?? (resolved.source === "personal" ? resolved.model?.split("/")[0] : "deepseek"),
    );
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

  private async verify(candidate: { baseUrl: string; model: string; apiKey: string }) {
    try {
      const response = await fetch(`${candidate.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${candidate.apiKey}`, Accept: "application/json" },
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
      if (!payload.data.some((item) => item.id === candidate.model))
        throw new AppError("modelSettings.modelUnavailable", 422);
    } catch (error) {
      // Never surface provider bodies, URLs or SDK errors containing credentials.
      if (error instanceof AppError) throw error;
      throw new AppError("modelSettings.connectionFailed", 422);
    }
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
