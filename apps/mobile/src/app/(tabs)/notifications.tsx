import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, FlatList, RefreshControl, View } from "react-native";
import { Body, Button, Card, Eyebrow, Heading, Screen } from "@/components/ui";
import { post } from "@/lib/api";
import { type ClientNotice, useNotifications } from "@/lib/notifications";
import { approvalStatuses, useWorkspace } from "@/lib/workspace";
import { useResponsive } from "@/theme/responsive";
import { colors, space } from "@/theme/tokens";
import { ActivityFeed } from "@/components/workspace";

export default function Notifications() {
  const { t, i18n } = useTranslation();
  const { gutter } = useResponsive();
  const queryClient = useQueryClient();
  const notices = useNotifications();
  const workspace = useWorkspace();
  const pending = workspace.data?.projects.filter(project => approvalStatuses.has(project.status) && !(project.status === "brief_ready" && project.brief_confirmed)) ?? [];
  const reminders = workspace.data?.tasks.filter(task => task.status === "blocked" || (task.due_at && task.status !== "completed" && new Date(task.due_at).getTime() <= workspace.dataUpdatedAt + 86400000)) ?? [];
  const read = useMutation({
    mutationFn: (item: ClientNotice) => post(`/v1/notifications/${item.id}/read`, { version: item.version }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["notifications"] }); },
  });
  return <Screen edges={[]}>
    <FlatList data={notices.data?.notifications ?? []} keyExtractor={(item) => item.id}
      contentContainerStyle={{ padding: gutter, gap: space.lg }}
      refreshControl={<RefreshControl refreshing={notices.isRefetching} onRefresh={() => void notices.refetch()} />}
      ListHeaderComponent={<View style={{ gap: space.sm }}><Heading>{t("contact.notifications")}</Heading>
        <Body muted>{t("contact.notificationsHint")}</Body>
        {pending.map(project => <Card key={project.id} tone="gold" style={{ gap: space.md }}>
          <Eyebrow>{t("v2.actionRequired")}</Eyebrow><Heading level={3}>{project.brief?.business.name ?? t("projects.untitled")}</Heading>
          <Body small>{t(`projects.activity.${project.status}`)}</Body>
          <Button label={t("projects.open")} compact onPress={() => router.push({ pathname: "/project/[id]/workspace", params: { id: project.id, section: project.status === "in_review" ? "deliverables" : "overview" } })} />
        </Card>)}
        {reminders.map(task => <Card key={task.id} tone="coral" style={{ gap: space.md }}>
          <Eyebrow>{t(task.status === "blocked" ? "v2.taskState.blocked" : "v2.deadline")}</Eyebrow><Body>{task.title}</Body>
          {task.due_at ? <Body small>{new Date(task.due_at).toLocaleDateString(i18n.language)}</Body> : null}
          <Button label={t("v2.tasks")} compact onPress={() => router.push({ pathname: "/project/[id]/workspace", params: { id: task.project_id, section: "tasks" } })} />
        </Card>)}
        {workspace.data?.activity.length ? <Card style={{ gap: space.md }}><Heading level={3}>{t("v2.recent")}</Heading>
          <ActivityFeed events={workspace.data.activity.slice(0, 6)} projects={workspace.data.projects} />
        </Card> : null}
        {workspace.isError ? <Body small>{t("common.loadError")}</Body> : null}
        {read.isError && <Body>{t("contact.error")}</Body>}</View>}
      ListEmptyComponent={notices.isPending ? <ActivityIndicator color={colors.cobalt} /> : notices.isError ?
        <Card><Body>{t("common.loadError")}</Body><Button label={t("common.retry")} onPress={() => void notices.refetch()} /></Card> :
        <Card><Body>{t("contact.noNotifications")}</Body></Card>}
      renderItem={({ item }) => <Card tone="coral" style={{ gap: space.md }}>
        <Eyebrow>{item.project_name ?? t("projects.untitled")}</Eyebrow>
        <Heading level={3}>{item.professional?.name ?? t("review.professional")}</Heading>
        <Body small>{t(item.kind === "meeting" ? "contact.meetingNotice" : "contact.messageNotice")}</Body>
        <Body>{item.message}</Body>
        {item.kind === "meeting" && <Body>{t(`contact.states.${item.status}`)} · {new Date(item.starts_at!).toLocaleString(i18n.language, { timeZoneName: "short" })}</Body>}
        <Button label={t("contact.openProfile")} onPress={() => router.push({ pathname: "/project/[id]/professional/[sid]",
          params: { id: item.project_id, sid: item.submission_id } })} />
        <Button label={t("contact.markRead")} variant="ghost" compact disabled={read.isPending} onPress={() => read.mutate(item)} />
      </Card>}
    />
  </Screen>;
}
