import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { AccountAvatar } from "./account-avatar";
import { AgentOrb } from "./agent-orb";
import { useAgentSpace } from "./agent-space";
import type { AgentDefinition } from "./agent-space-model";
import { useAgentWorkspace } from "./agent-workspace";
import { Text, TextInput } from "./app-text";
import { type ThreadHistoryPage, threadHistoryPagePath } from "./conversation-history";
import { useTranslation } from "./i18n";
import { Bell, Link2, Plus, Search } from "./icons";
import {
  type BotPreview,
  botHasUnread,
  botMatchesQuery,
  latestBotPreview,
  orderBotsByActivity,
} from "./mobile-bots";
import {
  attachWebRubberBand,
  edgeFadeMask,
  MOBILE_CONTROL,
  mobileGlassStyle,
} from "./mobile-chrome";
import { relativeDate } from "./relative-date";
import { colors, fonts, radius, semantic, shadow } from "./theme";
import { Sheet } from "./ui";
import { useWorkspace } from "./workspace";

/**
 * 手机宽度的 bots 首页。电脑版不走这里。
 * 最近一条消息来自现有的对话历史接口；未读点只反映挂在该 bot 任务上的未读通知。
 */
export function MobileBotsHome({
  onOpenBot,
  onCreate,
  onAccount,
  onNotifications,
  onConnections,
}: {
  onOpenBot: (agent: AgentDefinition) => void;
  onCreate: () => void;
  onAccount: () => void;
  onNotifications: () => void;
  onConnections: () => void;
}) {
  const { t } = useTranslation();
  const { api, workspace } = useWorkspace();
  const { agents } = useAgentSpace();
  const { data } = useAgentWorkspace();
  const scroller = useRef<ScrollView>(null);
  const searchInput = useRef<TextInput>(null);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [previews, setPreviews] = useState<Record<string, BotPreview | null>>({});
  const agentKey = agents.map((agent) => agent.id).join("|");

  useEffect(() => {
    let active = true;
    for (const agent of agents) {
      void api
        .request<ThreadHistoryPage>(threadHistoryPagePath(agent.threadId))
        .then((page) => {
          if (!active) return;
          setPreviews((current) => ({
            ...current,
            [agent.id]: latestBotPreview(page.messages),
          }));
        })
        .catch(() => {
          if (!active) return;
          setPreviews((current) => ({ ...current, [agent.id]: null }));
        });
    }
    return () => {
      active = false;
    };
  }, [api, agentKey]);

  useEffect(() => {
    const node = (
      scroller.current as { getScrollableNode?: () => HTMLElement } | null
    )?.getScrollableNode?.();
    if (!node || typeof node.addEventListener !== "function") return;
    return attachWebRubberBand(node);
  }, []);

  useEffect(() => {
    if (!searchOpen) return;
    const timer = setTimeout(() => searchInput.current?.focus(), 60);
    return () => clearTimeout(timer);
  }, [searchOpen]);

  const activityAt = useMemo(() => {
    const times: Record<string, string | undefined> = {};
    for (const agent of agents) times[agent.id] = previews[agent.id]?.at;
    return times;
  }, [agents, previews]);
  const rows = orderBotsByActivity(agents, activityAt);
  const searchRows = rows.filter((agent) =>
    botMatchesQuery(agent, previews[agent.id]?.text ?? "", query),
  );
  const nickname = workspace.profile.name.trim() || t("agentSpace.account");
  const edge = 16;
  const floatGap = 14;
  // 遮罩比按钮区再长一截，第一行停在完全不透明的位置，滚上去才开始变淡。
  const fade = edge + MOBILE_CONTROL + floatGap + 22;

  return (
    <View testID="mobile-bots-home" style={{ flex: 1, backgroundColor: colors.canvas }}>
      <View pointerEvents="box-none" style={[{ flex: 1 }, edgeFadeMask(fade, fade)]}>
        <ScrollView
          ref={scroller}
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          alwaysBounceVertical
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            minHeight: "100%",
            paddingTop: fade,
            paddingBottom: fade,
            paddingHorizontal: 8,
          }}
        >
          {rows.length === 0 ? (
            <Text style={{ padding: 24, textAlign: "center", color: colors.muted, fontSize: 14 }}>
              {t("agentSpace.noBotMessages")}
            </Text>
          ) : (
            rows.map((agent) => {
              const preview = previews[agent.id];
              const unread = botHasUnread(
                agent.threadId,
                agent.system,
                data?.tasks ?? [],
                data?.notifications ?? [],
              );
              const label = agent.role ? `${agent.name} · ${agent.role}` : agent.name;
              return (
                <Pressable
                  key={agent.id}
                  testID={`mobile-bot-${agent.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  onPress={() => onOpenBot(agent)}
                  style={({ pressed }) => ({
                    minHeight: 68,
                    paddingHorizontal: 8,
                    paddingVertical: 10,
                    borderRadius: radius.card,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    backgroundColor: pressed ? colors.overlay1 : "transparent",
                  })}
                >
                  <AgentOrb avatar={agent.avatar} size={44} />
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text
                        numberOfLines={1}
                        style={{
                          flex: 1,
                          fontFamily: fonts.serif,
                          fontSize: 16,
                          lineHeight: 22,
                          fontWeight: "600",
                          color: colors.text,
                        }}
                      >
                        {label}
                      </Text>
                      {!!preview?.at && (
                        <Text
                          style={{
                            flexShrink: 0,
                            fontSize: 12,
                            lineHeight: 18,
                            color: colors.faint,
                          }}
                        >
                          {relativeDate(preview.at)}
                        </Text>
                      )}
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text
                        numberOfLines={1}
                        style={{ flex: 1, fontSize: 13, lineHeight: 20, color: colors.muted }}
                      >
                        {preview?.text || t("agentSpace.noBotMessages")}
                      </Text>
                      {unread && (
                        <View
                          accessibilityLabel={t("agentSpace.newNotifications")}
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: radius.full,
                            backgroundColor: colors.primary,
                          }}
                        />
                      )}
                    </View>
                  </View>
                </Pressable>
              );
            })
          )}
        </ScrollView>
      </View>
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          top: edge,
          left: edge,
          right: edge,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <Pressable
          testID="mobile-bots-account"
          accessibilityRole="button"
          accessibilityLabel={t("agentSpace.personalCenter")}
          onPress={onAccount}
          style={({ pressed }) => ({
            borderRadius: radius.full,
            opacity: pressed ? 0.86 : 1,
            ...shadow.composer,
          })}
        >
          <AccountAvatar
            avatarUrl={workspace.profile.avatarUrl}
            name={nickname}
            size={MOBILE_CONTROL}
            borderRadius={MOBILE_CONTROL / 2}
          />
        </Pressable>
        <View pointerEvents="none" style={{ flex: 1 }} />
        <Pressable
          testID="mobile-bots-create"
          accessibilityRole="button"
          accessibilityLabel={t("agentSpace.createAgent")}
          onPress={onCreate}
          style={({ pressed }) => [
            mobileGlassStyle(pressed),
            floatingControl,
            { borderRadius: radius.full },
          ]}
        >
          <Plus size={22} color={colors.text} />
        </Pressable>
      </View>
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          left: edge,
          right: edge,
          bottom: edge,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
        }}
      >
        <Pressable
          testID="mobile-bots-notifications"
          accessibilityRole="button"
          accessibilityLabel={t("agentSpace.newNotifications")}
          onPress={onNotifications}
          style={({ pressed }) => [
            mobileGlassStyle(pressed),
            floatingControl,
            { borderRadius: radius.full },
          ]}
        >
          <Bell size={20} color={colors.text} />
        </Pressable>
        <Pressable
          testID="mobile-bots-connections"
          accessibilityRole="button"
          accessibilityLabel={t("agentSpace.connectApps")}
          onPress={onConnections}
          style={({ pressed }) => [
            mobileGlassStyle(pressed),
            floatingControl,
            { borderRadius: radius.full },
          ]}
        >
          <Link2 size={20} color={colors.text} />
        </Pressable>
        <Pressable
          testID="mobile-bots-search"
          accessibilityRole="button"
          accessibilityLabel={t("agentSpace.searchBots")}
          onPress={() => setSearchOpen(true)}
          style={[
            mobileGlassStyle(false),
            {
              flex: 1,
              height: MOBILE_CONTROL,
              paddingHorizontal: 14,
              borderRadius: radius.full,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
            },
          ]}
        >
          <Search size={18} color={colors.faint} />
          <Text style={{ flex: 1, fontSize: 15, lineHeight: 22, color: colors.faint }}>
            {t("agentSpace.searchBots")}
          </Text>
        </Pressable>
      </View>
      {searchOpen && (
        <Sheet
          botLayout
          title={t("agentSpace.searchBots")}
          onClose={() => {
            setSearchOpen(false);
            setQuery("");
          }}
        >
          <View
            style={{
              minHeight: 44,
              marginBottom: 12,
              paddingHorizontal: 14,
              borderRadius: radius.full,
              borderWidth: 1,
              borderColor: semantic.controlBorder,
              backgroundColor: colors.paper,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Search size={18} color={colors.faint} />
            <TextInput
              ref={searchInput}
              testID="mobile-bots-search-input"
              autoFocus
              value={query}
              onChangeText={setQuery}
              placeholder={t("agentSpace.searchBots")}
              placeholderTextColor={colors.faint}
              accessibilityLabel={t("agentSpace.searchBots")}
              style={{
                flex: 1,
                fontSize: 16,
                lineHeight: 22,
                color: colors.text,
                paddingVertical: 0,
              }}
            />
          </View>
          {searchRows.length === 0 ? (
            <Text style={{ padding: 24, textAlign: "center", color: colors.muted, fontSize: 14 }}>
              {t(query.trim() ? "agentSpace.noBotMatch" : "agentSpace.noBotMessages")}
            </Text>
          ) : (
            searchRows.map((agent) => {
              const preview = previews[agent.id];
              const unread = botHasUnread(
                agent.threadId,
                agent.system,
                data?.tasks ?? [],
                data?.notifications ?? [],
              );
              const label = agent.role ? `${agent.name} · ${agent.role}` : agent.name;
              return (
                <Pressable
                  key={agent.id}
                  testID={`mobile-search-result-${agent.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  onPress={() => {
                    setSearchOpen(false);
                    setQuery("");
                    onOpenBot(agent);
                  }}
                  style={({ pressed }) => ({
                    minHeight: 68,
                    paddingHorizontal: 4,
                    paddingVertical: 10,
                    borderRadius: radius.card,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    backgroundColor: pressed ? colors.overlay1 : "transparent",
                  })}
                >
                  <AgentOrb avatar={agent.avatar} size={44} />
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text
                      numberOfLines={1}
                      style={{
                        fontFamily: fonts.serif,
                        fontSize: 16,
                        lineHeight: 22,
                        fontWeight: "600",
                        color: colors.text,
                      }}
                    >
                      {label}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={{ fontSize: 13, lineHeight: 20, color: colors.muted }}
                    >
                      {preview?.text || t("agentSpace.noBotMessages")}
                    </Text>
                  </View>
                  {unread && (
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: radius.full,
                        backgroundColor: colors.primary,
                      }}
                    />
                  )}
                </Pressable>
              );
            })
          )}
        </Sheet>
      )}
    </View>
  );
}

const floatingControl = {
  width: MOBILE_CONTROL,
  height: MOBILE_CONTROL,
  alignItems: "center" as const,
  justifyContent: "center" as const,
};
