import { isValidLanguageTag, languageName } from "@bc/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, StyleSheet, View } from "react-native";
import { Body, Button, Card, Chip, Eyebrow, Field, Heading, Screen } from "@/components/ui";
import { post, type Project } from "@/lib/api";
import { useResponsive } from "@/theme/responsive";
import { space } from "@/theme/tokens";

const LANGUAGES = ["es", "en", "pt", "fr", "it", "de", "ar", "zh", "ja", "hi", "ht", "ko"];
export default function NewGoal() {
  const { t, i18n } = useTranslation();
  const { gutter } = useResponsive();
  const queryClient = useQueryClient();
  const { goal: suggestedGoal } = useLocalSearchParams<{ goal?: string }>();
  const [goal, setGoal] = useState(() => typeof suggestedGoal === "string" ? suggestedGoal.slice(0, 8000) : "");
  const [language, setLanguage] = useState(i18n.language);
  const [target, setTarget] = useState("");
  const valid = Boolean(goal.trim() && isValidLanguageTag(language.trim()) && (!target.trim() || isValidLanguageTag(target.trim())));
  const create = useMutation({
    mutationFn: () => post<{ project: Project }>("/v1/projects", { source_language: language.trim(),
      ...(target.trim() ? { target_language: target.trim() } : {}), goal: goal.trim() }),
    onSuccess: ({ project }) => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
      router.replace({ pathname: "/project/[id]", params: { id: project.id } });
    },
  });
  return <Screen blobs size="reading" edges={["bottom"]}>
    <Stack.Screen options={{ title: t("v2.start") }} />
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[s.page, { padding: gutter }]}>
      <Eyebrow>{t("v2.start")}</Eyebrow><Heading>{t("v2.goalQuestion")}</Heading><Body muted>{t("v2.goalHint")}</Body>
      <Field multiline value={goal} onChangeText={setGoal} maxLength={8000} placeholder={t("v2.goalPlaceholder")}
        accessibilityLabel={t("v2.goalQuestion")} style={{ minHeight: 180, textAlignVertical: "top" }} editable={!create.isPending} />
      <View style={s.chips}>{["market", "campaign", "website", "community", "product", "other"].map(key => <Chip key={key}
        label={t(`v2.suggestions.${key}`)} onPress={() => { if (!create.isPending) setGoal(previous => previous ? `${previous}\n${t(`v2.suggestions.${key}`)}` : t(`v2.suggestions.${key}`)); }} />)}</View>
      <Card style={s.section}><Heading level={3}>{t("v2.goalLanguage")}</Heading>
        <View style={s.chips}>{LANGUAGES.map(code => <Chip key={code} label={languageName(code, i18n.language)} selected={language === code}
          onPress={() => { if (!create.isPending) setLanguage(code); }} />)}</View>
        <Field value={language} onChangeText={setLanguage} accessibilityLabel={t("v2.customLanguage")} placeholder={t("v2.customLanguage")} autoCapitalize="none" autoCorrect={false} editable={!create.isPending} />
        <Body small muted>{t("newProject.sourceLanguage")}</Body>
        <Body small>{t("v2.targetLanguage")}</Body><Field value={target} onChangeText={setTarget} accessibilityLabel={t("v2.targetLanguage")} placeholder="en, fr, pt-BR…" autoCapitalize="none" autoCorrect={false} editable={!create.isPending} />
      </Card>
      <Body small muted>{t("v2.scopeNote")}</Body>
      {create.isError ? <Card tone="coral"><Body>{t("common.loadError")}</Body></Card> : null}
      <Button label={t("v2.goalSubmit")} loading={create.isPending} disabled={!valid} onPress={() => create.mutate()} />
    </ScrollView>
  </Screen>;
}
const s = StyleSheet.create({ page: { gap: space.xl, paddingBottom: 48 }, chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm }, section: { gap: space.lg } });
