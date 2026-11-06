import { View } from "react-native";
import { useAgentSpace } from "../agent-space";
import { Text } from "../app-text";
import { connectorOptions } from "../capability-picker";
import { useTranslation } from "../i18n";
import { StatusBadge } from "../status-badge";
import { colors, radius, s } from "../ui";
import { useWorkspace } from "../workspace";
import { BotEmpty, BotPage, type BotPageProps } from "./shared";

/**
 * Agent 详情页的「连接器」分区：只展示分配给这个 Agent 的连接器，
 * 真实连接状态取自工作区快照，未接通时不暗示可用。
 * 分配关系在「应用与能力 → 连接器 → 选择 → 添加到智能体」里维护。
 */
export function BotConnectorsPage({ onClose, embedded }: BotPageProps) {
  const { t } = useTranslation();
  const { current } = useAgentSpace();
  const { workspace } = useWorkspace();
  const options = connectorOptions(workspace);
  const assigned = (current.installedConnectors ?? [])
    .map((id) => options.find((option) => option.id === id))
    .filter((option): option is (typeof options)[number] => Boolean(option));

  return (
    <BotPage title={t("agentSpace.connectors")} onClose={onClose} embedded={embedded}>
      <View style={{ gap: 8 }}>
        <Text style={[s.muted, { marginBottom: 4 }]}>{t("agentSpace.connectorsHint")}</Text>
        {assigned.length ? (
          assigned.map((option) => (
            <View
              key={option.id}
              style={[
                s.between,
                {
                  minHeight: 56,
                  gap: 10,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.lineSoft,
                },
              ]}
            >
              <View style={[s.row, { flex: 1, minWidth: 0, gap: 11 }]}>
                <View
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: radius.control,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: colors.surfaceSoft,
                  }}
                >
                  <option.icon size={16} color={colors.text} />
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text numberOfLines={1} style={s.text}>
                    {option.name}
                  </Text>
                  <Text numberOfLines={1} style={s.small}>
                    {option.detail}
                  </Text>
                </View>
              </View>
              <StatusBadge
                tone={option.connected ? "done" : "paused"}
                label={t(
                  option.connected
                    ? "agent.hubConnectorStateConnected"
                    : "agent.hubConnectorStateDisconnected",
                )}
                style={{ borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 }}
              />
            </View>
          ))
        ) : (
          <BotEmpty>{t("agentSpace.connectorsEmpty")}</BotEmpty>
        )}
      </View>
    </BotPage>
  );
}
