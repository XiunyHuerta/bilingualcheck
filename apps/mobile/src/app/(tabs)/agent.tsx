import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { ScrollView, View } from "react-native";
import { Avatar, Body, Button, Card, Heading, Screen, StatusPill } from "@/components/ui";
import { LoadState } from "@/components/workspace";
import { useWorkspace } from "@/lib/workspace";
import { useResponsive } from "@/theme/responsive";
import { space } from "@/theme/tokens";

export default function Agent() {
  const { t } = useTranslation();
  const { gutter } = useResponsive();
  const query = useWorkspace();
  return <Screen blobs edges={[]}><ScrollView contentContainerStyle={{ padding: gutter, gap: space.xl }}>
    <Avatar kind="agent" size={48} /><Heading>{t("v2.agentTitle")}</Heading><Body muted>{t("v2.agentSubtitle")}</Body>
    <Button label={t("v2.start")} onPress={() => router.push("/new")} />
    <Heading level={2}>{t("v2.chooseProject")}</Heading>
    <LoadState loading={query.isPending} error={query.isError} retry={() => void query.refetch()} />
    {!query.isPending && !query.data?.projects.length ? <Body muted>{t("v2.noProjects")}</Body> : null}
    {query.data?.projects.map(project => {
      const latest = query.data.messages.find(message => message.project_id === project.id);
      return <Card key={project.id} style={{ gap: space.md }}>
        <View style={{ gap: space.sm }}><Heading level={3}>{project.brief?.business.name ?? t("projects.untitled")}</Heading><StatusPill status={project.status} /></View>
        <Body numberOfLines={3}>{latest?.content ?? t(`projects.activity.${project.status}`)}</Body>
        <Button label={t("v2.conversation")} compact onPress={() => router.push({ pathname: "/project/[id]", params: { id: project.id } })} />
        <Button label={t("v2.workspace")} variant="ghost" compact onPress={() => router.push({ pathname: "/project/[id]/workspace", params: { id: project.id } })} />
      </Card>;
    })}
  </ScrollView></Screen>;
}
