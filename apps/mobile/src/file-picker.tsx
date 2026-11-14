import { type ReactNode, useState } from "react";
import { Pressable, View } from "react-native";
import type { Artifact } from "../../../packages/domain/src";
import type { AgentArtifact } from "../../../packages/domain/src/agent";
import { Text } from "./app-text";
import { fileSourceLabel } from "./file-library";
import { useTranslation } from "./i18n";
import { statusLabel } from "./i18n/translate";
import { Check, FileText, FolderOpen, Upload } from "./icons";
import { Button, colors, dateLabel, Empty, radius, Sheet, s } from "./ui";

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** 资料卡片两列网格的列间距。 */
const FILE_GRID_GAP = 8;

/**
 * 资料两列网格：用 onLayout 实测容器宽度换算列宽——弹层在桌面端最宽 760、
 * 手机上接近满宽，用窗口宽度估算会让卡片在首帧错位。
 * 实测到之前用 48% 兜底，保证一开始就是两列。
 */
function FileGrid({ children }: { children: (cellWidth: number) => ReactNode }) {
  const [width, setWidth] = useState(0);
  const cellWidth = width > 0 ? (width - FILE_GRID_GAP) / 2 : 0;
  return (
    <View
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={{ flexDirection: "row", flexWrap: "wrap", gap: FILE_GRID_GAP }}
    >
      {children(cellWidth)}
    </View>
  );
}

/**
 * 弹层与附件 chip 的合并数据源：上传/分析文件（Artifact）与
 * 对话分析产物（AgentArtifact）统一成一种可渲染条目。
 */
export type PickerEntry =
  | { type: "file"; file: Artifact }
  | { type: "analysis"; artifact: AgentArtifact };

/** 取条目标题（文件用 name，分析产物用 title）。 */
export function pickerEntryTitle(entry: PickerEntry): string {
  return entry.type === "file" ? entry.file.name : entry.artifact.title;
}

/** 取条目 id，选择和去重都以它为准。 */
export function pickerEntryId(entry: PickerEntry): string {
  return entry.type === "file" ? entry.file.id : entry.artifact.id;
}

/** 取条目创建时间，用于按时间倒序排列。 */
function pickerEntryCreatedAt(entry: PickerEntry): string {
  return entry.type === "file" ? entry.file.createdAt : entry.artifact.createdAt;
}

/** 把「我的资料」合并为统一列表：全部上传/分析文件 + 全部对话分析产物。 */
export function pickerEntries(
  files: readonly Artifact[],
  analysis?: readonly AgentArtifact[],
): PickerEntry[] {
  return [
    ...files.map((file) => ({ type: "file" as const, file })),
    ...(analysis ?? []).map((artifact) => ({ type: "analysis" as const, artifact })),
  ].sort((a, b) => pickerEntryCreatedAt(b).localeCompare(pickerEntryCreatedAt(a)));
}

/** Composer attachment chips shared by the workbench and chat. */
export function ComposerAttachments({
  files,
  analysis,
  selectedIds,
  onRemove,
}: {
  files: readonly Artifact[];
  /** 对话分析产物（AgentArtifact），与上传资料合并后按标题展示。 */
  analysis?: readonly AgentArtifact[];
  selectedIds: readonly string[];
  onRemove: (id: string) => void;
}) {
  const { t } = useTranslation();
  const selected = pickerEntries(files, analysis).filter(
    (entry) => selectedIds.includes(pickerEntryId(entry)) && pickerEntryTitle(entry).trim(),
  );
  if (!selected.length) return null;
  return (
    <View style={[s.row, { gap: 6, flexWrap: "wrap", padding: 4, paddingBottom: 8 }]}>
      {selected.map((entry) => {
        const id = pickerEntryId(entry);
        const name = pickerEntryTitle(entry);
        return (
          <Pressable
            key={id}
            accessibilityRole="button"
            accessibilityLabel={t("chat.removeAttachment", { name })}
            onPress={() => onRemove(id)}
            style={({ pressed }) => [
              s.row,
              {
                gap: 7,
                maxWidth: "100%",
                backgroundColor: pressed ? colors.overlay1 : colors.surface,
                borderWidth: 1,
                borderColor: colors.line,
                borderRadius: 10,
                paddingHorizontal: 10,
                paddingVertical: 7,
              },
            ]}
          >
            <FileText size={14} color={colors.primary} />
            <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 12, color: colors.text }}>
              {name}
            </Text>
            <Text style={{ fontSize: 13, color: colors.muted }}>×</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * "Choose from Files" sheet. Selection is a draft until the user confirms, so
 * closing the sheet cannot unexpectedly change the current composer.
 */
export function FilePickerSheet({
  files,
  analysis,
  selectedIds,
  onToggle,
  onConfirm,
  onClose,
  onUpload,
  onBrowse,
}: {
  files: readonly Artifact[];
  /** 对话分析产物（AgentArtifact），与上传资料合并列出。 */
  analysis?: readonly AgentArtifact[];
  selectedIds: readonly string[];
  onToggle: (id: string) => void;
  onConfirm: () => void;
  onClose: () => void;
  onUpload?: () => Promise<void>;
  onBrowse?: () => void;
}) {
  const { t } = useTranslation();
  const [uploading, setUploading] = useState(false);
  const sorted = pickerEntries(files, analysis);
  const selectedCount = sorted.filter((entry) => selectedIds.includes(pickerEntryId(entry))).length;

  async function upload() {
    if (!onUpload || uploading) return;
    setUploading(true);
    try {
      await onUpload();
    } finally {
      setUploading(false);
    }
  }

  return (
    <Sheet
      title={t("chat.filePickerTitle")}
      subtitle={t("chat.filePickerSubtitle")}
      onClose={onClose}
    >
      {sorted.length ? (
        <FileGrid>
          {(cellWidth) =>
            sorted.map((entry) => {
              const id = pickerEntryId(entry);
              const checked = selectedIds.includes(id);
              const title = pickerEntryTitle(entry);
              // 文件卡片：扩展名徽章 + 大小·来源；分析产物卡片：类型徽章 + 日期。
              const badge =
                entry.type === "file"
                  ? (entry.file.name.split(".").pop() || "FILE").toUpperCase().slice(0, 5)
                  : statusLabel(entry.artifact.kind);
              const meta =
                entry.type === "file"
                  ? `${formatSize(entry.file.size)} · ${fileSourceLabel(entry.file.source, t)}`
                  : dateLabel(entry.artifact.createdAt);
              return (
                <Pressable
                  key={id}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked }}
                  accessibilityLabel={t("chat.selectAttachment", { name: title })}
                  onPress={() => onToggle(id)}
                  style={({ pressed }) => [
                    s.row,
                    {
                      width: cellWidth || "48%",
                      gap: 10,
                      minHeight: 62,
                      paddingHorizontal: 10,
                      paddingVertical: 10,
                      borderWidth: 1,
                      borderColor: checked ? colors.primary : colors.line,
                      borderRadius: radius.field,
                      backgroundColor: checked
                        ? colors.sky
                        : pressed
                          ? colors.surface
                          : colors.paper,
                    },
                  ]}
                >
                  <View
                    style={{
                      width: 32,
                      height: 40,
                      borderRadius: 7,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: colors.surface,
                      borderWidth: 1,
                      borderColor: colors.line,
                      flexShrink: 0,
                    }}
                  >
                    <Text
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.6}
                      style={{ fontSize: 8, fontWeight: "700", color: colors.muted }}
                    >
                      {badge}
                    </Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                    <Text
                      numberOfLines={1}
                      style={{ fontSize: 13, fontWeight: "600", color: colors.text }}
                    >
                      {title}
                    </Text>
                    <Text numberOfLines={1} style={{ fontSize: 11, color: colors.faint }}>
                      {meta}
                    </Text>
                  </View>
                  <View
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 5,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: checked ? colors.primary : colors.paper,
                      borderWidth: 1,
                      borderColor: checked ? colors.primary : colors.lineStrong,
                      flexShrink: 0,
                    }}
                  >
                    {checked && <Check size={13} strokeWidth={2.2} color={colors.onPrimary} />}
                  </View>
                </Pressable>
              );
            })
          }
        </FileGrid>
      ) : (
        <Empty
          icon={FolderOpen}
          title={t("chat.filePickerEmptyTitle")}
          detail={t("chat.filePickerEmptyDetail")}
        >
          {onBrowse && (
            <Button icon={FolderOpen} onPress={onBrowse}>
              {t("chat.filePickerBrowse")}
            </Button>
          )}
        </Empty>
      )}

      <View
        style={[
          s.row,
          {
            gap: 8,
            justifyContent: "flex-end",
            flexWrap: "wrap",
            marginTop: 16,
          },
        ]}
      >
        <Text style={[s.small, { flex: 1, minWidth: 100 }]}>
          {t("chat.filePickerSelected", { count: selectedCount })}
        </Text>
        {onUpload && (
          <Button icon={Upload} busy={uploading} onPress={() => void upload()}>
            {t("chat.uploadMaterial")}
          </Button>
        )}
        <Button primary disabled={selectedCount === 0} onPress={onConfirm}>
          {t("chat.filePickerConfirm", { count: selectedCount })}
        </Button>
      </View>
    </Sheet>
  );
}
