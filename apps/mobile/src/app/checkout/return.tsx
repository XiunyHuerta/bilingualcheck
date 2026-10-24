import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, View } from "react-native";
import { Body, Button } from "@/components/ui";
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
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: space.lg, padding: space.xl, backgroundColor: colors.cream }}>
      <ActivityIndicator color={colors.blueDeep} size="large" />
      <Body>{t("checkout.confirming")}</Body>
      {project_id && (
        <Button
          variant="secondary"
          label={t("checkout.back")}
          onPress={() => router.replace({ pathname: "/project/[id]", params: { id: project_id } })}
        />
      )}
    </View>
  );
}
