import { languageName } from "@bc/shared";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { ScrollView, StyleSheet, View } from "react-native";
import { Marker, Reveal } from "@/components/motion";
import { Body, Button, Chip, Eyebrow, Heading, Illustration, Logo, Pill, Screen } from "@/components/ui";
import i18n, { UI_LANGUAGES } from "@/lib/i18n";
import { colors, space } from "@/theme/tokens";

// Bienvenida: propuesta de valor + idioma de la interfaz (sin banderas).
export default function Welcome() {
  const { t } = useTranslation();
  return (
    <Screen blobs>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <Reveal style={{ marginBottom: space.xl }}>
          <Logo variant="horizontal" height={34} />
        </Reveal>

        <Reveal delay={80}>
          <Illustration style={{ marginBottom: space.xl }} />
        </Reveal>

        <Reveal delay={160} style={{ gap: space.md }}>
          <Eyebrow>{t("welcome.eyebrow")}</Eyebrow>
          <Heading>{t("welcome.title")}</Heading>
          <Body muted>{t("welcome.body")}</Body>
          <Pill tone="sky" label={t("welcome.pairs")} />
        </Reveal>

        <Reveal delay={240} style={{ marginTop: space.xl, gap: space.sm }}>
          <Marker>{t("tagline")}</Marker>
        </Reveal>

        <Reveal delay={320} style={{ marginTop: space.xl, gap: space.sm }}>
          <Eyebrow style={{ color: colors.muted }}>{t("welcome.uiLanguage")}</Eyebrow>
          <View style={s.langs}>
            {UI_LANGUAGES.map((l) => (
              <Chip key={l} label={languageName(l, l)} selected={i18n.language === l} onPress={() => void i18n.changeLanguage(l)} />
            ))}
          </View>
        </Reveal>

        <View style={{ marginTop: space.xl }}>
          <Button label={t("welcome.cta")} onPress={() => router.push("/sign-in")} />
        </View>
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  content: { padding: space.xl, paddingTop: space.lg },
  langs: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
});
