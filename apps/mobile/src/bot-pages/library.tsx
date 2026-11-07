import { View } from "react-native";
import { ArtifactCard } from "../agent-ui";
import { useTranslation } from "../i18n";
import { FileText } from "../icons";
import { LinkRow, SectionHeading } from "../ui";
import { useWorkspace } from "../workspace";
import { BotEmpty, BotPage, type BotPageProps, TwoColumnGrid, useBotResources } from "./shared";

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
            <TwoColumnGrid>
              {(columns, itemWidth) =>
                files.map((file) => (
                  <View key={file.id} style={columns === 2 ? { width: itemWidth } : undefined}>
                    <LinkRow
                      icon={FileText}
                      title={file.name}
                      onPress={() => open({ type: "file", file })}
                    />
                  </View>
                ))
              }
            </TwoColumnGrid>
          </>
        )}
        {!!artifacts.length && (
          <>
            <SectionHeading title={t("agentSpace.artifacts")} count={artifacts.length} />
            <TwoColumnGrid>
              {(columns, itemWidth) =>
                artifacts.map((artifact) => (
                  <View key={artifact.id} style={columns === 2 ? { width: itemWidth } : undefined}>
                    <ArtifactCard artifact={artifact} />
                  </View>
                ))
              }
            </TwoColumnGrid>
          </>
        )}
      </View>
    </BotPage>
  );
}
