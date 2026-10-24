import { languageName, taskProgress, type ActivityEvent, type ProjectTask } from "@bc/shared";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Avatar, Body, Button, Card, Eyebrow, Heading, Pill, StatusPill } from "./ui";
import type { Project } from "@/lib/api";
import type { TeamMember } from "@/lib/workspace";
import { useResponsive } from "@/theme/responsive";
import { colors, fonts, radius, space } from "@/theme/tokens";

export function LoadState({ loading, error, retry }: { loading: boolean; error: boolean; retry: () => void }) {
  const { t } = useTranslation();
  if (loading) return <Card style={s.skeleton}><ActivityIndicator color={colors.cobalt} /><View style={s.skeletonLine} /><View style={[s.skeletonLine, { width: "65%" }]} /></Card>;
  if (error) return <Card tone="coral" style={s.stack}><Body>{t("common.loadError")}</Body><Button label={t("common.retry")} variant="secondary" onPress={retry} /></Card>;
  return null;
}

export function TaskProgress({ tasks }: { tasks: Pick<ProjectTask, "status">[] }) {
  const { t } = useTranslation();
  const progress = taskProgress(tasks);
  return <View style={s.stack}>
    <View style={s.between}><Body small muted>{t("v2.progress", progress)}</Body><Text style={s.percent}>{progress.percent}%</Text></View>
    <View style={s.track} accessibilityRole="progressbar" accessibilityLabel={t("v2.tasks")}
      accessibilityValue={{ min: 0, max: progress.total || 1, now: progress.completed, text: t("v2.progress", progress) }}>
      <View style={[s.fill, { width: `${progress.percent}%` }]} />
    </View>
  </View>;
}

export function ProjectSummary({ project, tasks = [], team = [] }: { project: Project; tasks?: ProjectTask[]; team?: TeamMember[] }) {
  const { t, i18n } = useTranslation();
  const { isDesktop } = useResponsive();
  const brief = project.brief;
  const open = () => router.push({ pathname: "/project/[id]/workspace", params: { id: project.id } });
  return <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={t("projects.openNamed", { name: brief?.business.name ?? t("projects.untitled") })}>
    <Card style={s.stack}>
      <View style={[s.stack, isDesktop && s.summaryRow]}>
        <View style={[s.stack, isDesktop && s.flex]}>
          <View style={s.row}><Avatar kind="owner" label={brief?.business.name} size={42} /><View style={s.flex}>
            <Heading level={3}>{brief?.business.name ?? t("projects.untitled")}</Heading>
            <Body small muted>{languageName(project.source_language, i18n.language)} → {project.target_language ? languageName(project.target_language, i18n.language) : "…"}</Body>
          </View></View>
          <Eyebrow>{t(`projects.workType.${brief?.deliverable_type ?? "draft"}`)}</Eyebrow>
          <Body numberOfLines={2}>{brief?.goal ?? t("projects.noBrief")}</Body>
          {brief ? <Body small muted>{t("v2.market")}: {[brief.target_market.city, brief.target_market.region, brief.target_market.country].filter(Boolean).join(", ")}</Body> : null}
          <Body small muted>{t("v2.owner")}: {team.map(member => member.participant_summary?.name).filter(Boolean).join(", ") || t("v2.unassigned")}</Body>
        </View>
        <View style={[s.projectStatus, isDesktop && { width: 280 }]}>
          <StatusPill status={project.status} />
          <Body small>{t(`projects.activity.${project.status}`)}</Body>
          {tasks.length ? <TaskProgress tasks={tasks} /> : <Body small muted>{t("v2.noTasks")}</Body>}
        </View>
      </View>
      <Text style={s.open}>{t("projects.open")} →</Text>
    </Card>
  </Pressable>;
}

export function ActivityFeed({ events, projects = [] }: { events: ActivityEvent[]; projects?: Project[] }) {
  const { t, i18n } = useTranslation();
  if (!events.length) return <Body small muted>{t("v2.noActivity")}</Body>;
  return <View style={s.stack}>{events.map(event => <View key={event.id} style={s.event}>
    <View style={[s.actor, { backgroundColor: event.actor === "professional" ? colors.coralSoft : event.actor === "owner" ? colors.goldSoft : colors.skySoft }]}>
      <Text style={s.actorText}>{({ owner: "●", agent: "✦", professional: "◈", system: "↻" })[event.actor]}</Text>
    </View>
    <View style={s.flex}>
      <Body small>{event.action === "feedback_translated" ? t("v2.feedbackTranslated") : t(`v2.actions.${event.action}`, { defaultValue: event.action })}</Body>
      <Body small muted>{[projects.find(project => project.id === event.project_id)?.brief?.business.name,
        t(`v2.actors.${event.actor}`), new Date(event.created_at).toLocaleString(i18n.language, { dateStyle: "short", timeStyle: "short" })].filter(Boolean).join(" · ")}</Body>
      {event.previous_status && event.new_status && event.previous_status !== event.new_status ? <Body small muted>
        {t(`${event.action === "task_status" ? "v2.taskState" : "status"}.${event.previous_status}`, { defaultValue: event.previous_status })} → {t(`${event.action === "task_status" ? "v2.taskState" : "status"}.${event.new_status}`, { defaultValue: event.new_status })}
      </Body> : null}
      {event.detail ? <Body small muted numberOfLines={3}>{event.detail}</Body> : null}
    </View>
  </View>)}</View>;
}

export function TeamCard({ member, onTasks }: { member: TeamMember; onTasks: () => void }) {
  const { t } = useTranslation();
  const contact = (mode: "message" | "meeting") => router.push({ pathname: "/project/[id]/professional/[sid]", params: { id: member.project_id!, sid: member.id, mode } });
  return <Card style={s.stack}>
    <View style={s.row}><Avatar kind="human" label={member.participant_summary?.name ?? ""} size={44} />
      <View style={s.flex}><Heading level={3}>{member.participant_summary?.name ?? t("review.professional")}</Heading><Body small muted>{t("v2.verifiedSource")}</Body></View>
    </View>
    <Body small>{member.participant_summary?.specialty ? `${t("refinements.specialty")}: ${member.participant_summary.specialty}` : t("refinements.specialtyPending")}</Body>
    {(member.participant_summary?.experience ?? []).map((item, index) => <Body small key={`${index}-${item}`}>{item}</Body>)}
    <Pill label={member.client_decision === "approved" ? t("v2.taskState.completed") : t(["in_progress", "awaiting_review"].includes(member.status) ? "v2.taskState.in_progress" : "v2.team")} tone="sky" />
    {member.project_id ? <>
      <Button label={t("refinements.askProfessional")} compact onPress={() => contact("message")} />
      <Button label={t("refinements.arrangeMeeting")} compact variant="secondary" onPress={() => contact("meeting")} />
      <Body small muted>{t("refinements.contactHint")}</Body>
    </> : null}
    <Button label={t("v2.assignedTasks")} compact variant="ghost" onPress={onTasks} />
  </Card>;
}

const s = StyleSheet.create({
  stack: { gap: space.md }, row: { flexDirection: "row", alignItems: "center", gap: space.md },
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md },
  flex: { flex: 1, minWidth: 0 }, summaryRow: { flexDirection: "row", alignItems: "flex-start", gap: space.xxl },
  projectStatus: { gap: space.md, padding: space.lg, backgroundColor: colors.paper, borderRadius: radius.field },
  open: { alignSelf: "flex-end", fontFamily: fonts.bodySemi, color: colors.cobalt, fontSize: 14 },
  track: { height: 6, backgroundColor: colors.border, borderRadius: 5, overflow: "hidden" },
  fill: { height: 6, backgroundColor: colors.sage, borderRadius: 5 }, percent: { fontFamily: fonts.bodyBold, color: colors.cobalt, fontSize: 13 },
  event: { flexDirection: "row", gap: space.md, paddingVertical: space.sm },
  actor: { width: 32, height: 32, borderRadius: 11, alignItems: "center", justifyContent: "center" }, actorText: { color: colors.cobalt, fontSize: 17 },
  skeleton: { gap: space.lg, paddingVertical: space.xl }, skeletonLine: { height: 14, borderRadius: 7, backgroundColor: colors.graySoft, width: "90%" },
});
