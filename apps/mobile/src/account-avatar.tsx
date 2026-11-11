import { useEffect, useState } from "react";
import { Image, View } from "react-native";
import { Text } from "./app-text";
import { colors, semantic } from "./theme";

/**
 * Account avatar with the same initial fallback used by the account page.
 * A failed signed URL falls back immediately instead of leaving an empty tile.
 */
export function AccountAvatar({
  avatarUrl,
  name,
  size,
  borderRadius,
}: {
  avatarUrl?: string;
  name: string;
  size: number;
  borderRadius: number;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  useEffect(() => {
    setImageFailed(false);
  }, [avatarUrl]);

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        borderWidth: 1,
        borderColor: semantic.controlBorder,
        backgroundColor: colors.paper,
      }}
    >
      {avatarUrl && !imageFailed ? (
        <Image
          source={{ uri: avatarUrl }}
          resizeMode="cover"
          onError={() => setImageFailed(true)}
          style={{ width: size, height: size }}
        />
      ) : (
        <Text
          style={{
            fontSize: Math.max(11, Math.round(size * 0.35)),
            fontWeight: "700",
            color: colors.primaryStrong,
          }}
        >
          {initial}
        </Text>
      )}
    </View>
  );
}
