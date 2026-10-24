import { Tabs } from "expo-router";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";
import { ConceptDemoTag, Glyph, Logo } from "@/components/ui";
import { colors, fonts, space } from "@/theme/tokens";

export default function TabsLayout() {
  const { t } = useTranslation();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.cream },
        headerTitleStyle: { fontFamily: fonts.heading, color: colors.ink },
        headerTitleAlign: "left",
        headerShadowVisible: false,
        tabBarActiveTintColor: colors.cobalt,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontFamily: fonts.bodySemi, fontSize: 12 },
        tabBarStyle: { backgroundColor: colors.sidebar, borderTopColor: colors.border },
        sceneStyle: { backgroundColor: colors.cream },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("projects.title"),
          headerTitle: () => <Logo variant="horizontal" height={26} />,
          headerRight: () => (
            <View style={s.right}>
              <ConceptDemoTag />
            </View>
          ),
          tabBarIcon: ({ color }) => <Glyph name="projects" color={color} />,
        }}
      />
      <Tabs.Screen name="profile" options={{ title: t("profile.title"), tabBarIcon: ({ color }) => <Glyph name="profile" color={color} /> }} />
    </Tabs>
  );
}

const s = StyleSheet.create({ right: { marginRight: space.lg } });
