import { useMemo, useState } from "react";
import { Pressable, useWindowDimensions, View } from "react-native";
import { useAppConnectors } from "./app-connectors";
import { Text, TextInput } from "./app-text";
import {
  allConnectorOptions,
  connectorOptions,
  visibleConnectorOptions,
} from "./capability-picker";
import { useTranslation } from "./i18n";
import { Plus, Search } from "./icons";
import { StatusBadge } from "./status-badge";
import { colors, radius, s } from "./ui";
import { useWorkspace } from "./workspace";

/** 内容列宽达到该值才排两列，窄屏保持单列以免标题被挤没。 */
const GRID_MIN_WIDTH = 400;
/** 两列时格子之间的间距。 */
const GRID_GAP = 8;
/** 一次最多渲染的连接数（内置 + 账户级应用连接远小于技能目录，整页铺开即可）。 */
const PAGE_SIZE = 200;

/**
 * 连接库：工作区内置连接器（智能体电脑 / Google 系 / OpenBot）+ 账户级应用连接器
 * 合并后，挑连接挂到「当前归属」上。
 *
 * 归属既可以是某个智能体，也可以是一个频道（频道连接由全体成员共享），
 * 所以这里只做展示与点击回调，装 / 卸的具体写入交给调用方。
 * 只允许勾选已连接的连接：未连接的连接器置灰并标记「未连接」，
 * 与输入区的连接器选择弹层同一套判定，保证带进对话的始终是真正可用的能力。
 */
export function ConnectorLibraryPanel({
  installedIds,
  onToggle,
}: {
  installedIds: readonly string[];
  /** 点连接切换安装状态（未连接的连接不可选，不会触发回调）。 */
  onToggle: (id: string, installed: boolean) => void;
}) {
  const { t } = useTranslation();
  const { workspace, api } = useWorkspace();
  const appConnectors = useAppConnectors(api);
  const options = useMemo(
    // 只列出当前保留展示的连接器，与「能力与市场」连接器页、对话底部的「选择连接器」同口径。
    () =>
      visibleConnectorOptions(
        allConnectorOptions(connectorOptions(workspace), appConnectors.items),
      ),
    [workspace, appConnectors.items],
  );
  // 三栏布局下列宽远小于窗口宽，用 onLayout 的真实列宽决定单双列。
  const { width: windowWidth } = useWindowDimensions();
  const [width, setWidth] = useState(windowWidth);
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const keyword = query.trim().toLowerCase();
  const filtered = options.filter(
    (option) =>
      !keyword ||
      option.name.toLowerCase().includes(keyword) ||
      option.detail.toLowerCase().includes(keyword) ||
      option.id.toLowerCase().includes(keyword),
  );
  const grid = width >= GRID_MIN_WIDTH;
  const cellWidth = grid ? (width - GRID_GAP) / 2 : width;
  const visible = filtered.slice(0, PAGE_SIZE);

  return (
    <View style={{ gap: 8 }} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      <Text style={[s.small, { lineHeight: 17 }]}>{t("agentSpace.addConnectorHint")}</Text>
      <View
        style={[
          s.row,
          {
            gap: 8,
            minHeight: 36,
            paddingHorizontal: 11,
            borderWidth: 1,
            borderColor: focused ? colors.primary : colors.line,
            borderRadius: radius.field,
            backgroundColor: colors.paper,
          },
        ]}
      >
        <Search size={14} strokeWidth={1.7} color={colors.faint} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={t("agentSpace.addConnectorSearch")}
          placeholderTextColor={colors.faint}
          accessibilityLabel={t("agentSpace.addConnectorSearch")}
          style={{ flex: 1, minWidth: 0, paddingVertical: 0, color: colors.text, fontSize: 13 }}
        />
      </View>
      {visible.length ? (
        <View style={grid ? { flexDirection: "row", flexWrap: "wrap", gap: GRID_GAP } : { gap: 6 }}>
          {visible.map((option) => {
            const installed = installedIds.includes(option.id);
            return (
              <Pressable
                key={option.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: installed }}
                accessibilityLabel={option.name}
                disabled={!option.connected}
                onPress={() => onToggle(option.id, !installed)}
                style={({ pressed }) => [
                  s.row,
                  {
                    gap: 8,
                    minHeight: grid ? 38 : 44,
                    width: grid ? cellWidth : undefined,
                    paddingHorizontal: 10,
                    paddingVertical: grid ? 7 : 6,
                    borderWidth: 1,
                    borderColor: colors.line,
                    borderRadius: radius.field,
                    backgroundColor: installed
                      ? colors.sky
                      : pressed
                        ? colors.surfaceSoft
                        : colors.paper,
                    opacity: option.connected ? 1 : 0.55,
                  },
                ]}
              >
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: option.iconSurface ?? colors.surfaceSoft,
                  }}
                >
                  <option.icon size={13} color={option.iconColor ?? colors.muted} />
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                  <Text
                    numberOfLines={1}
                    style={[s.text, { fontSize: 13, lineHeight: 18, fontWeight: "600" }]}
                  >
                    {option.name}
                  </Text>
                  {!grid && (
                    <Text numberOfLines={1} style={[s.small, { lineHeight: 15 }]}>
                      {option.detail}
                    </Text>
                  )}
                </View>
                {!option.connected ? (
                  <StatusBadge
                    tone="paused"
                    label={t("agent.hubConnectorStateDisconnected")}
                    style={{ borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 }}
                  />
                ) : installed ? (
                  <StatusBadge
                    tone="done"
                    label={t("agent.hubConnectorStateConnected")}
                    style={{ borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 }}
                  />
                ) : (
                  <Plus size={13} color={colors.muted} />
                )}
              </Pressable>
            );
          })}
        </View>
      ) : (
        <Text style={[s.muted, { paddingVertical: 18 }]}>{t("agentSpace.addConnectorEmpty")}</Text>
      )}
    </View>
  );
}

/** 已挂载连接卡片上的「移除」：只从当前归属摘掉，不影响连接本身与其它归属。 */
export function ConnectorRemoveButton({ name, onRemove }: { name: string; onRemove: () => void }) {
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t("agentSpace.removeConnector")} ${name}`}
      hitSlop={6}
      onPress={(event) => {
        event.stopPropagation();
        onRemove();
      }}
      style={({ pressed }) => ({
        height: 24,
        justifyContent: "center",
        paddingHorizontal: 9,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: colors.errorSoft,
        backgroundColor: pressed ? colors.errorSoft : colors.paper,
      })}
    >
      <Text style={[s.small, { color: colors.danger, fontWeight: "600" }]}>
        {t("agentSpace.removeConnector")}
      </Text>
    </Pressable>
  );
}
