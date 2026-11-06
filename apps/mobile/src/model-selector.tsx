import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { Text } from "./app-text";
import { useTranslation } from "./i18n";
import { Check, ChevronDown, Cpu, Settings2 } from "./icons";
import { Button, colors, fonts, radius, Sheet, s, space } from "./ui";
import { useWorkspace } from "./workspace";

/**
 * 模型选择入口。凭据始终在「我的设置」里维护。
 *
 * 默认写回用户自己的模型选择；传入 `onSelect` 后改为受控模式，
 * 由调用方保存（例如把它存成某个 Agent 的专属模型）。
 */
export function ModelSelector({
  disabled = false,
  onManage,
  value,
  onSelect,
  inheritLabel,
}: {
  disabled?: boolean;
  onManage?: () => void;
  /** 受控模式的当前模型；不传表示跟随默认模型。 */
  value?: string;
  /** 受控模式的选择回调；`undefined` 表示恢复跟随默认模型。 */
  onSelect?: (model?: string) => void;
  /** 受控模式下「跟随默认模型」这一项的文案。 */
  inheritLabel?: string;
}) {
  const { workspace, api, refresh, notify, open } = useWorkspace();
  const { t } = useTranslation();
  const controlled = Boolean(onSelect);
  const [userModel, setUserModel] = useState(workspace.runtime.model);
  const [busy, setBusy] = useState(false);
  const [pendingModel, setPendingModel] = useState<string>();
  const [expanded, setExpanded] = useState(false);
  const options = workspace.runtime.modelOptions ?? [];
  const label = (model: string) =>
    workspace.runtime.modelLabels?.[model] ?? (model.split("/").slice(1).join("/") || model);
  const current = controlled ? value : userModel;
  // 没有单独指定模型时，实际使用的就是工作区默认模型，列表里把那一条打勾。
  const checkedModel = current ?? workspace.runtime.model;
  const title = current
    ? label(current)
    : controlled && inheritLabel
      ? inheritLabel
      : t("modelSettings.selectModel");
  const blocked = disabled || busy;

  useEffect(() => setUserModel(workspace.runtime.model), [workspace.runtime.model]);
  useEffect(() => {
    if (disabled) setExpanded(false);
  }, [disabled]);

  /**
   * 只叠一层「模型管理」浮层，不切换底层页面：
   * 从 Agent 详情等任意位置进来，关掉浮层都应回到原页面，而不是被带到账号页。
   */
  function manage() {
    setExpanded(false);
    onManage?.();
    open({ type: "model-settings" });
  }

  async function select(model?: string) {
    if (blocked) return;
    if (controlled) {
      // 未指定专属模型时默认项已经是当前选择，点它不产生变化。
      if (model === value || (value === undefined && model === checkedModel)) return;
      setExpanded(false);
      onSelect?.(model);
      return;
    }
    if (!model || model === userModel) return;
    setBusy(true);
    setPendingModel(model);
    try {
      const result = await api.request<{ model: string }>("/api/model", { model });
      setUserModel(result.model);
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
              : controlled && inheritLabel
                ? inheritLabel
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
                    {provider.provider === "custom"
                      ? t("modelSettings.customProvider")
                      : provider.label}
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
                      const selected = model === checkedModel;
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
