import type { ProjectStatus } from "@bc/shared";
import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fonts, radius, shadow, space } from "@/theme/tokens";
import { Pop } from "./motion";

// Stepper de 6 pasos (guía §4): el activo es una pastilla cobalt con número blanco,
// los completados llevan un círculo sage con ✓ y los pendientes un círculo con borde.

export const STEP_KEYS = ["chat", "brief", "quote", "payment", "work", "delivery"] as const;

// Paso activo según la máquina de estados (6 = todo completado).
const ACTIVE_STEP: Record<ProjectStatus, number> = {
  intake: 0,
  brief_ready: 1,
  quoting: 2,
  quoted: 2,
  awaiting_payment: 3,
  paid: 4,
  recruiting: 4,
  in_progress: 4,
  revision: 4,
  in_review: 5,
  delivered: 6,
  failed: 2,
  refunded: 4,
};

export function stepProgress(status: ProjectStatus) {
  return { active: ACTIVE_STEP[status], problem: status === "failed" || status === "refunded" };
}

type StepState = "done" | "active" | "pending";
const stateOf = (i: number, active: number): StepState => (i < active ? "done" : i === active ? "active" : "pending");

/** Versión compacta (cabecera del chat). Con `onPress` abre la línea de tiempo. */
export function Stepper({ status, onPress }: { status: ProjectStatus; onPress?: () => void }) {
  const { t } = useTranslation();
  const { active, problem } = stepProgress(status);
  const current = Math.min(active, STEP_KEYS.length - 1);
  const label = `${current + 1}/${STEP_KEYS.length} · ${t(`steps.${STEP_KEYS[current]}`)}`;

  return (
    <Pressable accessibilityRole={onPress ? "button" : "progressbar"} accessibilityLabel={label} onPress={onPress} disabled={!onPress} style={s.strip}>
      <View style={s.row}>
        {STEP_KEYS.map((key, i) => {
          const state = stateOf(i, active);
          return (
            <Fragment key={key}>
              {i > 0 && <View style={[s.link, i <= active && { backgroundColor: colors.sage }]} />}
              {state === "active" ? (
                <View style={[s.pill, problem && { backgroundColor: colors.coral }]}>
                  <View style={s.pillNumber}>
                    <Text style={[s.pillNumberText, problem && { color: colors.ink }]}>{i + 1}</Text>
                  </View>
                  <Text numberOfLines={1} style={[s.pillLabel, problem && { color: colors.ink }]}>
                    {t(`steps.${key}`)}
                  </Text>
                </View>
              ) : state === "done" ? (
                <Pop key={`${key}-done`}>
                  <View style={[s.circle, s.circleDone]}>
                    <Text style={s.tick}>✓</Text>
                  </View>
                </Pop>
              ) : (
                <View style={s.circle}>
                  <Text style={s.number}>{i + 1}</Text>
                </View>
              )}
            </Fragment>
          );
        })}
      </View>
    </Pressable>
  );
}

/** Seis segmentos finos para las filas de la lista: sage hecho, cobalt activo, gris pendiente. */
export function MiniProgress({ status }: { status: ProjectStatus }) {
  const { active, problem } = stepProgress(status);
  return (
    <View style={s.mini} accessibilityElementsHidden>
      {STEP_KEYS.map((key, i) => (
        <View
          key={key}
          style={[s.miniBar, i < active && { backgroundColor: colors.sage }, i === active && { backgroundColor: problem ? colors.coral : colors.cobalt }]}
        />
      ))}
    </View>
  );
}

/** Línea de tiempo vertical con el detalle de cada paso. */
export function StepTimeline({ status }: { status: ProjectStatus }) {
  const { t } = useTranslation();
  const { active, problem } = stepProgress(status);
  return (
    <View>
      {STEP_KEYS.map((key, i) => {
        const state = stateOf(i, active);
        const on = state === "active";
        const ink = on ? (problem ? colors.ink : colors.white) : colors.ink;
        return (
          <View key={key} style={[s.step, on && [s.stepActive, problem && { backgroundColor: colors.coral, boxShadow: undefined }]]}>
            <View style={[s.bigCircle, state === "done" && s.circleDone, on && { backgroundColor: colors.white, borderColor: colors.white }]}>
              <Text style={[s.bigNumber, state === "done" && { color: colors.white }, on && { color: problem ? colors.ink : colors.cobalt }]}>
                {state === "done" ? "✓" : i + 1}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.stepTitle, { color: ink }, state === "pending" && { color: colors.muted }]}>{t(`steps.${key}`)}</Text>
              <Text style={[s.stepHint, { color: on ? ink : colors.muted }]}>{t(`stepsHint.${key}`)}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  strip: { backgroundColor: colors.sidebar, borderBottomWidth: 1, borderBottomColor: colors.border, paddingHorizontal: space.lg, paddingVertical: space.md },
  row: { flexDirection: "row", alignItems: "center" },
  mini: { flexDirection: "row", gap: 4 },
  miniBar: { flex: 1, height: 5, borderRadius: 3, backgroundColor: colors.border },
  link: { flex: 1, height: 2, minWidth: 4, backgroundColor: colors.border, marginHorizontal: 3, borderRadius: 1 },
  circle: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: "rgba(32, 40, 53, 0.18)", backgroundColor: colors.white, alignItems: "center", justifyContent: "center" },
  circleDone: { backgroundColor: colors.sage, borderColor: colors.sage },
  number: { fontFamily: fonts.headingBold, fontSize: 12, color: colors.muted },
  tick: { fontFamily: fonts.heading, fontSize: 13, color: colors.white, lineHeight: 16 },
  pill: { flexShrink: 1, flexDirection: "row", alignItems: "center", gap: 7, height: 30, paddingLeft: 5, paddingRight: 12, borderRadius: radius.pill, backgroundColor: colors.cobalt },
  pillNumber: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.white, alignItems: "center", justifyContent: "center" },
  pillNumberText: { fontFamily: fonts.heading, fontSize: 12, color: colors.cobalt },
  pillLabel: { flexShrink: 1, fontFamily: fonts.headingBold, fontSize: 13, color: colors.white },
  step: { flexDirection: "row", alignItems: "center", gap: space.lg, padding: 14, borderRadius: 16, marginBottom: space.sm },
  stepActive: { backgroundColor: colors.cobalt, boxShadow: shadow.active },
  bigCircle: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: "rgba(32, 40, 53, 0.18)", backgroundColor: colors.white, alignItems: "center", justifyContent: "center" },
  bigNumber: { fontFamily: fonts.heading, fontSize: 16, color: colors.muted },
  stepTitle: { fontFamily: fonts.headingBold, fontSize: 16 },
  stepHint: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, marginTop: 2 },
});
