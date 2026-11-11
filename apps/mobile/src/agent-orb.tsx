import { View } from "react-native";
import type { AgentAvatarId } from "./agent-space-model";
import { Text } from "./app-text";
import { Pencil } from "./icons";
import { colors, radius } from "./theme";

const palette: Record<AgentAvatarId, { background: string; foreground: string; glyph: string }> = {
  orb: { background: colors.primary, foreground: colors.onPrimary, glyph: "" },
  bloom: { background: "#E8EFFF", foreground: "#477BC9", glyph: "✦" },
  moon: { background: "#E9EDF4", foreground: "#657488", glyph: "◕" },
  planet: { background: "#E8F0FA", foreground: "#4F7CAE", glyph: "◎" },
  cat: { background: "#F0EEF8", foreground: "#8C80A8", glyph: "⌁" },
};

export function AgentOrb({
  avatar = "orb",
  size = 32,
  editing = false,
}: {
  avatar?: AgentAvatarId;
  size?: number;
  /** 悬停编辑态：深色底，眼睛保留，中间叠一支铅笔。 */
  editing?: boolean;
}) {
  const theme = palette[avatar] ?? palette.orb;
  const background = editing ? colors.toast : theme.background;
  const frame = {
    width: size,
    height: size,
    borderRadius: radius.full,
    backgroundColor: background,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  };
  const pencil = editing ? (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Pencil
        size={Math.max(11, Math.round(size * 0.2))}
        color={colors.onToast}
        strokeWidth={1.8}
      />
    </View>
  ) : null;
  if (avatar === "orb") {
    return (
      <View
        style={{
          ...frame,
          flexDirection: "row",
          gap: Math.max(2, Math.round(size * (editing ? 0.28 : 0.12))),
          shadowColor: editing ? colors.toast : colors.primaryStrong,
          shadowOpacity: editing ? 0.2 : 0.16,
          shadowRadius: size * 0.26,
          shadowOffset: { width: 0, height: size * 0.14 },
          elevation: 3,
        }}
      >
        <View
          style={{
            width: Math.max(2, Math.round(size * 0.06)),
            height: Math.max(4, Math.round(size * 0.15)),
            borderRadius: size,
            backgroundColor: colors.onPrimary,
            transform: [{ rotate: "-14deg" }],
          }}
        />
        <View
          style={{
            width: Math.max(2, Math.round(size * 0.06)),
            height: Math.max(4, Math.round(size * 0.15)),
            borderRadius: size,
            backgroundColor: colors.onPrimary,
            transform: [{ rotate: "-14deg" }],
          }}
        />
        {pencil}
      </View>
    );
  }
  return (
    <View
      style={{
        ...frame,
        borderWidth: editing ? 0 : 1,
        borderColor: colors.lineSoft,
      }}
    >
      {!editing && (
        <Text
          style={{
            color: theme.foreground,
            fontSize: size * 0.5,
            lineHeight: size * 0.66,
            fontWeight: "500",
          }}
        >
          {theme.glyph}
        </Text>
      )}
      {pencil}
    </View>
  );
}
