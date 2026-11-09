import { useCallback, useEffect, useSyncExternalStore } from "react";
import { Modal, Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import type { ActionProposal } from "../../../packages/domain/src";
import type { AgentTask } from "../../../packages/domain/src/agent";
import { useAgentSpace } from "./agent-space";
import { useAgentWorkspace } from "./agent-workspace";
import { Text } from "./app-text";
import { ApprovalCard } from "./approval-card";
import { selectBotResources } from "./bot-resources";
import { activeLocaleTag, useTranslation } from "./i18n";
import { X } from "./icons";
import { queuedBriefSnapshot, subscribeQueuedBriefs } from "./queued-brief";
import { QueuedBriefCard } from "./queued-brief-card";
import { colors, radius, shadow } from "./theme";
import { TaskThreadCard } from "./thread-artifacts";
import { useWorkspace } from "./workspace";

export type WorkAnchor = { x: number; y: number; width: number; height: number };

/** 头顶胶囊点开的对话框：只放这个 Agent 的委派任务，按创建时间从新到旧。 */
export function AgentWorkDialog({ anchor, onClose }: { anchor: WorkAnchor; onClose: () => void }) {
  const { t } = useTranslation();
  const { width, height } = useWindowDimensions();
  const { current } = useAgentSpace();
  const briefs = useSyncExternalStore(
    subscribeQueuedBriefs,
    queuedBriefSnapshot,
    queuedBriefSnapshot,
  );
  const { api, workspace, refresh, open } = useWorkspace();
  const { data, refresh: refreshAgent } = useAgentWorkspace();
  const tasks = [...selectBotResources(current, data, workspace.files).tasks].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  const panelWidth = Math.min(440, width - 24);
  const left = Math.max(
    12,
    Math.min(anchor.x + anchor.width / 2 - panelWidth / 2, width - panelWidth - 12),
  );
  const top = anchor.y + anchor.height + 8;
  const maxHeight = Math.max(220, Math.min(640, height - top - 16));

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

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("ui.closeDetails")}
          onPress={onClose}
          style={{ flex: 1 }}
        />
        <View
          style={{
            position: "absolute",
            top,
            left,
            width: panelWidth,
            maxHeight,
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
              <Text
                style={{ fontSize: 16, lineHeight: 24, fontWeight: "600", color: colors.heading }}
              >
                {t("agentSpace.delegatedWork")}
              </Text>
              <Text style={{ fontSize: 12, lineHeight: 18, color: colors.muted }}>
                {current.name} · {t("agentSpace.delegatedWorkHint")}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("ui.closeDetails")}
              onPress={onClose}
              style={({ pressed }) => ({
                width: 28,
                height: 28,
                borderRadius: radius.control,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: pressed ? colors.overlay1 : "transparent",
              })}
            >
              <X size={16} color={colors.muted} />
            </Pressable>
          </View>
          <ScrollView
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 14, gap: 14 }}
          >
            {tasks.length === 0 ? (
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
            ) : (
              tasks.map((task) => (
                <WorkEntry
                  key={task.id}
                  task={task}
                  brief={briefs.get(task.id)}
                  actions={workspace.actions.filter(
                    (action) => action.taskId === task.id || task.actionId === action.id,
                  )}
                  agentName={current.name}
                  files={workspace.files}
                  onDecide={decideAction}
                  onOpenDetails={(action) => open({ type: "review", action })}
                />
              ))
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function WorkEntry({
  task,
  brief,
  actions,
  agentName,
  files,
  onDecide,
  onOpenDetails,
}: {
  task: AgentTask;
  brief?: { headline: string; body: string };
  actions: ActionProposal[];
  agentName: string;
  files: ReturnType<typeof useWorkspace>["workspace"]["files"];
  onDecide: (action: ActionProposal, decision: "approve" | "deny") => Promise<ActionProposal>;
  onOpenDetails: (action: ActionProposal) => void;
}) {
  const { t } = useTranslation();
  const when = new Date(task.createdAt).toLocaleString(activeLocaleTag(), {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const headline = brief?.headline ?? `${t("chat.queuedBrief")} · ${task.title}`;
  const body = brief?.body || task.prompt;
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ paddingHorizontal: 4, fontSize: 12, lineHeight: 18, color: colors.muted }}>
        {when}
      </Text>
      <QueuedBriefCard headline={headline} body={body} files={files} />
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
      <TaskThreadCard task={task} />
    </View>
  );
}
