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

export const deepseekDefaults = {
  baseUrl: "https://api.deepseek.com/v1",
  model: "deepseek-flash",
  models: ["deepseek-flash", "deepseek-v4-pro"],
} as const;
