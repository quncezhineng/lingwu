import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "./app-text";
import { useTranslation } from "./i18n";
import { Copy } from "./icons";
import { copyText } from "./message-share";
import { formatMessageTime } from "./message-time";
import { colors } from "./theme";

/**
 * 提问气泡右下角的一行元信息：发送时间 + 复制按钮。
 *
 * 助手回复下方的操作栏是「评价这条回答」，用户提问只需要「什么时候问的」和
 * 「把问题再抄一遍」，所以这里是极简的一行，贴着气泡右边缘。
 */
export function UserMessageMeta({
  text,
  at = 0,
  onNotify,
}: {
  /** 复制的内容：界面上展示的提问正文，不含附件标记。 */
  text: string;
  /** 发送时间（毫秒）。0 表示没有时间记录，此时只显示复制按钮。 */
  at?: number;
  onNotify?: (message: string) => void;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const time = formatMessageTime(at);

  const onCopy = async () => {
    try {
      await copyText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
      onNotify?.(t("chat.copiedQuestion"));
    } catch {
      onNotify?.(t("chat.copyFailed"));
    }
  };

  return (
    <View style={styles.row}>
      {time ? <Text style={styles.time}>{time}</Text> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("chat.copyQuestion")}
        hitSlop={8}
        onPress={onCopy}
        style={({ pressed }) => [styles.button, pressed && { opacity: 0.6 }]}
      >
        <Copy size={13} color={copied ? colors.primary : colors.muted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    // 气泡本身是右对齐的，这一行跟着贴右下角，不额外加内边距。
    alignSelf: "flex-end",
  },
  time: {
    fontSize: 11,
    lineHeight: 16,
    color: colors.faint,
  },
  button: {
    paddingVertical: 1,
  },
});
