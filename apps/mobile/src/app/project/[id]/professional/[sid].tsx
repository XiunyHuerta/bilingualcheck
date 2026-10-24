import { isMeetingUrl, localMeetingTime, validMeetingTime, type CollaborationItem, type MeetingAction } from "@bc/shared";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { Avatar, Body, Button, Card, Chip, Eyebrow, Field, Heading, Screen } from "@/components/ui";
import { api, post, type ProjectDetail, type Submission } from "@/lib/api";
import { space, colors } from "@/theme/tokens";
import { useResponsive } from "@/theme/responsive";
import { useConceptDemo } from "@/lib/health";

type Activity = { professional: Submission; activity: CollaborationItem[] };

export default function ProfessionalProfile() {
  const { id, sid, mode } = useLocalSearchParams<{ id: string; sid: string; mode?: string }>();
  const { t } = useTranslation();
  const { gutter } = useResponsive();
  const replay = useConceptDemo();
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<"message" | "meeting">(mode === "meeting" ? "meeting" : "message");
  const [message, setMessage] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState(30);
  const base = `/v1/projects/${id}/professionals/${sid}`;
  const detail = useQuery({ queryKey: ["project", id], queryFn: () => api<ProjectDetail>(`/v1/projects/${id}`), refetchInterval: 10_000 });
  const activity = useInfiniteQuery({ queryKey: ["professional", id, sid], initialPageParam: "",
    queryFn: ({ pageParam }) => api<Activity>(`${base}/activity${pageParam ? `?before=${encodeURIComponent(pageParam)}` : ""}`),
    getNextPageParam: (last) => last.activity.length === 100 ? last.activity[last.activity.length - 1]?.updated_at : undefined,
    refetchInterval: 10_000,
  });
  const professional = activity.data?.pages[0]?.professional;
  const items = [...new Map((activity.data?.pages.flatMap((p) => p.activity) ?? []).map((item) => [item.id, item])).values()];
  const active = Boolean(detail.data && professional &&
    ["recruiting", "in_progress", "in_review", "revision"].includes(detail.data.project.status) &&
    ["in_progress", "awaiting_review"].includes(professional.status) && professional.client_decision !== "approved");
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["professional", id, sid] });
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };
  const send = useMutation({ mutationFn: async () => {
    const startsAt = localMeetingTime(`${date} ${time}`);
    if (kind === "meeting" && (!startsAt || !validMeetingTime(startsAt))) throw new Error(t("contact.invalidTime"));
    return post(`${base}/activity`, { kind, message: message.trim(),
      ...(kind === "meeting" ? { starts_at: startsAt, duration_minutes: duration } : {}) });
  }, onSuccess: () => { setMessage(""); setDate(""); setTime(""); refresh(); } });
  const action = useMutation({ mutationFn: ({ item, action: intent }: { item: CollaborationItem; action: MeetingAction["action"] }) =>
    post(`${base}/meetings/${item.id}`, { action: intent, version: item.version }), onSettled: refresh });
  const demoReply = useMutation({ mutationFn: () => post(`${base}/demo-response`), onSettled: refresh });
  const [linkError, setLinkError] = useState(false);
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const busy = send.isPending || action.isPending;
  return <Screen edges={["bottom"]} size="compact">
    <Stack.Screen options={{ title: t("contact.profile") }} />
    <ScrollView contentContainerStyle={{ padding: gutter, gap: space.lg }} keyboardShouldPersistTaps="handled">
      {active && detail.data?.payment_is_demo && items.some(item => item.author === "client") && <Card tone="gold" style={{ gap: space.sm }}>
        <Body small>{t("card.demoReplyNote")}</Body>
        <Button label={t("card.demoReply")} loading={demoReply.isPending} onPress={() => demoReply.mutate()} />
        {demoReply.isError && <Body small>{t("common.loadError")}</Body>}
      </Card>}
      {activity.isPending ? <ActivityIndicator color={colors.cobalt} /> : activity.isError ?
        <Card><Body>{t("common.loadError")}</Body><Button label={t("common.retry")} onPress={() => void activity.refetch()} /></Card> : professional && <>
        <Card tone="coral" style={{ gap: space.md }}>
          <Avatar kind="human" label={professional.participant_summary?.name ?? ""} size={56} />
          <Eyebrow>{t("contact.team")}</Eyebrow>
          <Heading>{professional.participant_summary?.name ?? t("review.professional")}</Heading>
          <Body small>{professional.participant_summary?.specialty ? `${t("refinements.specialty")}: ${professional.participant_summary.specialty}` : t("refinements.specialtyPending")}</Body>
          {professional.participant_summary?.experience.map((v, index) => <Body key={`${index}-${v}`} small>{v}</Body>)}
          <Body small muted>{t("refinements.contactHint")}</Body>
          {(detail.data?.payment_is_demo || replay) && <Body small muted>{t("review.illustrativeNote")}</Body>}
        </Card>
        {detail.isError && <Card><Body>{t("common.loadError")}</Body><Button label={t("common.retry")} onPress={() => void detail.refetch()} /></Card>}
        {active ? <Card style={{ gap: space.md }}>
          <Heading level={2}>{t("contact.connect")}</Heading>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            {(["message", "meeting"] as const).map((value) => <Chip key={value} label={t(`contact.${value}`)} selected={kind === value} onPress={() => { setKind(value); send.reset(); }} />)}
          </View>
          <Body small>{t(kind === "meeting" ? "contact.purpose" : "contact.message")}</Body>
          <Field accessibilityLabel={t(kind === "meeting" ? "contact.purpose" : "contact.message")} value={message} onChangeText={setMessage}
            editable={!busy} multiline maxLength={kind === "meeting" ? 1000 : 5000} style={{ minHeight: 110, textAlignVertical: "top" }} />
          {kind === "meeting" && <>
            <Body small>{t("contact.localTime", { zone })}</Body>
            <Body small>{t("contact.date")}</Body>
            <Field accessibilityLabel={t("contact.date")} placeholder="YYYY-MM-DD" value={date} onChangeText={setDate} autoCapitalize="none" editable={!busy} maxLength={10} />
            <Body small>{t("contact.time")}</Body>
            <Field accessibilityLabel={t("contact.time")} placeholder="HH:mm" value={time} onChangeText={setTime} editable={!busy} maxLength={5} />
            <Body small>{t("contact.duration")}</Body>
            <View style={{ flexDirection: "row", gap: space.sm }}>{[15, 30, 60].map((n) =>
              <Chip key={n} label={`${n} min`} selected={duration === n} onPress={() => setDuration(n)} />)}</View>
            <Body small muted>{t("refinements.meetingHint")}</Body>
          </>}
          <Button label={t(kind === "meeting" ? "contact.requestCall" : "contact.send")} loading={send.isPending}
            disabled={!message.trim() || busy} onPress={() => send.mutate()} />
          {send.isSuccess && <Body>{t("contact.sent")}</Body>}
          {send.isError && <Body>{send.error.message || t("contact.error")}</Body>}
        </Card> : detail.data && <Body muted>{t("contact.closed")}</Body>}
        <Heading level={2}>{t("contact.activity")}</Heading>
        {action.isError && <Body>{action.error.message || t("contact.error")}</Body>}
        {linkError && <Body>{t("contact.linkError")}</Body>}
        {items.length === 0 && <Body muted>{t("contact.noActivity")}</Body>}
        {items.map((item) => <ActivityCard key={item.id} item={item} active={active} busy={busy}
          onAction={(intent) => action.mutate({ item, action: intent })}
          onJoin={() => {
            setLinkError(false);
            if (!item.meeting_url || !isMeetingUrl(item.meeting_url)) { setLinkError(true); return; }
            void Linking.openURL(item.meeting_url).catch(() => setLinkError(true));
          }} />)}
        {activity.hasNextPage && <Button label={t("contact.older")} variant="secondary" loading={activity.isFetchingNextPage} onPress={() => void activity.fetchNextPage()} />}
      </>}
    </ScrollView>
  </Screen>;
}

function ActivityCard({ item, active, busy, onAction, onJoin }: { item: CollaborationItem; active: boolean; busy: boolean;
  onAction: (action: MeetingAction["action"]) => void; onJoin: () => void }) {
  const { t, i18n } = useTranslation();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const future = item.starts_at && Date.parse(item.starts_at) > now;
  return <Card tone={item.author === "professional" ? "coral" : "sky"} style={{ gap: space.md }}>
    <Eyebrow>{t(item.author === "professional" ? "review.professional" : "contact.you")}</Eyebrow>
    <Body>{item.message}</Body>
    {item.kind === "meeting" && <>
      <Body>{new Date(item.starts_at!).toLocaleString(i18n.language, { timeZoneName: "short" })} · {item.duration_minutes} min</Body>
      <Body small>{t(`contact.states.${item.status}`)}</Body>
      {active && future && item.status === "proposed" && item.author === "professional" && <>
        <Button label={t("contact.confirm")} disabled={busy} onPress={() => onAction("confirm")} />
        <Button label={t("contact.decline")} disabled={busy} variant="ghost" onPress={() => onAction("decline")} />
      </>}
      {item.status === "confirmed" && (item.meeting_url ?
        <Button label={t("contact.join")} variant="secondary" onPress={onJoin} /> : <Body small muted>{t("contact.waitingLink")}</Body>)}
      {active && ["proposed", "confirmed"].includes(item.status ?? "") &&
        <Button label={t("contact.cancel")} variant="ghost" compact disabled={busy} onPress={() => onAction("cancel")} />}
    </>}
    <Body small muted>{new Date(item.updated_at).toLocaleString(i18n.language)}</Body>
  </Card>;
}
