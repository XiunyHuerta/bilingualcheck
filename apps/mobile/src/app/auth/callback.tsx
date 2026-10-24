import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Platform, ScrollView } from "react-native";
import { Body, Button, Card, Screen } from "@/components/ui";
import { api } from "@/lib/api";
import { consumeWhopWebOAuth } from "@/lib/config";
import { useSession } from "@/lib/session";
import { colors, space } from "@/theme/tokens";

// Web completa aquí PKCE incluso tras una navegación/recarga de la página de login.
// En nativo, AuthSession resuelve el retorno en la pantalla sign-in.
export default function AuthCallback() {
  const { t } = useTranslation();
  const signIn = useSession((s) => s.signIn);
  const [error, setError] = useState(false);
  const completion = useRef<Promise<void> | null>(null);

  useEffect(() => {
    let active = true;
    // Una única promesa por montaje, también con la repetición de efectos de StrictMode.
    completion.current ??= (async () => {
      if (Platform.OS !== "web") throw new Error("Reinicia el acceso desde la app");
      const input = consumeWhopWebOAuth(window.location.href);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 35_000);
      let session: { session_jwt: string };
      try {
        session = await api<{ session_jwt: string }>("/v1/auth/whop", {
          method: "POST", body: JSON.stringify(input), signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
      await signIn(session.session_jwt);
    })();
    void completion.current.then(() => {
      if (active) router.replace({ pathname: "/profile", params: { chooseLanguage: "1" } });
    }).catch(() => {
      if (active) setError(true);
    });
    return () => { active = false; };
  }, [signIn]);

  return (
    <Screen blobs size="compact">
      <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: "center", justifyContent: "center", padding: space.xl }}>
      {error ? (
        <Card tone="coral" style={{ padding: space.lg, gap: space.md }}>
          <Body>{t("signIn.error")}</Body>
          <Button label={t("signIn.button")} onPress={() => router.replace("/(auth)/sign-in")} />
        </Card>
      ) : <ActivityIndicator color={colors.cobalt} />}
      </ScrollView>
    </Screen>
  );
}
