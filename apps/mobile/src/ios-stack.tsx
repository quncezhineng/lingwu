import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { Animated, PanResponder, StyleSheet, useWindowDimensions, View } from "react-native";
import {
  IOS_DIM,
  IOS_EDGE_PX,
  IOS_PARALLAX,
  IOS_PUSH_MS,
  iosPushEasing,
  shouldCompletePop,
  webPrefersReducedMotion,
} from "./ios-transition";
import { colors } from "./theme";
import { useReducedMotion } from "./use-reduced-motion";

export interface IosScreen {
  id: string;
  node: ReactNode;
}

/**
 * 手机页面栈。新页从右滑入，底下页向左视差并变暗；返回则反向。
 * 每一层都保持挂载，避免滚动位置被清掉。
 */
export function IosStack({ screens, onPop }: { screens: readonly IosScreen[]; onPop: () => void }) {
  const { width } = useWindowDimensions();
  const reduced = useReducedMotion() || webPrefersReducedMotion();
  const cover = useRef(new Animated.Value(screens.length > 1 ? 1 : 0)).current;
  const ids = screens.map((screen) => screen.id).join("|");
  const idsRef = useRef(ids);
  const onPopRef = useRef(onPop);
  onPopRef.current = onPop;
  const widthRef = useRef(width);
  widthRef.current = width;
  const gestureDone = useRef(false);
  const nodeCache = useRef(new Map<string, ReactNode>());
  for (const screen of screens) nodeCache.current.set(screen.id, screen.node);
  const [leaving, setLeaving] = useState<IosScreen | null>(null);

  useLayoutEffect(() => {
    const previous = idsRef.current;
    if (previous === ids) return;
    const prevIds = previous.split("|").filter(Boolean);
    const nextIds = ids.split("|").filter(Boolean);
    const prevTop = prevIds[prevIds.length - 1];
    const nextTop = nextIds[nextIds.length - 1];
    idsRef.current = ids;
    if (gestureDone.current) {
      gestureDone.current = false;
      cover.setValue(nextIds.length > 1 ? 1 : 0);
      setLeaving(null);
      return;
    }
    if (!prevTop || prevTop === nextTop || reduced) {
      cover.setValue(nextIds.length > 1 ? 1 : 0);
      setLeaving(null);
      return;
    }
    const popping = prevIds.includes(nextTop) && nextIds.length < prevIds.length;
    if (popping) {
      const removed = [...prevIds].reverse().find((id) => !nextIds.includes(id));
      const node = removed ? nodeCache.current.get(removed) : undefined;
      if (removed && node) setLeaving({ id: removed, node });
      cover.setValue(1);
      const animation = Animated.timing(cover, {
        toValue: 0,
        duration: IOS_PUSH_MS,
        easing: iosPushEasing,
        useNativeDriver: false,
      });
      animation.start(({ finished }) => {
        if (!finished) return;
        cover.setValue(nextIds.length > 1 ? 1 : 0);
        setLeaving(null);
      });
      return () => animation.stop();
    }
    setLeaving(null);
    cover.setValue(0);
    const animation = Animated.timing(cover, {
      toValue: 1,
      duration: IOS_PUSH_MS,
      easing: iosPushEasing,
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [cover, ids, reduced]);

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) =>
        !webPrefersReducedMotion() &&
        idsRef.current.split("|").length > 1 &&
        gesture.x0 <= IOS_EDGE_PX &&
        gesture.dx > 8 &&
        Math.abs(gesture.dx) > Math.abs(gesture.dy),
      onPanResponderMove: (_event, gesture) => {
        const span = widthRef.current || 1;
        const next = 1 - Math.max(0, gesture.dx) / span;
        cover.setValue(Math.max(0, Math.min(1, next)));
      },
      onPanResponderRelease: (_event, gesture) => {
        const span = widthRef.current || 1;
        const distance = Math.max(0, gesture.dx);
        if (shouldCompletePop(distance, span, gesture.vx)) {
          gestureDone.current = true;
          Animated.timing(cover, {
            toValue: 0,
            duration: 180,
            easing: iosPushEasing,
            useNativeDriver: false,
          }).start(() => onPopRef.current());
          return;
        }
        Animated.timing(cover, {
          toValue: 1,
          duration: 220,
          easing: iosPushEasing,
          useNativeDriver: false,
        }).start();
      },
      onPanResponderTerminate: () => {
        Animated.timing(cover, {
          toValue: 1,
          duration: 220,
          easing: iosPushEasing,
          useNativeDriver: false,
        }).start();
      },
    }),
  ).current;

  const shown = leaving
    ? [...screens.filter((screen) => screen.id !== leaving.id), leaving]
    : screens;
  const last = shown.length - 1;
  return (
    <View
      style={{ flex: 1, overflow: "hidden", backgroundColor: colors.canvas }}
      {...pan.panHandlers}
    >
      {shown.map((screen, index) => {
        const role = index === last ? "top" : index === last - 1 ? "under" : "buried";
        const translateX =
          role === "top"
            ? last === 0
              ? 0
              : cover.interpolate({
                  inputRange: [0, 1],
                  outputRange: [width, 0],
                })
            : role === "under"
              ? cover.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -width * IOS_PARALLAX],
                })
              : -width;
        const dim =
          role === "under"
            ? cover.interpolate({
                inputRange: [0, 1],
                outputRange: [0, IOS_DIM],
              })
            : 0;
        return (
          <Animated.View
            key={screen.id}
            pointerEvents={role === "top" ? "auto" : "none"}
            style={{
              ...StyleSheet.absoluteFillObject,
              backgroundColor: colors.canvas,
              transform: [{ translateX: translateX as number }],
              // 顶层左侧一条细阴影，滑入时和底下页面分开。
              ...(role === "top" && last > 0
                ? {
                    shadowColor: "#2D2D2D",
                    shadowOpacity: 0.12,
                    shadowRadius: 12,
                    shadowOffset: { width: -4, height: 0 },
                  }
                : null),
            }}
          >
            {screen.node}
            {role === "under" && (
              <Animated.View
                pointerEvents="none"
                style={{
                  ...StyleSheet.absoluteFillObject,
                  backgroundColor: "#000",
                  opacity: dim as number,
                }}
              />
            )}
          </Animated.View>
        );
      })}
      {last > 0 && (
        <View
          testID="ios-edge-back"
          pointerEvents="box-none"
          style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: IOS_EDGE_PX }}
        />
      )}
    </View>
  );
}
