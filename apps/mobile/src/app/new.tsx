import { languageName } from "@bc/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router, Stack } from "expo-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Pop } from "@/components/motion";
import { Body, Button, Card, Check, Field, Heading, Screen } from "@/components/ui";
import { post, type Project } from "@/lib/api";
import { colors, fonts, radius, space } from "@/theme/tokens";

// Lista amplia de idiomas: cualquier par es válido (nada asume inglés ↔ español).
// El nombre se muestra con Intl.DisplayNames en el idioma de la interfaz, sin banderas.
const LANGUAGES = [
  "es", "en", "pt", "fr", "de", "it", "ko", "ja", "zh", "vi", "tl", "ar", "hi", "ru", "uk", "pl", "ht", "fa", "tr", "he",
  "bn", "ur", "pa", "gu", "ta", "te", "th", "id", "ms", "sw", "am", "so", "yo", "ha", "nl", "el", "ro", "hu", "cs", "sv",
];

export default function NewProject() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(i18n.language);

  const options = useMemo(() => {
    const named = LANGUAGES.map((code) => ({ code, name: languageName(code, i18n.language), native: languageName(code, code) }));
    const q = query.trim().toLowerCase();
    return q ? named.filter((l) => `${l.name} ${l.native} ${l.code}`.toLowerCase().includes(q)) : named;
  }, [query, i18n.language]);

  const create = useMutation({
    mutationFn: () => post<{ project: Project }>("/v1/projects", { source_language: selected }),
    onSuccess: ({ project }) => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      router.replace({ pathname: "/project/[id]", params: { id: project.id } });
    },
  });

  return (
    <Screen blobs edges={["bottom"]}>
      <Stack.Screen options={{ title: t("newProject.title") }} />
      <View style={s.head}>
        <Heading>{t("newProject.heading")}</Heading>
        <Body muted small>
          {t("newProject.sourceLanguage")}
        </Body>
        <Field value={query} onChangeText={setQuery} placeholder={t("newProject.search")} autoCorrect={false} accessibilityLabel={t("newProject.search")} />
      </View>
      <FlatList
        data={options}
        keyExtractor={(l) => l.code}
        contentContainerStyle={s.list}
        keyboardShouldPersistTaps="handled"
        ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
        ListEmptyComponent={
          <Card>
            <Body small muted>
              {t("newProject.empty")}
            </Body>
          </Card>
        }
        renderItem={({ item }) => {
          const on = selected === item.code;
          return (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              onPress={() => setSelected(item.code)}
              style={({ pressed }) => [s.lang, on && s.langOn, pressed && { opacity: 0.8 }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={s.langName}>{item.native}</Text>
                {item.name !== item.native && <Text style={s.langSub}>{item.name}</Text>}
              </View>
              {on && (
                <Pop>
                  <Check size={24} />
                </Pop>
              )}
            </Pressable>
          );
        }}
      />
      <View style={s.footer}>
        <Button label={t("newProject.create")} onPress={() => create.mutate()} loading={create.isPending} />
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  head: { padding: space.lg, gap: space.md },
  list: { paddingHorizontal: space.lg, paddingBottom: space.lg },
  lang: { flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, paddingVertical: space.md, borderRadius: radius.field, backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.border },
  langOn: { borderColor: colors.cobalt, backgroundColor: colors.skySoft },
  langName: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.ink },
  langSub: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  footer: { padding: space.lg, backgroundColor: colors.sidebar, borderTopWidth: 1, borderTopColor: colors.border },
});
