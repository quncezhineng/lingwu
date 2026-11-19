import { type ReactNode, useState } from "react";
import { View } from "react-native";
import { useAgentSpace } from "../agent-space";
import { useAppConnectors } from "../app-connectors";
import { Text } from "../app-text";
import { allConnectorOptions, type ConnectorOption, connectorOptions } from "../capability-picker";
import { CardGrid } from "../card-grid";
import { ConnectorLibraryPanel, ConnectorRemoveButton } from "../connector-library-panel";
import { useTranslation } from "../i18n";
import { Link2, Plus } from "../icons";
import { StatusBadge } from "../status-badge";
import { Button, colors, s } from "../ui";
import { useWorkspace } from "../workspace";
import { BotInlineBack, BotPage, type BotPageProps } from "./shared";

/**
 * Agent 详情页的「连接」分区：把工作区里**已连接**的能力挂到这个 Agent 上。
 *
 * 版式与「技能」页完全一致（右上角「+ 添加连接」+ 自适应卡片网格 + 卡片内「移除」），
 * 归属写进 `installedConnectors`；添加态铺开「连接库」挑选，只允许勾选已连接的连接
 * （未连接的连接器置灰并标记「未连接」，与输入区的连接器选择弹层同一套判定）。
 * 频道有自己的「连接」分区，两者互相独立。
 */
export function BotConnectorsPage({ onClose, embedded }: BotPageProps) {
  const { t } = useTranslation();
  const { current, updateAgent } = useAgentSpace();
  const { workspace, api, notify } = useWorkspace();
  const appConnectors = useAppConnectors(api);
  const [adding, setAdding] = useState(false);
  // 连接库 = 工作区内置连接器 + 账户级应用连接器，按 id 去重、已连接优先。
  const options = allConnectorOptions(connectorOptions(workspace), appConnectors.items);
  const installedIds = current.installedConnectors ?? [];
  const assigned = installedIds
    .map((id) => options.find((option) => option.id === id))
    .filter((option): option is ConnectorOption => Boolean(option));

  /**
   * 连接库面板的点选回调：只增删当前 Agent 的挂载关系，
   * 连接本身与其它智能体 / 频道上的挂载都不受影响。
   */
  const toggle = (id: string, installed: boolean) => {
    updateAgent(current.id, {
      installedConnectors: installed
        ? [...new Set([...installedIds, id])]
        : installedIds.filter((x) => x !== id),
    });
    const option = options.find((item) => item.id === id);
    notify(
      t(installed ? "agent.connectorInstalledToast" : "agent.connectorUninstalledToast", {
        name: option?.name ?? id,
        agent: current.name,
      }),
    );
  };

  /** 卡片上的「移除」：只从当前 Agent 摘掉，点击即生效、不弹确认。 */
  const remove = (option: ConnectorOption) => {
    if (!installedIds.includes(option.id)) return;
    toggle(option.id, false);
  };

  // 添加连接视图：左上角 `‹ 返回` 切回已挂列表，下面直接铺连接库（提示 / 搜索 / 卡片格子）。
  if (adding)
    return (
      <BotPage title={t("agentSpace.addConnector")} onClose={onClose} embedded={embedded}>
        {embedded && (
          <BotInlineBack
            label={t("common.back")}
            onPress={() => {
              setAdding(false);
            }}
          />
        )}
        <ConnectorLibraryPanel installedIds={installedIds} onToggle={toggle} />
      </BotPage>
    );

  const cards: { key: string; node: ReactNode }[] = assigned.map((option) => ({
    key: option.id,
    // 连接没有详情弹层，卡片只做只读展示：品牌色图标 + 名称 + 说明 + 连接状态 + 移除。
    node: (
      <View
        style={{
          flex: 1,
          padding: 14,
          borderRadius: 15,
          borderWidth: 1,
          borderColor: colors.line,
          backgroundColor: colors.paper,
          gap: 7,
        }}
      >
        <View style={s.between}>
          <View style={[s.row, { flex: 1, minWidth: 0, gap: 10 }]}>
            <View
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: option.iconSurface ?? colors.surfaceSoft,
              }}
            >
              <option.icon size={16} color={option.iconColor ?? colors.muted} />
            </View>
            <Text numberOfLines={1} style={[s.text, { flex: 1, minWidth: 0, fontWeight: "600" }]}>
              {option.name}
            </Text>
          </View>
          <ConnectorRemoveButton name={option.name} onRemove={() => remove(option)} />
        </View>
        <Text numberOfLines={2} style={s.small}>
          {option.detail}
        </Text>
        <View>
          <StatusBadge
            tone={option.connected ? "done" : "paused"}
            label={t(
              option.connected
                ? "agent.hubConnectorStateConnected"
                : "agent.hubConnectorStateDisconnected",
            )}
            style={{ borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 }}
          />
        </View>
      </View>
    ),
  }));

  return (
    <BotPage title={t("agentSpace.connectors")} onClose={onClose} embedded={embedded}>
      <View style={{ gap: 8 }}>
        <Text style={[s.muted, { marginBottom: 4 }]}>{t("agentSpace.connectorsHint")}</Text>
        <View style={[s.between, { alignItems: "center", marginBottom: 5, gap: 12 }]}>
          <Text style={s.small}>{t("agentSpace.connectorCount", { count: assigned.length })}</Text>
          <Button primary icon={Plus} onPress={() => setAdding(true)}>
            {t("agentSpace.addConnector")}
          </Button>
        </View>
        {assigned.length ? (
          <CardGrid
            items={cards}
            minColumnWidth={300}
            getKey={(card) => card.key}
            render={(card) => card.node}
          />
        ) : (
          <View style={{ gap: 8, alignItems: "center", paddingVertical: 24 }}>
            <Link2 size={28} color={colors.faint} />
            <Text style={[s.muted, { textAlign: "center", lineHeight: 22 }]}>
              {t("agentSpace.connectorsEmpty")}
            </Text>
          </View>
        )}
      </View>
    </BotPage>
  );
}
