/**
 * Today 的「待审批交付物」入口：展示 in_review 的交付物，
 * 点击进入交付物中心处理审批，避免审批只藏在二级页面里。
 */
import { useEffect } from "react";
import { Pressable, View } from "react-native";
import { Text } from "./app-text";
import { KIND_LABEL_KEYS, loadDeliverables, useDeliverablesState } from "./deliverables";
import type { TranslationKey } from "./i18n";
import { useTranslation } from "./i18n";
import { ShieldCheck } from "./icons";
import { colors, Empty, SectionHeading, s } from "./ui";
import { useWorkspace } from "./workspace";

export function DeliverableTodayCard() {
  const { api, navigate } = useWorkspace();
  const { t } = useTranslation();
  const state = useDeliverablesState();
  const pending = state.items.filter((item) => item.status === "in_review");

  useEffect(() => {
    void loadDeliverables(api, true);
  }, [api]);

  return (
    <View style={[s.card, { gap: 12 }]}>
      <SectionHeading
        title={t("screens.deliverableTodayHeading")}
        count={pending.length || undefined}
        action={t("screens.deliverableTodayAction")}
        onPress={() => navigate("deliverables")}
      />
      {pending.length === 0 ? (
        <Empty
          icon={ShieldCheck}
          title={t("screens.deliverableTodayEmptyTitle")}
          detail={t("screens.deliverableTodayEmptyDetail")}
        />
      ) : (
        <View style={{ gap: 8 }}>
          {pending.slice(0, 3).map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              onPress={() => navigate("deliverables")}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                paddingVertical: 8,
                paddingHorizontal: 10,
                borderRadius: 8,
                backgroundColor: pressed ? colors.overlay1 : "transparent",
              })}
            >
              <View
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: colors.surface,
                }}
              >
                <ShieldCheck size={15} color={colors.primary} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={{ fontSize: 13, fontWeight: "600", color: colors.text }}
                  numberOfLines={1}
                >
                  {item.title}
                </Text>
                <Text style={s.small} numberOfLines={1}>
                  {t(KIND_LABEL_KEYS[item.kind] as TranslationKey)} · v{item.version}
                </Text>
              </View>
              <Text style={[s.small, { color: colors.primaryStrong }]}>
                {t("screens.deliverableReview")}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
