import { Tabs } from "expo-router";
import { useTranslation } from "react-i18next";
import { Platform, Text, View } from "react-native";
import { Logo } from "@/components/ui";
import { AccountMenu } from "@/components/account-menu";
import { colors, fonts, space } from "@/theme/tokens";
import { useResponsive } from "@/theme/responsive";

export default function TabsLayout() {
  const { t } = useTranslation();
  const { isDesktop } = useResponsive();
  const desktopWeb = Platform.OS === "web" && isDesktop;
  return <Tabs screenOptions={{
    headerShown: !desktopWeb, headerStyle: { backgroundColor: colors.cream }, headerTitleAlign: "left", headerShadowVisible: false,
    headerTitle: () => <Logo height={23} />,
    headerRight: () => <View style={{ marginRight: space.sm }}><AccountMenu /></View>,
    tabBarActiveTintColor: colors.cobalt, tabBarInactiveTintColor: colors.muted,
    tabBarLabelStyle: { fontFamily: fonts.bodySemi, fontSize: 10 },
    tabBarStyle: desktopWeb ? { display: "none" } : { backgroundColor: colors.sidebar, borderTopColor: colors.border },
    sceneStyle: { backgroundColor: colors.cream },
  }}>
    <Tabs.Screen name="dashboard" options={{ title: t("v2.nav.dashboard"), tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 23 }}>▦</Text> }} />
    <Tabs.Screen name="projects" options={{ title: t("v2.nav.projects"), tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 23 }}>▤</Text> }} />
    <Tabs.Screen name="agent" options={{ title: t("v2.nav.agent"), tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 23 }}>✦</Text> }} />
    <Tabs.Screen name="professionals" options={{ title: t("v2.nav.professionals"), tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 23 }}>◈</Text> }} />
    <Tabs.Screen name="profile" options={{ title: t("v2.nav.profile"), headerRight: () => null, tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 23 }}>◉</Text> }} />
    <Tabs.Screen name="notifications" options={{ href: null, title: t("v2.nav.notifications") }} />
  </Tabs>;
}
