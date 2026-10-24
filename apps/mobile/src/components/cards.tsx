import { type Brief, type BriefEditField, type Card as ChatCard, languageName, type SubmissionReview } from "@bc/shared";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fonts, radius, space, tones } from "@/theme/tokens";
import { Pop, Reveal } from "./motion";
import { Avatar, Body, Button, Card, ConceptDemoTag, Eyebrow, Heading, Pill } from "./ui";

// Tarjetas interactivas del chat (doc 06). Se basan en datos del servidor,
// nunca en texto libre del modelo, para que precio y estado sean fiables.

export type CardActions = {
  canConfirmBrief: boolean;
  canEditBrief: boolean;
  canPay: boolean;
  canDemoPay: boolean;
  paymentBusy: boolean;
  busy: boolean;
  onConfirmBrief: () => void;
  onCorrectBrief: (field?: BriefEditField) => void;
  onPay: () => void;
  onDemoPay: () => void;
  onQuickReply: (text: string) => void;
  onOpenDelivery: (submissionId: string) => void;
  onNewProject: (goal: string) => void;
};

export function MessageCard({ card, actions }: { card: ChatCard; actions: CardActions }) {
  const { t } = useTranslation();
  return (
    <Reveal style={{ marginTop: space.sm }}>
      {card.type === "quick_replies" && <QuickReplies options={card.options} onPick={actions.onQuickReply} />}
      {card.type === "brief" && <BriefCard brief={card.brief} actions={actions} />}
      {card.type === "quote" && <QuoteCard total={card.total_usd} etaDays={card.eta_days} includes={card.includes} actions={actions} />}
      {card.type === "delivery" && <DeliveryCard submissionId={card.submission_id} review={card.review} onOpen={actions.onOpenDelivery} />}
      {card.type === "recommendation" && <RecommendationCard text={card.text} />}
      {card.type === "new_project" && <Card tone="gold" style={{ gap: space.md }}>
        <Body>{card.reason}</Body><Body small muted>{t("refinements.scopeChange")}</Body>
        <Button label={t("refinements.newProject")} compact onPress={() => actions.onNewProject(card.goal)} />
      </Card>}
    </Reveal>
  );
}

function QuickReplies({ options, onPick }: { options: string[]; onPick: (text: string) => void }) {
  return (
    <View style={s.replies}>
      {options.map((o, i) => (
        <Pop key={o} delay={i * 70}>
          <Pressable onPress={() => onPick(o)} style={({ pressed }) => [s.reply, pressed && { opacity: 0.75 }]} accessibilityRole="button">
            <Text style={s.replyText}>{o}</Text>
          </Pressable>
        </Pop>
      ))}
    </View>
  );
}

/** Fila blanca con label + valor, dentro de una tarjeta sky-soft. */
export function InfoRow({ label, value, onEdit }: { label: string; value: string; onEdit?: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={s.infoRow}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm }}>
        <Text style={[s.label, { flex: 1 }]}>{label}</Text>
        {onEdit && <Button label={t("briefEditor.edit")} variant="ghost" compact onPress={onEdit}
          accessibilityLabel={t("briefEditor.editField", { field: label })} />}
      </View>
      <Text style={s.value}>{value}</Text>
    </View>
  );
}

function BriefCard({ brief, actions }: { brief: Brief; actions: CardActions }) {
  const { t, i18n } = useTranslation();
  const market = [brief.target_market.city, brief.target_market.region, brief.target_market.country].filter(Boolean).join(", ");
  const pair = `${languageName(brief.source_language, i18n.language)} → ${languageName(brief.target_language, i18n.language)}`;
  return (
    <Card tone="sky">
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Eyebrow>{t("card.briefTitle")}</Eyebrow>
          <Heading level={3}>{brief.business.name}</Heading>
          <Text style={s.pair}>{pair}</Text>
        </View>
        {actions.canConfirmBrief && (
          <Pop>
            <Pill tone="sage" label={`✓ ${t("card.ready")}`} />
          </Pop>
        )}
      </View>
      <InfoRow label={t("card.goal")} value={brief.goal} onEdit={actions.canEditBrief ? () => actions.onCorrectBrief("goal") : undefined} />
      <InfoRow label={t("card.market")} value={market} onEdit={actions.canEditBrief ? () => actions.onCorrectBrief("market") : undefined} />
      <InfoRow label={t("card.audience")} value={brief.audience} onEdit={actions.canEditBrief ? () => actions.onCorrectBrief("audience") : undefined} />
      <InfoRow label={t("card.deliverables")} value={brief.deliverables.map((d) => `• ${d}`).join("\n")} onEdit={actions.canEditBrief ? () => actions.onCorrectBrief("deliverables") : undefined} />
      {(brief.cultural_notes.length > 0 || actions.canEditBrief) && <InfoRow label={t("card.culturalNotes")}
        value={brief.cultural_notes.map((d) => `• ${d}`).join("\n")}
        onEdit={actions.canEditBrief ? () => actions.onCorrectBrief("cultural_notes") : undefined} />}
      {actions.canConfirmBrief && (
        <View style={s.actions}>
          <Button label={t("card.confirm")} onPress={actions.onConfirmBrief} loading={actions.busy} style={{ flex: 1 }} />
        </View>
      )}
      {actions.canEditBrief && <Button label={t("briefEditor.editAll")} variant="secondary"
        onPress={() => actions.onCorrectBrief("all")} disabled={actions.busy} />}
    </Card>
  );
}

function QuoteCard(props: { total: number; etaDays: number | null; includes: string[]; actions: CardActions }) {
  const { t, i18n } = useTranslation();
  const price = new Intl.NumberFormat(i18n.language, { style: "currency", currency: "USD" }).format(props.total);
  return (
    <Card style={{ borderColor: colors.gold, borderWidth: 2 }}>
      <View style={s.header}>
        <Eyebrow style={{ flex: 1 }}>{t("card.quoteTitle")}</Eyebrow>
        <ConceptDemoTag />
      </View>
      <Text style={s.price}>{price}</Text>
      {props.etaDays != null && <Text style={s.eta}>{t("card.eta", { days: props.etaDays })}</Text>}
      {props.includes.length > 0 && (
        <View style={s.includes}>
          <Text style={s.label}>{t("card.includes")}</Text>
          {props.includes.map((item) => (
            <View key={item} style={s.includeLine}>
              <Text style={s.includeTick}>✓</Text>
              <Text style={[s.value, { flex: 1 }]}>{item}</Text>
            </View>
          ))}
        </View>
      )}
      {/* El dinero lo controla el usuario: se dice siempre (guía §6). */}
      <Text style={s.moneyNote}>{t("card.moneyNote")}</Text>
      {props.actions.canDemoPay && <View style={{ gap: space.sm, marginTop: space.lg }}>
        <Button label={t("card.demoPay")} onPress={props.actions.onDemoPay} loading={props.actions.paymentBusy} />
        <Body small muted>{t("card.demoPaymentNote")}</Body>
      </View>}
      {props.actions.canPay && <Button label={t("card.pay")} variant={props.actions.canDemoPay ? "secondary" : "primary"}
        onPress={props.actions.onPay} loading={props.actions.paymentBusy} style={{ marginTop: space.lg }} />}
    </Card>
  );
}

/** Tarjeta de entrega: resumen de la evaluación de la IA y acceso a la pantalla de revisión. */
export function DeliveryCard({ submissionId, review, onOpen }: { submissionId: string; review: SubmissionReview | null; onOpen: (id: string) => void }) {
  const { t } = useTranslation();
  const met = review ? review.criteria.filter((c) => c.met).length : 0;
  return (
    <Card>
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Eyebrow style={{ color: tones.coral.fg }}>{t("card.deliveryTitle")}</Eyebrow>
          <Heading level={3}>{t("card.deliveryHeadline")}</Heading>
        </View>
      </View>
      <View style={s.aiBox}>
        <View style={s.aiHead}>
          <Avatar kind="agent" size={24} />
          <Text style={s.aiTitle}>{t("review.aiTitle")}</Text>
          {review && <Pill tone={review.meets_brief ? "sage" : "coral"} label={review.meets_brief ? `✓ ${t("review.meets")}` : t("review.needsLook")} />}
        </View>
        {review ? (
          <>
            <Text style={s.value} numberOfLines={4}>
              {review.cultural_changes_explained}
            </Text>
            {review.criteria.length > 0 && <Text style={s.criteriaCount}>{t("review.criteriaCount", { met, total: review.criteria.length })}</Text>}
          </>
        ) : (
          <Text style={s.value}>{t("review.pending")}</Text>
        )}
      </View>
      <Button label={t("card.reviewDelivery")} onPress={() => onOpen(submissionId)} style={{ marginTop: space.lg }} />
      <Text style={s.moneyNote}>{t("card.approvalNote")}</Text>
    </Card>
  );
}

function RecommendationCard({ text }: { text: string }) {
  const { t } = useTranslation();
  return (
    <Card tone="sky">
      <Eyebrow>{t("card.recommendation")}</Eyebrow>
      <Body style={{ marginTop: space.xs }}>{text}</Body>
    </Card>
  );
}

/** Lista de criterios del brief: sage = cumplido, coral = a revisar. */
export function CriteriaList({ criteria }: { criteria: SubmissionReview["criteria"] }) {
  return (
    <View style={{ gap: space.sm }}>
      {criteria.map((c) => {
        const tone = c.met ? tones.sage : tones.coral;
        return (
          <View key={c.criterion} style={[s.criterion, { backgroundColor: tone.bg }]}>
            <Text style={[s.criterionMark, { color: tone.fg }]}>{c.met ? "✓" : "!"}</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.criterionTitle}>{c.criterion}</Text>
              {c.note ? <Text style={s.criterionNote}>{c.note}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "flex-start", gap: space.md, marginBottom: space.xs },
  pair: { fontFamily: fonts.italic, fontSize: 14, color: colors.muted, marginTop: 2 },
  label: { fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: colors.muted, marginBottom: 2 },
  value: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.ink },
  infoRow: { backgroundColor: colors.white, borderRadius: radius.field, paddingHorizontal: space.lg, paddingVertical: space.md, marginTop: space.sm },
  actions: { flexDirection: "row", gap: space.sm, marginTop: space.lg },
  price: { fontFamily: fonts.heading, fontSize: 40, lineHeight: 46, letterSpacing: -0.8, color: colors.ink, marginTop: space.xs },
  eta: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.muted, marginTop: 2 },
  includes: { marginTop: space.lg, gap: 6 },
  includeLine: { flexDirection: "row", gap: space.sm, alignItems: "flex-start" },
  includeTick: { fontFamily: fonts.heading, fontSize: 15, lineHeight: 21, color: tones.sage.fg },
  moneyNote: { fontFamily: fonts.italic, fontSize: 13, lineHeight: 18, color: colors.muted, marginTop: space.md },
  aiBox: { backgroundColor: colors.skySoft, borderRadius: radius.field, padding: space.lg, marginTop: space.sm, gap: space.sm },
  aiHead: { flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" },
  aiTitle: { flex: 1, fontFamily: fonts.headingBold, fontSize: 14, color: colors.cobalt },
  criteriaCount: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.muted },
  replies: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  reply: { borderRadius: radius.chip, borderWidth: 1.5, borderColor: colors.cobalt, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: colors.white },
  replyText: { fontFamily: fonts.bodySemi, color: colors.cobalt, fontSize: 14 },
  criterion: { flexDirection: "row", gap: space.md, padding: space.md, borderRadius: radius.field, alignItems: "flex-start" },
  criterionMark: { fontFamily: fonts.heading, fontSize: 16, width: 18, textAlign: "center", lineHeight: 21 },
  criterionTitle: { fontFamily: fonts.bodySemi, fontSize: 15, lineHeight: 21, color: colors.ink },
  criterionNote: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.muted, marginTop: 2 },
});
