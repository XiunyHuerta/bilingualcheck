import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Reveal } from "@/components/motion";
import { Body, Button, Card, Eyebrow, Heading, Pill, Screen } from "@/components/ui";
import { ActivityFeed, LoadState, ProjectSummary } from "@/components/workspace";
import { api, type User } from "@/lib/api";
import { approvalStatuses, closedStatuses, useWorkspace } from "@/lib/workspace";
import { useSession } from "@/lib/session";
import { useResponsive } from "@/theme/responsive";
import { colors, fonts, radius, space } from "@/theme/tokens";

/** Account workspace; the public home page remains available at /. */
export default function Dashboard() {
  const { t } = useTranslation();
  const { gutter, isDesktop, isTablet } = useResponsive();
  const token = useSession(state => state.token);
  const me = useQuery({ queryKey: ["me", token], queryFn: () => api<{ user: User }>("/v1/me") });
  const query = useWorkspace();
  const projects = query.data?.projects ?? [];
  const active = projects.filter(project => !closedStatuses.has(project.status));
  const pending = projects.filter(project => approvalStatuses.has(project.status) && !(project.status === "brief_ready" && project.brief_confirmed));
  const stats = [
    { key: "active", value: active.length },
    { key: "working", value: query.data?.professionals.filter(member => member.status === "in_progress").length ?? 0 },
    { key: "completed", value: query.data?.tasks.filter(task => task.status === "completed").length ?? 0 },
    { key: "pending", value: pending.length },
  ];
  const briefings = [...new Map([...(query.data?.messages ?? [])].reverse().map(message => [message.project_id, message])).values()].slice(-2).reverse();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "greetingMorning" : hour < 18 ? "greetingAfternoon" : "greetingEvening";
  return <Screen blobs edges={[]}><ScrollView contentContainerStyle={[s.page, { padding: gutter }]}>
    <View style={[s.stack, isDesktop && s.header]}><View style={s.stack}>
      <Eyebrow>{`BILINGUALCHECK · ${t("v2.nav.dashboard")}`}</Eyebrow>
      <Heading>{t(`v2.${greeting}`, { name: me.data?.user.business_name ?? me.data?.user.name ?? t("v2.business") })}</Heading>
      <Body muted>{t("v2.subtitle")}</Body>
    </View><Button label={t("v2.start")} onPress={() => router.push("/new")} /></View>
    <LoadState loading={query.isPending} error={query.isError} retry={() => void query.refetch()} />
    {query.data?.mode === "replay" ? <Pill tone="gold" label={t("v2.demoData")} /> : null}
    <View style={s.stats}>{stats.map(stat => <View key={stat.key} style={{ width: isDesktop ? "23.5%" : isTablet ? "48.5%" : "47.5%" }}><Card style={s.stat}>
      <Body small muted>{t(`v2.${stat.key}`)}</Body><Text style={s.number}>{query.isPending || query.isError ? "—" : stat.value}</Text>
    </Card></View>)}</View>
    <Reveal><Card tone="sky" style={s.briefing}>
      <View style={s.header}><View style={s.stack}><Eyebrow>{`✦ ${t("v2.coordinator")}`}</Eyebrow><Heading level={2}>{t("v2.briefing")}</Heading></View>
        <Button label={t("v2.nav.agent")} compact variant="secondary" onPress={() => router.push("/agent")} /></View>
      {briefings.length ? briefings.map(message => <View key={message.id} style={s.stack}>
        <Body small style={{ fontFamily: fonts.bodyBold }}>{projects.find(project => project.id === message.project_id)?.brief?.business.name ?? t("projects.untitled")}</Body>
        <Body numberOfLines={3}>{message.content}</Body>
      </View>) : <Body>{t("v2.briefingEmpty")}</Body>}
      {pending.length ? <Body small>{t("v2.pending")}: {pending.map(project => project.brief?.business.name ?? t("projects.untitled")).join(" · ")}</Body> : null}
      <Body small muted>{t("v2.briefingHint")}</Body>
    </Card></Reveal>
    <View style={s.header}><Heading level={2}>{t("v2.activeProjects")}</Heading><Button label={t("v2.allProjects")} variant="ghost" compact onPress={() => router.push("/projects")} /></View>
    {!active.length && !query.isPending ? <Card style={s.stack}><Body muted>{t("v2.noProjects")}</Body><Button label={t("v2.start")} onPress={() => router.push("/new")} /></Card> : null}
    {active.slice(0, 5).map(project => <ProjectSummary key={project.id} project={project}
      tasks={query.data?.tasks.filter(task => task.project_id === project.id)} team={query.data?.professionals.filter(member => member.project_id === project.id)} />)}
    <Card style={s.stack}><Heading level={2}>{t("v2.recent")}</Heading><ActivityFeed events={query.data?.activity.slice(0, 8) ?? []} projects={projects} /></Card>
    <View style={s.demoLink}><Body small muted>{t("v2.core")}</Body><Button label={t("v2.viewDemo")} compact variant="ghost" onPress={() => router.push("/demo")} /></View>
  </ScrollView></Screen>;
}

const s = StyleSheet.create({ page: { gap: space.xl, paddingBottom: 48 }, stack: { gap: space.sm },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: space.md },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: space.md, justifyContent: "space-between" },
  stat: { gap: space.md, minHeight: 110, borderRadius: radius.field }, number: { fontFamily: fonts.heading, fontSize: 32, color: colors.cobalt },
  briefing: { gap: space.lg, padding: space.xl }, demoLink: { gap: space.md, alignItems: "center", paddingVertical: space.lg },
});
