import { useState } from "react";
import { View } from "react-native";
import type { Artifact } from "../../../../packages/domain/src";
import { ArtifactCard } from "../agent-ui";
import { CardGrid } from "../card-grid";
import { saveRemoteFile, shareRemoteFile } from "../file-export";
import { useTranslation } from "../i18n";
import { ArrowDownToLine, FileText, Share2 } from "../icons";
import { IconButton, LinkRow, SectionHeading, s } from "../ui";
import { useWorkspace } from "../workspace";
import { BotEmpty, BotPage, type BotPageProps, useBotResources } from "./shared";

export function BotLibraryPage({ onClose, embedded }: BotPageProps) {
  const { t } = useTranslation();
  const { artifacts, files } = useBotResources();
  const { open, api, notify } = useWorkspace();
  // 同一个资料库里可能连着点开多个文件，忙碌状态按 id 记录，避免互相挡住。
  const [busyId, setBusyId] = useState<string | null>(null);

  async function share(file: Artifact) {
    if (busyId) return;
    setBusyId(file.id);
    try {
      const result = await shareRemoteFile(api, file);
      notify(t(result === "saved" ? "screens.filesShareSaved" : "screens.filesShared"));
    } catch {
      notify(t("screens.filesShareFailed"));
    } finally {
      setBusyId(null);
    }
  }

  async function save(file: Artifact) {
    if (busyId) return;
    setBusyId(file.id);
    try {
      await saveRemoteFile(api, file);
      notify(t("screens.filesExported", { name: file.name }));
    } catch {
      notify(t("screens.filesExportFailed"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <BotPage title={t("agentSpace.library")} onClose={onClose} embedded={embedded}>
      <View style={{ gap: 12 }}>
        {!artifacts.length && !files.length && <BotEmpty>{t("agentSpace.libraryEmpty")}</BotEmpty>}
        {!!files.length && (
          <>
            <SectionHeading title={t("screens.libraryFiles")} count={files.length} />
            <CardGrid
              items={files}
              minColumnWidth={300}
              getKey={(file) => file.id}
              render={(file) => (
                <View style={[s.row, { gap: 2 }]}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <LinkRow
                      icon={FileText}
                      title={file.name}
                      onPress={() => open({ type: "file", file })}
                    />
                  </View>
                  <IconButton
                    icon={Share2}
                    label={t("screens.filesShare", { name: file.name })}
                    size={32}
                    onPress={() => void share(file)}
                  />
                  <IconButton
                    icon={ArrowDownToLine}
                    label={t("screens.filesDownload", { name: file.name })}
                    size={32}
                    onPress={() => void save(file)}
                  />
                </View>
              )}
            />
          </>
        )}
        {!!artifacts.length && (
          <>
            <SectionHeading title={t("agentSpace.artifacts")} count={artifacts.length} />
            <CardGrid
              items={artifacts}
              minColumnWidth={300}
              getKey={(artifact) => artifact.id}
              render={(artifact) => <ArtifactCard artifact={artifact} />}
            />
          </>
        )}
      </View>
    </BotPage>
  );
}
