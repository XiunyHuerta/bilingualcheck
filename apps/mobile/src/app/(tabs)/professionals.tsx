import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { ScrollView, View } from "react-native";
import { Avatar, Body, Button, Card, Heading, Pill, Screen, StatusPill } from "@/components/ui";
import { LoadState, TeamCard } from "@/components/workspace";
import { useWorkspace } from "@/lib/workspace";
import { useResponsive } from "@/theme/responsive";
import { space } from "@/theme/tokens";

export default function Professionals() {
  const { t } = useTranslation();
  const { gutter } = useResponsive();
  const query = useWorkspace();
  return <Screen blobs edges={[]}><ScrollView contentContainerStyle={{ padding: gutter, gap: space.xl }}>
    <Heading>{t("v2.team")}</Heading><Body muted>{t("refinements.contactHint")}</Body>
    <LoadState loading={query.isPending} error={query.isError} retry={() => void query.refetch()} />
    {query.data && !query.data.projects.length ? <Card style={{ gap: space.md }}>
      <Body muted>{t("v2.noProjects")}</Body>
      <Button label={t("refinements.newProject")} onPress={() => router.push("/new")} />
    </Card> : null}
    {query.data?.projects.map(project => {
      const people = query.data.professionals.filter(member => member.project_id === project.id);
      return <View key={project.id} style={{ gap: space.md }}>
        <View style={{ gap: space.sm }}><Heading level={2}>{project.brief?.business.name ?? t("projects.untitled")}</Heading><StatusPill status={project.status} /></View>
        {people.length ? people.map(member => <TeamCard key={member.id} member={member}
          onTasks={() => router.push({ pathname: "/project/[id]/workspace", params: { id: project.id, section: "tasks", member: member.id } })} />) :
          <Card style={{ gap: space.md }}><Pill tone="neutral" label={t("menuTeam.waitingTeam")} /><Body small muted>{t("menuTeam.waitingContact")}</Body>
            <Body small>{t(`projects.activity.${project.status}`)}</Body>
            <Button label={t("v2.conversation")} compact variant="secondary" onPress={() => router.push({ pathname: "/project/[id]", params: { id: project.id } })} />
          </Card>}
      </View>;
    })}
    <Card tone="sky" style={{ gap: space.md }}><View style={{ flexDirection: "row", gap: space.md, alignItems: "center" }}><Avatar kind="agent" size={36} /><View><Heading level={3}>BilingualCheck</Heading><Body small>{t("v2.coordinator")}</Body></View></View></Card>
  </ScrollView></Screen>;
}
