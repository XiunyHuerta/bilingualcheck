import { router } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, View } from "react-native";
import { Body, Button, Chip, Field, Heading, Screen } from "@/components/ui";
import { LoadState, ProjectSummary } from "@/components/workspace";
import { closedStatuses, useWorkspace } from "@/lib/workspace";
import { useResponsive } from "@/theme/responsive";
import { space } from "@/theme/tokens";

export default function Projects() {
  const { t } = useTranslation();
  const { gutter } = useResponsive();
  const query = useWorkspace();
  const [search, setSearch] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);
  const projects = (query.data?.projects ?? []).filter(project => (!activeOnly || !closedStatuses.has(project.status)) &&
    `${project.brief?.business.name ?? ""} ${project.brief?.goal ?? ""}`.toLowerCase().includes(search.toLowerCase()));
  return <Screen edges={[]} blobs><ScrollView contentContainerStyle={{ padding: gutter, gap: space.lg }}>
    <Heading>{t("v2.nav.projects")}</Heading><Body muted>{t("projects.subtitle")}</Body>
    <Button label={t("v2.start")} onPress={() => router.push("/new")} />
    <Field accessibilityLabel={t("v2.nav.projects")} placeholder={t("v2.nav.projects")} value={search} onChangeText={setSearch} />
    <View style={{ flexDirection: "row", gap: space.sm }}><Chip label={t("v2.nav.projects")} selected={!activeOnly} onPress={() => setActiveOnly(false)} /><Chip label={t("v2.active")} selected={activeOnly} onPress={() => setActiveOnly(true)} /></View>
    <LoadState loading={query.isPending} error={query.isError} retry={() => void query.refetch()} />
    {!query.isPending && !query.isError && !projects.length ? <Body muted>{t(query.data?.projects.length ? "newProject.empty" : "v2.noProjects")}</Body> : null}
    {projects.map(project => <ProjectSummary key={project.id} project={project}
      tasks={query.data?.tasks.filter(task => task.project_id === project.id)} team={query.data?.professionals.filter(member => member.project_id === project.id)} />)}
  </ScrollView></Screen>;
}
