import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { Text } from "./app-text";
import { AssistantResponse } from "./assistant-response";
import { fetchSharedConversation, sharedPageUrl } from "./share-page-data";
import { formatShareDay, type SharedConversation } from "./share-page-model";
import { colors, radius } from "./theme";

/**
 * 前端域名下的公开分享页（Web）。
 *
 * 「分享为链接」生成的链接指向前端域名（PUBLIC_WEB_URL），收件人直开 `/s/:id`
 * 时命中这个 SPA 入口：跳过登录与工作区，直接渲染这里。正文由 `GET /s/:id/data`
 * 取回后用应用内的 Markdown 渲染器绘制，不再把服务端页面套进 iframe ——
 * 跨域内嵌、高度坍塌、iframe 内无法滚动这类问题一并消失。
 */

type ShareState =
  | { status: "loading" }
  | { status: "ready"; share: SharedConversation }
  | { status: "missing" }
  | { status: "error" };

export default function SharePageView({ id }: { id: string }) {
  const [state, setState] = useState<ShareState>({ status: "loading" });
  // 重试计数：变化即重新取数，失败态不必刷新整页。
  const [attempt, setAttempt] = useState(0);
  const { width } = useWindowDimensions();
  const compact = width <= 520;

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setState({ status: "loading" });
    void fetchSharedConversation(id, controller.signal)
      .then((result) => {
        if (!active) return;
        if (result.status === "ok") setState({ status: "ready", share: result.share });
        else setState({ status: result.status === "missing" ? "missing" : "error" });
      })
      // 主动取消不是错误：组件已卸载或 id 变了，交给下一次请求。
      .catch(() => {});
    return () => {
      active = false;
      controller.abort();
    };
  }, [id, attempt]);

  // 分享页是独立页面：标签页标题跟随提问，转发到聊天软件时也更容易辨认。
  useEffect(() => {
    if (state.status !== "ready" || typeof document === "undefined") return;
    const question = state.share.question.trim();
    document.title = question ? question.slice(0, 48) : "灵悟 · 对话分享";
  }, [state]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  return (
    <View style={styles.canvas}>
      <ScrollView
        style={styles.scroller}
        contentContainerStyle={[styles.scrollContent, compact && styles.scrollContentCompact]}
      >
        <View style={styles.page}>
          <View style={styles.brand}>
            <Image
              source={require("../assets/logo.png")}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.brandName}>灵悟</Text>
            <Pressable
              accessibilityRole="link"
              onPress={() => {
                if (typeof window !== "undefined") window.location.assign("/");
              }}
              style={styles.home}
            >
              <Text style={styles.homeText}>进入主页</Text>
            </Pressable>
          </View>

          {state.status === "loading" ? (
            <View style={[styles.card, styles.centerCard]}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.hint}>正在加载分享…</Text>
            </View>
          ) : null}

          {state.status === "missing" ? (
            <View style={styles.card}>
              <Text style={styles.hint}>这个分享不存在，或者已经失效了。</Text>
            </View>
          ) : null}

          {state.status === "error" ? (
            <View style={styles.card}>
              <Text style={styles.hint}>分享加载失败，请检查网络后重试。</Text>
              <View style={styles.actions}>
                <Pressable accessibilityRole="button" onPress={retry} style={styles.action}>
                  <Text style={styles.actionText}>重试</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="link"
                  onPress={() => void Linking.openURL(sharedPageUrl(id)).catch(() => {})}
                  style={styles.action}
                >
                  <Text style={styles.actionText}>打开原文页面</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {state.status === "ready" ? (
            <>
              <View style={[styles.card, compact && styles.cardCompact]}>
                {state.share.question.trim() ? (
                  <View style={styles.ask}>
                    <Text style={styles.askLabel}>提问</Text>
                    <Text selectable style={styles.askText}>
                      {state.share.question.trim()}
                    </Text>
                  </View>
                ) : null}
                <AssistantResponse content={state.share.answer} />
              </View>
              <Text style={styles.foot}>
                由灵悟生成
                {formatShareDay(state.share.createdAt)
                  ? ` · ${formatShareDay(state.share.createdAt)}`
                  : ""}
              </Text>
            </>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: { flex: 1, backgroundColor: colors.canvas },
  scroller: { flex: 1 },
  scrollContent: {
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 56,
  },
  scrollContentCompact: { paddingHorizontal: 14, paddingTop: 24, paddingBottom: 40 },
  // 与服务端分享页一致：阅读列上限 720，超出后居中留白。
  page: { width: "100%", maxWidth: 720 },
  brand: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 },
  logo: { width: 22, height: 22, borderRadius: 6 },
  brandName: { fontSize: 13, letterSpacing: 0.3, color: colors.muted },
  home: {
    marginLeft: "auto",
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paper,
  },
  homeText: { fontSize: 13, color: colors.primaryStrong },
  card: {
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingVertical: 22,
    paddingHorizontal: 24,
  },
  cardCompact: { paddingVertical: 18, paddingHorizontal: 16, borderRadius: 10 },
  centerCard: { alignItems: "center", gap: 10 },
  hint: { fontSize: 15, lineHeight: 25, color: colors.text },
  ask: {
    backgroundColor: colors.surfaceSoft,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 20,
  },
  askLabel: { fontSize: 11, letterSpacing: 0.4, color: colors.muted, marginBottom: 5 },
  askText: { fontSize: 15, lineHeight: 25, color: colors.text },
  actions: { flexDirection: "row", gap: 10, marginTop: 14 },
  action: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paper,
  },
  actionText: { fontSize: 13, color: colors.primaryStrong },
  foot: { marginTop: 18, fontSize: 12, color: colors.muted, textAlign: "center" },
});
