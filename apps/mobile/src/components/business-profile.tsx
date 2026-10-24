import { BusinessProfile, BusinessLink } from "@bc/shared";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Image, Linking, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { api, type User } from "@/lib/api";
import { useResponsive } from "@/theme/responsive";
import { colors, fonts, radius, space } from "@/theme/tokens";
import { Avatar, Body, Button, Card, Chip, Eyebrow, Field, Heading, Pill } from "./ui";
import { Reveal } from "./motion";

type Draft = { business_name: string; business_profile: BusinessProfile };
const fromUser = (user: User): Draft => ({ business_name: user.business_name ?? "",
  business_profile: BusinessProfile.parse(user.business_profile ?? {}) });

function LabeledField({ label, children }: { label: string; children: ReactNode }) {
  return <View style={s.labeled}><Body small style={s.label}>{label}</Body>{children}</View>;
}

export function BusinessProfileEditor({ user, onSaved }: { user: User; onSaved: (user: User) => void }) {
  const { t } = useTranslation();
  const { isDesktop, isTablet } = useResponsive();
  const [saved, setSaved] = useState(() => fromUser(user));
  const [draft, setDraft] = useState(() => fromUser(user));
  const [media, setMedia] = useState<Record<string, string>>(user.profile_media ?? {});
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<"saved" | "saveError" | "photoError" | "photoSize" | "linkError" | null>(null);
  const [preview, setPreview] = useState(false);
  const p = draft.business_profile;
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const completionFields = [
    { label: t("profile.businessName"), value: draft.business_name },
    ...(["category", "description", "location"] as const).map(key => ({ label: t(`profile.${key}`), value: p[key] })),
  ];
  const complete = completionFields.filter(field => field.value.trim()).length;
  const completion = Math.round(complete / completionFields.length * 100);
  const missing = completionFields.find(field => !field.value.trim());
  const update = <K extends keyof BusinessProfile>(key: K, value: BusinessProfile[K]) => {
    setDraft((d) => ({ ...d, business_profile: { ...d.business_profile, [key]: value } })); setMessage(null);
  };

  async function save() {
    if (!BusinessLink.safeParse(p.website).success) { setMessage("linkError"); return; }
    setBusy(true); setMessage(null);
    try {
      const { user: updated } = await api<{ user: User }>("/v1/me", { method: "PATCH", body: JSON.stringify({
        business_name: draft.business_name.trim() || null, business_profile: p,
      }) });
      const next = fromUser(updated);
      setSaved(next); setDraft(next); setMedia(updated.profile_media ?? {}); setMessage("saved"); onSaved(updated);
    } catch { setMessage("saveError"); }
    finally { setBusy(false); }
  }

  async function pickPhoto(logo: boolean) {
    // Web file pickers require launching directly from a user gesture.
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8,
        allowsEditing: logo, aspect: logo ? [1, 1] : undefined });
      if (result.canceled || !result.assets[0]) return;
      setUploading(true); setMessage(null);
      const blob = await (await fetch(result.assets[0].uri)).blob();
      if (blob.size > 3 * 1024 * 1024) { setMessage("photoSize"); return; }
      const uploaded = await api<{ path: string; url: string }>("/v1/me/photos", {
        method: "POST", headers: { "Content-Type": blob.type || "application/octet-stream" }, body: blob,
      });
      setMedia((m) => ({ ...m, [uploaded.path]: uploaded.url }));
      setDraft((d) => ({ ...d, business_profile: { ...d.business_profile,
        ...(logo ? { logo_path: uploaded.path } : { photo_paths: [...d.business_profile.photo_paths, uploaded.path].slice(0, 3) }),
      } }));
    } catch { setMessage("photoError"); }
    finally { setUploading(false); }
  }

  const textField = (key: "category" | "description" | "audience" | "location" | "website" | "contact" | "hours", max: number, multiline = false) => (
    <LabeledField label={t(`profile.${key}`)}>
      <Field accessibilityLabel={t(`profile.${key}`)} value={p[key]} onChangeText={(v) => update(key, v)}
        placeholder={t(`profile.${key}Placeholder`)} maxLength={max} multiline={multiline} editable={!busy}
        autoCapitalize={key === "website" ? "none" : "sentences"} autoCorrect={key !== "website"}
        keyboardType={key === "website" ? "url" : "default"} style={multiline && s.multiline} textAlignVertical={multiline ? "top" : "center"} />
      {key === "description" ? <Body small muted style={{ textAlign: "right" }}>{`${p.description.length}/600`}</Body> : null}
    </LabeledField>
  );

  return <>
    <Card tone="gold" style={{ gap: space.md, marginBottom: space.xl }}>
      <Heading level={3}>{t("v2.completion", { percent: completion })}</Heading>
      <View style={s.progressTrack}><View style={[s.progressFill, { width: `${completion}%` }]} /></View>
      <Body small muted>{missing ? t("v2.missing", { field: missing.label }) : t("v2.completeProfile")}</Body>
    </Card>
    <View style={[s.workspace, isDesktop && s.columns]}>
      <View style={s.editor}>
        <Reveal><Card style={s.section}>
          <View style={s.sectionHeading}><View style={s.number}><Text style={s.numberText}>01</Text></View><View style={s.flex}>
            <Heading level={3}>{t("profile.identity")}</Heading><Body small muted>{t("profile.identityHint")}</Body>
          </View></View>
          <View style={s.logoRow}>
            {p.logo_path && media[p.logo_path] ? <Image source={{ uri: media[p.logo_path] }} style={s.logo} accessibilityLabel={t("profile.logo")} /> : <Avatar kind="owner" label={draft.business_name} size={72} />}
            <View style={{ flex: 1, gap: space.xs }}>
              {user.uploads_enabled && <Button label={t(p.logo_path ? "profile.changeLogo" : "profile.addLogo")} variant="secondary" compact
                style={{ alignSelf: "flex-start" }} disabled={busy || uploading} onPress={() => { void pickPhoto(true); }} />
              }
              {user.uploads_enabled && <Body small muted>{t("profile.photoHint")}</Body>}
            </View>
            {p.logo_path ? <Button label={t("profile.remove")} compact variant="ghost" disabled={busy || uploading} onPress={() => update("logo_path", null)} /> : null}
          </View>
          <LabeledField label={t("profile.businessName")}><Field accessibilityLabel={t("profile.businessName")} value={draft.business_name}
            onChangeText={(business_name) => { setDraft((d) => ({ ...d, business_name })); setMessage(null); }}
            maxLength={200} placeholder={t("profile.namePlaceholder")} editable={!busy} /></LabeledField>
          {textField("category", 80)}{textField("description", 600, true)}
        </Card></Reveal>
        <Reveal delay={80}><Card style={s.section}>
          <View style={s.sectionHeading}><View style={s.number}><Text style={s.numberText}>02</Text></View><View style={s.flex}>
            <Heading level={3}>{t("profile.details")}</Heading><Body small muted>{t("profile.detailsHint")}</Body>
          </View></View>
          {textField("location", 200)}
          <LabeledField label={t("profile.serviceMode")}><View style={s.chips}>
            {(["local", "remote", "hybrid"] as const).map((mode) => <Chip key={mode} label={t(`profile.mode.${mode}`)}
              selected={p.service_mode === mode} onPress={() => { if (!busy) update("service_mode", p.service_mode === mode ? "" : mode); }} />)}
          </View></LabeledField>
          {textField("website", 2048)}
          <View style={[{ gap: space.lg }, isTablet && s.fieldColumns]}><View style={s.flex}>{textField("contact", 200)}</View><View style={s.flex}>{textField("hours", 200)}</View></View>
          <Body small muted>{t("profile.contactHint")}</Body>
        </Card></Reveal>
        {user.uploads_enabled && <Reveal delay={120}><Card style={s.section}>
          <View style={s.sectionHeading}><View style={s.number}><Text style={s.numberText}>03</Text></View><View style={s.flex}>
            <Heading level={3}>{t("profile.gallery")}</Heading><Body small muted>{t("profile.galleryHint")}</Body>
          </View><Pill label={`${p.photo_paths.length}/3`} tone="neutral" /></View>
          <View style={s.gallery}>
            {p.photo_paths.map((path, index) => <View key={path} style={s.photoWrap}>
              <Image source={{ uri: media[path] }} style={s.photo} accessibilityLabel={t("profile.referencePhoto", { number: index + 1 })} />
              <Button label={t("profile.remove")} compact variant="ghost" disabled={busy || uploading} onPress={() => update("photo_paths", p.photo_paths.filter((v) => v !== path))} />
            </View>)}
            {p.photo_paths.length < 3 ? <Pressable accessibilityRole="button" accessibilityLabel={t("profile.addPhoto")} disabled={busy || uploading}
              style={[s.addPhoto, (busy || uploading) && { opacity: 0.5 }]} onPress={() => { void pickPhoto(false); }}>
              <Text style={s.plus}>+</Text><Body small style={{ color: colors.cobalt }}>{t(uploading ? "profile.uploading" : "profile.addPhoto")}</Body>
            </Pressable> : null}
          </View>
        </Card></Reveal>}
        <Card tone="sky" style={s.section}>
          <View style={s.sharing}><View style={s.flex}><Heading level={3}>{t("profile.shareTitle")}</Heading><Body small muted>{t("profile.shareHint")}</Body></View>
            <Switch accessibilityLabel={t("profile.shareTitle")} value={p.share_with_professionals} disabled={busy}
              onValueChange={(value) => update("share_with_professionals", value)} trackColor={{ false: colors.border, true: colors.cobalt }} thumbColor={colors.white} />
          </View>
          <View style={s.actions}><Button label={t("profile.save")} onPress={() => { void save(); }} loading={busy} disabled={!dirty || uploading} />
            <Button label={t("profile.preview")} onPress={() => setPreview(true)} variant="secondary" />
          </View>
          <View accessibilityLiveRegion="polite">{message ? <Body small style={{ color: message === "saved" ? colors.sage : "#9C4A41" }}>{t(`profile.${message}`)}</Body> :
            <Body small muted>{t(dirty ? "profile.unsaved" : "profile.optional")}</Body>}</View>
        </Card>
      </View>
      {isDesktop ? <View style={s.sidebar}>
        <ProfilePreview draft={draft} media={{ ...user.profile_media, ...media }} />
        <Card tone="gold" style={s.section}><Eyebrow style={{ color: "#7A5A00" }}>{t("profile.goodStart")}</Eyebrow>
          <Heading level={3}>{t("v2.completion", { percent: completion })}</Heading>
          <View style={s.progressTrack}><View style={[s.progressFill, { width: `${completion}%` }]} /></View>
          <Body small muted>{t("profile.progressHint")}</Body>
        </Card>
      </View> : null}
    </View>
    <Modal visible={preview} transparent animationType="fade" onRequestClose={() => setPreview(false)}>
      <View style={s.modalBackdrop}><View style={s.modal} accessibilityViewIsModal>
        <ScrollView contentContainerStyle={{ gap: space.lg, padding: space.lg }}>
          <View style={s.sectionHeading}><View style={s.flex}><Heading level={3}>{t("profile.preview")}</Heading><Body small muted>{t("profile.previewHint")}</Body></View>
            <Button label={t("profile.close")} variant="ghost" compact onPress={() => setPreview(false)} /></View>
          <ProfilePreview draft={draft} media={{ ...user.profile_media, ...media }} />
        </ScrollView>
      </View></View>
    </Modal>
  </>;
}

function ProfilePreview({ draft, media }: { draft: Draft; media: Record<string, string> }) {
  const { t } = useTranslation();
  const p = draft.business_profile;
  const [linkFailed, setLinkFailed] = useState(false);
  const name = draft.business_name.trim() || t("profile.noName");
  return <Card style={s.preview}>
    <View style={s.cover}><View style={s.coverCircle} /><Eyebrow style={s.coverLabel}>{t("profile.previewLabel")}</Eyebrow>
      <Text style={s.coverText}>{t("profile.coverText")}</Text></View>
    <View style={s.previewBody}>
      <View style={s.previewIdentity}><View style={s.avatarFrame}>
        {p.logo_path && media[p.logo_path] ? <Image source={{ uri: media[p.logo_path] }} style={s.logo} accessibilityLabel={t("profile.logo")} /> : <Avatar kind="owner" label={name} size={72} />}
      </View><Pill label={t(p.share_with_professionals ? "profile.shared" : "profile.onlyYou")} tone={p.share_with_professionals ? "sage" : "neutral"} /></View>
      <View style={{ gap: space.xs }}><Heading level={2}>{name}</Heading><Body small style={{ color: colors.cobalt }}>{p.category || t("profile.categoryEmpty")}</Body></View>
      <Body muted={!p.description}>{p.description || t("profile.descriptionEmpty")}</Body>
      <View style={{ gap: space.sm }}>
        {p.location ? <Body small>{`⌖  ${p.location}`}</Body> : null}
        {p.service_mode ? <Body small muted>{t(`profile.mode.${p.service_mode}`)}</Body> : null}
        {p.hours ? <Body small>{p.hours}</Body> : null}{p.contact ? <Body small>{p.contact}</Body> : null}
      </View>
      {p.website && BusinessLink.safeParse(p.website).success ? <Pressable accessibilityRole="link" accessibilityLabel={p.website}
        onPress={() => { setLinkFailed(false); void Linking.openURL(p.website).catch(() => setLinkFailed(true)); }}><Body small style={s.link}>{`${p.website.replace(/^https?:\/\//, "")} ↗`}</Body></Pressable> : null}
      {linkFailed ? <Body small>{t("profile.linkOpenError")}</Body> : null}
      {p.photo_paths.length ? <View style={s.previewGallery}>{p.photo_paths.map((path, index) => <Image key={path} source={{ uri: media[path] }} style={s.previewPhoto}
        accessibilityLabel={t("profile.referencePhoto", { number: index + 1 })} />)}</View> : null}
      <View style={s.previewFooter}><Body small muted>{t("profile.previewFooter")}</Body></View>
    </View>
  </Card>;
}

const s = StyleSheet.create({
  workspace: { gap: space.xl }, columns: { flexDirection: "row", alignItems: "flex-start", gap: space.xxl },
  editor: { flex: 1, minWidth: 0, gap: space.xl }, sidebar: { width: 360, gap: space.xl },
  section: { gap: space.lg }, sectionHeading: { flexDirection: "row", alignItems: "center", gap: space.md },
  flex: { flex: 1, minWidth: 0, gap: space.xs }, number: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.skySoft, justifyContent: "center", alignItems: "center" },
  numberText: { fontFamily: fonts.headingBold, fontSize: 13, color: colors.cobalt },
  labeled: { gap: space.sm }, label: { fontFamily: fonts.bodySemi }, multiline: { minHeight: 110 },
  logoRow: { flexDirection: "row", flexWrap: "wrap", gap: space.lg, alignItems: "center" }, logo: { width: 72, height: 72, borderRadius: 22, resizeMode: "cover" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm }, fieldColumns: { flexDirection: "row", alignItems: "flex-start" },
  gallery: { flexDirection: "row", flexWrap: "wrap", gap: space.md }, photoWrap: { width: 132 }, photo: { width: 132, height: 104, borderRadius: radius.field, backgroundColor: colors.graySoft },
  addPhoto: { minWidth: 132, height: 104, borderRadius: radius.field, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.cobalt, backgroundColor: colors.skySoft, alignItems: "center", justifyContent: "center", gap: space.xs },
  plus: { fontFamily: fonts.body, color: colors.cobalt, fontSize: 28 }, sharing: { flexDirection: "row", alignItems: "center", gap: space.lg },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  preview: { padding: 0, overflow: "hidden" }, cover: { height: 152, backgroundColor: colors.cobalt, padding: space.xl, overflow: "hidden", justifyContent: "space-between" },
  coverCircle: { position: "absolute", width: 170, height: 170, borderRadius: 85, right: -65, top: -55, backgroundColor: colors.sky, opacity: 0.35 },
  coverLabel: { color: colors.white, fontSize: 10, letterSpacing: 1.5 }, coverText: { fontFamily: fonts.heading, fontSize: 24, lineHeight: 30, color: colors.white, maxWidth: 235, paddingBottom: 15 },
  previewBody: { padding: space.xl, paddingTop: 0, gap: space.lg }, previewIdentity: { marginTop: -28, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: space.sm },
  avatarFrame: { padding: 5, backgroundColor: colors.white, borderRadius: 28 }, previewNote: { backgroundColor: colors.skySoft, padding: space.md, borderRadius: radius.field, gap: space.sm },
  link: { color: colors.cobalt, textDecorationLine: "underline" }, previewGallery: { flexDirection: "row", gap: space.sm },
  previewPhoto: { flex: 1, height: 88, borderRadius: 12, backgroundColor: colors.graySoft }, previewFooter: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.md },
  progressTrack: { height: 6, backgroundColor: "rgba(122, 90, 0, 0.12)", borderRadius: 3, overflow: "hidden" }, progressFill: { height: 6, backgroundColor: colors.cobalt, borderRadius: 3 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(32,40,53,0.55)", alignItems: "center", justifyContent: "center", padding: space.lg },
  modal: { width: "100%", maxWidth: 560, maxHeight: "90%", backgroundColor: colors.paper, borderRadius: radius.card, overflow: "hidden" },
});
