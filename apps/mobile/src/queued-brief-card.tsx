import { useState } from "react";
import { Pressable, View } from "react-native";
import type { Artifact } from "../../../packages/domain/src";
import { Text } from "./app-text";
import { AssistantResponse } from "./assistant-response";
import { useTranslation } from "./i18n";
import { ChevronDown, ChevronRight, ListChecks } from "./icons";
import { colors, radius } from "./theme";

/** 已排队说明：默认只露标题，点开才看到交办范围。 */
export function QueuedBriefCard({
  headline,
  body,
  files = [],
  onOpenFile,
}: {
  headline: string;
  body: string;
  files?: Artifact[];
  onOpenFile?: (file: Artifact) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const canExpand = body.trim().length > 0;
  return (
    <View style={{ width: "100%", maxWidth: 860, alignSelf: "flex-start", gap: 7 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={headline}
        accessibilityHint={
          canExpand
            ? t(open ? "tools.toolStepHideDetails" : "tools.toolStepShowDetails")
            : undefined
        }
        accessibilityState={canExpand ? { expanded: open } : undefined}
        disabled={!canExpand}
        onPress={() => setOpen((value) => !value)}
        style={({ pressed }) => ({
          alignSelf: "flex-start",
          maxWidth: "100%",
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.line,
          backgroundColor: pressed && canExpand ? colors.overlay2 : colors.surface,
        })}
      >
        <ListChecks size={15} color={colors.muted} />
        <Text
          numberOfLines={1}
          style={{ flexShrink: 1, color: colors.muted, fontSize: 13, lineHeight: 18 }}
        >
          {headline}
        </Text>
        {canExpand &&
          (open ? (
            <ChevronDown size={14} color={colors.muted} />
          ) : (
            <ChevronRight size={14} color={colors.muted} />
          ))}
      </Pressable>
      {open && canExpand && (
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
          <AssistantResponse
            content={body}
            streaming={false}
            files={files}
            onOpenFile={onOpenFile ?? (() => {})}
          />
        </View>
      )}
    </View>
  );
}
