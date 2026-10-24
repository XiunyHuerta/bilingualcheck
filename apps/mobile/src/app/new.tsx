import { languageName } from "@bc/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router, Stack } from "expo-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Body, Button } from "@/components/ui";
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
    <View style={{ flex: 1, padding: space.lg, gap: space.md }}>
      <Stack.Screen options={{ title: t("newProject.title") }} />
      <Body>{t("newProject.sourceLanguage")}</Body>
      <TextInput value={query} onChangeText={setQuery} placeholder={t("newProject.search")} style={s.search} />
      <FlatList
        data={options}
        keyExtractor={(l) => l.code}
        renderItem={({ item }) => (
          <Pressable onPress={() => setSelected(item.code)} style={[s.lang, selected === item.code && s.selected]}>
            <Text style={s.langName}>{item.native}</Text>
            <Text style={s.langSub}>{item.name}</Text>
          </Pressable>
        )}
      />
      <Button label={t("newProject.create")} onPress={() => create.mutate()} loading={create.isPending} />
    </View>
  );
}

const s = StyleSheet.create({
  search: { backgroundColor: colors.white, borderRadius: radius.md, padding: space.md, fontFamily: fonts.body, fontSize: 16 },
  lang: { padding: space.md, borderRadius: radius.md, marginBottom: space.xs },
  selected: { backgroundColor: colors.blueSoft },
  langName: { fontFamily: fonts.bodyMedium, fontSize: 16, color: colors.ink },
  langSub: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
});
