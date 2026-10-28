import { useThreads } from "@copilotkit/react-native/headless";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, Text, TextInput, View } from "react-native";
import type { AccountProfile } from "./api";
import { filterArchivedThreads } from "./archived-threads";
import { useTranslation } from "./i18n";
import {
  Archive,
  ArrowLeft,
  CalendarClock,
  type IconComponent,
  IdCard,
  LogOut,
  Mail,
  MessageCircle,
  Monitor,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
} from "./icons";
import { useLingWuThread } from "./threads";
import { Button, Card, colors, dateLabel, Empty, ErrorNotice, LinkRow, s, timeLabel } from "./ui";
import { useWorkspace } from "./workspace";

/** 个人信息里的一行：图标 + 名称 + 取值。 */
function ProfileRow({
  icon: Icon,
  label,
  value,
  divided,
}: {
  icon: IconComponent;
  label: string;
  value: string;
  divided?: boolean;
}) {
  return (
    <View
      style={[
        s.row,
        { gap: 12, paddingVertical: 12 },
        divided && { borderTopWidth: 1, borderTopColor: colors.line },
      ]}
    >
      <View style={s.iconBox}>
        <Icon size={18} color={colors.primary} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.small}>{label}</Text>
        <Text
          selectable
          style={[s.text, { fontWeight: "500", fontVariant: ["tabular-nums"] as const }]}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

/** 「我的」里的归档页：搜索、恢复并打开，或永久删除已归档对话。 */
function ArchivedThreadsScreen({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const { notify } = useWorkspace();
  const { enabled, select } = useLingWuThread();
  const threads = useThreads({
    agentId: "default",
    enabled,
    includeArchived: true,
    limit: 50,
  });
  const [query, setQuery] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string>();
  const [mutationError, setMutationError] = useState("");
  const visibleThreads = filterArchivedThreads(threads.threads, query);

  async function restoreAndOpen(id: string) {
    if (threads.isMutating) return;
    setMutationError("");
    try {
      await threads.unarchiveThread(id);
      notify(t("threads.restoredNotice"));
      select({ id, existing: true });
    } catch (e) {
      setMutationError(e instanceof Error ? e.message : String(e));
    }
  }

  async function remove(id: string) {
    if (threads.isMutating) return;
    setMutationError("");
    try {
      await threads.deleteThread(id);
      setPendingDelete(undefined);
      notify(t("threads.deletedNotice"));
    } catch (e) {
      setMutationError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <View style={{ gap: 18 }}>
      <Button small icon={ArrowLeft} onPress={onBack} style={{ alignSelf: "flex-start" }}>
        {t("app.backToAccount")}
      </Button>
      <View style={{ gap: 5 }}>
        <Text style={[s.title, { fontSize: 20 }]}>{t("threads.archivedPageTitle")}</Text>
        <Text style={s.muted}>{t("threads.archivedPageSubtitle")}</Text>
      </View>
      <View
        style={[
          s.row,
          {
            gap: 9,
            paddingHorizontal: 13,
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: 10,
            // 输入框走次级面 surface（与邮件页搜索框一致）
            backgroundColor: colors.surface,
          },
        ]}
      >
        <Search size={17} color={colors.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t("threads.searchArchived")}
          placeholderTextColor={colors.faint}
          accessibilityLabel={t("threads.searchArchived")}
          style={{ flex: 1, minHeight: 43, color: colors.text, fontSize: 14 }}
        />
      </View>
      <ErrorNotice error={mutationError || threads.error?.message} />
      {threads.isLoading ? (
        <ActivityIndicator color={colors.primary} />
      ) : visibleThreads.length ? (
        <View
          style={{
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: 14,
            overflow: "hidden",
            backgroundColor: colors.paper,
          }}
        >
          {visibleThreads.map((thread, index) => (
            <View
              key={thread.id}
              style={{
                gap: 8,
                padding: 12,
                borderTopWidth: index === 0 ? 0 : 1,
                borderTopColor: colors.line,
              }}
            >
              <View style={[s.row, { gap: 12 }]}>
                <View style={s.iconBox}>
                  <MessageCircle size={19} color={colors.primary} />
                </View>
                <Text style={[s.text, { flex: 1, fontWeight: "500" }]}>
                  {thread.name || t("threads.untitledConversation")}
                </Text>
              </View>
              {pendingDelete === thread.id ? (
                <View
                  style={{
                    gap: 9,
                    padding: 12,
                    borderRadius: 10,
                    backgroundColor: colors.errorSoft,
                  }}
                >
                  <Text style={[s.text, { fontWeight: "500", color: colors.danger }]}>
                    {t("threads.deleteConfirmTitle")}
                  </Text>
                  <Text style={s.small}>{t("threads.deleteConfirmNote")}</Text>
                  <View style={[s.row, { gap: 8, flexWrap: "wrap" }]}>
                    <Button
                      small
                      danger
                      disabled={threads.isMutating}
                      onPress={() => void remove(thread.id)}
                    >
                      {t("threads.permanentlyDelete")}
                    </Button>
                    <Button small onPress={() => setPendingDelete(undefined)}>
                      {t("common.cancel")}
                    </Button>
                  </View>
                </View>
              ) : (
                <View style={[s.row, { gap: 8, flexWrap: "wrap" }]}>
                  <Button
                    small
                    icon={RotateCcw}
                    disabled={threads.isMutating}
                    onPress={() => void restoreAndOpen(thread.id)}
                  >
                    {t("threads.restoreAndOpen")}
                  </Button>
                  <Button
                    small
                    danger
                    icon={Trash2}
                    disabled={threads.isMutating}
                    onPress={() => setPendingDelete(thread.id)}
                  >
                    {t("threads.delete")}
                  </Button>
                </View>
              )}
            </View>
          ))}
        </View>
      ) : (
        !threads.error && (
          <Empty
            icon={Archive}
            title={query.trim() ? t("threads.emptyArchivedSearch") : t("threads.emptyArchived")}
            detail={
              query.trim()
                ? t("threads.emptyArchivedSearchDetail")
                : t("threads.archivedPageSubtitle")
            }
          />
        )
      )}
      {threads.error && (
        <Button small onPress={threads.refetchThreads}>
          {t("threads.retryConversations")}
        </Button>
      )}
      <ErrorNotice error={threads.fetchMoreError?.message} />
      {threads.hasMoreThreads && (
        <Button small busy={threads.isFetchingMoreThreads} onPress={threads.fetchMoreThreads}>
          {t("threads.loadMore")}
        </Button>
      )}
    </View>
  );
}

/**
 * 「我的」页面：展示当前登录用户的昵称、邮箱等个人信息，并提供退出登录。
 *
 * 数据来自 /api/auth/me：owner（账号 ID）、邮箱与昵称都随会话隔离，
 * 因此换一个账号登录看到的完全是另一份信息。
 */
export function AccountScreen({ onSignOut }: { onSignOut: () => void }) {
  const { t } = useTranslation();
  const { api } = useWorkspace();
  const { enabled: richThreads } = useLingWuThread();
  const [view, setView] = useState<"overview" | "archived">("overview");
  const [profile, setProfile] = useState<AccountProfile>();
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setError("");
    try {
      setProfile(await api.request<AccountProfile>("/api/auth/me"));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [api]);
  useEffect(() => {
    void load();
  }, [load]);
  if (!profile && !error)
    return (
      <View style={{ alignItems: "center", padding: 40, gap: 13 }}>
        <ActivityIndicator color={colors.primary} />
        <Text style={s.muted}>{t("app.profileLoading")}</Text>
      </View>
    );
  if (!profile)
    return (
      <View style={{ gap: 12 }}>
        <ErrorNotice error={error} />
        <Button onPress={() => void load()}>{t("common.tryAgain")}</Button>
      </View>
    );
  if (view === "archived") return <ArchivedThreadsScreen onBack={() => setView("overview")} />;
  const nickname = profile.displayName || t("app.profileUnset");
  const email = profile.email || t("app.profileUnset");
  // 简介：来自 user_profiles.bio，未填写时显示占位文案。
  const bio = profile.bio || t("app.profileUnset");
  // 头像优先用 Supabase 里的头像地址，取不到再退回昵称/邮箱首字母。
  const initial = (profile.displayName || profile.email || "?").trim().charAt(0).toUpperCase();
  const expiresAt = new Date(profile.expiresAt).toISOString();
  return (
    <View style={{ gap: 20 }}>
      <Card style={{ alignItems: "center", gap: 8, paddingVertical: 20 }}>
        <View
          style={{
            width: 60,
            height: 60,
            borderRadius: 999,
            backgroundColor: colors.surface,
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          {profile.avatarUrl ? (
            <Image source={{ uri: profile.avatarUrl }} style={{ width: 60, height: 60 }} />
          ) : (
            <Text style={{ fontSize: 24, fontWeight: "600", color: colors.primaryStrong }}>
              {initial}
            </Text>
          )}
        </View>
        <Text style={{ fontSize: 18, fontWeight: "600", color: colors.text }}>{nickname}</Text>
        <Text style={s.muted}>{bio}</Text>
      </Card>
      <View style={{ gap: 10 }}>
        <Text style={s.heading}>{t("app.profileDetails")}</Text>
        <Card style={{ paddingVertical: 4 }}>
          <ProfileRow icon={UserRound} label={t("app.profileNickname")} value={nickname} />
          <ProfileRow divided icon={Mail} label={t("app.emailLabel")} value={email} />
          <ProfileRow divided icon={IdCard} label={t("app.profileAccountId")} value={profile.id} />
          <ProfileRow
            divided
            icon={ShieldCheck}
            label={t("app.profileSignInMethod")}
            value={
              profile.authMode === "supabase"
                ? t("app.profileSignInAccount")
                : t("app.profileSignInKey")
            }
          />
          <ProfileRow
            divided
            icon={Monitor}
            label={t("app.profileMode")}
            value={profile.mode === "live" ? t("app.profileModeLive") : t("app.profileModeSample")}
          />
          <ProfileRow
            divided
            icon={CalendarClock}
            label={t("app.profileSessionExpires")}
            value={`${dateLabel(expiresAt)} ${timeLabel(expiresAt)}`}
          />
        </Card>
      </View>
      {richThreads && (
        <View style={{ gap: 10 }}>
          <Text style={s.heading}>{t("app.conversationManagement")}</Text>
          <Card style={{ paddingVertical: 4 }}>
            <LinkRow
              icon={Archive}
              title={t("app.archivedConversations")}
              detail={t("app.archivedConversationsDetail")}
              onPress={() => setView("archived")}
            />
          </Card>
        </View>
      )}
      <View style={{ gap: 10 }}>
        <Button danger icon={LogOut} onPress={onSignOut}>
          {t("app.signOutLabel")}
        </Button>
      </View>
    </View>
  );
}
