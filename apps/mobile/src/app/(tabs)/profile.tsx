import { languageName } from "@bc/shared";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";
import { Reveal } from "@/components/motion";
import { Avatar, Body, Button, Card, Chip, Eyebrow, Heading, Screen } from "@/components/ui";
import { api, post, type User } from "@/lib/api";
import i18n, { UI_LANGUAGES } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { colors, space } from "@/theme/tokens";

export default function Profile() {
  const { t } = useTranslation();
  const signOut = useSession((s) => s.signOut);
  const { data } = useQuery({ queryKey: ["me"], queryFn: () => api<{ user: User }>("/v1/me"), retry: false });
  const user = data?.user;
  const name = user?.business_name ?? user?.name ?? t("profile.noName");

  return (
    <Screen blobs edges={[]}>
      <View style={s.content}>
        <Reveal>
          <Card>
            <View style={s.who}>
              <Avatar kind="owner" label={name} size={52} />
              <View style={{ flex: 1 }}>
                <Heading level={2}>{name}</Heading>
                {user?.email ? <Body muted small>{user.email}</Body> : null}
              </View>
            </View>
          </Card>
        </Reveal>

        <Reveal delay={100} style={{ gap: space.sm, marginTop: space.xl }}>
          <Eyebrow style={{ color: colors.muted }}>{t("profile.uiLanguage")}</Eyebrow>
          <View style={s.langs}>
            {UI_LANGUAGES.map((l) => (
              <Chip
                key={l}
                label={languageName(l, l)}
                selected={i18n.language === l}
                onPress={() => {
                  void i18n.changeLanguage(l);
                  void api("/v1/me", { method: "PATCH", body: JSON.stringify({ ui_language: l }) }).catch(() => undefined);
                }}
              />
            ))}
          </View>
          <Body small muted>
            {t("profile.uiLanguageHint")}
          </Body>
        </Reveal>

        <View style={{ flex: 1 }} />
        <Button
          label={t("profile.signOut")}
          variant="secondary"
          onPress={() => {
            void post("/v1/auth/logout").finally(signOut);
          }}
        />
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  content: { flex: 1, padding: space.lg, paddingBottom: space.xl },
  who: { flexDirection: "row", alignItems: "center", gap: space.lg },
  langs: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
});
