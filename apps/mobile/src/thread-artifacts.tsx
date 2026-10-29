import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { Artifact, BrowserSession } from "../../../packages/domain/src";
import type { AgentArtifact, AgentTask } from "../../../packages/domain/src/agent";
import { ArtifactCard, TaskCard } from "./agent-ui";
import { useAgentWorkspace } from "./agent-workspace";
import { BrowserThreadCard } from "./computer";
import { fileKind, fileTypeName } from "./file-kind";
import { useTranslation } from "./i18n";
import { ChevronRight, FileText } from "./icons";
import { PlanCard } from "./plan-card";
import { QuestionCard, taskHasQuestion } from "./question-card";
import { Button, colors, ErrorNotice, s } from "./ui";
import { useWorkspace } from "./workspace";

export function FileThreadCard({ file }: { file: Artifact }) {
  const { open } = useWorkspace();
  const { t } = useTranslation();
  const kind = fileKind(file);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(
        kind === "html" ? "tools.openHtml" : kind === "pdf" ? "tools.openPdf" : "tools.openFile",
        { name: file.name },
      )}
      onPress={() => open({ type: "file", file })}
      // 产物条目：白底 + 1px 描边的紧凑卡片，按压态用 overlay1
      style={({ pressed }) => [
        s.card,
        { padding: 12, gap: 8, width: "100%", maxWidth: 440 },
        pressed && { backgroundColor: colors.overlay1 },
      ]}
    >
      <View style={{ borderRadius: 10, padding: 12, backgroundColor: colors.surface, gap: 8 }}>
        <Text style={s.heading}>{file.name.replace(/\.(pdf|html?)$/i, "")}</Text>
        {file.fields?.length ? (
          file.fields.slice(0, 4).map((field) => (
            <View
              key={field.name}
              style={{
                gap: 4,
                borderBottomWidth: 1,
                borderBottomColor: colors.line,
                paddingBottom: 8,
              }}
            >
              <Text style={[s.small, { fontSize: 10 }]}>
                {field.name.replace(/_/g, " ").toUpperCase()}
              </Text>
              <Text style={[s.text, { fontSize: 13, fontVariant: ["tabular-nums"] as const }]}>
                {field.value || "—"}
              </Text>
            </View>
          ))
        ) : (
          <Text style={s.muted}>
            {kind === "html"
              ? t("tools.fileHtmlTap")
              : kind === "pdf"
                ? file.pageCount === 1
                  ? t("tools.fileTapSingle")
                  : t("tools.fileTapPlural", { pageCount: file.pageCount })
                : t("tools.fileOpenTap")}
          </Text>
        )}
      </View>
      <View style={[s.row, { gap: 12 }]}>
        <View style={[s.iconBox, { width: 40, height: 40 }]}>
          <FileText size={20} color={colors.primary} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text numberOfLines={2} style={s.heading}>
            {file.name}
          </Text>
          <Text style={s.muted}>{fileTypeName(file)}</Text>
        </View>
        <ChevronRight size={18} color={colors.muted} />
      </View>
    </Pressable>
  );
}
/** Hydrates task-linked artifacts by ID on replay; signed URLs are never stored in messages. */
export function TaskThreadCard({ task }: { task: AgentTask }) {
  const { api } = useWorkspace();
  const { data } = useAgentWorkspace();
  const { t } = useTranslation();
  const [detail, setDetail] = useState<{
    artifacts: AgentArtifact[];
    files: Artifact[];
    browsers: BrowserSession[];
  }>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void api
      .request<{ artifacts: AgentArtifact[]; files: Artifact[]; browsers: BrowserSession[] }>(
        `/api/agent/tasks/${task.id}`,
      )
      .then((result) => {
        if (active) {
          setDetail(result);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      active = false;
    };
  }, [api, task.id, task.updatedAt, attempt]);
  const hasQuestion = taskHasQuestion(task);
  return (
    <View style={{ gap: 12 }}>
      <QuestionCard task={task} agentName={data?.identity.name} />
      {/* 计划卡独立视觉：有步骤就展示步骤列表，不再用任务卡冒充计划卡 */}
      {!hasQuestion &&
        (task.plan.length ? (
          <PlanCard steps={task.plan} title={task.title} />
        ) : (
          <TaskCard task={task} compact />
        ))}
      {detail?.browsers.map((browser) => (
        <BrowserThreadCard key={browser.id} browser={browser} />
      ))}
      {[...(detail?.files || [])]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 1)
        .map((file) => (
          <FileThreadCard key={file.id} file={file} />
        ))}
      {detail?.artifacts.map((artifact) => (
        <ArtifactCard key={artifact.id} artifact={artifact} />
      ))}
      <ErrorNotice error={error} />
      {!!error && (
        <Button small onPress={() => setAttempt((value) => value + 1)}>
          {t("tools.reloadTaskResults")}
        </Button>
      )}
    </View>
  );
}
