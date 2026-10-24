import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, ScrollView, StyleSheet, View } from "react-native";
import { AccountMenu } from "@/components/account-menu";
import { BusinessProfileEditor } from "@/components/business-profile";
import { LanguageSettings } from "@/components/language-settings";
import { Body, Button, Card, Eyebrow, Heading, Screen } from "@/components/ui";
import { api, type User } from "@/lib/api";
import { useSession } from "@/lib/session";
import { colors, space } from "@/theme/tokens";
import { useResponsive } from "@/theme/responsive";

export default function Profile() {
  const { t } = useTranslation();
  const { chooseLanguage } = useLocalSearchParams<{ chooseLanguage?: string }>();
  const { gutter } = useResponsive();
  const token = useSession(state => state.token);
  const client = useQueryClient();
  const { data, isPending, error, refetch } = useQuery({ queryKey: ["me", token], queryFn: () => api<{ user: User }>("/v1/me"), retry: false });
  return <Screen blobs edges={[]}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[s.content, { padding: gutter }]}>
      <View style={s.header}><View style={s.title}>
        <Eyebrow>{t("profile.eyebrow")}</Eyebrow><Heading>{t("profile.title")}</Heading>
      </View><AccountMenu /></View>
      <Body muted>{t("refinements.profileIntro")}</Body>
      {chooseLanguage === "1" ? <LanguageSettings initial onContinue={() => router.setParams({ chooseLanguage: undefined })} /> : null}
      {isPending ? <ActivityIndicator color={colors.cobalt} accessibilityLabel={t("profile.loading")} /> : null}
      {error ? <Card><Body>{t("common.loadError")}</Body><Button label={t("common.retry")} onPress={() => void refetch()} variant="ghost" /></Card> : null}
      {data?.user ? <BusinessProfileEditor key={data.user.id} user={data.user} onSaved={user => {
        client.setQueryData(["me", token], { user });
      }} /> : null}
    </ScrollView>
  </Screen>;
}
const s = StyleSheet.create({ content: { gap: space.lg, paddingBottom: space.xxl }, header: { flexDirection: "row", alignItems: "center", gap: space.md },
  title: { flex: 1, minWidth: 0, gap: space.sm },
});
