import { createElement, useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, Text, View } from "react-native";
import {
  deepseekDefaults,
  type ModelSettings,
  type ModelSettingsInput,
} from "../../../packages/domain/src/model-settings";
import { useTranslation } from "./i18n";
import type { TranslationKey } from "./i18n/locales/en";
import { ChevronDown } from "./icons";
import { Button, colors, Field, Sheet, s } from "./ui";
import { useWorkspace } from "./workspace";

const errorKeys = [
  "encryptionUnavailable",
  "backendUnavailable",
  "baseUrlNotAllowed",
  "apiKeyRequired",
  "authenticationFailed",
  "rateLimited",
  "connectionFailed",
  "modelUnavailable",
  "providerUnavailable",
] as const;

function ModelSelect({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: { id: string; label: string }[];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      <Text style={[s.small, { fontWeight: "600", color: colors.text }]}>{label}</Text>
      {Platform.OS === "web" ? (
        createElement(
          "select",
          {
            "aria-label": label,
            value,
            disabled,
            onChange: (event: { target: { value: string } }) => onChange(event.target.value),
            style: {
              minHeight: 46,
              width: "100%",
              padding: "0 12px",
              border: `1px solid ${colors.lineStrong}`,
              borderRadius: 8,
              backgroundColor: colors.paper,
              color: colors.text,
              fontSize: 14,
              fontFamily: "inherit",
              cursor: disabled ? "default" : "pointer",
            },
          },
          options.map((option) =>
            createElement("option", { key: option.id, value: option.id }, option.label),
          ),
        )
      ) : (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ expanded, disabled }}
            disabled={disabled}
            onPress={() => setExpanded(!expanded)}
            style={[s.input, s.between]}
          >
            <Text style={s.text}>
              {options.find((option) => option.id === value)?.label ?? value}
            </Text>
            <ChevronDown size={16} color={colors.muted} />
          </Pressable>
          {expanded && (
            <View style={[s.card, { padding: 4 }]}>
              {options.map((option) => (
                <Pressable
                  key={option.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: option.id === value }}
                  onPress={() => {
                    onChange(option.id);
                    setExpanded(false);
                  }}
                  style={{
                    padding: 12,
                    backgroundColor: option.id === value ? colors.sky : colors.paper,
                  }}
                >
                  <Text style={s.text}>{option.label}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </>
      )}
    </View>
  );
}

export function ModelSettingsForm({ onSaved }: { onSaved?: () => void }) {
  const { api, refresh, notify } = useWorkspace();
  const { t } = useTranslation();
  const [settings, setSettings] = useState<ModelSettings>();
  const [provider, setProvider] = useState("deepseek");
  const [model, setModel] = useState<string>(deepseekDefaults.model);
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState<"load" | "test" | "save" | "remove" | "">("load");
  const [error, setError] = useState("");
  const [tested, setTested] = useState(false);

  function message(error: unknown) {
    const text = error instanceof Error ? error.message : "";
    return errorKeys.some((key) => text === `modelSettings.${key}`)
      ? t(text as TranslationKey)
      : t("modelSettings.requestFailed");
  }

  useEffect(() => {
    let active = true;
    void api
      .request<ModelSettings>("/api/model/settings")
      .then((value) => {
        if (!active) return;
        setSettings(value);
        setProvider(value.provider);
        setModel(value.model);
      })
      .catch((error) => {
        if (active) setError(message(error));
      })
      .finally(() => {
        if (active) setBusy("");
      });
    return () => {
      active = false;
    };
  }, [api]);

  const retainedKey = Boolean(settings?.hasApiKey && provider === settings.provider);
  const enabled = Boolean(settings?.canConfigure && model.trim() && (apiKey.trim() || retainedKey));
  function changed(update: () => void) {
    update();
    setTested(false);
    setError("");
  }

  async function submit(action: "test" | "save" | "remove") {
    setBusy(action);
    setError("");
    setTested(false);
    const payload: ModelSettingsInput = {
      provider,
      model,
      ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
    };
    try {
      if (action === "test") {
        await api.request("/api/model/settings/test", payload);
        setTested(true);
      } else {
        const value = await api.request<ModelSettings>(
          `/api/model/settings?provider=${encodeURIComponent(provider)}`,
          action === "save" ? payload : undefined,
          action === "save" ? "PUT" : "DELETE",
        );
        setApiKey("");
        setSettings(value);
        setProvider(value.provider);
        setModel(value.model);
        await refresh();
        notify(t(action === "save" ? "modelSettings.saved" : "modelSettings.removed"));
        onSaved?.();
      }
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy("");
    }
  }

  async function changeProvider(value: string) {
    setApiKey("");
    setError("");
    setTested(false);
    setBusy("load");
    try {
      const result = await api.request<ModelSettings>(
        `/api/model/settings?provider=${encodeURIComponent(value)}`,
      );
      setSettings(result);
      setProvider(result.provider);
      setModel(result.model);
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy("");
    }
  }

  if (busy === "load")
    return (
      <ActivityIndicator accessibilityLabel={t("modelSettings.loading")} color={colors.primary} />
    );
  return (
    <View style={{ gap: 18 }}>
      <View style={[s.card, { padding: 14, gap: 5, backgroundColor: colors.sky }]}>
        <Text style={s.small}>{t("modelSettings.scope")}</Text>
        <Text style={s.small}>
          {t("modelSettings.current", {
            model: settings?.effectiveModel ?? t("modelSettings.notConfigured"),
          })}
        </Text>
      </View>
      {settings && !settings.canConfigure && (
        <Text style={s.muted}>{t("modelSettings.setupUnavailable")}</Text>
      )}
      <ModelSelect
        label={t("modelSettings.provider")}
        value={provider}
        options={settings?.providers ?? []}
        disabled={Boolean(busy) || !settings?.canConfigure}
        onChange={(value) => void changeProvider(value)}
      />
      <ModelSelect
        label={t("modelSettings.model")}
        value={model}
        options={settings?.providers.find((item) => item.id === provider)?.models ?? []}
        disabled={Boolean(busy) || !settings?.canConfigure}
        onChange={(value) => changed(() => setModel(value))}
      />
      <Text style={s.small}>{t("modelSettings.endpointHint")}</Text>
      <Field
        label="API Key"
        value={apiKey}
        onChangeText={(value) => changed(() => setApiKey(value))}
        editable={!busy && settings?.canConfigure}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="none"
        placeholder={retainedKey ? t("modelSettings.keepKey") : "sk-…"}
      />
      <Text style={s.small}>{t("modelSettings.keyHint")}</Text>
      {!!error && (
        <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 13 }}>
          {error}
        </Text>
      )}
      {tested && (
        <Text role="status" style={{ color: colors.primaryStrong, fontSize: 13 }}>
          {t("modelSettings.testPassed")}
        </Text>
      )}
      <View style={[s.row, { gap: 10, flexWrap: "wrap" }]}>
        <Button
          busy={busy === "test"}
          disabled={Boolean(busy) || !enabled}
          onPress={() => void submit("test")}
        >
          {t("modelSettings.test")}
        </Button>
        <Button
          primary
          busy={busy === "save"}
          disabled={Boolean(busy) || !enabled}
          onPress={() => void submit("save")}
        >
          {t("modelSettings.save")}
        </Button>
      </View>
      {settings?.hasApiKey && (
        <Button
          busy={busy === "remove"}
          disabled={Boolean(busy)}
          onPress={() => void submit("remove")}
        >
          {t("modelSettings.restore")}
        </Button>
      )}
    </View>
  );
}

export function ModelSettingsSheet() {
  const { close } = useWorkspace();
  const { t } = useTranslation();
  return (
    <Sheet title={t("modelSettings.title")} subtitle={t("modelSettings.subtitle")} onClose={close}>
      <ModelSettingsForm onSaved={close} />
    </Sheet>
  );
}
