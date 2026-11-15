import { ScrollView, View } from "react-native";
import type {
  OrchestrationNode,
  OrchestrationPlan,
} from "../../../packages/domain/src/orchestration";
import { Text } from "./app-text";
import { useTranslation } from "./i18n";
import { Check, X } from "./icons";
import { colors, radius, s } from "./ui";

/**
 * 编排进度呈现（M2）。
 *
 * 把一个 OrchestrationPlan 的 DAG 节点按提交顺序渲染成进度列表：每个节点显示
 * 标题 + 状态（等待/排队/进行中/完成/失败/跳过）。计划终态后展示汇总研报。
 */
export function OrchestrationProgressCard({ plan }: { plan: OrchestrationPlan }) {
  const { t } = useTranslation();
  const done = plan.status === "succeeded" || plan.status === "failed";

  return (
    <View style={{ gap: 14 }}>
      <View style={[s.row, { alignItems: "center", gap: 10 }]}>
        <PlanStatusIcon status={plan.status} />
        <View style={{ flex: 1 }}>
          <Text style={[s.text, { fontWeight: "600" }]}>{planTitle(plan.status, t)}</Text>
          <Text style={[s.small, { color: colors.faint }]}>
            {t("channels.researchProgressDetail")}
          </Text>
        </View>
      </View>

      <ScrollView style={{ maxHeight: 320 }}>
        <View style={{ gap: 6 }}>
          {plan.nodes.map((node) => (
            <NodeRow key={node.id} node={node} />
          ))}
        </View>
      </ScrollView>

      {done && plan.result ? (
        <View
          style={{
            gap: 8,
            padding: 12,
            borderRadius: radius.card,
            borderWidth: 1,
            borderColor: colors.line,
            backgroundColor: colors.paper,
          }}
        >
          <Text style={[s.label, { fontWeight: "700" }]}>{t("channels.resultLabel")}</Text>
          <Text style={s.text}>{plan.result}</Text>
        </View>
      ) : null}
    </View>
  );
}

function planTitle(status: OrchestrationPlan["status"], t: ReturnType<typeof useTranslation>["t"]) {
  switch (status) {
    case "succeeded":
      return t("channels.planSucceeded");
    case "failed":
      return t("channels.planFailed");
    default:
      return t("channels.planRunning");
  }
}

function PlanStatusIcon({ status }: { status: OrchestrationPlan["status"] }) {
  if (status === "succeeded") return <Check size={18} color={colors.success} />;
  if (status === "failed") return <X size={18} color={colors.danger} />;
  return (
    <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary }} />
  );
}

function NodeRow({ node }: { node: OrchestrationNode }) {
  const { t } = useTranslation();
  const { label, color } = nodeStatus(node.status, t);
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: radius.control,
        backgroundColor: colors.surface,
      }}
    >
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[s.text, { fontWeight: "500" }]} numberOfLines={1}>
          {node.title}
        </Text>
        <Text style={[s.small, { color: colors.faint }]} numberOfLines={1}>
          {node.agentTemplate}
        </Text>
      </View>
      <Text style={[s.small, { color }]}>{label}</Text>
    </View>
  );
}

/**
 * 编排拆解预览（M2）：编排者刚调用 submit_orchestration 时，展示拆出的 DAG 节点清单。
 * 此时节点尚未落盘、无实时状态，统一显示「等待中」。
 */
export function OrchestrationNodeList({ nodes }: { nodes: OrchestrationNode[] }) {
  const { t } = useTranslation();
  return (
    <View style={{ gap: 6 }}>
      {nodes.map((node) => (
        <NodeRow key={node.id} node={{ ...node, status: "pending" }} />
      ))}
      <Text style={[s.small, { color: colors.faint, marginTop: 4 }]}>
        {t("channels.researchProgressDetail")}
      </Text>
    </View>
  );
}

function nodeStatus(
  status: OrchestrationNode["status"],
  t: ReturnType<typeof useTranslation>["t"],
): { label: string; color: string } {
  switch (status) {
    case "pending":
      return { label: t("channels.nodePending"), color: colors.muted };
    case "queued":
      return { label: t("channels.nodeQueued"), color: colors.muted };
    case "running":
      return { label: t("channels.nodeRunning"), color: colors.primary };
    case "succeeded":
      return { label: t("channels.nodeSucceeded"), color: colors.success };
    case "failed":
      return { label: t("channels.nodeFailed"), color: colors.danger };
    case "skipped":
      return { label: t("channels.nodeSkipped"), color: colors.faint };
  }
}
