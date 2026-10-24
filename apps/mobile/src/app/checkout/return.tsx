import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Reveal } from "@/components/motion";
import { Body, Button, Card, Heading, Logo, Screen } from "@/components/ui";
import { api } from "@/lib/api";
import { colors, space } from "@/theme/tokens";

// Vuelta desde Whop. Solo muestra "confirmando": el estado `paid` lo pone
// el webhook payment.succeeded en el servidor, nunca esta pantalla.
export default function CheckoutReturn() {
  const { t } = useTranslation();
  const { project_id } = useLocalSearchParams<{ project_id?: string }>();
  const { data } = useQuery({
    queryKey: ["payment", project_id],
    queryFn: () => api<{ status: string }>(`/v1/projects/${project_id}/payment`),
    enabled: Boolean(project_id),
    refetchInterval: 2_000,
  });

  useEffect(() => {
    if (project_id && data && data.status !== "awaiting_payment") {
      router.replace({ pathname: "/project/[id]", params: { id: project_id } });
    }
  }, [data, project_id]);

  return (
    <Screen blobs>
      <View style={s.content}>
        <Reveal>
          <Logo variant="horizontal" height={30} />
        </Reveal>
        <View style={{ flex: 1, justifyContent: "center" }}>
          <Reveal delay={100}>
            <Card style={s.card}>
              <ActivityIndicator color={colors.cobalt} size="large" />
              <Heading level={2} style={{ textAlign: "center" }}>
                {t("checkout.confirming")}
              </Heading>
              <Body muted small style={{ textAlign: "center" }}>
                {t("checkout.confirmingBody")}
              </Body>
              {project_id && (
                <Button
                  variant="secondary"
                  label={t("checkout.back")}
                  onPress={() => router.replace({ pathname: "/project/[id]", params: { id: project_id } })}
                  style={{ alignSelf: "stretch", marginTop: space.sm }}
                />
              )}
            </Card>
          </Reveal>
        </View>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  content: { flex: 1, padding: space.xl },
  card: { alignItems: "center", gap: space.lg, paddingVertical: space.xl },
});
