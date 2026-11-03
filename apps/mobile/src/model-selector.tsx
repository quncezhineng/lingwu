import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { Text } from "./app-text";
import { useTranslation } from "./i18n";
import { Check, ChevronDown, Cpu, Settings2 } from "./icons";
import { Button, colors, fonts, radius, Sheet, s, space } from "./ui";
import { useWorkspace } from "./workspace";

/** Model selection in Bot management. Credentials stay in My settings. */
export function ModelSelector({
  disabled = false,
  onManage,
}: {
  disabled?: boolean;
  onManage?: () => void;
}) {
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
    onManage?.();
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
        <Cpu size={18} color={colors.primary} />
      )}
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text style={{ fontSize: 12, lineHeight: 18, fontWeight: "500", color: colors.text }}>
          {t("modelSettings.model")}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            fontSize: 11,
            lineHeight: 18,
            fontWeight: "400",
            color: colors.muted,
            fontFamily: fonts.sans,
          }}
        >
          {title}
        </Text>
      </View>
      <ChevronDown size={12} color={colors.faint} />
    </>
  );
  const triggerStyle = {
    minHeight: 58,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    opacity: blocked ? 0.55 : 1,
  };
  return (
    <View style={{ width: "100%", minWidth: 0 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("modelSettings.selectModel")}
        accessibilityValue={{ text: title }}
        accessibilityState={{ expanded, disabled: blocked, busy }}
        disabled={blocked}
        onPress={() => setExpanded(true)}
        style={({ pressed }) => [
          triggerStyle,
          { backgroundColor: pressed ? colors.overlay1 : colors.paper },
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
