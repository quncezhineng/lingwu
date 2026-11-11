import { useCallback, useEffect, useMemo } from "react";
import { Platform, Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import type { ActionProposal } from "../../../packages/domain/src";
import type { AgentTask } from "../../../packages/domain/src/agent";
import { useAgentSpace } from "./agent-space";
import { useAgentWorkspace } from "./agent-workspace";
import { Text } from "./app-text";
import { ApprovalCard } from "./approval-card";
import { selectBotResources } from "./bot-resources";
import { activeLocaleTag, useTranslation } from "./i18n";
import { X } from "./icons";
import { ModalOverlay } from "./modal-overlay";
import { delegatedSectionTitle } from "./plan-card";
import { colors, radius, shadow } from "./theme";
import { TaskThreadCard } from "./thread-artifacts";
import { s } from "./ui";
import { useWorkspace } from "./workspace";

function useAgentWorkData() {
  const { current } = useAgentSpace();
  const { api, workspace, refresh, open } = useWorkspace();
  const { data, refresh: refreshAgent } = useAgentWorkspace();
  const tasks = useMemo(
    () =>
      [...selectBotResources(current, data, workspace.files).tasks].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      ),
    [current, data, workspace.files],
  );

  useEffect(() => {
    void refresh().catch(() => {});
    void refreshAgent().catch(() => {});
  }, [refresh, refreshAgent]);

  const decideAction = useCallback(
    async (action: ActionProposal, decision: "approve" | "deny") => {
      const result = await api.request<ActionProposal>(`/api/actions/${action.id}/decide`, {
        decision,
        hash: action.hash,
      });
      await Promise.all([refresh().catch(() => {}), refreshAgent().catch(() => {})]);
      return result;
    },
    [api, refresh, refreshAgent],
  );

  return { current, workspace, tasks, decideAction, open };
}

/** 这个 Agent 交办的任务，按创建时间从新到旧。父级负责滚动。 */
export function AgentWorkList() {
  const { t } = useTranslation();
  const { current, workspace, tasks, decideAction, open } = useAgentWorkData();
  if (tasks.length === 0) {
    return (
      <Text
        style={{
          paddingHorizontal: 4,
          paddingVertical: 18,
          fontSize: 13,
          lineHeight: 20,
          color: colors.muted,
        }}
      >
        {t("agentSpace.noTasks")}
      </Text>
    );
  }
  return (
    <View style={{ gap: 14 }}>
      {tasks.map((task) => (
        <WorkEntry
          key={task.id}
          task={task}
          actions={workspace.actions.filter(
            (action) => action.taskId === task.id || task.actionId === action.id,
          )}
          agentName={current.name}
          files={workspace.files}
          onDecide={decideAction}
          onOpenDetails={(action) => open({ type: "review", action })}
        />
      ))}
    </View>
  );
}

/** 居中的完整委派列表。Esc、点遮罩、关闭按钮都可以收起。 */
export function AgentWorkModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { height } = useWindowDimensions();
  const listHeight = Math.max(280, Math.min(640, Math.round(height * 0.7)));
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  return (
    <ModalOverlay onRequestClose={onClose}>
      <Pressable accessibilityRole="button" onPress={onClose} style={s.modalShade}>
        <Pressable
          testID="agent-work-modal"
          accessibilityViewIsModal
          onPress={(event) => event.stopPropagation()}
          style={{
            width: "100%",
            maxWidth: 440,
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: radius.sheet,
            backgroundColor: colors.paper,
            overflow: "hidden",
            ...shadow.sheet,
          }}
        >
          <View
            style={{
              paddingHorizontal: 16,
              paddingTop: 14,
              paddingBottom: 10,
              flexDirection: "row",
              alignItems: "flex-start",
              gap: 12,
            }}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={delegatedSectionTitle}>{t("agentSpace.delegatedWork")}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("ui.closeDetails")}
              onPress={onClose}
              style={({ pressed }) => ({
                width: 28,
                height: 28,
                borderRadius: radius.full,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: pressed ? colors.overlay1 : "transparent",
              })}
            >
              <X size={16} color={colors.muted} />
            </Pressable>
          </View>
          <ScrollView
            style={{ maxHeight: listHeight }}
            contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 14 }}
          >
            <AgentWorkList />
          </ScrollView>
        </Pressable>
      </Pressable>
    </ModalOverlay>
  );
}

function WorkEntry({
  task,
  actions,
  agentName,
  files,
  onDecide,
  onOpenDetails,
}: {
  task: AgentTask;
  actions: ActionProposal[];
  agentName: string;
  files: ReturnType<typeof useWorkspace>["workspace"]["files"];
  onDecide: (action: ActionProposal, decision: "approve" | "deny") => Promise<ActionProposal>;
  onOpenDetails: (action: ActionProposal) => void;
}) {
  const when = new Date(task.createdAt).toLocaleString(activeLocaleTag(), {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ paddingHorizontal: 4, fontSize: 12, lineHeight: 18, color: colors.muted }}>
        {when}
      </Text>
      {actions.map((action) => (
        <ApprovalCard
          key={action.id}
          action={action}
          task={task}
          agentName={agentName}
          agentNameCustomized
          files={files}
          onDecide={onDecide}
          onOpenDetails={onOpenDetails}
        />
      ))}
      <TaskThreadCard task={task} quiet />
    </View>
  );
}
