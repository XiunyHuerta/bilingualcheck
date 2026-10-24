import "@/lib/i18n";
import { Inter_400Regular, Inter_500Medium } from "@expo-google-fonts/inter";
import { Manrope_700Bold } from "@expo-google-fonts/manrope";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { useSession } from "@/lib/session";
import { colors, fonts } from "@/theme/tokens";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 5_000 } } });

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Manrope_700Bold, Inter_400Regular, Inter_500Medium });
  const { token, ready, load } = useSession();

  useEffect(() => {
    void load();
  }, [load]);

  if (!fontsLoaded || !ready) return null;
  const signedIn = Boolean(token);

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.cream },
          headerTitleStyle: { fontFamily: fonts.heading, color: colors.blueDeep },
          headerTintColor: colors.blueDeep,
          contentStyle: { backgroundColor: colors.cream },
          headerShadowVisible: false,
        }}
      >
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="new" options={{ presentation: "modal" }} />
          <Stack.Screen name="project/[id]" />
          <Stack.Screen name="checkout/return" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
      </Stack>
    </QueryClientProvider>
  );
}
