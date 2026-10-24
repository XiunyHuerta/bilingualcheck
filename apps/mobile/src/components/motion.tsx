import { type ReactNode, useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, Text, type StyleProp, type TextStyle, type ViewStyle, View } from "react-native";
import { colors, space } from "@/theme/tokens";

// Movimiento de la guía (§5): entrada con fade + 26 px hacia arriba (0.5 s, ease-out cubic),
// aparición con rebote suave desde escala 0.55 y marcador que se "pinta" de izquierda a
// derecha. Se respeta "reducir movimiento" del sistema.

const native = Platform.OS !== "web";
const easeOut = Easing.out(Easing.cubic);
const backOut = Easing.out(Easing.back(1.8));

function play(value: Animated.Value, config: Omit<Animated.TimingAnimationConfig, "toValue">): void {
  const run = () => Animated.timing(value, { ...config, toValue: 1 }).start();
  void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => (reduce ? value.setValue(1) : run()), run);
}

/** Entrada de un bloque: fade + 26 px hacia arriba. */
export function Reveal({ children, delay = 0, style }: { children: ReactNode; delay?: number; style?: StyleProp<ViewStyle> }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    play(v, { duration: 500, delay, easing: easeOut, useNativeDriver: native });
  }, [v, delay]);
  return (
    <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [26, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}

/** Aparición de chips, tarjetas y checks: pop con rebote desde escala 0.55. */
export function Pop({ children, delay = 0, style }: { children: ReactNode; delay?: number; style?: StyleProp<ViewStyle> }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    play(v, { duration: 420, delay, easing: backOut, useNativeDriver: native });
  }, [v, delay]);
  return (
    <Animated.View style={[style, { opacity: v.interpolate({ inputRange: [0, 0.4], outputRange: [0, 1], extrapolate: "clamp" }), transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }) }] }]}>
      {children}
    </Animated.View>
  );
}

/** Marcador: subrayado de 42 % de alto que se pinta de izquierda a derecha. Coral señala problemas. */
export function Marker({ children, tone = "gold", delay = 500, textStyle }: { children: string; tone?: "gold" | "coral"; delay?: number; textStyle?: StyleProp<TextStyle> }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    play(v, { duration: 700, delay, easing: Easing.inOut(Easing.cubic), useNativeDriver: false });
  }, [v, delay]);
  return (
    <View style={{ alignSelf: "flex-start" }}>
      <Animated.View
        pointerEvents="none"
        style={[s.marker, { backgroundColor: colors[tone], width: v.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }]}
      />
      <Text style={[s.markerText, textStyle]}>{children}</Text>
    </View>
  );
}

/** "El agente está escribiendo…": tres puntos que laten en cascada. */
export function TypingDots() {
  const dots = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  useEffect(() => {
    const loops = dots.map((d, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(d, { toValue: 1, duration: 320, easing: easeOut, useNativeDriver: native }),
          Animated.timing(d, { toValue: 0, duration: 320, easing: Easing.in(Easing.cubic), useNativeDriver: native }),
          Animated.delay((2 - i) * 160),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [dots]);
  return (
    <View style={{ flexDirection: "row", gap: space.xs + 2, paddingVertical: 6 }} accessibilityRole="progressbar">
      {dots.map((d, i) => (
        <Animated.View
          key={i}
          style={[s.dot, { opacity: d.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }), transform: [{ translateY: d.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) }] }]}
        />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  marker: { position: "absolute", left: 0, bottom: 2, height: "42%" },
  markerText: { color: colors.ink },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.cobalt },
});
