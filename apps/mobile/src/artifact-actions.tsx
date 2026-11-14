/**
 * 报告产物上的「分享 / 导出」动作组。
 *
 * 同一组动作要出现在对话卡片、右侧「资料」列表、报告详情页三种容器里，
 * 尺寸与形态各不相同，所以这里只做一处实现、三种排版：
 *
 * - `buttons`：卡片底部的两个小按钮（分享 / 导出 HTML）；
 * - `full`：详情页工具栏，额外给出 Markdown 导出与「复制为 Markdown」；
 * - `links`：洞察卡页脚的纯文字动作，与「讲浅一点 / 我有不同看法」同排。
 *
 * 分享走公开分享页（收件人无需登录），导出走本地文件；两条链路都在完成后
 * 用工作区的 toast 反馈结果，失败不会静默。
 */
import { useState } from "react";
import { Pressable, View } from "react-native";
import type { AgentArtifact } from "../../../packages/domain/src/agent";
import { Text } from "./app-text";
import { type ArtifactExportFormat, artifactExportText } from "./artifact-export";
import { exportArtifact, shareArtifactLink } from "./artifact-share";
import { useTranslation } from "./i18n";
import { ArrowDownToLine, Copy, FileText, Link2, Share2 } from "./icons";
import { copyText } from "./message-share";
import { colors, typography } from "./theme";
import { Button } from "./ui";
import { useWorkspace } from "./workspace";

type ArtifactAction = "share" | ArtifactExportFormat | "copy";

export function ArtifactActions({
  artifact,
  variant = "buttons",
  onDone,
}: {
  artifact: AgentArtifact;
  variant?: "buttons" | "full" | "links";
  /** 动作完成后回调（例如关闭浮层或收起菜单）。 */
  onDone?: () => void;
}) {
  const { api, notify } = useWorkspace();
  const { t } = useTranslation();
  const [busy, setBusy] = useState<ArtifactAction | null>(null);

  const share = async () => {
    if (busy) return;
    setBusy("share");
    try {
      const { result } = await shareArtifactLink(api, artifact);
      notify(t(result === "copied" ? "agent.artifactShareCopied" : "agent.artifactShareShared"));
      onDone?.();
    } catch {
      notify(t("agent.artifactShareFailed"));
    } finally {
      setBusy(null);
    }
  };

  const save = async (format: ArtifactExportFormat) => {
    if (busy) return;
    setBusy(format);
    try {
      const name = await exportArtifact(artifact, format);
      notify(t("agent.artifactExported", { name }));
      onDone?.();
    } catch {
      notify(t("agent.artifactExportFailed"));
    } finally {
      setBusy(null);
    }
  };

  const copy = async () => {
    if (busy) return;
    setBusy("copy");
    try {
      await copyText(artifactExportText(artifact, "markdown"));
      notify(t("agent.artifactCopied"));
      onDone?.();
    } catch {
      notify(t("agent.artifactCopyFailed"));
    } finally {
      setBusy(null);
    }
  };

  if (variant === "links") {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <LinkAction
          label={t("agent.artifactShare")}
          disabled={!!busy}
          onPress={() => void share()}
        />
        <LinkAction
          label={t("agent.artifactExport")}
          disabled={!!busy}
          onPress={() => void save("html")}
        />
      </View>
    );
  }

  const full = variant === "full";
  return (
    <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
      <Button
        size="sm"
        variant={full ? "ghost" : "outline"}
        icon={full ? Link2 : Share2}
        busy={busy === "share"}
        onPress={() => void share()}
      >
        {t(full ? "agent.artifactShareLink" : "agent.artifactShare")}
      </Button>
      <Button
        size="sm"
        variant={full ? "ghost" : "outline"}
        icon={ArrowDownToLine}
        busy={busy === "html"}
        onPress={() => void save("html")}
      >
        {t(full ? "agent.artifactExportHtml" : "agent.artifactExport")}
      </Button>
      {full && (
        <>
          <Button
            size="sm"
            variant="ghost"
            icon={FileText}
            busy={busy === "markdown"}
            onPress={() => void save("markdown")}
          >
            {t("agent.artifactExportMarkdown")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={Copy}
            busy={busy === "copy"}
            onPress={() => void copy()}
          >
            {t("agent.artifactCopyMarkdown")}
          </Button>
        </>
      )}
    </View>
  );
}

/** 页脚文字动作：与洞察卡既有动作（讲浅一点 / 我有不同看法）同一排版。 */
function LinkAction({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: disabled ? 0.5 : pressed ? 0.7 : 1 })}
    >
      <Text style={[typography.caption, { color: colors.link }]}>{label}</Text>
    </Pressable>
  );
}
