import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Platform, ScrollView, StyleSheet, View } from "react-native";
import { Reveal } from "@/components/motion";
import { Body, Button, Card, Heading, Logo, Screen } from "@/components/ui";
import { api } from "@/lib/api";
import { colors, space } from "@/theme/tokens";

// Vuelta desde Whop. Solo muestra "confirmando": el estado `paid` lo pone
// el webhook payment.succeeded en el servidor, nunca esta pantalla.
export default function CheckoutReturn() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ project_id?: string | string[] }>();
  const project_id = typeof params.project_id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.project_id)
    ? params.project_id : undefined;
  const [timedOut, setTimedOut] = useState(false);
  const { data, isError } = useQuery({
    queryKey: ["payment", project_id],
    queryFn: () => api<{ status: string }>(`/v1/projects/${project_id}/payment`),
    enabled: Boolean(project_id),
    refetchInterval: (query) => timedOut || query.state.error || (query.state.data && query.state.data.status !== "awaiting_payment") ? false : 2_000,
  });

  useEffect(() => {
    // Compatibilidad con el checkout abierto como popup por la pantalla del proyecto.
    // Conserva la comprobación de origen de Expo; el retorno nunca confirma un pago.
    if (Platform.OS === "web" && window.opener) {
      try { WebBrowser.maybeCompleteAuthSession(); } catch { /* La página sigue siendo utilizable. */ }
    }
    const timer = setTimeout(() => setTimedOut(true), 60_000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (project_id && data && data.status !== "awaiting_payment") {
      router.replace({ pathname: "/project/[id]", params: { id: project_id } });
    }
  }, [data, project_id]);

  return (
    <Screen blobs size="compact">
      <ScrollView contentContainerStyle={s.content}>
        <Reveal>
          <Logo variant="horizontal" height={30} />
        </Reveal>
        <View style={{ flex: 1, justifyContent: "center" }}>
          <Reveal delay={100}>
            <Card style={s.card}>
              {project_id && !isError && !timedOut && <ActivityIndicator color={colors.cobalt} size="large" />}
              <Heading level={2} style={{ textAlign: "center" }}>
                {t("checkout.confirming")}
              </Heading>
              <Body muted small style={{ textAlign: "center" }}>
                {t(project_id && !isError && !timedOut ? "checkout.confirmingBody" : "common.loadError")}
              </Body>
              {project_id && (
                <Button
                  variant="secondary"
                  label={t("checkout.back")}
                  onPress={() => router.replace({ pathname: "/project/[id]", params: { id: project_id } })}
                  style={{ alignSelf: "stretch", marginTop: space.sm }}
                />
              )}
              {!project_id && <Button label={t("common.back")} onPress={() => router.replace("/(tabs)")} />}
            </Card>
          </Reveal>
        </View>
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  content: { flexGrow: 1, padding: space.xl },
  card: { alignItems: "center", gap: space.lg, paddingVertical: space.xl },
});
