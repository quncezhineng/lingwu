import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { useAgentSpace } from "../agent-space";
import { useAgentWorkspace } from "../agent-workspace";
import { Text } from "../app-text";
import { selectBotResources } from "../bot-resources";
import { ChevronLeft } from "../icons";
import { colors, Sheet, s } from "../ui";
import { useWorkspace } from "../workspace";

/** embedded 为真时只渲染内容，由外层的独立页面提供标题与容器。 */
export type BotPageProps = { onClose: () => void; embedded?: boolean };

export function BotPage({
  title,
  subtitle,
  onClose,
  children,
  embedded = false,
}: BotPageProps & { title: string; subtitle?: string; children: ReactNode }) {
  const { current } = useAgentSpace();
  if (embedded) return <View style={{ gap: 2 }}>{children}</View>;
  return (
    <Sheet botLayout title={title} subtitle={subtitle ?? current.name} onClose={onClose}>
      {children}
    </Sheet>
  );
}

export function BotEmpty({ children }: { children: ReactNode }) {
  return <Text style={[s.muted, { paddingVertical: 24, lineHeight: 22 }]}>{children}</Text>;
}

/**
 * 嵌入模式下的返回入口。
 *
 * 浮层里由标题栏承担「回到列表」，独立页面没有这一层，
 * 因此嵌套的编辑态需要自己给出一条返回路径。
 */
export function BotInlineBack({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      hitSlop={8}
      style={{
        alignSelf: "flex-start",
        flexDirection: "row",
        alignItems: "center",
        gap: 3,
        paddingVertical: 5,
        marginBottom: 6,
      }}
    >
      <ChevronLeft size={15} color={colors.muted} />
      <Text style={[s.small, { fontSize: 12, color: colors.muted }]}>{label}</Text>
    </Pressable>
  );
}

export function useBotResources() {
  const { current } = useAgentSpace();
  const { data } = useAgentWorkspace();
  const { workspace } = useWorkspace();
  return { current, data, ...selectBotResources(current, data, workspace.files) };
}
