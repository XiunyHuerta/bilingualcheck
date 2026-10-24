import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { ScrollView, StyleSheet, View } from "react-native";
import { AccountMenu } from "@/components/account-menu";
import { Marker, Reveal } from "@/components/motion";
import { Body, Button, Eyebrow, Heading, Illustration, Logo, Pill, Screen } from "@/components/ui";
import { space } from "@/theme/tokens";
import { useResponsive } from "@/theme/responsive";
import { useSession } from "@/lib/session";

// Bienvenida: propuesta de valor + idioma de la interfaz (sin banderas).
export default function Welcome() {
  const { t } = useTranslation();
  const { isDesktop, gutter } = useResponsive();
  const token = useSession(state => state.token);
  return (
    <Screen blobs>
      <ScrollView contentContainerStyle={[s.content, { padding: gutter }, isDesktop && s.desktopContent]} showsVerticalScrollIndicator={false}>
        <Reveal style={{ marginBottom: space.xl, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md }}>
          <Logo variant="horizontal" height={34} />
          <AccountMenu />
        </Reveal>

        <View style={[s.hero, isDesktop && s.heroDesktop]}>
          <Reveal delay={80} style={isDesktop && s.visual}>
            <Illustration style={!isDesktop && { marginBottom: space.xl }} />
          </Reveal>

          <View style={isDesktop && s.copy}>
            <Reveal delay={160} style={{ gap: space.md }}>
              <Eyebrow>{t("welcome.eyebrow")}</Eyebrow>
              <Heading>{t("welcome.title")}</Heading>
              <Body muted>{t("welcome.body")}</Body>
              <Pill tone="sky" label={t("welcome.pairs")} />
            </Reveal>

            <Reveal delay={240} style={{ marginTop: space.xl, gap: space.sm }}>
              <Marker>{t("tagline")}</Marker>
            </Reveal>


            <View style={{ marginTop: space.xl, gap: space.md }}>
              <Button label={t("v2.viewDemo")} onPress={() => router.push("/demo")} />
              <Button label={t(token ? "v2.nav.dashboard" : "welcome.cta")} variant="secondary" onPress={() => router.push(token ? "/dashboard" : "/sign-in")} />
              <Body small muted>{t("v2.core")}</Body>
            </View>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  content: { padding: space.xl, paddingTop: space.lg },
  desktopContent: { flexGrow: 1, justifyContent: "center", paddingVertical: 48 },
  hero: { width: "100%" },
  heroDesktop: { flexDirection: "row-reverse", alignItems: "center", gap: 64, flex: 1 },
  visual: { flex: 1, minWidth: 0 },
  copy: { flex: 1, minWidth: 0, maxWidth: 520 },
  langs: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
});
