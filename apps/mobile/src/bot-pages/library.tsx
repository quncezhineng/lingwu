import { View } from "react-native";
import { ArtifactCard } from "../agent-ui";
import { useTranslation } from "../i18n";
import { FileText } from "../icons";
import { LinkRow, SectionHeading } from "../ui";
import { useWorkspace } from "../workspace";
import { BotEmpty, BotPage, type BotPageProps, useBotResources } from "./shared";

export function BotLibraryPage({ onClose }: BotPageProps) {
  const { t } = useTranslation();
  const { artifacts, files } = useBotResources();
  const { open } = useWorkspace();
  return (
    <BotPage title={t("agentSpace.library")} onClose={onClose}>
      <View style={{ gap: 12 }}>
        {!artifacts.length && !files.length && <BotEmpty>{t("agentSpace.libraryEmpty")}</BotEmpty>}
        {!!files.length && (
          <>
            <SectionHeading title={t("screens.libraryFiles")} count={files.length} />
            {files.map((file) => (
              <LinkRow
                key={file.id}
                icon={FileText}
                title={file.name}
                onPress={() => open({ type: "file", file })}
              />
            ))}
          </>
        )}
        {!!artifacts.length && (
          <>
            <SectionHeading title={t("agentSpace.artifacts")} count={artifacts.length} />
            {artifacts.map((artifact) => (
              <ArtifactCard key={artifact.id} artifact={artifact} />
            ))}
          </>
        )}
      </View>
    </BotPage>
  );
}
