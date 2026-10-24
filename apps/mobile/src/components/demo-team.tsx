import { localMeetingTime, validMeetingTime } from "@bc/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";
import { colors, radius, space } from "@/theme/tokens";
import { Avatar, Body, Button, Card, Chip, Eyebrow, Field, Heading, Pill } from "./ui";

type MeetingType = "appointment" | "phone" | "video";
type Notice = { id: number; kind: "reply" | "request" | "proposal" | "confirmed"; when?: string; meetingType?: MeetingType };

/** This presentation example is entirely local. It never calls Terac, payment, chat or meeting endpoints. */
export function DemoTeamCard() {
  const { t, i18n } = useTranslation();
  const [panel, setPanel] = useState<"question" | "meeting" | null>(null);
  const [question, setQuestion] = useState("");
  const [questions, setQuestions] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [meetingType, setMeetingType] = useState<MeetingType>("video");
  const [initial] = useState(() => {
    const next = new Date(Date.now() + 86400000); next.setHours(10, 0, 0, 0);
    return { date: `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`, time: "10:00" };
  });
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [invalid, setInvalid] = useState(false);
  const [notices, setNotices] = useState<Notice[]>([]);
  const addNotice = (notice: Omit<Notice, "id">) => setNotices(previous => [...previous, { ...notice, id: (previous.at(-1)?.id ?? 0) + 1 }]);
  return <Card style={s.card}>
    <Pill tone="gold" label={t("menuTeam.demoLabel")} />
    <View style={s.row}><Avatar kind="human" label="Alex Rivera" size={56} /><View style={s.flex}>
      <Heading level={2}>{t("menuTeam.demoName")}</Heading><Body small style={{ color: colors.cobalt }}>{t("menuTeam.demoSpecialty")}</Body>
    </View></View>
    <Body small>{t("menuTeam.demoLanguages")}</Body><Body small muted>{t("menuTeam.demoExperience")}</Body>
    <View style={s.actions}><Button label={t("menuTeam.ask")} onPress={() => setPanel("question")} compact />
      <Button label={t("menuTeam.schedule")} onPress={() => setPanel("meeting")} variant="secondary" compact /></View>
    <Body small muted>{t("menuTeam.demoNote")}</Body>
    {panel === "question" ? <View style={s.form}>
      <Heading level={3}>{t("menuTeam.question")}</Heading>
      <Field value={question} onChangeText={setQuestion} multiline maxLength={2000} accessibilityLabel={t("menuTeam.question")} placeholder={t("menuTeam.questionPlaceholder")} style={{ minHeight: 90 }} />
      <Button label={t("menuTeam.send")} compact disabled={!question.trim()} onPress={() => {
        setQuestions(previous => [...previous, question.trim()].slice(-5)); setQuestion(""); setPanel(null); addNotice({ kind: "reply" });
      }} />
      <Button label={t("menuTeam.close")} variant="ghost" compact onPress={() => setPanel(null)} />
    </View> : null}
    {panel === "meeting" ? <View style={s.form}>
      <Heading level={3}>{t("menuTeam.schedule")}</Heading><Body small>{t("menuTeam.meetingType")}</Body>
      <View style={s.actions}>{(["appointment", "phone", "video"] as const).map(type => <Chip key={type} label={t(`menuTeam.${type}`)} selected={meetingType === type} onPress={() => setMeetingType(type)} />)}</View>
      <Body small>{t("menuTeam.date")}</Body><Field value={date} onChangeText={setDate} accessibilityLabel={t("menuTeam.date")} maxLength={10} placeholder="YYYY-MM-DD" />
      <Body small>{t("menuTeam.time")}</Body><Field value={time} onChangeText={setTime} accessibilityLabel={t("menuTeam.time")} maxLength={5} placeholder="HH:mm" />
      <Body small>{t("menuTeam.reason")}</Body><Field value={reason} onChangeText={setReason} accessibilityLabel={t("menuTeam.reason")} maxLength={1000} multiline />
      <Button label={t("menuTeam.meetingSend")} compact disabled={!reason.trim()} onPress={() => {
        const when = localMeetingTime(`${date} ${time}`);
        if (!when || !validMeetingTime(when)) { setInvalid(true); return; }
        setInvalid(false); addNotice({ kind: "request", when, meetingType }); setPanel(null); setReason("");
      }} />
      {invalid ? <Body small>{t("menuTeam.invalidDate")}</Body> : null}
      <Button label={t("menuTeam.close")} variant="ghost" compact onPress={() => setPanel(null)} />
    </View> : null}
    {questions.map((text, index) => <View key={`${index}-${text}`} style={s.conversation}>
      <Body small>{t("contact.you")}: {text}</Body><Body small style={{ color: colors.cobalt }}>Alex: {t("menuTeam.reply")}</Body>
    </View>)}
    <View style={s.notifications} accessibilityLiveRegion="polite">
      <Eyebrow>{t("menuTeam.demoNotices")}</Eyebrow>
      {!notices.length ? <Body small muted>{t("menuTeam.emptyNotices")}</Body> : null}
      {notices.map(notice => <View key={notice.id} style={s.notice}>
        <Body small>{notice.kind === "reply" ? t("menuTeam.replyNotice") : notice.kind === "request" ? t("menuTeam.requestNotice", {
          type: t(`menuTeam.${notice.meetingType}`), date: new Date(notice.when!).toLocaleString(i18n.language),
        }) : t(notice.kind === "proposal" ? "menuTeam.proposed" : "menuTeam.confirmed")}</Body>
        {(notice.kind === "proposal" || notice.kind === "confirmed") && notice.when ? <Body small muted>{new Date(notice.when).toLocaleString(i18n.language, { dateStyle: "medium", timeStyle: "short" })}</Body> : null}
        {notice.kind === "proposal" ? <Button label={t("menuTeam.confirm")} compact variant="secondary" onPress={() => setNotices(previous => previous.map(item => item.id === notice.id ? { ...item, kind: "confirmed" } : item))} /> : null}
      </View>)}
      <Button label={t("menuTeam.propose")} variant="secondary" compact onPress={() => {
        const when = localMeetingTime(`${initial.date} ${initial.time}`)!;
        addNotice({ kind: "proposal", when, meetingType: "video" });
      }} />
    </View>
    <Button label={t("menuTeam.reset")} variant="ghost" compact onPress={() => {
      setPanel(null); setQuestions([]); setQuestion(""); setNotices([]); setReason(""); setInvalid(false); setDate(initial.date); setTime(initial.time);
    }} />
  </Card>;
}
const s = StyleSheet.create({ card: { gap: space.lg, borderColor: colors.gold, borderWidth: 1.5 }, row: { flexDirection: "row", alignItems: "center", gap: space.md }, flex: { flex: 1, minWidth: 0 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm }, form: { gap: space.md, padding: space.lg, borderRadius: radius.field, backgroundColor: colors.paper },
  conversation: { padding: space.lg, backgroundColor: colors.skySoft, borderRadius: radius.field, gap: space.md },
  notifications: { padding: space.lg, borderRadius: radius.field, backgroundColor: colors.goldSoft, gap: space.md }, notice: { padding: space.md, backgroundColor: colors.white, borderRadius: radius.field, gap: space.sm },
});
