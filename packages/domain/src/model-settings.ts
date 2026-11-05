/** Safe to return to the app. API keys are write-only and never included here. */
export interface ModelSettings {
  provider: string;
  providers: {
    id: string;
    label: string;
    baseUrl: string;
    models: { id: string; label: string }[];
  }[];
  baseUrl: string;
  model: string;
  modelOptions: { id: string; label: string }[];
  hasApiKey: boolean;
  canConfigure: boolean;
  source: "personal" | "server" | "none";
  effectiveModel?: string;
  updatedAt?: string;
}

export interface ModelSettingsInput {
  provider: string;
  model: string;
  /** Omit/leave blank to retain an existing personal key. */
  apiKey?: string;
}

/**
 * 模型库中的一行。
 *
 * `builtin` 来自服务端已配置的厂商目录，只读；`custom` 由用户自己添加，
 * 指向任意 OpenAI Chat Completions 兼容端点。
 */
export interface ModelLibraryEntry {
  /** 模型规格：内置为 `provider/model`，自定义为 `custom/model`。 */
  spec: string;
  label: string;
  /** 服务商标识；`custom` 表示用户自定义端点，由客户端翻译成展示名。 */
  provider: string;
  /** 服务商展示名（内置模型使用厂商品牌名）。 */
  providerLabel: string;
  builtin: boolean;
  enabled: boolean;
  baseUrl?: string;
  hasApiKey?: boolean;
  updatedAt?: string;
}

export interface ModelLibrary {
  builtin: ModelLibraryEntry[];
  custom: ModelLibraryEntry[];
  /** 服务端是否允许用户维护自定义模型（需要模型后端与凭证加密）。 */
  canConfigure: boolean;
  effectiveModel?: string;
}

/** 读取某端点可用模型的结果；只含 ID，不含服务商原始响应。 */
export interface ModelDiscoveryResult {
  models: string[];
}

/** 通过服务商预设一次性添加多个模型（同一端点、同一密钥）。 */
export interface CustomModelBatchInput {
  baseUrl: string;
  apiKey: string;
  models: string[];
  /** 服务商展示名，用于模型列表的「服务商」列。 */
  provider?: string;
}

export interface CustomModelInput {
  /** 模型 ID（发给服务商的模型名），同时作为自定义模型在该账号下的唯一标识。 */
  model: string;
  /** 展示名；留空时使用模型 ID。 */
  label?: string;
  baseUrl: string;
  /** 留空表示保留已保存的密钥。 */
  apiKey?: string;
  enabled?: boolean;
}

export const deepseekDefaults = {
  baseUrl: "https://api.deepseek.com/v1",
  model: "deepseek-flash",
  models: ["deepseek-flash", "deepseek-v4-pro"],
} as const;
