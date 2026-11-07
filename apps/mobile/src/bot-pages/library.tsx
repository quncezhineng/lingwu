import { View } from "react-native";
import { ArtifactCard } from "../agent-ui";
import { CardGrid } from "../card-grid";
import { useTranslation } from "../i18n";
import { FileText } from "../icons";
import { LinkRow, SectionHeading } from "../ui";
import { useWorkspace } from "../workspace";
import { BotEmpty, BotPage, type BotPageProps, useBotResources } from "./shared";

export function BotLibraryPage({ onClose, embedded }: BotPageProps) {
  const { t } = useTranslation();
  const { artifacts, files } = useBotResources();
  const { open } = useWorkspace();
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
                <LinkRow
                  icon={FileText}
                  title={file.name}
                  onPress={() => open({ type: "file", file })}
                />
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
