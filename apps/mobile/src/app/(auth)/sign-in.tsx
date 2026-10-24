import * as AuthSession from "expo-auth-session";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Body, Button, Heading } from "@/components/ui";
import { post, type User } from "@/lib/api";
import { config } from "@/lib/config";
import { useSession } from "@/lib/session";
import { colors, space } from "@/theme/tokens";

WebBrowser.maybeCompleteAuthSession();

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
  const nonce = useMemo(() => Crypto.randomUUID(), []);
  const redirectUri = AuthSession.makeRedirectUri({ scheme: "bilingualcheck", path: "auth/callback" });

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: config.whopClientId,
      redirectUri,
      scopes: ["openid", "profile", "email"],
      usePKCE: true,
      extraParams: { nonce },
    },
    discovery,
  );

  useEffect(() => {
    if (response?.type !== "success" || !request?.codeVerifier) {
      if (response && response.type !== "success") setLoading(false);
      if (response?.type === "error") setError(true);
      return;
    }
    post<{ session_jwt: string; user: User }>("/v1/auth/whop", {
      code: response.params.code,
      code_verifier: request.codeVerifier,
      redirect_uri: redirectUri,
    })
      .then((r) => signIn(r.session_jwt))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [response, request, redirectUri, signIn]);

  return (
    <SafeAreaView style={s.screen}>
      <Heading>{t("signIn.title")}</Heading>
      <View style={{ height: space.md }} />
      <Body muted>{t("tagline")}</Body>
      <View style={{ flex: 1 }} />
      {error && <Body>{t("signIn.error")}</Body>}
      <Button
        label={t("signIn.button")}
        disabled={!request || !config.whopClientId}
        loading={loading}
        onPress={() => {
          setError(false);
          setLoading(true);
          void promptAsync();
        }}
        style={{ marginTop: space.md }}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({ screen: { flex: 1, padding: space.xl, backgroundColor: colors.cream } });
