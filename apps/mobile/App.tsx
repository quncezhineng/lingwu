import { CopilotKitProvider } from "@copilotkit/react-native/headless";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Platform,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import type { Section, Workspace } from "../../packages/domain/src";
import { AccountScreen } from "./src/account";
import { AgentStatus, IdeasScreen } from "./src/agent-ui";
import { AgentWorkspaceProvider, useAgentWorkspace } from "./src/agent-workspace";
import {
  type AccountProfile,
  API_URL,
  type AuthMode,
  authConfig,
  createSession,
  LingWuApi,
  requestOtp,
  verifyOtp,
} from "./src/api";
import { CapabilityHubScreen } from "./src/capability-hub";
import { ChatScreen, WorkspaceTools } from "./src/chat";
import { ComputerDraftProvider } from "./src/computer-drafts";
import { Details } from "./src/details";
import { I18nProvider, localizeAgentName, useTranslation } from "./src/i18n";
import type { TranslationKey } from "./src/i18n/locales/en";
import { clearStorage, readStorage, writeStorage } from "./src/i18n/storage";
import { Bell, Menu, Search, Settings2 } from "./src/icons";
import { PageHeader } from "./src/page-header";
import { PreferencesScreen } from "./src/preferences-screen";
import { BrowserScreen, CalendarScreen, FilesScreen, MailScreen } from "./src/screens";
import { GlobalSearchSheet } from "./src/search-sheet";
import { ACCOUNT_NAV, BrandMark, ChatsColumn, MOBILE_NAV, Rail } from "./src/shell";
import { TaskHubScreen } from "./src/task-hub";
import { breakpoints, layout } from "./src/theme";
import { ThreadsProvider, ThreadsSheet, useLingWuThread } from "./src/threads";
import { Toast, type ToastState } from "./src/toast";
import {
  Button,
  Card,
  colors,
  ErrorNotice,
  Field,
  fonts,
  IconButton,
  iconStroke,
  Mascot,
  radius,
  s,
  space,
  typography,
} from "./src/ui";
import { WatchlistHubScreen } from "./src/watchlist-hub";
import { WorkbenchScreen } from "./src/workbench";
import { type Detail, useWorkspace, WorkspaceContext } from "./src/workspace";

/** 登录会话在本地持久化的键，刷新网页后据此恢复登录状态。 */
const SESSION_KEY = "lingwu.session";

// 移动端底部保留四个主入口，「我的」固定在最后。
const nav = [...MOBILE_NAV, ACCOUNT_NAV];
const titles: Partial<Record<Section, { titleKey: TranslationKey; subtitleKey: TranslationKey }>> =
  {
    today: { titleKey: "app.titleToday", subtitleKey: "app.subtitleToday" },
    watchlist: { titleKey: "app.titleWatchlist", subtitleKey: "app.subtitleWatchlist" },
    portfolio: { titleKey: "app.titlePortfolio", subtitleKey: "app.subtitlePortfolio" },
    notes: { titleKey: "app.titleNotes", subtitleKey: "app.subtitleNotes" },
    activity: { titleKey: "app.titleActivity", subtitleKey: "app.subtitleActivity" },
    ideas: { titleKey: "app.titleIdeas", subtitleKey: "app.subtitleIdeas" },
    goals: { titleKey: "app.titleGoals", subtitleKey: "app.subtitleGoals" },
    preferences: { titleKey: "app.titlePreferences", subtitleKey: "app.subtitlePreferences" },
    apps: { titleKey: "app.titleApps", subtitleKey: "app.subtitleApps" },
    account: { titleKey: "app.titleAccount", subtitleKey: "app.subtitleAccount" },
    connections: { titleKey: "app.titleConnections", subtitleKey: "app.subtitleConnections" },
    mail: { titleKey: "app.titleMail", subtitleKey: "app.subtitleMail" },
    calendar: { titleKey: "app.titleCalendar", subtitleKey: "app.subtitleCalendar" },
    browser: { titleKey: "app.titleBrowser", subtitleKey: "app.subtitleBrowser" },
    files: { titleKey: "app.titleFiles", subtitleKey: "app.subtitleFiles" },
  };

/** 应用入口：先挂载语言上下文，保证包含登录页在内的所有界面都可被翻译。 */
export default function App() {
  return (
    <I18nProvider>
      <Root />
    </I18nProvider>
  );
}

/**
 * 登录入口。
 *
 * 服务端有两种登录方式：
 * - 账号模式（配置了 Supabase）：每个用户用邮箱注册/登录，各自的工作区数据互相隔离；
 * - 访问密钥模式（未配置 Supabase）：整个部署共用一个访问密钥，即单用户部署。
 * 具体用哪种由 /api/auth/config 决定，本地示例部署仍会直接打开工作区。
 */
function Root() {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const [token, setToken] = useState(() => readStorage(SESSION_KEY) ?? "");
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [accessKey, setAccessKey] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  /** 登录成功后持久化会话令牌，刷新网页后也能自动恢复登录状态。 */
  const applySession = useCallback((nextToken: string) => {
    writeStorage(SESSION_KEY, nextToken);
    setToken(nextToken);
  }, []);
  const connect = useCallback(
    async (key?: string) => {
      setBusy(true);
      setError("");
      try {
        const session = await createSession(key);
        applySession(session.token);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [applySession],
  );
  const signOut = useCallback(() => {
    clearStorage(SESSION_KEY);
    setToken("");
  }, []);
  /** 账号模式下请求发送验证码；成功后提示用户查收邮件。 */
  const sendCode = useCallback(async () => {
    setSendingCode(true);
    setError("");
    try {
      await requestOtp(email);
      setCodeSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSendingCode(false);
    }
  }, [email]);
  /** 账号模式下校验验证码登录，成功后 token 只属于当前用户。 */
  const submitAccount = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const session = await verifyOtp({ email, code });
      applySession(session.token);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [email, code, applySession]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const config = await authConfig();
        if (cancelled) return;
        setAuthMode(config.authMode);
        if (config.authMode === "access-key") await connect();
        else setBusy(false);
      } catch {
        if (cancelled) return;
        // 读不到配置时按访问密钥模式处理，保证本地开发仍能打开工作区。
        setAuthMode("access-key");
        await connect();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connect]);
  const accountMode = authMode === "supabase";
  const wideAuth = width >= 900;
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {token ? (
        <CopilotKitProvider
          runtimeUrl={`${API_URL}/api/copilotkit`}
          headers={{ Authorization: `Bearer ${token}` }}
        >
          <WorkspaceApp token={token} onSignOut={signOut} />
        </CopilotKitProvider>
      ) : (
        <SafeAreaView
          style={{
            flex: 1,
            backgroundColor: colors.canvas,
            justifyContent: "center",
            alignItems: "center",
            paddingHorizontal: wideAuth ? space.page : 24,
            paddingVertical: 28,
          }}
        >
          <View
            style={{
              width: "100%",
              maxWidth: wideAuth ? 1020 : 440,
              flexDirection: wideAuth ? "row" : "column",
              alignItems: "stretch",
              justifyContent: "center",
              gap: wideAuth ? 64 : 22,
            }}
          >
            {wideAuth && (
              <View
                style={{
                  flex: 1,
                  minWidth: 0,
                  paddingVertical: 28,
                  paddingRight: 44,
                  borderRightWidth: 1,
                  borderRightColor: colors.line,
                  justifyContent: "space-between",
                  gap: 54,
                }}
              >
                <View style={[s.row, { gap: 10 }]}>
                  <BrandMark size={32} />
                  <Text
                    style={{
                      fontSize: 22,
                      lineHeight: 30,
                      fontWeight: "600",
                      color: colors.text,
                      letterSpacing: 2.4,
                      fontFamily: fonts.serif,
                    }}
                  >
                    {t("common.agentName")}
                  </Text>
                </View>
                <View style={{ gap: 18 }}>
                  <View style={[s.row, { gap: 8 }]}>
                    <View
                      style={{
                        width: 18,
                        height: 1,
                        backgroundColor: colors.primary,
                      }}
                    />
                    <Text style={[typography.eyebrow, { color: colors.primaryStrong }]}>
                      PERSONAL INVESTMENT INTELLIGENCE
                    </Text>
                  </View>
                  <Text
                    style={{
                      ...typography.display,
                      color: colors.heading,
                      maxWidth: 520,
                    }}
                  >
                    {t("app.welcomeTitle")}
                  </Text>
                  <Text style={[s.muted, { maxWidth: 500 }]}>{t("app.welcomeSubtitle")}</Text>
                </View>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                  {[
                    t("workbench.depthAnalysis"),
                    t("workbench.myWatchlist"),
                    t("app.personalInvestmentSpace"),
                  ].map((item) => (
                    <View
                      key={item}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 7,
                        borderWidth: 1,
                        borderColor: colors.line,
                        borderRadius: radius.control,
                        backgroundColor: colors.paper,
                      }}
                    >
                      <Text style={[s.small, { color: colors.muted }]}>{item}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
            <View
              style={{
                width: wideAuth ? 390 : "100%",
                maxWidth: 440,
                alignSelf: wideAuth ? "center" : "auto",
                gap: 22,
                alignItems: "stretch",
              }}
            >
              {!wideAuth && (
                <View style={[s.row, { justifyContent: "center", gap: 9, marginBottom: 2 }]}>
                  <BrandMark size={29} />
                  <Text
                    style={{
                      fontSize: 20,
                      fontWeight: "600",
                      letterSpacing: 2.2,
                      color: colors.text,
                      fontFamily: fonts.serif,
                    }}
                  >
                    {t("common.agentName")}
                  </Text>
                </View>
              )}
              <Card style={{ padding: 22, borderRadius: radius.panel }}>
                <View style={{ alignItems: "center", gap: 8, marginBottom: 20 }}>
                  <Mascot size={wideAuth ? 52 : 60} />
                  <Text
                    style={{
                      fontSize: 18,
                      lineHeight: 26,
                      fontWeight: "600",
                      color: colors.text,
                      textAlign: "center",
                      fontFamily: fonts.serif,
                    }}
                  >
                    {t(accountMode ? "app.signIn" : "app.openWorkspace")}
                  </Text>
                  <Text style={[s.small, { textAlign: "center", maxWidth: 300 }]}>
                    {t("app.welcomeSubtitle")}
                  </Text>
                </View>
                {authMode === null ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <>
                    <ErrorNotice error={error} />
                    {accountMode ? (
                      <>
                        <Field
                          label={t("app.emailLabel")}
                          value={email}
                          onChangeText={setEmail}
                          autoCapitalize="none"
                          autoCorrect={false}
                          keyboardType="email-address"
                          placeholder={t("app.emailPlaceholder")}
                        />
                        <Button busy={sendingCode} onPress={() => void sendCode()}>
                          {t("app.sendCode")}
                        </Button>
                        {codeSent && (
                          <Text style={[s.small, { textAlign: "center", marginTop: 10 }]}>
                            {t("app.sendCodeSent")}
                          </Text>
                        )}
                        <View style={{ marginTop: space.md }}>
                          <Field
                            label={t("app.codeLabel")}
                            value={code}
                            onChangeText={setCode}
                            autoCapitalize="none"
                            autoCorrect={false}
                            keyboardType="number-pad"
                            placeholder={t("app.codePlaceholder")}
                          />
                        </View>
                        <Button
                          primary
                          busy={busy}
                          disabled={!code}
                          onPress={() => void submitAccount()}
                        >
                          {t("app.signIn")}
                        </Button>
                      </>
                    ) : (
                      <>
                        <Field
                          label={t("app.accessKeyLabel")}
                          value={accessKey}
                          onChangeText={setAccessKey}
                          secureTextEntry
                          placeholder={t("app.accessKeyPlaceholder")}
                        />
                        <Button
                          primary
                          busy={busy}
                          onPress={() => void connect(accessKey || undefined)}
                        >
                          {t("app.openWorkspace")}
                        </Button>
                        <Text style={[s.small, { marginTop: 15, textAlign: "center" }]}>
                          {t("app.localWorkspaceHint", { url: API_URL })}
                        </Text>
                      </>
                    )}
                  </>
                )}
              </Card>
            </View>
          </View>
        </SafeAreaView>
      )}
    </SafeAreaProvider>
  );
}
function WorkspaceApp({ token, onSignOut }: { token: string; onSignOut: () => void }) {
  const { t } = useTranslation();
  const api = useMemo(() => new LingWuApi(token), [token]);
  const [workspace, setWorkspace] = useState<Workspace>();
  const [section, setSection] = useState<Section>("today");
  const [detail, setDetail] = useState<Detail>();
  const [toast, setToast] = useState<ToastState>();
  const [error, setError] = useState("");
  const [prompt, setPrompt] = useState<{
    id: number;
    text: string;
    attachmentIds?: readonly string[];
  }>();
  const refresh = useCallback(async () => {
    const [snapshot, account] = await Promise.all([
      api.request<Workspace>("/api/workspace"),
      api.request<AccountProfile>("/api/auth/me").catch(() => undefined),
    ]);
    const accountName =
      account?.displayName?.trim() || account?.email?.split("@")[0]?.trim() || undefined;
    setWorkspace({
      ...snapshot,
      profile: {
        name: accountName || snapshot.profile.name,
        email: account?.email?.trim() || snapshot.profile.email,
      },
    });
    setError("");
  }, [api]);
  /** 统一处理刷新失败：令牌过期/无效（401）时退回登录页，其余错误提示重试。 */
  const runRefresh = useCallback(() => {
    void refresh().catch((e) => {
      if ((e as { status?: number }).status === 401) onSignOut();
      else setError(String(e));
    });
  }, [refresh, onSignOut]);
  useEffect(() => {
    runRefresh();
  }, [runRefresh]);
  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") runRefresh();
    });
    return () => listener.remove();
  }, [runRefresh]);
  useEffect(() => {
    if (!toast) return;
    // P2-3：统一 3.2s 自动消失
    const timer = setTimeout(() => setToast(undefined), 3200);
    return () => clearTimeout(timer);
  }, [toast]);
  const notify = useCallback(
    (message: string, action?: { label: string; onPress: () => void }) =>
      setToast({ text: message, action }),
    [],
  );
  const navigate = useCallback(
    (next: Section) => setSection(next === "connections" ? "apps" : next),
    [],
  );
  const open = useCallback((next: Detail) => setDetail(next), []);
  const close = useCallback(() => setDetail(undefined), []);
  /** 退出登录：先让服务端作废令牌，再清空本地会话回到登录页。 */
  const signOut = useCallback(() => {
    void api.request("/api/auth/signout", {}).catch(() => undefined);
    onSignOut();
  }, [api, onSignOut]);
  const ask = useCallback((text: string, attachmentIds?: readonly string[]) => {
    setPrompt({ id: Date.now(), text, attachmentIds });
    setSection("chat");
  }, []);
  if (!workspace)
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: colors.canvas,
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          gap: 18,
        }}
      >
        <Mascot size={56} />
        {error ? (
          <>
            <ErrorNotice error={error} />
            <Button onPress={runRefresh}>{t("common.tryAgain")}</Button>
          </>
        ) : (
          <>
            <ActivityIndicator color={colors.primary} />
            <Text style={s.muted}>{t("app.openingWorkspace")}</Text>
          </>
        )}
      </SafeAreaView>
    );
  return (
    <WorkspaceContext.Provider
      value={{ workspace, api, section, navigate, refresh, open, close, notify, ask }}
    >
      <AgentWorkspaceProvider>
        <ComputerDraftProvider key={token}>
          <ThreadsProvider>
            <WorkspaceShell
              detail={detail}
              toast={toast}
              clearToast={() => setToast(undefined)}
              error={error}
              prompt={prompt}
              onSignOut={signOut}
            />
          </ThreadsProvider>
        </ComputerDraftProvider>
      </AgentWorkspaceProvider>
    </WorkspaceContext.Provider>
  );
}
function WorkspaceShell({
  detail,
  toast,
  clearToast,
  error,
  prompt,
  onSignOut,
}: {
  detail?: Detail;
  toast?: ToastState;
  clearToast: () => void;
  error: string;
  prompt?: { id: number; text: string; attachmentIds?: readonly string[] };
  onSignOut: () => void;
}) {
  const { workspace, section, navigate, open, close } = useWorkspace();
  const { t } = useTranslation();
  const { data } = useAgentWorkspace();
  const {
    selection,
    visited,
    loading: threadsLoading,
    error: threadsError,
    retry: retryThreads,
    enabled: richThreads,
  } = useLingWuThread();
  const [threadsOpen, setThreadsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { width } = useWindowDimensions();
  const desktop = width >= breakpoints.desktop;

  // P2-1 快捷键（仅 Web）：⌘J 新分析、⌘K 全局搜索、Esc 关闭浮层。
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (mod && key === "k") {
        event.preventDefault();
        setSearchOpen((value) => !value);
        return;
      }
      if (mod && key === "j") {
        event.preventDefault();
        navigate("chat");
        // 对话页监听该事件并聚焦输入框；输入法组合输入不受影响（仅带修饰键触发）。
        window.dispatchEvent(new Event("lingwu:focus-composer"));
        return;
      }
      if (event.key === "Escape") {
        if (searchOpen) {
          setSearchOpen(false);
          return;
        }
        if (threadsOpen) {
          setThreadsOpen(false);
          return;
        }
        if (detail) close();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [searchOpen, threadsOpen, detail, close, navigate]);
  // 工作台采用宽幅编辑画布，右侧信息轨由页面内部负责。
  const contentMax = desktop ? layout.contentMax : 760;
  const pending =
    (data?.notifications.filter((n) => !n.read).length || 0) +
    workspace.actions.filter((a) => a.status === "awaiting_review").length;
  // 服务端保存英文默认名 Xiao Wu，展示前按语言本地化为「小悟」或「Xiao Wu」。
  const agentName = localizeAgentName(data?.identity.name, data?.identity.nameCustomized);
  const activeMonitorCount = (data?.monitors ?? []).filter(
    (monitor) => monitor.status === "active",
  ).length;
  const monitorStatus =
    activeMonitorCount > 0
      ? t("app.activeMonitors", { count: activeMonitorCount })
      : t("app.noActiveMonitors");
  const title = titles[section] || titles.apps;
  const Screen =
    section === "today"
      ? WorkbenchScreen
      : section === "watchlist" || section === "portfolio"
        ? WatchlistHubScreen
        : section === "mail"
          ? MailScreen
          : section === "calendar"
            ? CalendarScreen
            : section === "browser"
              ? BrowserScreen
              : section === "activity" || section === "goals"
                ? TaskHubScreen
                : section === "ideas"
                  ? IdeasScreen
                  : section === "preferences"
                    ? PreferencesScreen
                    : CapabilityHubScreen;
  return (
    <>
      <WorkspaceTools />
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top", "bottom"]}>
        {/* 宽屏是「文本侧栏 + 工作区」，窄屏是单列加底部标签栏。 */}
        <View style={{ flex: 1, flexDirection: desktop ? "row" : "column" }}>
          {desktop && <Rail name={agentName} />}
          {desktop && section === "chat" && <ChatsColumn />}
          <View style={{ flex: 1, minWidth: 0 }}>
            <View
              style={{
                flex: 1,
                width: "100%",
                maxWidth: contentMax,
                alignSelf: "center",
              }}
            >
              {!desktop && (
                <View
                  style={{
                    height: layout.topBarMobile,
                    paddingTop: 4,
                    marginHorizontal: 18,
                  }}
                >
                  <View style={{ position: "absolute", left: 0, top: 4 }}>
                    <View style={[s.row, { alignItems: "center", gap: 4 }]}>
                      <IconButton
                        icon={Menu}
                        label={t("app.openConversations")}
                        onPress={() => setThreadsOpen(true)}
                      />
                      {/* 移动端顶部搜索入口：紧跟左侧栏按钮。 */}
                      <IconButton
                        icon={Search}
                        label={t("search.title")}
                        onPress={() => setSearchOpen(true)}
                      />
                    </View>
                  </View>
                  <View
                    pointerEvents="box-none"
                    style={{
                      alignItems: "center",
                      justifyContent: "center",
                      height: 56,
                    }}
                  >
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t("app.agentSettingsLabel", { name: agentName })}
                      onPress={() => open({ type: "personality" })}
                      style={({ pressed }) => ({
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 10,
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: radius.control,
                        backgroundColor: pressed ? colors.overlay1 : "transparent",
                      })}
                    >
                      <View
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: 15,
                          alignItems: "center",
                          justifyContent: "center",
                          borderWidth: 1,
                          borderColor: colors.line,
                          backgroundColor: colors.paper,
                        }}
                      >
                        <Mascot
                          size={24}
                          variant={data?.identity.avatar}
                          background={colors.paper}
                        />
                      </View>
                      <View style={{ gap: 1 }}>
                        <Text
                          numberOfLines={1}
                          style={{ fontSize: 12, fontWeight: "600", color: colors.text }}
                        >
                          {t("app.agentWatching", { name: agentName })}
                        </Text>
                        <View style={[s.row, { gap: 5 }]}>
                          <View
                            style={{
                              width: 5,
                              height: 5,
                              borderRadius: 3,
                              backgroundColor: colors.success,
                            }}
                          />
                          <Text numberOfLines={1} style={{ fontSize: 10, color: colors.muted }}>
                            {monitorStatus}
                          </Text>
                        </View>
                      </View>
                    </Pressable>
                  </View>
                  <View
                    style={{
                      position: "absolute",
                      right: 0,
                      top: 4,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    {/* 移动端的「设置」入口：始终在顶栏显示，与通知按钮同级。 */}
                    <IconButton
                      icon={Settings2}
                      label={t("details.settingsTitle")}
                      onPress={() => open({ type: "settings" })}
                    />
                    <View>
                      <IconButton
                        icon={Bell}
                        label={t("app.notificationsLabel", { count: pending })}
                        onPress={() => open({ type: "notifications" })}
                      />
                      {pending > 0 && (
                        <View
                          pointerEvents="none"
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: radius.full,
                            position: "absolute",
                            top: 8,
                            right: 9,
                            backgroundColor: colors.primary,
                          }}
                        />
                      )}
                    </View>
                  </View>
                </View>
              )}
              {desktop && (
                <View
                  style={{
                    height: layout.topBarDesktop,
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 38,
                    backgroundColor: colors.canvas,
                  }}
                >
                  <View style={[s.row, { gap: 10, flex: 1 }]}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t("app.goHome")}
                      onPress={() => navigate("today")}
                      hitSlop={6}
                      style={({ pressed }) => ({
                        minHeight: 32,
                        justifyContent: "center",
                        paddingHorizontal: 4,
                        marginHorizontal: -4,
                        borderRadius: radius.control,
                        backgroundColor: pressed ? colors.overlay1 : "transparent",
                      })}
                    >
                      <Text style={{ fontSize: 11, color: colors.muted }}>
                        {t("common.agentName")}
                      </Text>
                    </Pressable>
                    <Text style={{ fontSize: 11, color: colors.lineStrong }}>/</Text>
                    <Text style={{ fontSize: 11, color: colors.muted, fontWeight: "500" }}>
                      {section === "chat"
                        ? t("app.navChat")
                        : section === "watchlist" || section === "portfolio"
                          ? t("app.navWatchlist")
                          : section === "notes"
                            ? `${t("app.navFiles")} / ${t("app.titleNotes")}`
                            : title
                              ? t(title.titleKey)
                              : t("app.navApps")}
                    </Text>
                  </View>
                  <View style={[s.row, { gap: 8 }]}>
                    <View
                      style={[
                        s.row,
                        {
                          gap: 6,
                          marginRight: 7,
                          paddingHorizontal: 8,
                          height: 24,
                          borderRadius: radius.full,
                          borderWidth: 1,
                          borderColor: colors.line,
                          backgroundColor: colors.paper,
                        },
                      ]}
                    >
                      <View
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: radius.full,
                          backgroundColor: colors.success,
                        }}
                      />
                      <Text style={{ fontSize: 9, color: colors.faint }}>
                        {t("workbench.synced")}
                      </Text>
                    </View>
                    <IconButton
                      icon={Search}
                      label={t("search.title")}
                      onPress={() => setSearchOpen(true)}
                    />
                    <View>
                      <IconButton
                        icon={Bell}
                        label={t("app.notificationsLabel", { count: pending })}
                        onPress={() => open({ type: "notifications" })}
                      />
                      {pending > 0 && (
                        <View
                          pointerEvents="none"
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: radius.full,
                            position: "absolute",
                            top: 8,
                            right: 9,
                            backgroundColor: colors.primary,
                          }}
                        />
                      )}
                    </View>
                  </View>
                </View>
              )}
              <View style={{ flex: 1, minHeight: 0 }}>
                {section !== "chat" && (
                  <ScrollView
                    key={section}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{
                      paddingHorizontal: desktop ? space.page : space.pageMobile,
                      paddingTop: desktop ? 20 : 16,
                      paddingBottom: desktop ? 48 : 30,
                    }}
                    keyboardShouldPersistTaps="handled"
                  >
                    {section !== "today" &&
                      section !== "activity" &&
                      section !== "files" &&
                      section !== "notes" &&
                      section !== "goals" && (
                        <PageHeader
                          title={title ? t(title.titleKey) : ""}
                          description={title ? t(title.subtitleKey) : undefined}
                          compact={!desktop}
                        />
                      )}
                    <ErrorNotice error={error} />
                    {section === "account" ? (
                      <AccountScreen onSignOut={onSignOut} />
                    ) : section === "files" || section === "notes" ? (
                      <FilesScreen initialSection={section === "notes" ? "notes" : "files"} />
                    ) : (
                      <Screen />
                    )}
                  </ScrollView>
                )}
                <View
                  style={{
                    display: section === "chat" ? "flex" : "none",
                    flex: 1,
                    paddingHorizontal: desktop ? space.page : 17,
                  }}
                >
                  <AgentStatus />
                  {richThreads ? (
                    <>
                      <ErrorNotice error={threadsError} />
                      {threadsError ? (
                        <Button onPress={retryThreads}>{t("app.retryMainChat")}</Button>
                      ) : threadsLoading ? (
                        <ActivityIndicator color={colors.primary} />
                      ) : null}
                      {/* visited 由 ThreadsProvider 维护（去重追加），但并发/重试下仍会
                          出现瞬时重复 id，这里按 id 先去重再渲染，避免 React 重复 key 告警。 */}
                      {[...new Map(visited.map((t) => [t.id, t])).values()].map((thread) => (
                        <View
                          key={thread.id}
                          style={{ display: selection.id === thread.id ? "flex" : "none", flex: 1 }}
                        >
                          <ChatScreen
                            thread={thread}
                            active={section === "chat" && selection.id === thread.id}
                            prompt={selection.id === thread.id ? prompt : undefined}
                          />
                        </View>
                      ))}
                    </>
                  ) : (
                    <ChatScreen prompt={prompt} active={section === "chat"} />
                  )}
                </View>
              </View>
              {!desktop && (
                <View
                  style={{
                    paddingHorizontal: 10,
                    paddingTop: 5,
                    paddingBottom: 7,
                    alignItems: "center",
                    borderTopWidth: 1,
                    borderTopColor: colors.line,
                    backgroundColor: colors.paper,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      width: "100%",
                      maxWidth: 560,
                    }}
                  >
                    {nav.map((item) => {
                      const active =
                        section === item.id ||
                        (item.id === "watchlist" && section === "portfolio") ||
                        (item.id === "activity" && section === "goals") ||
                        (item.id === "today" && ["watchlist", "portfolio"].includes(section)) ||
                        (item.id === "files" && section === "notes") ||
                        (item.id === "account" &&
                          ["preferences", "apps", "connections"].includes(section));
                      return (
                        <Pressable
                          key={item.id}
                          accessibilityRole="tab"
                          accessibilityLabel={t(item.labelKey)}
                          accessibilityState={{ selected: active }}
                          onPress={() => navigate(item.id)}
                          style={({ pressed }) => ({
                            position: "relative",
                            flex: 1,
                            minHeight: layout.bottomNav - 12,
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 4,
                            backgroundColor: pressed ? colors.surface : "transparent",
                          })}
                        >
                          {active && (
                            <View
                              pointerEvents="none"
                              style={{
                                position: "absolute",
                                top: -1,
                                width: 18,
                                height: 2,
                                borderRadius: radius.full,
                                backgroundColor: colors.primary,
                              }}
                            />
                          )}
                          <item.icon
                            size={20}
                            strokeWidth={active ? iconStroke.nav : iconStroke.tab}
                            color={active ? colors.primary : colors.faint}
                          />
                          <Text
                            numberOfLines={1}
                            style={{
                              fontSize: typography.eyebrow.fontSize,
                              fontWeight: active ? "600" : "500",
                              color: active ? colors.primaryStrong : colors.faint,
                            }}
                          >
                            {t(item.labelKey)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}
            </View>
          </View>
        </View>
        <Toast toast={toast} onDismiss={clearToast} />
        {threadsOpen && <ThreadsSheet onClose={() => setThreadsOpen(false)} />}
        {searchOpen && <GlobalSearchSheet onClose={() => setSearchOpen(false)} />}
        {detail && (
          <Details
            key={
              detail.type === "task"
                ? detail.taskId
                : detail.type === "file"
                  ? detail.file.id
                  : detail.type === "browser"
                    ? detail.browser.id
                    : detail.type === "mail"
                      ? detail.mail.id
                      : detail.type === "review"
                        ? detail.action.id
                        : detail.type === "email"
                          ? JSON.stringify(detail.draft)
                          : detail.type === "event"
                            ? detail.event?.id || "event-new"
                            : detail.type === "artifact"
                              ? detail.artifact.id
                              : detail.type
            }
            detail={detail}
          />
        )}
      </SafeAreaView>
    </>
  );
}
