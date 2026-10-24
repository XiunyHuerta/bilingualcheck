import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import type { Submission } from "@/lib/api";
import { space } from "@/theme/tokens";
import { useConceptDemo } from "@/lib/health";
import { Avatar, Body, Button, Card, Eyebrow, Heading } from "./ui";

export function ProfessionalEntry({ projectId, professionals, demo }: { projectId: string; professionals: Submission[]; demo?: boolean }) {
  const { t } = useTranslation();
  const replay = useConceptDemo();
  const active = professionals.filter((p) => !["rejected", "abandoned", "screened_out"].includes(p.status));
  return <Card tone="coral" style={{ gap: space.md }}>
    <Eyebrow>{t("contact.team")}</Eyebrow>
    <Body small>{t("refinements.contactHint")}</Body>
    {(demo || replay) && <Body small muted>{t("review.illustrativeNote")}</Body>}
    {active.length === 0 ? <Body muted small>{t("contact.waiting")}</Body> : active.map((p) =>
      <View key={p.id} style={{ gap: space.sm }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <Avatar kind="human" label={p.participant_summary?.name ?? ""} />
          <View style={{ flex: 1 }}><Heading level={3}>{p.participant_summary?.name ?? t("review.professional")}</Heading></View>
        </View>
        {p.participant_summary?.specialty ? <Body small>{p.participant_summary.specialty}</Body> : null}
        <Button label={t("refinements.askProfessional")} compact variant="secondary" onPress={() => router.push({
          pathname: "/project/[id]/professional/[sid]", params: { id: projectId, sid: p.id, mode: "message" },
        })} />
        <Button label={t("refinements.arrangeMeeting")} compact variant="ghost" onPress={() => router.push({
          pathname: "/project/[id]/professional/[sid]", params: { id: projectId, sid: p.id, mode: "meeting" },
        })} />
      </View>)}
  </Card>;
}
