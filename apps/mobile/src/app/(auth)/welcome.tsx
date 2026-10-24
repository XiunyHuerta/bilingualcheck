import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Body, Button, Heading } from "@/components/ui";
import i18n, { UI_LANGUAGES } from "@/lib/i18n";
import { colors, space } from "@/theme/tokens";
import { languageName } from "@bc/shared";

// Bienvenida: propuesta de valor + idioma de la interfaz (sin banderas).
export default function Welcome() {
  const { t } = useTranslation();
  return (
    <SafeAreaView style={s.screen}>
      <View style={s.mark}>
        <View style={[s.bubble, { backgroundColor: colors.blueSoft }]} />
        <View style={[s.bubble, { backgroundColor: colors.yellow, marginLeft: -18, marginTop: 22 }]} />
      </View>
      <Heading>{t("welcome.title")}</Heading>
      <View style={{ height: space.md }} />
      <Body>{t("welcome.body")}</Body>
      <View style={{ height: space.sm }} />
      <Body muted>{t("tagline")}</Body>
      <View style={s.langs}>
        {UI_LANGUAGES.map((l) => (
          <Button
            key={l}
            label={languageName(l, l)}
            variant={i18n.language === l ? "primary" : "secondary"}
            onPress={() => void i18n.changeLanguage(l)}
            style={{ paddingHorizontal: space.lg, paddingVertical: space.sm }}
          />
        ))}
      </View>
      <View style={{ flex: 1 }} />
      <Button label={t("welcome.cta")} onPress={() => router.push("/sign-in")} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, padding: space.xl, backgroundColor: colors.cream },
  mark: { flexDirection: "row", marginVertical: space.xxl },
  bubble: { width: 64, height: 52, borderRadius: 22 },
  langs: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.xl },
});
