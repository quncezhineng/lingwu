import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { type AgentArtifact, artifactChatBrief } from "../../../packages/domain/src/agent";
import { useAgentWorkspace } from "./agent-workspace";
import { Text } from "./app-text";
import { AssistantResponse } from "./assistant-response";
import { useTranslation } from "./i18n";
import { colors, radius } from "./theme";
import { useWorkspace } from "./workspace";

/** 对话里的报告摘要：只显示模型写好的短结论。还没有时向服务端要一次。 */
export function ReportBriefCard({ artifact }: { artifact: AgentArtifact }) {
  const brief = artifactChatBrief(artifact.data);
  const { t } = useTranslation();
  const { api, open } = useWorkspace();
  const { refresh } = useAgentWorkspace();
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (brief) return;
    let cancelled = false;
    setFailed(false);
    void api
      .request<AgentArtifact>(`/api/agent/artifacts/${artifact.id}/brief`, {})
      .then(() => refresh().catch(() => {}))
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [api, artifact.id, attempt, brief, refresh]);
  return (
    <View
      style={{
        paddingHorizontal: 14,
        paddingVertical: 11,
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: colors.line,
        backgroundColor: colors.paper,
      }}
    >
      {brief ? (
        <AssistantResponse
          content={brief}
          streaming={false}
          files={[]}
          onOpenFile={(file) => open({ type: "file", file })}
        />
      ) : failed ? (
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 14, lineHeight: 22, color: colors.muted }}>
            {t("chat.summaryUnavailable")}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("chat.retrySummary")}
            onPress={() => setAttempt((value) => value + 1)}
          >
            <Text style={{ fontSize: 13, lineHeight: 20, color: colors.primaryStrong }}>
              {t("chat.retrySummary")}
            </Text>
          </Pressable>
        </View>
      ) : (
        <Text style={{ fontSize: 14, lineHeight: 22, color: colors.muted }}>
          {t("chat.summarizingReport")}
        </Text>
      )}
    </View>
  );
}
