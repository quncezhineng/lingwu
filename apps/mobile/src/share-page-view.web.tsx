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
import { colors, grid, radius, space, textScale, typography } from "./theme";

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

export default function SharePageView({ id, broken = false }: { id: string; broken?: boolean }) {
  const [state, setState] = useState<ShareState>({ status: "loading" });
  // 重试计数：变化即重新取数，失败态不必刷新整页。
  const [attempt, setAttempt] = useState(0);
  const { width } = useWindowDimensions();
  const compact = width <= 520;

  useEffect(() => {
    // 链接本身就不完整时无可取：直接停在提示上，别发一次注定 404 的请求。
    if (broken) return;
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
  }, [id, attempt, broken]);

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

          {broken ? (
            <View style={styles.card}>
              <Text style={styles.hint}>这个分享链接不完整，请让发送方重新复制一次。</Text>
            </View>
          ) : null}

          {!broken && state.status === "loading" ? (
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

/**
 * 分享页排版按 TDesign 4px 栅格 + 字号 +8 行高韵律收敛，
 * 并与 `apps/server/src/share-routes.ts` 的服务端兜底页保持同一套间距与阅读列宽度。
 * 所有颜色仍取自 `colors`，配色零改动。
 */
const styles = StyleSheet.create({
  canvas: { flex: 1, backgroundColor: colors.canvas },
  scroller: { flex: 1 },
  scrollContent: {
    alignItems: "center",
    paddingHorizontal: space.xl,
    paddingTop: space.section,
    paddingBottom: space.hero,
  },
  scrollContentCompact: {
    paddingHorizontal: space.md,
    paddingTop: space.xl,
    paddingBottom: space.xxxl,
  },
  // 与服务端分享页一致：阅读列上限 760，超出后居中留白。
  page: { width: "100%", maxWidth: grid.readingMax },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    marginBottom: space.md,
  },
  logo: { width: 22, height: 22, borderRadius: radius.default },
  brandName: { fontSize: 13, letterSpacing: 0.3, color: colors.muted },
  home: {
    marginLeft: "auto",
    paddingHorizontal: space.md,
    paddingVertical: space.xxs,
    borderRadius: radius.circle,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paper,
  },
  homeText: {
    fontSize: 13,
    lineHeight: textScale.bodyMedium.lineHeight,
    color: colors.primaryStrong,
  },
  card: {
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.large,
    paddingVertical: space.xl,
    paddingHorizontal: space.xl,
  },
  cardCompact: {
    paddingVertical: space.lg,
    paddingHorizontal: space.md,
    borderRadius: radius.medium,
  },
  centerCard: { alignItems: "center", gap: space.tight },
  hint: { ...typography.body, color: colors.text },
  ask: {
    backgroundColor: colors.surfaceSoft,
    borderRadius: radius.medium,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    marginBottom: space.xl,
  },
  askLabel: {
    fontSize: 11,
    letterSpacing: 0.4,
    color: colors.muted,
    marginBottom: space.xxs,
  },
  askText: { ...typography.body, color: colors.text },
  actions: { flexDirection: "row", gap: space.tight, marginTop: space.md },
  action: {
    paddingHorizontal: space.md,
    paddingVertical: space.compact,
    borderRadius: radius.circle,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paper,
  },
  actionText: {
    fontSize: 13,
    lineHeight: textScale.bodyMedium.lineHeight,
    color: colors.primaryStrong,
  },
  foot: {
    marginTop: space.lg,
    ...textScale.bodySmall,
    color: colors.muted,
    textAlign: "center",
  },
});
