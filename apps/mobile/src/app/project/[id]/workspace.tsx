import { languageName } from "@bc/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, StyleSheet, View } from "react-native";
import { StepTimeline } from "@/components/stepper";
import { TaskBoard } from "@/components/task-board";
import { Avatar, Body, Button, Card, Chip, Eyebrow, Heading, Pill, Screen, StatusPill } from "@/components/ui";
import { ActivityFeed, LoadState, TaskProgress, TeamCard } from "@/components/workspace";
import { post } from "@/lib/api";
import { closedStatuses, useProjectWorkspace } from "@/lib/workspace";
import { useResponsive } from "@/theme/responsive";
import { space } from "@/theme/tokens";

const SECTIONS = ["overview", "tasks", "team", "deliverables", "activity"] as const;
export default function Workspace() {
  const { id, section: initial, member } = useLocalSearchParams<{ id: string; section?: string; member?: string }>();
  const [section, setSection] = useState<string>(SECTIONS.includes(initial as typeof SECTIONS[number]) ? initial! : "overview");
  const [memberFilter, setMemberFilter] = useState(member ?? "");
  const { t, i18n } = useTranslation();
  const { gutter, isDesktop } = useResponsive();
  const query = useProjectWorkspace(id);
  const queryClient = useQueryClient();
  const confirm = useMutation({ mutationFn: () => post(`/v1/projects/${id}/brief/confirm`), onSuccess: () => {
    void queryClient.invalidateQueries({ queryKey: ["workspace-project", id] });
    void queryClient.invalidateQueries({ queryKey: ["workspace"] });
  } });
  const data = query.data;
  const project = data?.project;
  const brief = project?.brief;
  const talk = () => router.push({ pathname: "/project/[id]", params: { id } });
  const tasks = data?.tasks ?? [];
  return <Screen blobs edges={["bottom"]}>
    <Stack.Screen options={{ title: brief?.business.name ?? t("v2.workspace") }} />
    <ScrollView contentContainerStyle={[s.page, { padding: gutter }]}>
      <LoadState loading={query.isPending} error={query.isError} retry={() => void query.refetch()} />
      {data && project ? <>
        <View style={s.row}><View style={s.flex}><Eyebrow>{t("v2.workspace")}</Eyebrow><Heading>{brief?.business.name ?? t("projects.untitled")}</Heading></View><StatusPill status={project.status} /></View>
        {data.matching.mode === "replay" || data.payment?.is_demo ? <Pill tone="gold" label={t("v2.demoData")} /> : null}
        <View style={s.row}><Button label={t("v2.conversation")} compact onPress={talk} />
          <Button label={t("chat.timeline")} compact variant="secondary" onPress={() => router.push({ pathname: "/project/[id]/timeline", params: { id } })} /></View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
          {SECTIONS.map(value => <Chip key={value} selected={section === value} label={t(`v2.${value}`)} onPress={() => setSection(value)} />)}
        </ScrollView>
        {section === "overview" ? <>
          <Card tone="sky" style={s.stack}><Eyebrow>{t("v2.next")}</Eyebrow><Body>{t(`projects.activity.${project.status}`)}</Body><TaskProgress tasks={tasks} /></Card>
          <View style={[s.stack, isDesktop && s.columns]}><View style={[s.stack, isDesktop && s.flex]}>
            <Card style={s.stack}><Heading level={2}>{t("v2.plan")}</Heading><Body>{brief?.goal ?? t("projects.noBrief")}</Body>
              {brief ? <>
                <Body small>{languageName(brief.source_language, i18n.language)} → {languageName(brief.target_language, i18n.language)}</Body>
                <Body small>{t("v2.market")}: {[brief.target_market.city, brief.target_market.region, brief.target_market.country].filter(Boolean).join(", ")}</Body>
                <Body small>{t("v2.audience")}: {brief.audience}</Body>
                <Body small>{t("v2.budget")}: {brief.budget_usd ? new Intl.NumberFormat(i18n.language, { style: "currency", currency: "USD" }).format(brief.budget_usd) : t("v2.noEstimate")}</Body>
                <Body small>{t("v2.deadline")}: {brief.deadline_days ? t("v2.days", { count: brief.deadline_days }) : t("v2.noEstimate")}</Body>
                <Body small muted>{t("v2.estimateNote")}</Body>
                <Eyebrow>{t("v2.deliverables")}</Eyebrow>{brief.deliverables.map((value, index) => <Body small key={`${index}-${value}`}>{index + 1}. {value}</Body>)}
                <Body small>{t("v2.skills")}: {brief.professional_profile}</Body>
                {brief.acceptance_criteria.map((value, index) => <Body small muted key={`${index}-${value}`}>✓ {value}</Body>)}
                <Button label={t("v2.reviewPlan")} variant="secondary" compact onPress={talk} />
                {project.status === "brief_ready" && !project.brief_confirmed ? <Button label={t("v2.approvePlan")} compact loading={confirm.isPending} onPress={() => confirm.mutate()} /> : null}
                {confirm.isError ? <Body small>{t("v2.saveError")}</Body> : null}
                <Body small muted>{t("v2.scopeNote")}</Body>
              </> : <Button label={t("v2.conversation")} onPress={talk} />}
            </Card>
            <Card style={s.stack}><Heading level={3}>{t("v2.matching")}</Heading>
              <Body small>{t(data.matching.requested ? "v2.matchingRunning" : "v2.matchingPending")}</Body>
              {brief ? <><Eyebrow>{t("v2.criteria")}</Eyebrow><Body small>{brief.professional_profile}</Body><Body small>{brief.audience}</Body>
                {brief.cultural_notes.map((note, index) => <Body small key={`${index}-${note}`}>{note}</Body>)}</> : null}
              <Body small muted>{t("v2.matchingNote")}</Body>
            </Card>
          </View><Card style={isDesktop ? { width: 260 } : undefined}><StepTimeline status={project.status} /></Card></View>
        </> : null}
        {section === "tasks" ? <>
          {memberFilter ? <Button label={t("v2.tasks")} variant="ghost" onPress={() => setMemberFilter("")} /> : null}
          <TaskBoard tasks={tasks.filter(task => !memberFilter || task.assigned_submission_id === memberFilter)} team={data.professionals}
            authorized={["in_progress", "in_review", "revision"].includes(project.status)} closed={closedStatuses.has(project.status)} />
        </> : null}
        {section === "team" ? <>
          <Card tone="sky" style={s.stack}><Avatar kind="agent" size={36} /><Heading level={3}>BilingualCheck</Heading><Body>{t("v2.coordinator")}</Body></Card>
          {!data.professionals.length ? <Card><Body muted>{t("v2.noTeam")}</Body></Card> : null}
          {data.professionals.map(person => <TeamCard key={person.id} member={{ ...person, project_id: id }} onTasks={() => { setMemberFilter(person.id); setSection("tasks"); }} />)}
        </> : null}
        {section === "deliverables" ? <>
          {!data.professionals.some(person => person.has_delivery) ? <Card><Body muted>{t("v2.noDeliveries")}</Body></Card> : null}
          {data.professionals.filter(person => person.has_delivery).map(person => <Card key={person.id} style={s.stack}>
            <Heading level={3}>{brief?.business.name ?? t("v2.deliverables")}</Heading>
            <Body>{person.participant_summary?.name ?? t("review.professional")}</Body>
            <Pill label={t("v2.version", { version: person.content_version })} tone="neutral" />
            <Body small>{person.client_decision === "approved" ? t("review.approved") : person.client_decision === "changes_requested" ? t("review.changesSent") : t("v2.taskState.in_review")}</Body>
            <Button label={t("v2.viewDelivery")} onPress={() => router.push({ pathname: "/project/[id]/delivery/[sid]", params: { id, sid: person.id } })} />
          </Card>)}
        </> : null}
        {section === "activity" ? <Card style={s.stack}><Heading level={2}>{t("v2.activity")}</Heading><ActivityFeed events={data.activity} /></Card> : null}
      </> : null}
    </ScrollView>
  </Screen>;
}
const s = StyleSheet.create({ page: { gap: space.xl, paddingBottom: 48 }, stack: { gap: space.lg }, row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.md }, flex: { flex: 1, minWidth: 0 }, columns: { flexDirection: "row", alignItems: "flex-start", gap: space.xl } });
