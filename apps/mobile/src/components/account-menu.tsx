import { isRTLUILanguage, languageName } from "@bc/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState, type ComponentRef } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { post } from "@/lib/api";
import { useSession } from "@/lib/session";
import { colors, fonts, radius, shadow, space } from "@/theme/tokens";
import { Body, Logo } from "./ui";
import { LanguagePicker } from "./language-picker";

/** Settings menu shared by desktop and mobile. */
export function AccountMenu({ initialOpen = false }: { initialOpen?: boolean }) {
  const { t, i18n } = useTranslation();
  const { menu } = useLocalSearchParams<{ menu?: string }>();
  const token = useSession(state => state.token);
  const signOut = useSession(state => state.signOut);
  const client = useQueryClient();
  const { width, height } = useWindowDimensions();
  const [expanded, setOpen] = useState(initialOpen);
  const open = expanded || menu === "1";
  const [languages, setLanguages] = useState(false);
  const [position, setPosition] = useState({ x: 16, y: 64 });
  const trigger = useRef<ComponentRef<typeof View>>(null);
  const focus = useRef<ComponentRef<typeof Pressable>>(null);
  const close = () => {
    setOpen(false); setLanguages(false);
    if (menu === "1") router.setParams({ menu: undefined });
    if (Platform.OS === "web") (focus.current as unknown as { focus?: () => void })?.focus?.();
  };
  const show = () => {
    trigger.current?.measureInWindow((x, y, _width, triggerHeight) => setPosition({ x, y: y + triggerHeight + 8 }));
    setLanguages(false); setOpen(true);
  };
  useEffect(() => {
    if (!open || Platform.OS !== "web") return;
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); setLanguages(false); } };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [open]);
  const logout = useMutation({ mutationFn: async () => {
    await post("/v1/auth/logout").catch(() => undefined);
    await client.cancelQueries(); await signOut(); client.clear();
    setOpen(false);
    if (Platform.OS === "web") window.location.assign("/welcome");
    else router.replace("/welcome");
  } });
  const panelWidth = Math.min(352, width - 24);
  const left = Math.min(Math.max(12, position.x - panelWidth + 46), width - panelWidth - 12);
  const top = Math.max(12, Math.min(position.y, height - (languages ? 492 : 255) - 12));
  return <>
    <View ref={trigger} collapsable={false}><Pressable ref={focus} accessibilityRole="button" accessibilityLabel={t("v2.nav.settings")}
      accessibilityState={{ expanded: open }} onPress={show} style={({ pressed }) => [s.trigger, pressed && { backgroundColor: colors.skySoft }]}>
      <View style={s.gear} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {Array.from({ length: 8 }, (_, index) => <View key={index} style={[s.tooth, { transform: [{ rotate: `${index * 45}deg` }, { translateY: -9 }] }]} />)}
        <View style={s.gearRing}><View style={s.gearCenter} /></View>
      </View>
    </Pressable></View>
    <Modal transparent visible={open} animationType="none" onRequestClose={close}>
      <View style={s.overlay}><Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel={t("menuTeam.close")} accessibilityRole="button" />
        <View accessibilityViewIsModal style={[s.panel, { width: panelWidth, maxHeight: height - 24, left, top, direction: isRTLUILanguage(i18n.language) ? "rtl" : "ltr" }]}>
          <View style={s.heading}><Logo height={20} /><Pressable accessibilityRole="button" accessibilityLabel={t("menuTeam.close")} onPress={close} style={s.close}><Text style={s.closeText}>×</Text></Pressable></View>
          {languages ? <>
            <Pressable accessibilityRole="button" onPress={() => setLanguages(false)} style={s.item}><Text style={s.itemText}>‹ {t("menuTeam.back")}</Text></Pressable>
            <LanguagePicker onSaved={close} />
          </> : <>
            <Pressable accessibilityRole="button" onPress={() => setLanguages(true)} style={s.item}>
              <Text style={s.languageIcon}>文 A</Text><View style={{ flex: 1 }}><Text style={s.itemText}>{t("menuTeam.languages")}</Text><Body small muted>{languageName(i18n.language, i18n.language)}</Body></View><Text style={s.chevron}>›</Text>
            </Pressable>
            {token ? <Pressable accessibilityRole="button" onPress={() => { close(); router.push("/notifications"); }} style={s.item}><Text style={s.itemText}>{t("menuTeam.notifications")}</Text><Text style={s.chevron}>›</Text></Pressable> : null}
            <View style={s.divider} />
            {token ? <Pressable accessibilityRole="button" disabled={logout.isPending} accessibilityState={{ busy: logout.isPending }} onPress={() => logout.mutate()} style={s.item}>
              <Text style={[s.itemText, { color: "#9C4A41" }]}>{t("profile.signOut")}</Text><Text style={s.chevron}>↪</Text>
            </Pressable> : <Pressable accessibilityRole="button" onPress={() => { close(); router.push("/sign-in"); }} style={s.item}><Text style={s.itemText}>{t("signIn.title").replaceAll("**", "")}</Text><Text style={s.chevron}>›</Text></Pressable>}
            {logout.isError ? <Body small>{t("common.loadError")}</Body> : null}
          </>}
        </View>
      </View>
    </Modal>
  </>;
}
const s = StyleSheet.create({ trigger: { width: 44, height: 44, borderRadius: radius.field, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, alignItems: "center", justifyContent: "center" },
  gear: { width: 24, height: 24, alignItems: "center", justifyContent: "center" },
  tooth: { position: "absolute", width: 5, height: 7, borderRadius: 1, backgroundColor: colors.cobalt },
  gearRing: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.cobalt, alignItems: "center", justifyContent: "center" },
  gearCenter: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.white },
  overlay: { flex: 1, backgroundColor: "rgba(32,40,53,0.08)" },
  panel: { position: "absolute", padding: space.lg, backgroundColor: colors.white, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, boxShadow: shadow.window, gap: space.sm },
  heading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: space.sm }, close: { width: 36, height: 36, alignItems: "center", justifyContent: "center" }, closeText: { fontSize: 24, color: colors.muted },
  item: { minHeight: 48, flexDirection: "row", gap: space.md, alignItems: "center", justifyContent: "space-between", paddingVertical: space.sm }, itemText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.ink },
  languageIcon: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.cobalt, padding: 9, borderRadius: 10, backgroundColor: colors.skySoft }, chevron: { fontSize: 21, color: colors.muted }, divider: { height: 1, backgroundColor: colors.border },
});
