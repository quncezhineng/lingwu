/**
 * 语言切换按钮。
 *
 * 交互：按钮始终展示「当前语言」的简称（EN / 中），点击后弹出语言列表，
 * 选择任意语言后立即生效并写入本地存储，无需刷新页面。
 */

import { useCallback, useRef, useState } from "react";
import { Modal, Pressable, Text, useWindowDimensions, View } from "react-native";
import { Check, Languages, X } from "../icons";
import { colors, shadow } from "../ui";
import { useTranslation } from "./index";
import { LOCALE_LABELS, type Locale } from "./types";

type LanguageAnchor = {
  top?: number;
  right?: number;
  left?: number;
  bottom?: number;
};

export function LanguagePicker({
  visible,
  onClose,
  anchor,
  centered = false,
}: {
  visible: boolean;
  onClose: () => void;
  anchor?: LanguageAnchor | null;
  centered?: boolean;
}) {
  const { locale, locales, setLocale, t } = useTranslation();

  const choose = useCallback(
    (next: Locale) => {
      setLocale(next);
      onClose();
    },
    [onClose, setLocale],
  );

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          justifyContent: centered ? "center" : "flex-start",
          alignItems: centered ? "center" : "stretch",
          padding: centered ? 20 : 0,
          backgroundColor: colors.modalShade,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common.close")}
          onPress={onClose}
          style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
        />
        <View
          accessibilityViewIsModal
          style={[
            {
              minWidth: 144,
              paddingVertical: 8,
              backgroundColor: colors.paper,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: colors.line,
              ...shadow.card,
            },
            centered
              ? { width: "100%", maxWidth: 320 }
              : {
                  position: "absolute",
                  top: anchor?.top,
                  right: anchor?.right,
                  left: anchor?.left,
                  bottom: anchor?.bottom,
                },
          ]}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingLeft: 14,
              paddingRight: 10,
              paddingTop: 8,
              paddingBottom: 6,
            }}
          >
            <Text
              style={{
                flex: 1,
                fontSize: 10,
                fontWeight: "700",
                letterSpacing: 1.2,
                textTransform: "uppercase",
                color: colors.muted,
              }}
            >
              {t("common.language")}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("common.close")}
              hitSlop={8}
              onPress={onClose}
              style={({ pressed }) => ({
                width: 28,
                height: 28,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 8,
                backgroundColor: pressed ? colors.overlay1 : "transparent",
              })}
            >
              <X size={14} color={colors.muted} />
            </Pressable>
          </View>
          {locales.map((item) => {
            const meta = LOCALE_LABELS[item];
            const selected = item === locale;
            return (
              <Pressable
                key={item}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={meta.english}
                onPress={() => choose(item)}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  marginHorizontal: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 11,
                  borderRadius: 10,
                  backgroundColor: selected ? colors.sky : pressed ? colors.surface : "transparent",
                })}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: selected ? "600" : "500",
                      color: colors.text,
                    }}
                  >
                    {meta.native}
                  </Text>
                </View>
                {selected && <Check size={15} color={colors.primary} />}
              </Pressable>
            );
          })}
        </View>
      </View>
    </Modal>
  );
}

export function LanguageSwitcher({
  compact = false,
  vertical = false,
  showIcon = true,
  centered = false,
}: {
  compact?: boolean;
  vertical?: boolean;
  showIcon?: boolean;
  centered?: boolean;
}) {
  const { locale, t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<LanguageAnchor | null>(null);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const trigger = useRef<View>(null);
  const current = LOCALE_LABELS[locale];

  // 弹窗要贴着按钮展开：横排时在按钮右下方；竖排（左侧图标栏）时按钮在左下角，改为向右上方展开。
  const show = useCallback(() => {
    if (centered) {
      setOpen(true);
      return;
    }
    trigger.current?.measureInWindow((x, y, width, height) => {
      if (vertical) {
        setAnchor({
          left: x + width + 6,
          bottom: Math.max(12, windowHeight - y),
        });
      } else {
        setAnchor({
          top: y + height + 6,
          right: Math.max(12, windowWidth - (x + width)),
        });
      }
      setOpen(true);
    });
  }, [centered, vertical, windowWidth, windowHeight]);

  return (
    <>
      <Pressable
        ref={trigger}
        accessibilityRole="button"
        accessibilityLabel={t("common.currentLanguage", { language: current.english })}
        accessibilityHint={t("common.changeLanguage")}
        onPress={show}
        style={({ pressed }) =>
          vertical
            ? {
                width: 60,
                alignItems: "center",
                gap: 3,
                paddingVertical: 6,
                borderRadius: 10,
                backgroundColor: pressed ? colors.overlay1 : "transparent",
              }
            : {
                height: 38,
                paddingHorizontal: compact ? 9 : 11,
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: colors.line,
                backgroundColor: pressed ? colors.overlay2 : colors.paper,
              }
        }
      >
        {vertical ? (
          <>
            <Languages size={21} color={colors.muted} />
            <Text
              numberOfLines={1}
              style={{ fontSize: 10, lineHeight: 13, fontWeight: "500", color: colors.muted }}
            >
              {t("common.language")}
            </Text>
          </>
        ) : (
          <>
            {showIcon && <Languages size={15} color={colors.text} />}
            <Text style={{ fontSize: 12, fontWeight: "600", color: colors.text }}>
              {current.short}
            </Text>
          </>
        )}
      </Pressable>
      <LanguagePicker
        visible={open && (centered || Boolean(anchor))}
        onClose={() => setOpen(false)}
        anchor={anchor}
        centered={centered}
      />
    </>
  );
}
