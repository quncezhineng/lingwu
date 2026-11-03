import { type ReactNode, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { agentLayout } from "./agent-layout";
import { AgentOrb } from "./agent-orb";
import { useAgentSpace } from "./agent-space";
import type { AgentAvatarId } from "./agent-space-model";
import { Text, TextInput } from "./app-text";
import { useTranslation } from "./i18n";
import { ArrowRight, Check, ChevronDown, ChevronLeft } from "./icons";
import { Button, colors, fonts, radius, s } from "./ui";

const AVATARS: AgentAvatarId[] = ["orb", "bloom", "moon", "planet", "cat"];
const MARKETS = ["A股", "港股", "美股", "基金"];
const AREAS = ["宽基ETF", "科技", "消费", "医药", "红利", "黄金"];
const HORIZONS = ["1—2年", "3年以上", "还不确定"];
const GOALS = [
  ["为长期积累做准备", "goalLongTerm"],
  ["持续跟踪重点标的", "goalTrack"],
  ["建立投资习惯", "goalHabit"],
  ["先学习，再做判断", "goalLearn"],
] as const;

function ChoiceRow({
  selected,
  onPress,
  title,
  detail,
  roomy = false,
}: {
  selected: boolean;
  onPress: () => void;
  title: string;
  detail?: string;
  roomy?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: roomy ? 56 : 47,
        paddingHorizontal: roomy ? 16 : 13,
        paddingVertical: roomy ? 14 : 12,
        borderRadius: roomy ? 15 : 13,
        borderWidth: 1,
        borderColor: selected ? colors.primary : colors.line,
        backgroundColor: selected ? colors.sky : pressed ? colors.surface : colors.paper,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
      })}
    >
      <View style={{ flex: 1, gap: 3 }}>
        <Text
          style={[
            s.text,
            { fontSize: roomy ? 13 : 12, lineHeight: roomy ? 20 : 18, fontWeight: "500" },
          ]}
        >
          {title}
        </Text>
        {!!detail && <Text style={s.small}>{detail}</Text>}
      </View>
      <View
        style={{
          width: 16,
          height: 16,
          borderRadius: radius.full,
          borderWidth: 1,
          borderColor: selected ? colors.primary : colors.lineStrong,
          backgroundColor: selected ? colors.primary : colors.paper,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {selected && <Check size={12} color={colors.onPrimary} />}
      </View>
    </Pressable>
  );
}

function Chip({
  label,
  selected,
  onPress,
  roomy = false,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  roomy?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: roomy ? 17 : 14,
        paddingVertical: roomy ? 10 : 9,
        minHeight: roomy ? 44 : 38,
        borderRadius: radius.full,
        borderWidth: 1,
        borderColor: selected ? colors.primary : colors.line,
        backgroundColor: selected ? colors.sky : pressed ? colors.surface : colors.paper,
      })}
    >
      <Text
        style={{
          fontSize: roomy ? 13 : 12,
          lineHeight: roomy ? 20 : 18,
          color: selected ? colors.primaryStrong : colors.muted,
          fontWeight: selected ? "600" : "500",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function OptionalSection({ title, children }: { title: string; children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <View style={{ gap: 10 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded(!expanded)}
        style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8 }}
      >
        <View style={{ transform: [{ rotate: expanded ? "180deg" : "0deg" }] }}>
          <ChevronDown size={13} color={colors.faint} />
        </View>
        <Text style={{ fontSize: 10, lineHeight: 18, color: colors.faint }}>{title}</Text>
      </Pressable>
      {expanded && children}
    </View>
  );
}

export function AgentOnboarding() {
  const { t } = useTranslation();
  const {
    state,
    current,
    preferences,
    advanceOnboarding,
    finishOnboarding,
    setPreferences,
    updateAgent,
  } = useAgentSpace();
  const { width } = useWindowDimensions();
  const compact = width < 600;
  const roomy = !compact;
  const scroll = useRef<ScrollView>(null);
  const step = state.onboardingStep;
  const [viewportHeight, setViewportHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const [agentName, setAgentName] = useState(current.name);
  const [avatar, setAvatar] = useState<AgentAvatarId>(current.avatar);
  const [userName, setUserName] = useState(preferences.name);
  const [goal, setGoal] = useState(() =>
    GOALS.some(([value]) => value === preferences.goal) ? "" : preferences.goal,
  );

  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, [step]);

  const previousAnswer = [
    undefined,
    current.name,
    preferences.name,
    preferences.risk,
    preferences.markets.join("、") || t("agentSpace.marketsLater"),
  ][step];

  const risks = [
    ["稳健一些", "riskSteady", "riskSteadyDetail"],
    ["均衡一些", "riskBalanced", "riskBalancedDetail"],
    ["更积极一些", "riskActive", "riskActiveDetail"],
    ["还不确定", "riskUnsure", "riskUnsureDetail"],
  ] as const;
  const canContinue =
    step === 0
      ? agentName.trim().length > 0
      : step === 1
        ? userName.trim().length > 0
        : step === 2
          ? !!preferences.risk
          : step === 4
            ? !!preferences.goal
            : true;

  function toggle(list: string[], value: string) {
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  }

  function next() {
    if (!canContinue) return;
    if (step === 0) {
      // The provider owns the Agent registry; update the draft name immediately so
      // the next two steps can address the user's chosen Agent.
      updateAgent(current.id, { name: agentName.trim(), avatar });
    }
    if (step === 1) setPreferences({ name: userName.trim() || "朋友" });
    if (step === 4) {
      finishOnboarding({ goal: goal.trim() || preferences.goal });
      return;
    }
    advanceOnboarding(step + 1);
  }

  const centerPadding =
    contentHeight > 0 && viewportHeight > contentHeight ? (viewportHeight - contentHeight) / 2 : 0;
  const paddingTop = Math.max(compact ? 24 : 56, centerPadding);
  const paddingBottom = Math.max(compact ? 32 : 48, centerPadding);

  return (
    <View
      style={{ flex: 1 }}
      onLayout={(event) => setViewportHeight(event.nativeEvent.layout.height)}
    >
      <ScrollView
        ref={scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          width: "100%",
          alignItems: "center",
          paddingTop,
          paddingBottom,
        }}
      >
        <View
          style={{
            width: "100%",
            maxWidth: agentLayout.onboardingMaxWidth,
            paddingHorizontal: agentLayout.pagePadding,
          }}
          onLayout={(event) => setContentHeight(event.nativeEvent.layout.height)}
        >
          <View style={[s.between, { marginBottom: compact ? 23 : 34, gap: 12 }]}>
            {step > 0 && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("common.back")}
                onPress={() => advanceOnboarding(step - 1)}
                style={{ paddingVertical: 6, paddingRight: 4 }}
              >
                <ChevronLeft size={16} color={colors.faint} />
              </Pressable>
            )}
            <Text style={{ fontSize: 9, lineHeight: 14, color: colors.faint, flex: 1 }}>
              {t("agentSpace.onboardingProgress", { step: step + 1 })}
            </Text>
            <View style={{ flexDirection: "row", gap: 4 }}>
              {[0, 1, 2, 3, 4].map((index) => (
                <View
                  key={index}
                  style={{
                    width: 15,
                    height: 3,
                    borderRadius: 4,
                    backgroundColor: index <= step ? colors.primary : colors.line,
                  }}
                />
              ))}
            </View>
          </View>

          {!!previousAnswer && (
            <View
              style={{
                alignSelf: "flex-end",
                maxWidth: "86%",
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 16,
                borderBottomRightRadius: 5,
                backgroundColor: colors.surface,
                marginBottom: compact ? 25 : 32,
              }}
            >
              <Text style={{ fontSize: 11, lineHeight: 20, color: colors.muted }}>
                {previousAnswer}
              </Text>
            </View>
          )}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              marginBottom: compact ? 11 : 15,
            }}
          >
            <AgentOrb avatar={avatar} size={compact ? 14 : 18} />
            <Text style={{ fontSize: compact ? 10 : 11, color: colors.faint }}>{current.name}</Text>
          </View>
          <Text
            style={{
              color: colors.text,
              fontSize: compact ? 15 : 18,
              lineHeight: compact ? 28 : 32,
              fontWeight: "400",
              fontFamily: fonts.sans,
              letterSpacing: 0.1,
              marginBottom: compact ? 17 : 24,
              maxWidth: agentLayout.onboardingMaxWidth - agentLayout.pagePadding * 2,
            }}
          >
            {step === 0
              ? t("agentSpace.onboardingIntro")
              : step === 1
                ? t("agentSpace.onboardingUserName", { name: current.name })
                : step === 2
                  ? t("agentSpace.onboardingRisk", { name: preferences.name || "朋友" })
                  : step === 3
                    ? t("agentSpace.onboardingMarkets")
                    : t("agentSpace.onboardingGoal")}
          </Text>

          <View
            style={{
              backgroundColor: colors.paper,
              borderWidth: 1,
              borderColor: colors.line,
              borderRadius: compact ? 23 : 26,
              paddingHorizontal: compact ? 18 : 34,
              paddingVertical: compact ? 20 : 32,
              gap: compact ? 12 : 20,
              minHeight: compact ? undefined : 430,
            }}
          >
            {step === 0 && (
              <>
                <View style={{ alignItems: "center" }}>
                  <AgentOrb avatar={avatar} size={compact ? 65 : 88} />
                </View>
                <Text style={[s.small, { fontWeight: "600", color: colors.text }]}>
                  {t("agentSpace.onboardingName")}
                </Text>
                <TextInput
                  value={agentName}
                  onChangeText={setAgentName}
                  maxLength={20}
                  accessibilityLabel={t("agentSpace.onboardingName")}
                  placeholder={t("agentSpace.onboardingName")}
                  placeholderTextColor={colors.faint}
                  style={[
                    s.input,
                    {
                      minHeight: compact ? 48 : 56,
                      borderRadius: compact ? 13 : 15,
                      textAlign: "center",
                      fontSize: compact ? 16 : 18,
                      fontWeight: "600",
                      color: colors.primaryStrong,
                    },
                  ]}
                />
                <Text style={[s.small, { color: colors.faint }]}>{t("agentSpace.avatar")}</Text>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "center",
                    gap: width < 360 ? 6 : compact ? 7 : 14,
                  }}
                >
                  {AVATARS.map((item) => (
                    <Pressable
                      key={item}
                      accessibilityRole="radio"
                      accessibilityLabel={`${t("agentSpace.avatar")} ${item}`}
                      accessibilityState={{ checked: avatar === item }}
                      onPress={() => setAvatar(item)}
                      style={{
                        width: width < 360 ? 40 : compact ? 43 : 54,
                        height: width < 360 ? 40 : compact ? 43 : 54,
                        borderRadius: radius.full,
                        alignItems: "center",
                        justifyContent: "center",
                        borderWidth: avatar === item ? 1.5 : 1,
                        borderColor: avatar === item ? colors.primary : colors.line,
                        backgroundColor: avatar === item ? colors.sky : colors.paper,
                      }}
                    >
                      <AgentOrb avatar={item} size={compact ? 31 : 39} />
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            {step === 1 && (
              <>
                <Text style={[s.small, { fontWeight: "600", color: colors.text }]}>
                  {t("agentSpace.yourName")}
                </Text>
                <TextInput
                  value={userName}
                  onChangeText={setUserName}
                  maxLength={20}
                  accessibilityLabel={t("agentSpace.yourName")}
                  placeholder={t("agentSpace.nicknamePlaceholder")}
                  placeholderTextColor={colors.faint}
                  style={[
                    s.input,
                    {
                      textAlign: "center",
                      fontSize: compact ? 17 : 19,
                      minHeight: compact ? 44 : 56,
                    },
                  ]}
                />
                <Button
                  onPress={() => {
                    setUserName("朋友");
                    setPreferences({ name: "朋友" });
                    advanceOnboarding(2);
                  }}
                >
                  {t("agentSpace.nicknameLater")}
                </Button>
              </>
            )}

            {step === 2 && (
              <View style={{ gap: compact ? 8 : 10 }}>
                {risks.map(([value, titleKey, detailKey]) => (
                  <ChoiceRow
                    key={value}
                    selected={preferences.risk === value}
                    onPress={() => setPreferences({ risk: value })}
                    title={t(`agentSpace.${titleKey}` as "agentSpace.riskSteady")}
                    detail={t(`agentSpace.${detailKey}` as "agentSpace.riskSteadyDetail")}
                    roomy={roomy}
                  />
                ))}
              </View>
            )}

            {step === 3 && (
              <>
                <Text style={[s.small, { fontWeight: "600", color: colors.text }]}>
                  {t("agentSpace.markets")}
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: compact ? 8 : 10 }}>
                  {MARKETS.map((value) => (
                    <Chip
                      key={value}
                      label={value}
                      selected={preferences.markets.includes(value)}
                      onPress={() =>
                        setPreferences({ markets: toggle(preferences.markets, value) })
                      }
                      roomy={roomy}
                    />
                  ))}
                </View>
                <OptionalSection title={t("agentSpace.areas")}>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: compact ? 8 : 10 }}>
                    {AREAS.map((value) => (
                      <Chip
                        key={value}
                        label={value}
                        selected={preferences.areas.includes(value)}
                        onPress={() => setPreferences({ areas: toggle(preferences.areas, value) })}
                        roomy={roomy}
                      />
                    ))}
                  </View>
                </OptionalSection>
                <Button onPress={() => advanceOnboarding(4)}>{t("agentSpace.marketsLater")}</Button>
              </>
            )}

            {step === 4 && (
              <>
                <View style={{ gap: compact ? 8 : 10 }}>
                  {GOALS.map(([value, key]) => (
                    <ChoiceRow
                      key={value}
                      selected={preferences.goal === value}
                      onPress={() => {
                        setGoal("");
                        setPreferences({ goal: value });
                      }}
                      title={t(`agentSpace.${key}` as "agentSpace.goalLongTerm")}
                      roomy={roomy}
                    />
                  ))}
                </View>
                <Text style={[s.small, { fontWeight: "600", color: colors.text, marginTop: 5 }]}>
                  {t("agentSpace.customGoal")}
                </Text>
                <TextInput
                  value={goal}
                  onChangeText={(value) => {
                    setGoal(value);
                    setPreferences({ goal: value.trim() });
                  }}
                  maxLength={120}
                  placeholder={t("agentSpace.customGoalPlaceholder")}
                  placeholderTextColor={colors.faint}
                  style={s.input}
                />
                <OptionalSection title={t("agentSpace.horizon")}>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: compact ? 8 : 10 }}>
                    {HORIZONS.map((value) => (
                      <Chip
                        key={value}
                        label={value}
                        selected={preferences.horizon === value}
                        onPress={() => setPreferences({ horizon: value })}
                        roomy={roomy}
                      />
                    ))}
                  </View>
                </OptionalSection>
              </>
            )}

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !canContinue }}
              disabled={!canContinue}
              onPress={next}
              style={({ pressed }) => ({
                minHeight: compact ? 46 : 54,
                marginTop: compact ? 9 : 16,
                borderRadius: compact ? 15 : 17,
                backgroundColor: colors.primaryAction,
                opacity: !canContinue ? 0.5 : pressed ? 0.85 : 1,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: compact ? 7 : 9,
              })}
            >
              <Text
                style={{
                  fontSize: compact ? 12 : 13,
                  fontWeight: "500",
                  color: colors.onPrimary,
                }}
              >
                {step === 4
                  ? t("agentSpace.finishOnboarding", { name: current.name })
                  : t("agentSpace.continue")}
              </Text>
              <ArrowRight size={14} color={colors.onPrimary} />
            </Pressable>
          </View>
          <Text
            style={[
              s.small,
              {
                fontSize: compact ? 9 : 10,
                lineHeight: compact ? 17 : 19,
                textAlign: "center",
                color: colors.faint,
                marginTop: compact ? 17 : 24,
              },
            ]}
          >
            {t("agentSpace.onboardingFootnote")}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
