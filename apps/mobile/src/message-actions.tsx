import { type ReactNode, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { Text } from "./app-text";
import { AssistantResponse } from "./assistant-response";
import { useTranslation } from "./i18n";
import { Copy, Image, Link2, Share2, ThumbsDown, ThumbsUp } from "./icons";
import { copyText, shareLink, shareText } from "./message-share";
import { captureAndShare } from "./message-share-image";
import { colors, radius } from "./theme";

/** 操作完成后给用户一次性提示（复用工作区的 toast）。 */
type Notify = (message: string) => void;

/** 发布一张「提问 + 回复」的公开网页，返回可分享的链接。 */
type PublishShare = (input: { question: string; answer: string }) => Promise<string>;

/**
 * 每条助手回复下方的操作栏：点赞、不喜欢、复制为 Markdown、分享（图片 / 链接）。
 *
 * 「分享为图片」通过离屏渲染一张与正文一致的 Markdown 卡片，再用截图能力
 * 捕获为 PNG 分享，避免侵入聊天列表的 ref 管理，也保证分享内容不含操作栏本身。
 * 「分享为链接」把对话发布成公开网页，再把链接交给系统分享面板。
 */
export function MessageActions({
  markdown,
  prompt = "",
  onNotify,
  onPublishShare,
}: {
  markdown: string;
  /** 该条回复对应的用户提问；有值时一并出现在分享的图片与网页里。 */
  prompt?: string;
  onNotify?: Notify;
  onPublishShare?: PublishShare;
}) {
  const { t } = useTranslation();
  // 点赞与点踩互斥：再次点击已选中的一侧取消选择。
  const [feedback, setFeedback] = useState<"like" | "dislike" | null>(null);
  const [copied, setCopied] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const captureRef = useRef<View>(null);
  const question = prompt.trim();

  const onToggleFeedback = (value: "like" | "dislike") =>
    setFeedback((current) => (current === value ? null : value));

  const onCopy = async () => {
    try {
      await copyText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
      onNotify?.(t("chat.copiedMarkdown"));
    } catch {
      onNotify?.(t("chat.copyFailed"));
    }
  };

  const onShareImage = async () => {
    setShareOpen(false);
    if (sharing) return;
    setSharing(true);
    try {
      // 等离屏卡片挂载并完成布局后再截图，避免拿到空尺寸。
      await waitForRef(captureRef);
      const result = await captureAndShare(captureRef);
      if (result === "shared") onNotify?.(t("chat.shareImageShared"));
      else if (result === "downloaded") onNotify?.(t("chat.shareImageSaved"));
      else onNotify?.(t("chat.shareImageFailed"));
    } catch {
      onNotify?.(t("chat.shareImageFailed"));
    } finally {
      setSharing(false);
    }
  };

  const onShareLink = async () => {
    setShareOpen(false);
    if (publishing) return;

    // 首选：把这一轮对话发布成公开网页，分享页面链接（收件人无需登录即可阅读）。
    if (onPublishShare) {
      setPublishing(true);
      try {
        const url = await onPublishShare({ question, answer: markdown });
        const result = await shareLink(url, question || undefined);
        onNotify?.(t(result === "copied" ? "chat.sharePageCopied" : "chat.sharePageShared"));
      } catch {
        onNotify?.(t("chat.sharePageFailed"));
      } finally {
        setPublishing(false);
      }
      return;
    }

    // 未接入公开页能力时降级：分享当前页面链接 + 对话文本。
    try {
      const body = question ? `${question}\n\n---\n\n${markdown}` : markdown;
      const result = await shareText(body);
      onNotify?.(t(result === "copied" ? "chat.shareLinkCopied" : "chat.shareLinkShared"));
    } catch {
      onNotify?.(t("chat.shareFailed"));
    }
  };

  return (
    <>
      {/* 离屏截图卡片：仅在「分享为图片」时挂载，位置移出可视区但保持真实渲染。 */}
      {sharing && (
        <View
          ref={captureRef}
          collapsable={false}
          style={styles.captureCard}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <View style={styles.captureInner}>
            {question ? (
              <View style={styles.capturePrompt}>
                <Text style={styles.capturePromptLabel}>{t("chat.sharePromptLabel")}</Text>
                <Text style={styles.capturePromptText} selectable>
                  {question}
                </Text>
              </View>
            ) : null}
            <AssistantResponse content={markdown} />
          </View>
        </View>
      )}

      <View style={styles.row}>
        <ActionButton
          label={t(feedback === "like" ? "chat.liked" : "chat.like")}
          active={feedback === "like"}
          onPress={() => onToggleFeedback("like")}
        >
          <ThumbsUp
            size={15}
            color={feedback === "like" ? colors.primary : colors.muted}
            fill={feedback === "like" ? colors.primary : undefined}
          />
        </ActionButton>
        <ActionButton
          label={t(feedback === "dislike" ? "chat.disliked" : "chat.dislike")}
          active={feedback === "dislike"}
          onPress={() => onToggleFeedback("dislike")}
        >
          <ThumbsDown
            size={15}
            color={feedback === "dislike" ? colors.primary : colors.muted}
            fill={feedback === "dislike" ? colors.primary : undefined}
          />
        </ActionButton>
        <ActionButton
          label={t(copied ? "chat.copiedMarkdown" : "chat.copyMarkdown")}
          onPress={onCopy}
        >
          <Copy size={15} color={copied ? colors.primary : colors.muted} />
        </ActionButton>
        <View style={styles.shareWrap}>
          <ActionButton
            label={t("chat.share")}
            active={shareOpen}
            onPress={() => setShareOpen((value) => !value)}
          >
            <Share2 size={15} color={shareOpen ? colors.primary : colors.muted} />
          </ActionButton>
          {shareOpen && (
            <View style={styles.shareMenu}>
              <ShareMenuItem
                icon={<Image size={14} color={colors.text} />}
                label={t("chat.shareImage")}
                disabled={sharing}
                onPress={onShareImage}
              />
              <ShareMenuItem
                icon={<Link2 size={14} color={colors.text} />}
                label={publishing ? t("chat.sharePublishing") : t("chat.shareLink")}
                disabled={publishing}
                onPress={onShareLink}
              />
            </View>
          )}
        </View>
      </View>
    </>
  );
}

/**
 * 轮询等待离屏卡片的 ref 就绪。
 *
 * 卡片是「点分享时才挂载」的，setState 之后到 ref 赋值之间有一段时间；
 * 这里最多等约 500ms，避免直接截图拿到 null。
 */
async function waitForRef<T>(ref: { current: T | null }): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (ref.current) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

function ShareMenuItem({
  icon,
  label,
  disabled = false,
  onPress,
}: {
  icon: ReactNode;
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.shareMenuItem,
        pressed && { backgroundColor: colors.overlay1 },
        disabled && { opacity: 0.5 },
      ]}
    >
      {icon}
      <Text style={styles.shareMenuLabel}>{label}</Text>
    </Pressable>
  );
}

function ActionButton({
  label,
  onPress,
  active = false,
  children,
}: {
  label: string;
  onPress: () => void;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        styles.button,
        (pressed || active) && { backgroundColor: colors.overlay1 },
      ]}
    >
      {children}
      <Text style={[styles.label, active && { color: colors.primaryStrong }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: radius.control,
  },
  label: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.muted,
  },
  shareWrap: {
    position: "relative",
  },
  shareMenu: {
    position: "absolute",
    bottom: 30,
    left: 0,
    minWidth: 140,
    paddingVertical: 4,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paper,
    ...Platform.select({
      web: { boxShadow: "0 2px 12px rgba(0,0,0,0.08)" },
      default: {
        shadowColor: "#000",
        shadowOpacity: 0.08,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 2 },
        elevation: 3,
      },
    }),
  },
  shareMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  shareMenuLabel: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.text,
  },
  captureCard: {
    // Web 用 fixed 让离屏卡片脱离聊天滚动容器的 overflow 裁剪，
    // 否则 html2canvas 克隆 DOM 时会把卡片裁掉，截出空白图。
    // RN 的 ViewStyle 类型未收录 "fixed"，但 react-native-web 运行时支持。
    ...(Platform.OS === "web"
      ? { position: "fixed" as "absolute" }
      : { position: "absolute" as const }),
    left: -10000,
    top: 0,
    width: 600,
  },
  captureInner: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paper,
  },
  capturePrompt: {
    marginBottom: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.field,
    backgroundColor: colors.surfaceSoft,
  },
  capturePromptLabel: {
    marginBottom: 5,
    fontSize: 11,
    lineHeight: 16,
    color: colors.muted,
  },
  capturePromptText: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.text,
  },
});
