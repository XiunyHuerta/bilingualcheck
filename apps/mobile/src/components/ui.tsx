import type { ProjectStatus } from "@bc/shared";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { colors, fonts, radius, space } from "@/theme/tokens";

export function Button(props: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary";
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const primary = (props.variant ?? "primary") === "primary";
  return (
    <Pressable
      accessibilityRole="button"
      onPress={props.onPress}
      disabled={props.disabled || props.loading}
      style={({ pressed }) => [
        styles.button,
        primary ? styles.primary : styles.secondary,
        (pressed || props.disabled) && { opacity: 0.7 },
        props.style,
      ]}
    >
      {props.loading ? (
        <ActivityIndicator color={primary ? colors.white : colors.blueDeep} />
      ) : (
        <Text style={[styles.buttonText, { color: primary ? colors.white : colors.blueDeep }]}>{props.label}</Text>
      )}
    </Pressable>
  );
}

export function Heading({ children }: { children: ReactNode }) {
  return <Text style={styles.heading}>{children}</Text>;
}

export function Body({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return <Text style={[styles.body, muted && { color: colors.muted }]}>{children}</Text>;
}

const STATUS_COLOR: Partial<Record<ProjectStatus, string>> = {
  delivered: colors.green,
  paid: colors.green,
  in_review: colors.coral,
  quoted: colors.yellow,
  failed: colors.coral,
};

export function StatusPill({ status }: { status: ProjectStatus }) {
  const { t } = useTranslation();
  return (
    <View style={[styles.pill, { backgroundColor: STATUS_COLOR[status] ?? colors.blueSoft }]}>
      <Text style={styles.pillText}>{t(`status.${status}`)}</Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  button: { borderRadius: radius.pill, paddingVertical: space.md, paddingHorizontal: space.xl, alignItems: "center" },
  primary: { backgroundColor: colors.blueDeep },
  secondary: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.blueDeep },
  buttonText: { fontFamily: fonts.bodyMedium, fontSize: 16 },
  heading: { fontFamily: fonts.heading, fontSize: 26, color: colors.blueDeep, lineHeight: 32 },
  body: { fontFamily: fonts.body, fontSize: 16, color: colors.ink, lineHeight: 23 },
  pill: { alignSelf: "flex-start", borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: space.xs },
  pillText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.ink },
});
