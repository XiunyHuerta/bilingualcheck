import { languageName, recognizedUILanguage } from "@bc/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { api, type User } from "@/lib/api";
import i18n, { changeUILanguage, deviceUILanguage, followDeviceLanguage, UI_LANGUAGES } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { colors, fonts, radius, space } from "@/theme/tokens";
import { Body, Button, Field } from "./ui";

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export function LanguagePicker({ onSaved }: { onSaved?: () => void }) {
  const { t } = useTranslation();
  const displayLanguage = i18n.language;
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const save = useMutation({ mutationFn: async (language: string) => {
    if (language === "auto") await followDeviceLanguage();
    else await changeUILanguage(language);
    const token = useSession.getState().token;
    if (!token) return;
    const result = await api<{ user: User }>("/v1/me", { method: "PATCH", body: JSON.stringify({ ui_language: i18n.language }) });
    client.setQueryData(["me", token], result);
  }, onSuccess: onSaved });
  const options = useMemo(() => {
    const collator = new Intl.Collator(displayLanguage, { sensitivity: "base" });
    const languages: { code: string; name: string; native: string }[] = UI_LANGUAGES.map(code => ({ code, name: languageName(code, displayLanguage), native: languageName(code, code) }))
      .sort((a, b) => collator.compare(a.name, b.name));
    const query = normalize(search.trim());
    const filtered = query ? languages.filter(item => normalize(`${item.name} ${item.native} ${item.code}`).includes(query)) : languages;
    const custom = recognizedUILanguage(search.trim());
    if (custom && !filtered.some(item => item.code === custom)) filtered.unshift({ code: custom, name: languageName(custom, displayLanguage), native: languageName(custom, custom) });
    return filtered;
  }, [search, displayLanguage]);
  return <View style={s.container}>
    <Button label={t("menuTeam.deviceLanguage", { language: languageName(deviceUILanguage(), displayLanguage) })} compact variant="secondary"
      disabled={save.isPending} onPress={() => save.mutate("auto")} />
    <Field value={search} onChangeText={setSearch} accessibilityLabel={t("menuTeam.search")} placeholder={t("menuTeam.search")} autoCapitalize="none" autoCorrect={false} editable={!save.isPending} />
    {save.isPending ? <View style={s.loading} accessibilityLiveRegion="polite"><ActivityIndicator color={colors.cobalt} /><Body small>{t("menuTeam.loading")}</Body></View> : null}
    {save.isError ? <Body small style={{ color: "#9C4A41" }}>{t(i18n.language === save.variables ? "refinements.languageSaveError" : "menuTeam.languageError")}</Body> : null}
    <FlatList style={s.list} data={options} keyExtractor={item => item.code} keyboardShouldPersistTaps="handled" initialNumToRender={12}
      ListEmptyComponent={<Body small muted>{t("menuTeam.noLanguage")}</Body>}
      renderItem={({ item }) => <Pressable accessibilityRole="radio" accessibilityState={{ selected: i18n.language === item.code, disabled: save.isPending }}
        disabled={save.isPending} onPress={() => save.mutate(item.code)} style={({ pressed }) => [s.option, i18n.language === item.code && s.selected, pressed && { opacity: 0.7 }]}>
        <View style={{ flex: 1, minWidth: 0 }}><Text style={s.name}>{item.native}</Text><Text style={s.translation}>{item.name}</Text></View>
        <Text style={s.code}>{i18n.language === item.code ? "✓" : item.code.toUpperCase()}</Text>
      </Pressable>} />
  </View>;
}
const s = StyleSheet.create({ container: { gap: space.md }, list: { height: 300 }, option: { minHeight: 58, padding: space.md, borderRadius: radius.chip, flexDirection: "row", alignItems: "center", gap: space.sm }, selected: { backgroundColor: colors.skySoft },
  name: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.ink }, translation: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, marginTop: 3 }, code: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.cobalt }, loading: { flexDirection: "row", alignItems: "center", gap: space.sm },
});
