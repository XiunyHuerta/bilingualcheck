import { useQuery } from "@tanstack/react-query";
import { Link, usePathname } from "expo-router";
import { useTranslation } from "react-i18next";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { api, type User } from "@/lib/api";
import { useSession } from "@/lib/session";
import { colors, fonts, radius, space } from "@/theme/tokens";
import { Avatar, Body, ConceptDemoTag, Logo } from "./ui";
import { AccountMenu } from "./account-menu";

const NAV = [
  { path: "/dashboard", key: "dashboard", icon: "▦" }, { path: "/projects", key: "projects", icon: "▤" },
  { path: "/agent", key: "agent", icon: "✦" }, { path: "/professionals", key: "professionals", icon: "◈" },
  { path: "/profile", key: "profile", icon: "◉" },
] as const;
export function DesktopHeader() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const token = useSession(state => state.token);
  const me = useQuery({ queryKey: ["me", token], queryFn: () => api<{ user: User }>("/v1/me") });
  const name = me.data?.user.business_name ?? me.data?.user.name ?? t("v2.business");
  return <View style={s.sidebar}>
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm }}><Link href="/" accessibilityLabel="BilingualCheck"><Logo height={23} /></Link><AccountMenu /></View>
    <View style={s.business}><Avatar kind="owner" label={name} size={32} /><View style={{ flex: 1 }}><Body small numberOfLines={2}>{name}</Body></View></View>
    <ScrollView contentContainerStyle={s.nav}>
      <View role="navigation" style={s.nav}>{NAV.map(item => <Link key={item.key} href={item.path} style={[s.link, pathname === item.path && s.active]}>
        <Text style={s.icon}>{item.icon}  </Text>{t(`v2.nav.${item.key}`)}
      </Link>)}</View>
    </ScrollView>
    <Link href="/new" style={s.create}>{t("v2.start")} +</Link>
    <ConceptDemoTag />
    <Link href="/demo" style={s.demo}>{t("v2.viewDemo")} ↗</Link>
    <Text style={s.tagline}>{t("tagline")}</Text>
  </View>;
}
const s = StyleSheet.create({
  sidebar: { width: 230, backgroundColor: colors.sidebar, borderRightWidth: 1, borderRightColor: colors.border, padding: space.xl, gap: space.xl },
  business: { flexDirection: "row", alignItems: "center", gap: space.sm, borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: space.lg },
  nav: { gap: space.sm }, link: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.muted, paddingVertical: 13, paddingHorizontal: space.md, borderRadius: radius.chip },
  active: { backgroundColor: colors.skySoft, color: colors.cobalt }, icon: { fontSize: 16 },
  create: { backgroundColor: colors.cobalt, color: colors.white, padding: space.md, fontFamily: fonts.headingBold, fontSize: 14, borderRadius: radius.button, textAlign: "center" },
  demo: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.cobalt }, tagline: { fontFamily: fonts.italic, fontSize: 12, lineHeight: 18, color: colors.muted },
});
