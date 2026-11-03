import { useThreads } from "@copilotkit/react-native/headless";
import * as DocumentPicker from "expo-document-picker";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Platform, View } from "react-native";
import { AccountAvatar } from "./account-avatar";
import type { AccountProfile } from "./api";
import { Text, TextInput } from "./app-text";
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
  Pencil,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  Upload,
  UserRound,
  X,
} from "./icons";
import { useLingWuThread } from "./threads";
import {
  Button,
  Card,
  colors,
  dateLabel,
  Empty,
  ErrorNotice,
  Field,
  LinkRow,
  s,
  timeLabel,
} from "./ui";
import { useWorkspace } from "./workspace";

const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
const AVATAR_MIME_BY_EXTENSION: Record<string, string> = {
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

function avatarMimeType(asset: DocumentPicker.DocumentPickerAsset) {
  const declared = asset.mimeType?.toLowerCase();
  if (AVATAR_TYPES.includes(declared as (typeof AVATAR_TYPES)[number])) return declared;
  const extension = asset.name.split(".").pop()?.toLowerCase() ?? "";
  return AVATAR_MIME_BY_EXTENSION[extension];
}

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
          numberOfLines={1}
          style={[s.text, { fontWeight: "500", fontVariant: ["tabular-nums"] as const }]}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

/** 「已归档对话」页：搜索、恢复并打开，或永久删除已归档对话。 */
export function ArchivedThreadsScreen({
  onBack,
  embedded = false,
}: {
  onBack: () => void;
  /** 嵌入到设置面板 Sheet 中时隐藏页内标题与返回键，由外层标题承担。 */
  embedded?: boolean;
}) {
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
      {!embedded && (
        <Button small icon={ArrowLeft} onPress={onBack} style={{ alignSelf: "flex-start" }}>
          {t("app.backToAccount")}
        </Button>
      )}
      {!embedded && (
        <View style={{ gap: 5 }}>
          <Text style={[s.title, { fontSize: 20 }]}>{t("threads.archivedPageTitle")}</Text>
          <Text style={s.muted}>{t("threads.archivedPageSubtitle")}</Text>
        </View>
      )}
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
export function AccountScreen({
  onSignOut,
  onOpenPreferences,
}: {
  onSignOut: () => void;
  onOpenPreferences?: () => void;
}) {
  const { t } = useTranslation();
  const { api, notify, refresh } = useWorkspace();
  const [profile, setProfile] = useState<AccountProfile>();
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [draftNickname, setDraftNickname] = useState("");
  const [draftBio, setDraftBio] = useState("");
  const [avatarAsset, setAvatarAsset] = useState<DocumentPicker.DocumentPickerAsset>();
  const [removeAvatar, setRemoveAvatar] = useState(false);
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
  useEffect(() => {
    const uri = avatarAsset?.uri;
    if (Platform.OS !== "web" || !uri?.startsWith("blob:")) return;
    return () => URL.revokeObjectURL(uri);
  }, [avatarAsset]);

  function beginEditing() {
    setDraftNickname(profile?.displayName?.trim() || "");
    setDraftBio(profile?.bio?.trim() || "");
    setAvatarAsset(undefined);
    setRemoveAvatar(false);
    setEditError("");
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setAvatarAsset(undefined);
    setRemoveAvatar(false);
    setEditError("");
  }

  async function chooseAvatar() {
    setEditError("");
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [...AVATAR_TYPES],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset || !avatarMimeType(asset)) {
        setEditError(t("app.profileAvatarInvalid"));
        return;
      }
      if (asset.size !== undefined && asset.size > 5 * 1024 * 1024) {
        setEditError(t("app.profileAvatarTooLarge"));
        return;
      }
      setAvatarAsset(asset);
      setRemoveAvatar(false);
    } catch {
      setEditError(t("app.profileAvatarPickFailed"));
    }
  }

  async function saveProfile() {
    if (!profile || saving) return;
    const nickname = draftNickname.trim();
    if (!nickname) {
      setEditError(t("app.profileNicknameRequired"));
      return;
    }
    setSaving(true);
    setEditError("");
    try {
      const form = new FormData();
      form.append("nickname", nickname);
      form.append("bio", draftBio.trim());
      if (removeAvatar) form.append("removeAvatar", "true");
      if (avatarAsset) {
        const mimeType = avatarMimeType(avatarAsset);
        if (!mimeType) throw new Error(t("app.profileAvatarInvalid"));
        if (Platform.OS === "web") {
          if (!avatarAsset.file) throw new Error(t("app.profileAvatarPickFailed"));
          form.append("avatar", avatarAsset.file, avatarAsset.name);
        } else {
          form.append("avatar", {
            uri: avatarAsset.uri,
            name: avatarAsset.name,
            type: mimeType,
          } as unknown as Blob);
        }
      }
      const next = await api.request<AccountProfile>("/api/auth/profile", form, "PUT");
      setProfile(next);
      setEditing(false);
      setAvatarAsset(undefined);
      setRemoveAvatar(false);
      notify(t("app.profileSaved"));
      void refresh().catch(() => undefined);
    } catch (reason) {
      setEditError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSaving(false);
    }
  }

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
  const nickname =
    profile.displayName?.trim() || profile.email?.split("@")[0]?.trim() || t("app.profileUnset");
  const email = profile.email || t("app.profileUnset");
  const bio = profile.bio?.trim() || t("app.profileUnset");
  const displayedAvatar = removeAvatar
    ? undefined
    : (avatarAsset?.uri ?? profile.avatarUrl ?? undefined);
  // I8：接口缺少 expiresAt 时不能直接 toISOString（会抛错导致整页白屏）
  const expiresRaw = profile.expiresAt ? new Date(profile.expiresAt) : undefined;
  const expiresAt =
    expiresRaw && !Number.isNaN(expiresRaw.getTime()) ? expiresRaw.toISOString() : undefined;
  return (
    <View style={{ gap: 20 }}>
      <Card style={{ alignItems: "center", gap: 8, paddingVertical: 20 }}>
        <AccountAvatar
          avatarUrl={displayedAvatar}
          name={draftNickname.trim() || nickname}
          size={60}
          borderRadius={999}
        />
        <Text style={{ fontSize: 18, fontWeight: "600", color: colors.text }}>{nickname}</Text>
        <Text style={s.muted}>{bio}</Text>
        <Button small icon={Pencil} onPress={beginEditing}>
          {t("app.editProfile")}
        </Button>
      </Card>
      {editing && (
        <Card style={{ gap: 14 }}>
          <View style={[s.row, { gap: 14, alignItems: "flex-start" }]}>
            <AccountAvatar
              avatarUrl={displayedAvatar}
              name={draftNickname.trim() || nickname}
              size={66}
              borderRadius={22}
            />
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={[s.text, { fontWeight: "600" }]}>{t("app.profileAvatar")}</Text>
              <Text style={s.small}>{t("app.profileAvatarHint")}</Text>
              <View style={[s.row, { gap: 8, flexWrap: "wrap" }]}>
                <Button small icon={Upload} onPress={() => void chooseAvatar()}>
                  {t("app.changeAvatar")}
                </Button>
                {(avatarAsset || profile.avatarUrl) && (
                  <Button
                    small
                    icon={X}
                    onPress={() => {
                      setAvatarAsset(undefined);
                      setRemoveAvatar(true);
                    }}
                  >
                    {t("app.removeAvatar")}
                  </Button>
                )}
              </View>
            </View>
          </View>
          <View style={{ gap: 4 }}>
            <Field
              label={t("app.profileNickname")}
              value={draftNickname}
              onChangeText={setDraftNickname}
              maxLength={40}
              autoCapitalize="words"
              placeholder={t("app.profileNickname")}
            />
            <Text style={[s.small, { marginTop: -10, marginBottom: 10 }]}>
              {t("app.profileNicknameHint")}
            </Text>
          </View>
          <View style={{ gap: 4 }}>
            <Field
              label={t("app.profileBio")}
              value={draftBio}
              onChangeText={setDraftBio}
              maxLength={240}
              multiline
              autoCapitalize="sentences"
              placeholder={t("app.profileBioPlaceholder")}
              style={{ minHeight: 88 }}
            />
            <Text style={[s.small, { marginTop: -10, marginBottom: 10 }]}>
              {t("app.profileBioHint")}
            </Text>
          </View>
          <ErrorNotice error={editError} />
          <View style={[s.row, { gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }]}>
            <Button small disabled={saving} onPress={cancelEditing}>
              {t("common.cancel")}
            </Button>
            <Button
              small
              primary
              busy={saving}
              disabled={!draftNickname.trim()}
              onPress={() => void saveProfile()}
            >
              {t("app.profileSave")}
            </Button>
          </View>
        </Card>
      )}
      <View style={{ gap: 10 }}>
        <Text style={s.heading}>{t("app.profileDetails")}</Text>
        <Card style={{ paddingVertical: 4 }}>
          <ProfileRow icon={UserRound} label={t("app.profileNickname")} value={nickname} />
          <ProfileRow divided icon={UserRound} label={t("app.profileBio")} value={bio} />
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
            value={
              expiresAt ? `${dateLabel(expiresAt)} ${timeLabel(expiresAt)}` : t("app.profileUnset")
            }
          />
        </Card>
      </View>
      {onOpenPreferences && (
        <Card style={{ paddingVertical: 4 }}>
          <LinkRow
            icon={Settings2}
            title={t("agentSpace.preferences")}
            detail={t("agentSpace.preferencesDetail")}
            onPress={onOpenPreferences}
          />
        </Card>
      )}
      <View style={{ gap: 10 }}>
        <Button danger icon={LogOut} onPress={onSignOut}>
          {t("app.signOutLabel")}
        </Button>
      </View>
    </View>
  );
}
