import * as AuthSession from "expo-auth-session";
import * as Crypto from "expo-crypto";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, StyleSheet, View } from "react-native";
import { Reveal } from "@/components/motion";
import { Body, Button, Card, Heading, Illustration, Logo, Screen } from "@/components/ui";
import { post, type User } from "@/lib/api";
import { config, startWhopWebOAuth, whopNativeOAuthRedirectUri, whopNativeReturnUri } from "@/lib/config";
import { useSession } from "@/lib/session";
import { space } from "@/theme/tokens";

// Sign in with Whop: OAuth 2.1 + PKCE (doc 05). El código se intercambia en el
// backend, que devuelve nuestra propia sesión. Probar en un development build:
// en Expo Go el esquema bilingualcheck:// no funciona.
const discovery = {
  authorizationEndpoint: `${config.whopOAuthBase}/oauth/authorize`,
  tokenEndpoint: `${config.whopOAuthBase}/oauth/token`,
};

export default function SignIn() {
  const { t } = useTranslation();
  const signIn = useSession((s) => s.signIn);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [nonce] = useState(() => Crypto.randomUUID());
  const redirectUri = Platform.OS === "web"
    ? AuthSession.makeRedirectUri({ path: "auth/callback" })
    : whopNativeOAuthRedirectUri();

  const [request] = AuthSession.useAuthRequest(
    {
      clientId: config.whopClientId,
      redirectUri,
      scopes: ["openid", "profile", "email"],
      usePKCE: true,
      extraParams: { nonce },
    },
    discovery,
  );

  async function authorize() {
    if (!request || loading) return;
    setError(false);
    setLoading(true);
    try {
      if (Platform.OS === "web") {
        startWhopWebOAuth(request);
        return;
      }
      if (!request.url || !request.codeVerifier) throw new Error("OAuth no está listo");
      // El callback registrado en Whop es HTTPS; el puente devuelve a este esquema.
      const result = await WebBrowser.openAuthSessionAsync(request.url, whopNativeReturnUri);
      if (result.type !== "success") return;
      const response = request.parseReturnUrl(result.url);
      if (response.type !== "success" || !response.params.code) throw new Error("OAuth rechazado");
      const session = await post<{ session_jwt: string; user: User }>("/v1/auth/whop", {
        code: response.params.code,
        code_verifier: request.codeVerifier,
        redirect_uri: redirectUri,
      });
      await signIn(session.session_jwt);
      router.replace("/(tabs)");
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen blobs>
      <View style={s.content}>
        <Reveal>
          <Logo variant="horizontal" height={30} />
        </Reveal>

        <Reveal delay={100} style={{ marginTop: space.xxl, gap: space.md }}>
          <Illustration height={150} />
          <Heading>{t("signIn.title")}</Heading>
          <Body muted>{t("signIn.body")}</Body>
        </Reveal>

        <View style={{ flex: 1 }} />

        <Reveal delay={200} style={{ gap: space.md }}>
          {error && (
            <Card tone="coral" style={{ padding: space.lg }}>
              <Body small>{t("signIn.error")}</Body>
            </Card>
          )}
          {!config.whopClientId && (
            <Card tone="gold" style={{ padding: space.lg }}>
              <Body small>{t("signIn.notConfigured")}</Body>
            </Card>
          )}
          <Button
            label={t("signIn.button")}
            disabled={!request || !config.whopClientId}
            loading={loading}
            onPress={() => void authorize()}
          />
          <Button label={t("common.back")} variant="ghost" onPress={() => router.back()} />
        </Reveal>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({ content: { flex: 1, padding: space.xl } });
