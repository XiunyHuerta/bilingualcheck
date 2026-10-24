import i18n, { restoreUILanguage } from "@/lib/i18n";
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_400Regular_Italic } from "@expo-google-fonts/inter/400Regular_Italic";
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { Inter_700Bold } from "@expo-google-fonts/inter/700Bold";
import { Manrope_700Bold } from "@expo-google-fonts/manrope/700Bold";
import { Manrope_800ExtraBold } from "@expo-google-fonts/manrope/800ExtraBold";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Stack, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, Platform, View } from "react-native";
import { isRTLUILanguage } from "@bc/shared";
import { useTranslation } from "react-i18next";
import { DesktopHeader } from "@/components/desktop-header";
import { useSession } from "@/lib/session";
import { useResponsive } from "@/theme/responsive";
import { colors, fonts } from "@/theme/tokens";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 5_000 } } });

export default function RootLayout() {
  const { i18n: currentLocale } = useTranslation();
  const pathname = usePathname();
  const { isDesktop } = useResponsive();
  const desktopWeb = Platform.OS === "web" && isDesktop;
  const [fontsLoaded] = useFonts({
    Manrope_700Bold,
    Manrope_800ExtraBold,
    Inter_400Regular,
    Inter_400Regular_Italic,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const { token, ready, load } = useSession();
  const [localeReady, setLocaleReady] = useState(false);

  useEffect(() => {
    void load();
    void restoreUILanguage().finally(() => setLocaleReady(true));
  }, [load]);
  useEffect(() => {
    if (Platform.OS !== "web") return;
    document.documentElement.lang = currentLocale.language;
    document.documentElement.dir = isRTLUILanguage(currentLocale.language) ? "rtl" : "ltr";
  }, [currentLocale.language]);

  if (!fontsLoaded || !ready || !localeReady) return <View style={{ flex: 1, backgroundColor: colors.cream, alignItems: "center", justifyContent: "center", gap: 12 }}><ActivityIndicator color={colors.cobalt} /><Text>{i18n.t("menuTeam.loading")}</Text></View>;
  const signedIn = Boolean(token);

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="dark" />
      <View style={{ flex: 1, flexDirection: "row", backgroundColor: colors.cream, direction: isRTLUILanguage(currentLocale.language) ? "rtl" : "ltr" }}>
      {signedIn && desktopWeb && !["/", "/welcome", "/demo", "/sign-in"].includes(pathname) && <DesktopHeader />}
      <View style={{ flex: 1, minWidth: 0 }}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.cream },
          headerTitleStyle: { fontFamily: fonts.heading, color: colors.ink },
          headerTintColor: colors.cobalt,
          contentStyle: { backgroundColor: colors.cream },
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="new" options={{ presentation: desktopWeb ? "card" : "modal" }} />
          <Stack.Screen name="project/[id]/index" />
          <Stack.Screen name="project/[id]/timeline" />
          <Stack.Screen name="project/[id]/workspace" />
          <Stack.Screen name="project/[id]/delivery/[sid]" />
          <Stack.Screen name="project/[id]/professional/[sid]" />
          <Stack.Screen name="checkout/return" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
        <Stack.Screen name="demo" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ title: i18n.t("v2.nav.settings") }} />
      </Stack>
      </View>
      </View>
    </QueryClientProvider>
  );
}
