import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from "react-native";
import { AgentOrb } from "./agent-orb";
import { useAgentSpace } from "./agent-space";
import type { AgentAvatarId } from "./agent-space-model";
import { useTranslation } from "./i18n";
import { ArrowRight, Check } from "./icons";
import { Button, colors, fonts, radius, s, space, typography } from "./ui";

const AVATARS: AgentAvatarId[] = ["orb", "bloom", "moon", "planet", "cat"];
const MARKETS = ["A股", "港股", "美股", "基金"];
const AREAS = ["宽基ETF", "科技", "消费", "医药", "红利", "黄金"];
const HORIZONS = ["1—2年", "3年以上", "还不确定"];

function ChoiceRow({
  selected,
  onPress,
  title,
  detail,
}: {
  selected: boolean;
  onPress: () => void;
  title: string;
  detail?: string;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 58,
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderRadius: radius.field,
        borderWidth: 1,
        borderColor: selected ? colors.primary : colors.line,
        backgroundColor: selected ? colors.sky : pressed ? colors.surface : colors.paper,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
      })}
    >
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={[s.text, { fontWeight: "600" }]}>{title}</Text>
        {!!detail && <Text style={s.small}>{detail}</Text>}
      </View>
      <View
        style={{
          width: 19,
          height: 19,
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
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: 14,
        paddingVertical: 9,
        minHeight: 38,
        borderRadius: radius.full,
        borderWidth: 1,
        borderColor: selected ? colors.primary : colors.line,
        backgroundColor: selected ? colors.sky : pressed ? colors.surface : colors.paper,
      })}
    >
      <Text
        style={{
          fontSize: 12,
          lineHeight: 18,
          color: selected ? colors.primaryStrong : colors.muted,
          fontWeight: selected ? "600" : "500",
        }}
      >
        {label}
      </Text>
    </Pressable>
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
  const compact = width < 700;
  const step = state.onboardingStep;
  const [agentName, setAgentName] = useState(current.name);
  const [avatar, setAvatar] = useState<AgentAvatarId>(current.avatar);
  const [userName, setUserName] = useState(preferences.name);
  const [goal, setGoal] = useState(preferences.goal);

  const risks = [
    ["稳健一些", "riskSteady", "riskSteadyDetail"],
    ["均衡一些", "riskBalanced", "riskBalancedDetail"],
    ["更积极一些", "riskActive", "riskActiveDetail"],
    ["还不确定", "riskUnsure", "riskUnsureDetail"],
  ] as const;
  const goals = [
    ["为长期积累做准备", "goalLongTerm"],
    ["持续跟踪重点标的", "goalTrack"],
    ["建立投资习惯", "goalHabit"],
    ["先学习，再做判断", "goalLearn"],
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
      finishOnboarding({ goal: goal.trim() });
      return;
    }
    advanceOnboarding(step + 1);
  }

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        flexGrow: 1,
        width: "100%",
        maxWidth: 720,
        alignSelf: "center",
        paddingHorizontal: compact ? space.pageMobile : space.page,
        paddingTop: compact ? 20 : 46,
        paddingBottom: 42,
        justifyContent: "center",
      }}
    >
      <View style={[s.between, { marginBottom: 26 }]}>
        <Text style={[typography.eyebrow, { color: colors.faint }]}>
          {t("agentSpace.onboardingProgress", { step: step + 1 })}
        </Text>
        <View style={{ flexDirection: "row", gap: 4 }}>
          {[0, 1, 2, 3, 4].map((index) => (
            <View
              key={index}
              style={{
                width: compact ? 17 : 24,
                height: 3,
                borderRadius: 4,
                backgroundColor: index <= step ? colors.primary : colors.line,
              }}
            />
          ))}
        </View>
      </View>

      <Text
        style={{
          color: colors.text,
          fontSize: compact ? 22 : 26,
          lineHeight: compact ? 34 : 40,
          fontWeight: "500",
          fontFamily: fonts.serif,
          letterSpacing: 0.1,
          marginBottom: 24,
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
          borderRadius: 20,
          padding: compact ? 18 : 24,
          gap: 16,
        }}
      >
        {step === 0 && (
          <>
            <View style={{ alignItems: "center" }}>
              <AgentOrb avatar={avatar} size={66} />
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
                  textAlign: "center",
                  fontSize: 18,
                  fontWeight: "600",
                  color: colors.primaryStrong,
                },
              ]}
            />
            <Text style={[s.small, { color: colors.faint }]}>{t("agentSpace.avatar")}</Text>
            <View style={{ flexDirection: "row", justifyContent: "center", gap: 9 }}>
              {AVATARS.map((item) => (
                <Pressable
                  key={item}
                  accessibilityRole="radio"
                  accessibilityLabel={`${t("agentSpace.avatar")} ${item}`}
                  accessibilityState={{ checked: avatar === item }}
                  onPress={() => setAvatar(item)}
                  style={{
                    width: 49,
                    height: 49,
                    borderRadius: radius.full,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: avatar === item ? 1.5 : 1,
                    borderColor: avatar === item ? colors.primary : colors.line,
                    backgroundColor: avatar === item ? colors.sky : colors.paper,
                  }}
                >
                  <AgentOrb avatar={item} size={34} />
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
              style={[s.input, { textAlign: "center", fontSize: 17 }]}
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
          <View style={{ gap: 8 }}>
            {risks.map(([value, titleKey, detailKey]) => (
              <ChoiceRow
                key={value}
                selected={preferences.risk === value}
                onPress={() => setPreferences({ risk: value })}
                title={t(`agentSpace.${titleKey}` as "agentSpace.riskSteady")}
                detail={t(`agentSpace.${detailKey}` as "agentSpace.riskSteadyDetail")}
              />
            ))}
          </View>
        )}

        {step === 3 && (
          <>
            <Text style={[s.small, { fontWeight: "600", color: colors.text }]}>
              {t("agentSpace.markets")}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {MARKETS.map((value) => (
                <Chip
                  key={value}
                  label={value}
                  selected={preferences.markets.includes(value)}
                  onPress={() => setPreferences({ markets: toggle(preferences.markets, value) })}
                />
              ))}
            </View>
            <Text style={[s.small, { fontWeight: "600", color: colors.text, marginTop: 5 }]}>
              {t("agentSpace.areas")}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {AREAS.map((value) => (
                <Chip
                  key={value}
                  label={value}
                  selected={preferences.areas.includes(value)}
                  onPress={() => setPreferences({ areas: toggle(preferences.areas, value) })}
                />
              ))}
            </View>
            <Button onPress={() => advanceOnboarding(4)}>{t("agentSpace.marketsLater")}</Button>
          </>
        )}

        {step === 4 && (
          <>
            <View style={{ gap: 8 }}>
              {goals.map(([value, key]) => (
                <ChoiceRow
                  key={value}
                  selected={preferences.goal === value}
                  onPress={() => {
                    setGoal(value);
                    setPreferences({ goal: value });
                  }}
                  title={t(`agentSpace.${key}` as "agentSpace.goalLongTerm")}
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
                setPreferences({ goal: value });
              }}
              maxLength={120}
              placeholder={t("agentSpace.customGoalPlaceholder")}
              placeholderTextColor={colors.faint}
              style={s.input}
            />
            <Text style={[s.small, { fontWeight: "600", color: colors.text }]}>
              {t("agentSpace.horizon")}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {HORIZONS.map((value) => (
                <Chip
                  key={value}
                  label={value}
                  selected={preferences.horizon === value}
                  onPress={() => setPreferences({ horizon: value })}
                />
              ))}
            </View>
          </>
        )}

        <Button
          primary
          disabled={!canContinue}
          onPress={next}
          style={{ minHeight: 48, marginTop: 4 }}
          icon={step === 4 ? undefined : ArrowRight}
        >
          {step === 4
            ? t("agentSpace.finishOnboarding", { name: current.name })
            : t("agentSpace.continue")}
        </Button>
      </View>
      <Text style={[s.small, { textAlign: "center", color: colors.faint, marginTop: 16 }]}>
        {t("agentSpace.onboardingFootnote")}
      </Text>
    </ScrollView>
  );
}
