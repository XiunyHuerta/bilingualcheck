import type { ProjectStatus } from "@bc/shared";
import { type ComponentRef, type ReactNode, type Ref, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  type ColorValue,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { type Edge, SafeAreaView } from "react-native-safe-area-context";
import { useConceptDemo } from "@/lib/health";
import { contentWidths, useResponsive } from "@/theme/responsive";
import { colors, fonts, radius, shadow, space, STATUS_TONE, type Tone, tones } from "@/theme/tokens";

// Sistema de componentes de BilingualCheck (docs/styleUIguide.md §4).

// ── Pantalla ──────────────────────────────────────────────────────

/** Fluid page with a readable limit; compact is for callback/status screens. */
export function Screen({
  children,
  blobs,
  edges = ["top", "bottom"],
  maxWidth,
  size = "page",
  style,
}: {
  children: ReactNode;
  blobs?: boolean;
  edges?: Edge[];
  maxWidth?: number;
  size?: keyof typeof contentWidths;
  style?: StyleProp<ViewStyle>;
}) {
  const { pageWidth } = useResponsive();
  const limit = maxWidth ?? (size === "page" ? pageWidth : contentWidths[size]);
  return (
    <SafeAreaView edges={edges} style={s.screen}>
      {blobs && <Blobs />}
      <View style={[s.column, { maxWidth: limit }, style]}>{children}</View>
    </SafeAreaView>
  );
}

function Blobs() {
  const blur: ViewStyle | null = Platform.OS === "web" ? { filter: "blur(36px)" } : null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[s.blob, { top: -90, right: -70, width: 260, height: 260, backgroundColor: colors.gold, opacity: 0.5 }, blur]} />
      <View style={[s.blob, { bottom: -110, left: -90, width: 300, height: 300, backgroundColor: colors.sky, opacity: 0.55 }, blur]} />
      <View style={[s.blob, { bottom: 150, right: -130, width: 220, height: 220, backgroundColor: colors.coral, opacity: 0.35 }, blur]} />
    </View>
  );
}

// ── Marca ─────────────────────────────────────────────────────────

const LOGOS = {
  horizontal: { src: require("../../assets/brand/bilingualcheck-logo-horizontal.png"), ratio: 2060 / 470 },
  full: { src: require("../../assets/brand/bilingualcheck-logo-full.png"), ratio: 2172 / 724 },
  mark: { src: require("../../assets/brand/bilingualcheck-mark.png"), ratio: 520 / 470 },
} as const;

/** Logo. Dejar alrededor un espacio libre como la altura de una pieza del símbolo; nunca sobre `sky` ni `gold`. */
export function Logo({ variant = "horizontal", height = 32, style }: { variant?: keyof typeof LOGOS; height?: number; style?: StyleProp<ViewStyle> }) {
  const { src, ratio } = LOGOS[variant];
  return <Image source={src} accessibilityLabel="BilingualCheck" resizeMode="contain" style={[{ height, width: height * ratio }, style as object]} />;
}

const handsPuzzle = require("../../assets/brand/hands-puzzle.png");

/**
 * Ilustración de manos y piezas (héroes, aperturas, estados vacíos). Va dentro de un
 * contenedor con la proporción: en web `Image` toma su alto intrínseco y anularía `aspectRatio`.
 */
export function Illustration({ height, style }: { height?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[s.illustration, height ? { height } : { aspectRatio: 912 / 700 }, style]}>
      <Image source={handsPuzzle} resizeMode="cover" accessibilityLabel="" style={s.illustrationImage} />
    </View>
  );
}

/** Avatar: el símbolo es el agente, coral la persona que ejecuta, cobalt el dueño. */
export function Avatar({ kind, label = "", size = 32 }: { kind: "agent" | "human" | "owner"; label?: string; size?: number }) {
  if (kind === "agent") {
    return (
      <View style={[s.avatar, { width: size, height: size, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border }]}>
        <Logo variant="mark" height={size * 0.62} />
      </View>
    );
  }
  const human = kind === "human";
  return (
    <View style={[s.avatar, { width: size, height: size, backgroundColor: human ? colors.coral : colors.cobalt }]}>
      <Text style={{ fontFamily: fonts.heading, fontSize: size * 0.42, color: human ? colors.ink : colors.white }}>{label.trim().charAt(0).toUpperCase() || "·"}</Text>
    </View>
  );
}

// ── Tipografía ────────────────────────────────────────────────────

/** `**palabra clave**` se pinta en cobalt, como en los títulos de la guía. */
function emphasize(text: string, style: StyleProp<TextStyle>): ReactNode[] {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) =>
    i % 2 ? (
      <Text key={i} style={style}>
        {part}
      </Text>
    ) : (
      part
    ),
  );
}

export function Heading({ children, level = 1, style }: { children: string; level?: 1 | 2 | 3; style?: StyleProp<TextStyle> }) {
  const { isDesktop } = useResponsive();
  return (
    <Text accessibilityRole="header" style={[s.heading, level === 1 && s.h1, level === 1 && isDesktop && s.h1Desktop, level === 2 && s.h2, level === 3 && s.h3, style]}>
      {emphasize(children, s.keyword)}
    </Text>
  );
}

export function Body({ children, muted, small, style, numberOfLines }: { children: ReactNode; muted?: boolean; small?: boolean; style?: StyleProp<TextStyle>; numberOfLines?: number }) {
  return <Text numberOfLines={numberOfLines} style={[s.body, small && s.small, muted && { color: colors.muted }, style]}>{children}</Text>;
}

export function Eyebrow({ children, style }: { children: string; style?: StyleProp<TextStyle> }) {
  return <Text style={[s.eyebrow, style]}>{children}</Text>;
}

/** Glosa o traducción: itálica y en texto secundario. */
export function Gloss({ children }: { children: ReactNode }) {
  return <Text style={s.gloss}>{children}</Text>;
}

// ── Acciones ──────────────────────────────────────────────────────

export function Button({
  label,
  onPress,
  variant = "primary",
  loading,
  disabled,
  compact,
  style,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "success" | "ghost";
  loading?: boolean;
  disabled?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const solid = variant === "primary" || variant === "success";
  const textColor = solid ? colors.white : colors.cobalt;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: Boolean(disabled || loading), busy: Boolean(loading) }}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        s.button,
        compact && s.buttonCompact,
        variant === "primary" && s.primary,
        variant === "success" && s.success,
        variant === "secondary" && s.secondary,
        pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
        disabled && { opacity: 0.5 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text style={[s.buttonText, compact && { fontSize: 14 }, { color: textColor }]}>{variant === "success" ? `✓ ${label}` : label}</Text>
      )}
    </Pressable>
  );
}

/** Opción seleccionable (idioma de la interfaz, filtros). */
export function Chip({ label, selected, onPress, disabled }: { label: string; selected?: boolean; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected), disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [s.chip, selected && s.chipSelected, disabled && { opacity: 0.5 }, pressed && { opacity: 0.8 }]}
    >
      <Text style={[s.chipText, selected && { color: colors.white }]}>{label}</Text>
    </Pressable>
  );
}

export function Field({ style, ref, ...props }: TextInputProps & { ref?: Ref<ComponentRef<typeof TextInput>> }) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      ref={ref}
      placeholderTextColor={colors.muted}
      {...props}
      onFocus={(e) => {
        setFocused(true);
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        props.onBlur?.(e);
      }}
      style={[s.field, focused && { borderColor: colors.cobalt }, style]}
    />
  );
}

// ── Superficies y estados ─────────────────────────────────────────

/** Tarjeta blanca (radio 22, sombra suave). Con `tone` toma el tinte suave de ese significado. */
export function Card({ children, tone, style }: { children: ReactNode; tone?: Tone; style?: StyleProp<ViewStyle> }) {
  const t = tone ? tones[tone] : null;
  return (
    <View
      style={[
        s.card,
        t && { backgroundColor: t.bg, borderColor: tone === "sky" ? "rgba(49, 90, 158, 0.18)" : colors.border },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Pill({ label, tone = "sky", dot, style }: { label: string; tone?: Tone; dot?: boolean; style?: StyleProp<ViewStyle> }) {
  const c = tones[tone];
  return (
    <View style={[s.pill, { backgroundColor: c.bg }, style]}>
      {dot && <View style={[s.pillDot, { backgroundColor: c.solid }]} />}
      <Text style={[s.pillText, { color: c.fg }]}>{label}</Text>
    </View>
  );
}

export function StatusPill({ status }: { status: ProjectStatus }) {
  const { t } = useTranslation();
  return <Pill tone={STATUS_TONE[status]} label={t(`status.${status}`)} />;
}

/** Etiquetas de honestidad (§4): obligatorias cuando el contenido es simulado. */
export function HonestyTag({ kind }: { kind: "concept" | "illustrative" }) {
  const { t } = useTranslation();
  if (kind === "concept") {
    return (
      <View style={[s.pill, { backgroundColor: colors.goldSoft, borderWidth: 1, borderColor: "rgba(245, 201, 73, 0.9)" }]}>
        <View style={[s.pillDot, { backgroundColor: colors.gold }]} />
        <Text style={[s.pillText, { color: tones.gold.fg }]}>{t("honesty.concept")}</Text>
      </View>
    );
  }
  return (
    <View style={[s.pill, { borderWidth: 1, borderStyle: "dashed", borderColor: "rgba(32, 40, 53, 0.3)" }]}>
      <Text style={[s.pillText, { color: colors.muted, fontSize: 12, letterSpacing: 0.8, textTransform: "uppercase" }]}>{t("honesty.illustrative")}</Text>
    </View>
  );
}

/** "Concept demo" solo si el servidor corre Terac en `replay`. */
export function ConceptDemoTag() {
  return useConceptDemo() ? <HonestyTag kind="concept" /> : null;
}

/** Estado vacío con la imagen de manos y piezas (§0). */
export function EmptyState({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
  return (
    <View style={s.empty}>
      <Illustration style={s.emptyImage} />
      <Heading level={2} style={{ textAlign: "center" }}>
        {title}
      </Heading>
      <Body muted style={{ textAlign: "center" }}>
        {body}
      </Body>
      {children}
    </View>
  );
}

/** Círculo con ✓ en sage (aprobado, completado). */
export function Check({ size = 24 }: { size?: number }) {
  return (
    <View style={[s.avatar, { width: size, height: size, backgroundColor: colors.sage }]}>
      <Text style={{ color: colors.white, fontFamily: fonts.heading, fontSize: size * 0.55, lineHeight: size * 0.75 }}>✓</Text>
    </View>
  );
}

// ── Iconos de la barra de pestañas (sin dependencias) ─────────────

export function Glyph({ name, color, size = 22 }: { name: "projects" | "profile" | "notifications"; color: ColorValue; size?: number }) {
  if (name === "notifications") return <View style={{ width: size, height: size, alignItems: "center" }}>
    <View style={{ marginTop: 2, width: size * 0.72, height: size * 0.65, borderTopLeftRadius: size, borderTopRightRadius: size, borderBottomLeftRadius: 3, borderBottomRightRadius: 3, backgroundColor: color }} />
    <View style={{ marginTop: 2, width: size * 0.25, height: size * 0.16, borderRadius: size, backgroundColor: color }} />
  </View>;
  if (name === "projects") {
    return (
      <View style={{ width: size, height: size }}>
        <View style={{ position: "absolute", top: 1, left: 0, width: size, height: size * 0.72, borderRadius: size * 0.28, backgroundColor: color }} />
        <View style={{ position: "absolute", bottom: 1, left: size * 0.2, width: size * 0.26, height: size * 0.26, backgroundColor: color, transform: [{ rotate: "45deg" }], borderRadius: 2 }} />
      </View>
    );
  }
  return (
    <View style={{ width: size, height: size, alignItems: "center" }}>
      <View style={{ width: size * 0.42, height: size * 0.42, borderRadius: size, backgroundColor: color }} />
      <View style={{ marginTop: size * 0.08, width: size * 0.8, height: size * 0.4, borderTopLeftRadius: size, borderTopRightRadius: size, backgroundColor: color }} />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream, overflow: "hidden" },
  column: { flex: 1, minHeight: 0, minWidth: 0, width: "100%", alignSelf: "center" },
  blob: { position: "absolute", borderRadius: 999 },
  avatar: { borderRadius: 999, alignItems: "center", justifyContent: "center" },
  heading: { fontFamily: fonts.heading, color: colors.ink },
  h1: { fontSize: 32, lineHeight: 38, letterSpacing: -0.6 },
  h1Desktop: { fontSize: 44, lineHeight: 52, letterSpacing: -1 },
  h2: { fontSize: 22, lineHeight: 28, letterSpacing: -0.2 },
  h3: { fontSize: 18, lineHeight: 24 },
  keyword: { color: colors.cobalt },
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 23, color: colors.ink },
  small: { fontSize: 14, lineHeight: 20 },
  eyebrow: { fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", color: colors.cobalt },
  gloss: { fontFamily: fonts.italic, fontSize: 14, lineHeight: 20, color: colors.muted },
  button: { borderRadius: radius.button, paddingVertical: 15, paddingHorizontal: space.xl, alignItems: "center", justifyContent: "center", minHeight: 50 },
  buttonCompact: { paddingVertical: 10, paddingHorizontal: space.lg, minHeight: 40 },
  primary: { backgroundColor: colors.cobalt },
  success: { backgroundColor: colors.sage },
  secondary: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.cobalt },
  buttonText: { fontFamily: fonts.headingBold, fontSize: 16, textAlign: "center", flexShrink: 1 },
  chip: { borderRadius: radius.chip, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  chipSelected: { backgroundColor: colors.cobalt, borderColor: colors.cobalt },
  chipText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.ink },
  field: {
    backgroundColor: colors.white,
    borderRadius: radius.field,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: space.lg,
    paddingVertical: 13,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.ink,
    outlineWidth: 0,
  },
  card: { backgroundColor: colors.white, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, padding: space.card, boxShadow: shadow.card },
  pill: { maxWidth: "100%", alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5 },
  pillDot: { width: 7, height: 7, borderRadius: 4 },
  pillText: { fontFamily: fonts.bodySemi, fontSize: 13, flexShrink: 1 },
  empty: { alignItems: "center", gap: space.md, paddingVertical: space.xl, paddingHorizontal: space.lg },
  illustration: { width: "100%", borderRadius: radius.card, overflow: "hidden", backgroundColor: colors.paper, boxShadow: shadow.card },
  illustrationImage: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%" },
  emptyImage: { maxWidth: 340, marginBottom: space.sm },
});
