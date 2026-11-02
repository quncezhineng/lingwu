import { Text, View } from "react-native";
import type { AgentAvatarId } from "./agent-space-model";
import { colors, radius } from "./theme";

const palette: Record<AgentAvatarId, { background: string; foreground: string; glyph: string }> = {
  orb: { background: colors.primary, foreground: colors.onPrimary, glyph: "" },
  bloom: { background: "#E8EFFF", foreground: "#477BC9", glyph: "✦" },
  moon: { background: "#E9EDF4", foreground: "#657488", glyph: "◕" },
  planet: { background: "#E8F0FA", foreground: "#4F7CAE", glyph: "◎" },
  cat: { background: "#F0EEF8", foreground: "#8C80A8", glyph: "⌁" },
};

export function AgentOrb({ avatar = "orb", size = 32 }: { avatar?: AgentAvatarId; size?: number }) {
  const theme = palette[avatar] ?? palette.orb;
  if (avatar === "orb") {
    return (
      <View
        accessible={false}
        style={{
          width: size,
          height: size,
          borderRadius: radius.full,
          backgroundColor: theme.background,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: Math.max(2, Math.round(size * 0.12)),
          shadowColor: colors.primaryStrong,
          shadowOpacity: 0.16,
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
      </View>
    );
  }
  return (
    <View
      accessible={false}
      style={{
        width: size,
        height: size,
        borderRadius: radius.full,
        backgroundColor: theme.background,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: colors.lineSoft,
      }}
    >
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
    </View>
  );
}
