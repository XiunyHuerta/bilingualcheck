import { Tabs } from "expo-router";
import { useTranslation } from "react-i18next";
import { colors, fonts } from "@/theme/tokens";

export default function TabsLayout() {
  const { t } = useTranslation();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.cream },
        headerTitleStyle: { fontFamily: fonts.heading, color: colors.blueDeep },
        headerShadowVisible: false,
        tabBarActiveTintColor: colors.blueDeep,
        tabBarStyle: { backgroundColor: colors.cream, borderTopColor: colors.border },
        sceneStyle: { backgroundColor: colors.cream },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t("projects.title") }} />
      <Tabs.Screen name="profile" options={{ title: t("profile.title") }} />
    </Tabs>
  );
}
