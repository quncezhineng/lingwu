import { createElement, useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useTranslation } from "./i18n";
import { Check, ChevronDown } from "./icons";
import { colors, fonts, radius, s, shadow } from "./ui";
import { useWorkspace } from "./workspace";

const manageValue = "__manage_models__";

/** Compact picker shared by the workbench and chat composers. Credentials stay in My settings. */
export function ComposerModelSelector({ disabled = false }: { disabled?: boolean }) {
  const { workspace, api, refresh, notify, navigate, open } = useWorkspace();
  const { t } = useTranslation();
  const [current, setCurrent] = useState(workspace.runtime.model);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const options = workspace.runtime.modelOptions ?? [];
  const label = (model: string) =>
    workspace.runtime.modelLabels?.[model] ?? (model.split("/").slice(1).join("/") || model);
  const title = current ? label(current) : t("modelSettings.selectModel");
  const blocked = disabled || busy;

  useEffect(() => setCurrent(workspace.runtime.model), [workspace.runtime.model]);
  useEffect(() => {
    if (disabled) setExpanded(false);
  }, [disabled]);

  function manage() {
    setExpanded(false);
    navigate("account");
    open({ type: "model-settings" });
  }

  async function select(model: string) {
    if (model === manageValue) {
      manage();
      return;
    }
    if (!model || model === current || blocked) return;
    setBusy(true);
    try {
      const result = await api.request<{ model: string }>("/api/model", { model });
      setCurrent(result.model);
      setExpanded(false);
      notify(t("screens.connectionsModelSwitched", { model: label(result.model) }));
      // The saved selection is authoritative even if refreshing other workspace data fails.
      await refresh().catch(() => {});
    } catch {
      notify(t("modelSettings.switchFailed"));
    } finally {
      setBusy(false);
    }
  }

  const content = (
    <>
      {busy ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <View
          style={{
            width: 6,
            height: 6,
            borderRadius: radius.full,
            backgroundColor: colors.primary,
          }}
        />
      )}
      <Text
        numberOfLines={1}
        style={{
          maxWidth: 180,
          fontSize: 11,
          lineHeight: 17,
          fontWeight: "500",
          color: colors.muted,
          fontFamily: fonts.sans,
        }}
      >
        {title}
      </Text>
      <ChevronDown size={12} color={colors.faint} />
    </>
  );
  const triggerStyle = {
    minHeight: 34,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    paddingHorizontal: 7,
    borderRadius: radius.control,
    opacity: blocked ? 0.55 : 1,
  };
  return (
    <View style={{ position: "relative", flexShrink: 1, minWidth: 0, zIndex: 5 }}>
      {Platform.OS === "web" ? (
        <View style={triggerStyle}>
          {content}
          {createElement(
            "select",
            {
              "aria-label": t("modelSettings.selectModel"),
              value: current ?? "",
              disabled: blocked,
              onChange: (event: { target: { value: string } }) => void select(event.target.value),
              style: {
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                opacity: 0,
                cursor: blocked ? "default" : "pointer",
                fontSize: 13,
              },
            },
            createElement("option", { value: "", disabled: true }, t("modelSettings.selectModel")),
            ...options.map((provider) =>
              createElement(
                "optgroup",
                { key: provider.provider, label: provider.label },
                provider.models.map((model) =>
                  createElement("option", { key: model, value: model }, label(model)),
                ),
              ),
            ),
            ...(current && !options.some((provider) => provider.models.includes(current))
              ? [createElement("option", { key: "current", value: current, disabled: true }, title)]
              : []),
            createElement("option", { value: manageValue }, t("modelSettings.manage")),
          )}
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("modelSettings.selectModel")}
          accessibilityValue={{ text: title }}
          accessibilityState={{ expanded, disabled: blocked, busy }}
          disabled={blocked}
          onPress={() => setExpanded(!expanded)}
          style={({ pressed }) => [
            triggerStyle,
            { backgroundColor: pressed ? colors.overlay1 : "transparent" },
          ]}
        >
          {content}
        </Pressable>
      )}
      {Platform.OS !== "web" && expanded && (
        <View
          style={{
            position: "absolute",
            bottom: "100%",
            left: 0,
            minWidth: 240,
            maxWidth: 320,
            marginBottom: 8,
            padding: 6,
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: radius.panel,
            backgroundColor: colors.paper,
            ...shadow.card,
          }}
        >
          <ScrollView style={{ maxHeight: 260 }}>
            {!options.length && (
              <Text style={[s.small, { padding: 10 }]}>
                {t("modelSettings.noConfiguredModels")}
              </Text>
            )}
            {options.map((provider) => (
              <View key={provider.provider} style={{ gap: 2 }}>
                <Text style={[s.small, { padding: 8 }]}>{provider.label}</Text>
                {provider.models.map((model) => (
                  <Pressable
                    key={model}
                    accessibilityRole="button"
                    accessibilityState={{ selected: model === current, disabled: blocked }}
                    disabled={blocked}
                    onPress={() => void select(model)}
                    style={[
                      s.between,
                      {
                        padding: 10,
                        borderRadius: radius.control,
                        backgroundColor: model === current ? colors.sky : colors.paper,
                      },
                    ]}
                  >
                    <Text style={s.text}>{label(model)}</Text>
                    {model === current && <Check size={14} color={colors.primary} />}
                  </Pressable>
                ))}
              </View>
            ))}
          </ScrollView>
          <Pressable
            accessibilityRole="button"
            onPress={manage}
            style={{ padding: 10, borderTopWidth: 1, borderTopColor: colors.line }}
          >
            <Text style={[s.text, { color: colors.primaryStrong }]}>
              {t("modelSettings.manage")}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
