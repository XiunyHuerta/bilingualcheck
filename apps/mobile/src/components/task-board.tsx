import { TASK_STATUSES, type ProjectTask } from "@bc/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";
import { api } from "@/lib/api";
import type { TeamMember } from "@/lib/workspace";
import { space } from "@/theme/tokens";
import { Body, Button, Card, Chip, Field, Heading, Pill } from "./ui";

export function TaskBoard({ tasks, team, authorized, closed }: { tasks: ProjectTask[]; team: TeamMember[]; authorized: boolean; closed: boolean }) {
  const { t } = useTranslation();
  if (!tasks.length) return <Card><Body muted>{t("v2.noTasks")}</Body></Card>;
  return <View style={s.stack}>{!authorized && !closed ? <Body small muted>{t("v2.taskAuthorization")}</Body> : null}
    {tasks.map(task => <TaskItem key={task.id} task={task} allTasks={tasks} team={team} authorized={authorized} closed={closed} />)}
  </View>;
}
function TaskItem({ task, allTasks, team, authorized, closed }: { task: ProjectTask; allTasks: ProjectTask[]; team: TeamMember[]; authorized: boolean; closed: boolean }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [comment, setComment] = useState("");
  const [date, setDate] = useState(task.due_at?.slice(0, 10) ?? "");
  const [invalidDate, setInvalidDate] = useState(false);
  const update = useMutation({ mutationFn: (patch: Record<string, unknown>) => api(`/v1/projects/${task.project_id}/tasks/${task.id}`, {
    method: "PATCH", body: JSON.stringify({ version: task.version, ...patch }),
  }), onSuccess: () => {
    setComment("");
    void queryClient.invalidateQueries({ queryKey: ["workspace-project", task.project_id] });
    void queryClient.invalidateQueries({ queryKey: ["workspace"] });
  } });
  const assigned = team.find(member => member.id === task.assigned_submission_id);
  return <Card style={s.stack}>
    <View style={s.row}><View style={s.flex}><Heading level={3}>{task.title}</Heading></View><Pill tone={task.status === "completed" ? "sage" : task.status === "blocked" ? "coral" : "sky"} label={t(`v2.taskState.${task.status}`)} /></View>
    {task.description ? <Body small muted>{task.description}</Body> : null}
    <Body small>{t("v2.owner")}: {assigned?.participant_summary?.name ?? t("v2.unassigned")}</Body>
    <Body small muted>{t("v2.dependencies")}: {task.dependencies.length ? task.dependencies.map(id => allTasks.find(item => item.id === id)?.title ?? "…").join(" · ") : t("v2.noDependencies")}</Body>
    {task.deliverables.map((value, index) => <Body small key={`${index}-${value}`}>↳ {value}</Body>)}
    {!closed ? <View style={s.chips}>{TASK_STATUSES.map(status => <Chip key={status} selected={task.status === status}
      disabled={update.isPending || (!authorized && !["todo", "blocked"].includes(status)) || task.status === status}
      label={t(`v2.taskState.${status}`)} onPress={() => {
        if (!update.isPending && (authorized || ["todo", "blocked"].includes(status))) update.mutate({ status });
      }} />)}</View> : null}
    {!closed && team.length ? <View style={s.stack}><Body small>{t("v2.setOwner")}</Body><View style={s.chips}>
      <Chip label={t("v2.clearOwner")} selected={!task.assigned_submission_id} onPress={() => { if (!update.isPending) update.mutate({ assigned_submission_id: null }); }} />
      {team.filter(member => !["rejected", "abandoned", "screened_out"].includes(member.status)).map(member => <Chip key={member.id}
        label={member.participant_summary?.name ?? t("review.professional")} selected={member.id === task.assigned_submission_id}
        onPress={() => { if (!update.isPending) update.mutate({ assigned_submission_id: member.id }); }} />)}
    </View></View> : null}
    {!closed ? <View style={s.stack}>
      <Field accessibilityLabel={t("v2.dueDate")} placeholder={t("v2.dueDate")} value={date} onChangeText={setDate} editable={!update.isPending} />
      <Button compact variant="ghost" label={t("v2.saveDate")} disabled={update.isPending} onPress={() => {
        const value = date.trim() ? new Date(`${date.trim()}T12:00:00Z`) : null;
        if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(date.trim()) || Number.isNaN(value.getTime()) || value.toISOString().slice(0, 10) !== date.trim())) { setInvalidDate(true); return; }
        setInvalidDate(false); update.mutate({ due_at: value?.toISOString() ?? null });
      }} />
      {invalidDate ? <Body small>{t("v2.invalidDate")}</Body> : null}
    </View> : null}
    {task.comments.length ? <View style={s.stack}><Body small>{t("v2.comments")}</Body>{task.comments.slice(-5).map((entry, index) => <Body small key={`${entry.created_at}-${index}`}>{entry.text}</Body>)}</View> : null}
    <Field value={comment} onChangeText={setComment} placeholder={t("v2.commentPlaceholder")} accessibilityLabel={t("v2.comments")} maxLength={2000} multiline editable={!update.isPending} />
    <Button label={t("v2.addComment")} compact variant="secondary" disabled={!comment.trim()} loading={update.isPending} onPress={() => update.mutate({ comment: comment.trim() })} />
    {update.isError ? <Body small>{t("v2.saveError")}</Body> : update.isSuccess ? <Body small>{t("v2.saved")}</Body> : null}
    <Body small muted>{t("v2.lastUpdate")}: {new Date(task.updated_at).toLocaleString(i18n.language)}</Body>
  </Card>;
}
const s = StyleSheet.create({ stack: { gap: space.md }, row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.md }, flex: { flex: 1, minWidth: 0 }, chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm } });
