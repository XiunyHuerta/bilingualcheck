import { useQuery } from "@tanstack/react-query";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, ScrollView, StyleSheet, View } from "react-native";
import { Reveal } from "@/components/motion";
import { StepTimeline } from "@/components/stepper";
import { Body, Button, Eyebrow, Heading, Screen, StatusPill } from "@/components/ui";
import { api, type ProjectDetail } from "@/lib/api";
import { colors, space } from "@/theme/tokens";

// Línea de tiempo del proyecto (doc 06): los 6 pasos y en cuál está ahora.
export default function Timeline() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { data } = useQuery({ queryKey: ["project", id], queryFn: () => api<ProjectDetail>(`/v1/projects/${id}`) });
  const project = data?.project;

  return (
    <Screen blobs edges={["bottom"]}>
      <Stack.Screen options={{ title: t("timeline.title") }} />
      <ScrollView contentContainerStyle={s.content}>
        {!project ? (
          <ActivityIndicator color={colors.cobalt} style={{ marginTop: space.xxl }} />
        ) : (
          <>
            <Reveal style={{ gap: space.sm, marginBottom: space.xl }}>
              <Eyebrow>{t("timeline.now")}</Eyebrow>
              <View style={{ flexDirection: "row" }}>
                <StatusPill status={project.status} />
              </View>
              <Heading level={2}>{project.brief?.business.name ?? t("projects.untitled")}</Heading>
              <Body muted small>
                {t("card.moneyNote")}
              </Body>
            </Reveal>
            <Reveal delay={100}>
              <StepTimeline status={project.status} />
            </Reveal>
            <Button label={t("common.back")} variant="secondary" onPress={() => router.back()} style={{ marginTop: space.lg }} />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({ content: { padding: space.lg, paddingBottom: space.xxl } });
