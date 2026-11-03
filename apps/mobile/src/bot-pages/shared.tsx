import type { ReactNode } from "react";
import { useAgentSpace } from "../agent-space";
import { useAgentWorkspace } from "../agent-workspace";
import { Text } from "../app-text";
import { selectBotResources } from "../bot-resources";
import { Sheet, s } from "../ui";
import { useWorkspace } from "../workspace";

export type BotPageProps = { onClose: () => void };

export function BotPage({
  title,
  subtitle,
  onClose,
  children,
}: BotPageProps & { title: string; subtitle?: string; children: ReactNode }) {
  const { current } = useAgentSpace();
  return (
    <Sheet botLayout title={title} subtitle={subtitle ?? current.name} onClose={onClose}>
      {children}
    </Sheet>
  );
}

export function BotEmpty({ children }: { children: ReactNode }) {
  return <Text style={[s.muted, { paddingVertical: 24, lineHeight: 22 }]}>{children}</Text>;
}

export function useBotResources() {
  const { current } = useAgentSpace();
  const { data } = useAgentWorkspace();
  const { workspace } = useWorkspace();
  return { current, data, ...selectBotResources(current, data, workspace.files) };
}
