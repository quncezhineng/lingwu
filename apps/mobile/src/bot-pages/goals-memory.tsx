import { useState } from "react";
import { Pressable, View } from "react-native";
import { GoalCard, GoalForm } from "../agent-ui";
import { useAgentWorkspace } from "../agent-workspace";
import { Text } from "../app-text";
import { HubTabs } from "../hub-tabs";
import { useTranslation } from "../i18n";
import { ChevronRight, Plus } from "../icons";
import { PreferencesScreen } from "../preferences-screen";
import { Button, colors, s } from "../ui";
import { BotEmpty, BotInlineBack, BotPage, type BotPageProps } from "./shared";

/** Account goals and memories are maintained here, independently of Bot identity. */
export function BotGoalsMemoryPage({ onClose, embedded }: BotPageProps) {
  const { t } = useTranslation();
  const { data } = useAgentWorkspace();
  const [tab, setTab] = useState<"goals" | "memories">("goals");
  const [addingGoal, setAddingGoal] = useState(false);
  const [goalId, setGoalId] = useState<string>();
  const goal = data?.goals.find((item) => item.id === goalId);
  if (addingGoal)
    return (
      <BotPage
        title={t("agent.createGoal")}
        onClose={() => setAddingGoal(false)}
        embedded={embedded}
      >
        {embedded && (
          <BotInlineBack label={t("common.back")} onPress={() => setAddingGoal(false)} />
        )}
        <GoalForm onDone={() => setAddingGoal(false)} />
      </BotPage>
    );
  if (goal)
    return (
      <BotPage title={goal.title} onClose={() => setGoalId(undefined)} embedded={embedded}>
        {embedded && (
          <BotInlineBack label={t("common.back")} onPress={() => setGoalId(undefined)} />
        )}
        <GoalCard goal={goal} onOpenTask={() => setGoalId(undefined)} />
      </BotPage>
    );
  return (
    <BotPage
      title={t("agentSpace.goalsMemory")}
      subtitle={t("agentSpace.sharedGoalsMemory")}
      onClose={onClose}
      embedded={embedded}
    >
      <View style={{ gap: 16 }}>
        <HubTabs
          active={tab}
          onChange={setTab}
          items={[
            { id: "goals", label: t("agent.goalsTab"), count: data?.goals.length ?? 0 },
            { id: "memories", label: t("agent.memory"), count: data?.memories.length ?? 0 },
          ]}
        />
        {tab === "goals" ? (
          <View style={{ gap: 12 }}>
            {(data?.goals ?? []).map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                onPress={() => setGoalId(item.id)}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  minHeight: 58,
                  padding: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.line,
                  backgroundColor: pressed ? colors.surface : colors.paper,
                })}
              >
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={s.text}>{item.title}</Text>
                  <Text style={s.small}>{item.description}</Text>
                </View>
                <ChevronRight size={16} color={colors.faint} />
              </Pressable>
            ))}
            {!data?.goals.length && <BotEmpty>{t("agent.goalsEmpty")}</BotEmpty>}
            <Button primary icon={Plus} onPress={() => setAddingGoal(true)}>
              {t("agent.createGoal")}
            </Button>
          </View>
        ) : (
          <PreferencesScreen embedded />
        )}
      </View>
    </BotPage>
  );
}
