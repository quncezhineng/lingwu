import { View } from "react-native";
import { type ChannelAvatarId, isChannelAvatarId } from "../../../packages/domain/src/channel";
import type { AgentAvatarId } from "./agent-space-model";
import { Text } from "./app-text";
import { Pencil } from "./icons";
import { avatarStacks, colors, radius } from "./theme";

const palette: Record<AgentAvatarId, { background: string; foreground: string; glyph: string }> = {
  orb: { background: colors.primary, foreground: colors.onPrimary, glyph: "" },
  bloom: { background: "#E8EFFF", foreground: "#477BC9", glyph: "✦" },
  moon: { background: "#E9EDF4", foreground: "#657488", glyph: "◕" },
  planet: { background: "#E8F0FA", foreground: "#4F7CAE", glyph: "◎" },
  cat: { background: "#F0EEF8", foreground: "#8C80A8", glyph: "⌁" },
};

/** 把叠层放到圆心附近：以圆心为基准偏移 dx/dy，并中分宽高。 */
function place(center: number, width: number, height: number, dx: number, dy: number) {
  return {
    position: "absolute" as const,
    left: center + dx - width / 2,
    top: center + dy - height / 2,
    width,
    height,
  };
}

/**
 * 频道「叠加头像」：2–3 块图形错位交叠，表达「多成员群组」，
 * 与 Agent 的单符号头像（orb/bloom/moon/planet/cat）刻意区分。
 * 调用方应先用 `normalizeChannelAvatar` 兜底，保证 avatar 一定是新值。
 */
function ChannelStack({
  avatar,
  size,
  editing = false,
}: {
  avatar: ChannelAvatarId;
  size: number;
  /** 悬停编辑态：压暗部群组图形，中间叠一支铅笔。 */
  editing?: boolean;
}) {
  const spec = avatarStacks[avatar] ?? avatarStacks["stack-circles"];
  const center = size / 2;
  const ring = { borderWidth: Math.max(2, Math.round(size * 0.1)), borderStyle: "solid" as const };
  const cards = avatar === "stack-cards";
  const dots = avatar === "stack-dots";
  const rings = avatar === "stack-rings";
  const gems = avatar === "stack-gems";
  const shapes = cards ? (
    <>
      {/* 后层：深卡，向左上错开并微旋。 */}
      <View
        style={{
          ...place(center, size * 0.56, size * 0.56, -size * 0.1, -size * 0.14),
          borderRadius: size * 0.12,
          backgroundColor: spec.deep,
          opacity: 0.94,
          transform: [{ rotate: "-8deg" }],
        }}
      />
      {/* 前层：浅卡，向右下错开。 */}
      <View
        style={{
          ...place(center, size * 0.46, size * 0.46, size * 0.12, size * 0.12),
          borderRadius: size * 0.12,
          backgroundColor: spec.light,
          transform: [{ rotate: "5deg" }],
          borderWidth: 1,
          borderColor: colors.paper,
        }}
      />
    </>
  ) : dots ? (
    <>
      <View
        style={{
          ...place(center, size * 0.44, size * 0.44, -size * 0.06, -size * 0.06),
          borderRadius: radius.full,
          backgroundColor: spec.deep,
          opacity: 0.94,
        }}
      />
      <View
        style={{
          ...place(center, size * 0.34, size * 0.34, size * 0.06, -size * 0.1),
          borderRadius: radius.full,
          backgroundColor: spec.mid,
        }}
      />
      <View
        style={{
          ...place(center, size * 0.3, size * 0.3, size * 0.12, size * 0.1),
          borderRadius: radius.full,
          backgroundColor: spec.light,
        }}
      />
    </>
  ) : rings ? (
    <>
      {/* 后环：深色圆环。 */}
      <View
        style={{
          ...place(center, size * 0.54, size * 0.54, -size * 0.08, -size * 0.08),
          borderRadius: radius.full,
          backgroundColor: "transparent",
          borderColor: spec.deep,
          ...ring,
        }}
      />
      {/* 前环：浅色圆环。 */}
      <View
        style={{
          ...place(center, size * 0.42, size * 0.42, size * 0.1, size * 0.1),
          borderRadius: radius.full,
          backgroundColor: "transparent",
          borderColor: spec.light,
          ...ring,
        }}
      />
      {/* 环心点缀。 */}
      <View
        style={{
          ...place(center, size * 0.12, size * 0.12, 0, size * 0.02),
          borderRadius: radius.full,
          backgroundColor: spec.mid,
        }}
      />
    </>
  ) : gems ? (
    <>
      {/* 后层：深色旋转方块（菱形）。 */}
      <View
        style={{
          ...place(center, size * 0.46, size * 0.46, -size * 0.08, -size * 0.1),
          borderRadius: size * 0.05,
          backgroundColor: spec.deep,
          opacity: 0.94,
          transform: [{ rotate: "45deg" }],
        }}
      />
      {/* 前层：浅色旋转方块。 */}
      <View
        style={{
          ...place(center, size * 0.32, size * 0.32, size * 0.12, size * 0.1),
          borderRadius: size * 0.05,
          backgroundColor: spec.light,
          transform: [{ rotate: "45deg" }],
          borderWidth: 1,
          borderColor: colors.paper,
        }}
      />
    </>
  ) : (
    <>
      {/* 叠圆（默认）：后层大圆 + 前层小圆。 */}
      <View
        style={{
          ...place(center, size * 0.6, size * 0.6, -size * 0.1, -size * 0.1),
          borderRadius: radius.full,
          backgroundColor: spec.deep,
          opacity: 0.92,
        }}
      />
      <View
        style={{
          ...place(center, size * 0.42, size * 0.42, size * 0.12, size * 0.1),
          borderRadius: radius.full,
          backgroundColor: spec.light,
          borderWidth: 1,
          borderColor: colors.paper,
        }}
      />
      {/* 前层右上小点缀，强化「多图叠加」。 */}
      <View
        style={{
          ...place(center, size * 0.1, size * 0.1, size * 0.28, -size * 0.24),
          borderRadius: radius.full,
          backgroundColor: spec.mid,
        }}
      />
    </>
  );
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius.full,
        backgroundColor: spec.background,
        borderWidth: 1,
        borderColor: colors.lineSoft,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {shapes}
      {editing && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            borderRadius: radius.full,
            backgroundColor: colors.toast,
            opacity: 0.82,
          }}
        />
      )}
      {editing && (
        <View
          pointerEvents="none"
          style={{ position: "absolute", alignItems: "center", justifyContent: "center" }}
        >
          <Pencil
            size={Math.max(11, Math.round(size * 0.2))}
            color={colors.onToast}
            strokeWidth={1.8}
          />
        </View>
      )}
    </View>
  );
}

export function AgentOrb({
  avatar = "orb",
  size = 32,
  editing = false,
}: {
  /** Agent 单符号头像或频道「叠加」头像；频道旧数据请先 normalize 兜底。 */
  avatar?: AgentAvatarId | ChannelAvatarId;
  size?: number;
  /** 悬停编辑态：深色底，眼睛保留，中间叠一支铅笔。 */
  editing?: boolean;
}) {
  // 频道新头像走叠加渲染；Agent 头像（含未识别旧值）走下方单符号渲染。
  if (isChannelAvatarId(avatar)) {
    return <ChannelStack avatar={avatar} size={size} editing={editing} />;
  }
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
