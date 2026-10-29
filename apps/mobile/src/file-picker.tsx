import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { Artifact } from "../../../packages/domain/src";
import { fileSourceLabel } from "./file-library";
import { useTranslation } from "./i18n";
import { Check, FileText, FolderOpen, Upload } from "./icons";
import { Button, colors, Empty, Sheet, s } from "./ui";

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Composer attachment chips shared by the workbench and chat. */
export function ComposerAttachments({
  files,
  selectedIds,
  onRemove,
}: {
  files: readonly Artifact[];
  selectedIds: readonly string[];
  onRemove: (id: string) => void;
}) {
  const { t } = useTranslation();
  const selected = files.filter((file) => selectedIds.includes(file.id));
  if (!selected.length) return null;
  return (
    <View style={[s.row, { gap: 6, flexWrap: "wrap", padding: 4, paddingBottom: 8 }]}>
      {selected.map((file) => (
        <Pressable
          key={file.id}
          accessibilityRole="button"
          accessibilityLabel={t("chat.removeAttachment", { name: file.name })}
          onPress={() => onRemove(file.id)}
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
            {file.name}
          </Text>
          <Text style={{ fontSize: 13, color: colors.muted }}>×</Text>
        </Pressable>
      ))}
    </View>
  );
}

/**
 * "Choose from Files" sheet. Selection is a draft until the user confirms, so
 * closing the sheet cannot unexpectedly change the current composer.
 */
export function FilePickerSheet({
  files,
  selectedIds,
  onToggle,
  onConfirm,
  onClose,
  onUpload,
  onBrowse,
}: {
  files: readonly Artifact[];
  selectedIds: readonly string[];
  onToggle: (id: string) => void;
  onConfirm: () => void;
  onClose: () => void;
  onUpload?: () => Promise<void>;
  onBrowse?: () => void;
}) {
  const { t } = useTranslation();
  const [uploading, setUploading] = useState(false);
  const sorted = [...files].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const selectedCount = files.filter((file) => selectedIds.includes(file.id)).length;

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
        <View style={{ borderWidth: 1, borderColor: colors.line, borderRadius: 12 }}>
          {sorted.map((file, index) => {
            const checked = selectedIds.includes(file.id);
            const extension = (file.name.split(".").pop() || "FILE").toUpperCase().slice(0, 5);
            return (
              <Pressable
                key={file.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
                accessibilityLabel={t("chat.selectAttachment", { name: file.name })}
                onPress={() => onToggle(file.id)}
                style={({ pressed }) => [
                  s.row,
                  {
                    gap: 12,
                    minHeight: 62,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderTopWidth: index ? 1 : 0,
                    borderTopColor: colors.line,
                    backgroundColor: pressed ? colors.surface : colors.paper,
                  },
                ]}
              >
                <View
                  style={{
                    width: 38,
                    height: 44,
                    borderRadius: 7,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.line,
                  }}
                >
                  <Text style={{ fontSize: 8, fontWeight: "700", color: colors.muted }}>
                    {extension}
                  </Text>
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                  <Text
                    numberOfLines={1}
                    style={{ fontSize: 14, fontWeight: "600", color: colors.text }}
                  >
                    {file.name}
                  </Text>
                  <Text numberOfLines={1} style={{ fontSize: 11, color: colors.faint }}>
                    {formatSize(file.size)} · {fileSourceLabel(file.source, t)}
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
                  }}
                >
                  {checked && <Check size={13} strokeWidth={2.2} color={colors.onPrimary} />}
                </View>
              </Pressable>
            );
          })}
        </View>
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
