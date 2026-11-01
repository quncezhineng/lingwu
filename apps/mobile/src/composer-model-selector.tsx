import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useTranslation } from "./i18n";
import { Check, ChevronDown, Settings2 } from "./icons";
import { Button, colors, fonts, radius, Sheet, s, space } from "./ui";
import { useWorkspace } from "./workspace";

/** Compact picker shared by the workbench and chat composers. Credentials stay in My settings. */
export function ComposerModelSelector({ disabled = false }: { disabled?: boolean }) {
  const { workspace, api, refresh, notify, navigate, open } = useWorkspace();
  const { t } = useTranslation();
  const [current, setCurrent] = useState(workspace.runtime.model);
  const [busy, setBusy] = useState(false);
  const [pendingModel, setPendingModel] = useState<string>();
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
    if (!model || model === current || blocked) return;
    setBusy(true);
    setPendingModel(model);
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
      setPendingModel(undefined);
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
          maxWidth: 190,
          fontSize: 12,
          lineHeight: 18,
          fontWeight: "600",
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
    minHeight: 40,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 7,
    paddingHorizontal: 9,
    borderRadius: radius.control,
    opacity: blocked ? 0.55 : 1,
  };
  return (
    <View style={{ flexShrink: 1, minWidth: 0 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("modelSettings.selectModel")}
        accessibilityValue={{ text: title }}
        accessibilityState={{ expanded, disabled: blocked, busy }}
        disabled={blocked}
        hitSlop={8}
        onPress={() => setExpanded(true)}
        style={({ pressed }) => [
          triggerStyle,
          { backgroundColor: pressed ? colors.overlay1 : "transparent" },
        ]}
      >
        {content}
      </Pressable>
      {expanded && (
        <Sheet
          small
          title={t("modelSettings.selectModel")}
          subtitle={
            current
              ? t("modelSettings.current", { model: title })
              : t("modelSettings.noConfiguredModels")
          }
          onClose={() => setExpanded(false)}
        >
          <View style={{ gap: space.lg }}>
            {!options.length ? (
              <Text style={[s.muted, { lineHeight: 22, paddingVertical: space.sm }]}>
                {t("modelSettings.noConfiguredModels")}
              </Text>
            ) : (
              options.map((provider) => (
                <View key={provider.provider} style={{ gap: 7 }}>
                  <Text style={[s.small, { fontWeight: "600", color: colors.text }]}>
                    {provider.label}
                  </Text>
                  <View
                    style={{
                      overflow: "hidden",
                      borderWidth: 1,
                      borderColor: colors.line,
                      borderRadius: radius.panel,
                      backgroundColor: colors.paper,
                    }}
                  >
                    {provider.models.map((model, index) => {
                      const selected = model === current;
                      const pending = pendingModel === model;
                      return (
                        <Pressable
                          key={model}
                          accessibilityRole="button"
                          accessibilityState={{
                            selected,
                            disabled: blocked,
                            busy: pending,
                          }}
                          disabled={blocked}
                          onPress={() => void select(model)}
                          style={({ pressed }) => [
                            s.between,
                            {
                              minHeight: 54,
                              gap: space.sm,
                              paddingHorizontal: space.md,
                              paddingVertical: space.sm,
                              borderBottomWidth: index < provider.models.length - 1 ? 1 : 0,
                              borderBottomColor: colors.lineSoft,
                              backgroundColor: selected
                                ? colors.sky
                                : pressed
                                  ? colors.overlay1
                                  : colors.paper,
                            },
                          ]}
                        >
                          <Text
                            style={{
                              flex: 1,
                              fontSize: 15,
                              lineHeight: 23,
                              fontWeight: selected ? "600" : "500",
                              color: colors.text,
                              fontFamily: fonts.sans,
                            }}
                          >
                            {label(model)}
                          </Text>
                          {pending ? (
                            <ActivityIndicator size="small" color={colors.primary} />
                          ) : selected ? (
                            <Check size={17} color={colors.primaryStrong} />
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))
            )}
            <Button icon={Settings2} onPress={manage} style={{ minHeight: 48 }}>
              {t("modelSettings.manage")}
            </Button>
          </View>
        </Sheet>
      )}
    </View>
  );
}
