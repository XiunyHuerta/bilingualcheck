import type { Brief, Card } from "@bc/shared";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fonts, radius, space } from "@/theme/tokens";
import { Button } from "./ui";

// Tarjetas interactivas del chat (doc 06). Se basan en datos del servidor,
// nunca en texto libre del modelo, para que precio y estado sean fiables.

type Actions = {
  canConfirmBrief: boolean;
  canPay: boolean;
  busy: boolean;
  onConfirmBrief: () => void;
  onCorrectBrief: () => void;
  onPay: () => void;
  onQuickReply: (text: string) => void;
};

export function MessageCard({ card, actions }: { card: Card; actions: Actions }) {
  switch (card.type) {
    case "quick_replies":
      return <QuickReplies options={card.options} onPick={actions.onQuickReply} />;
    case "brief":
      return <BriefCard brief={card.brief} actions={actions} />;
    case "quote":
      return <QuoteCard total={card.total_usd} etaDays={card.eta_days} includes={card.includes} actions={actions} />;
    case "recommendation":
      return <RecommendationCard text={card.text} />;
    case "delivery":
      return null; // fase 5: pantalla de revisión de la entrega
  }
}

function QuickReplies({ options, onPick }: { options: string[]; onPick: (text: string) => void }) {
  return (
    <View style={s.replies}>
      {options.map((o) => (
        <Pressable key={o} onPress={() => onPick(o)} style={s.reply} accessibilityRole="button">
          <Text style={s.replyText}>{o}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ marginTop: space.sm }}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.value}>{value}</Text>
    </View>
  );
}

function BriefCard({ brief, actions }: { brief: Brief; actions: Actions }) {
  const { t } = useTranslation();
  const market = [brief.target_market.city, brief.target_market.region, brief.target_market.country].filter(Boolean).join(", ");
  return (
    <View style={s.card}>
      <Text style={s.title}>{t("card.briefTitle")}</Text>
      <Text style={s.value}>
        {brief.business.name} · {brief.source_language} → {brief.target_language}
      </Text>
      <Row label={t("card.goal")} value={brief.goal} />
      <Row label={t("card.market")} value={market} />
      <Row label={t("card.audience")} value={brief.audience} />
      <Row label={t("card.deliverables")} value={brief.deliverables.map((d) => `• ${d}`).join("\n")} />
      {actions.canConfirmBrief && (
        <View style={s.actions}>
          <Button label={t("card.confirm")} onPress={actions.onConfirmBrief} loading={actions.busy} style={{ flex: 1 }} />
          <Button label={t("card.correct")} variant="secondary" onPress={actions.onCorrectBrief} style={{ flex: 1 }} />
        </View>
      )}
    </View>
  );
}

function QuoteCard(props: { total: number; etaDays: number | null; includes: string[]; actions: Actions }) {
  const { t, i18n } = useTranslation();
  const price = new Intl.NumberFormat(i18n.language, { style: "currency", currency: "USD" }).format(props.total);
  return (
    <View style={[s.card, { backgroundColor: colors.white, borderColor: colors.yellow, borderWidth: 2 }]}>
      <Text style={s.title}>{t("card.quoteTitle")}</Text>
      <Text style={s.price}>{price}</Text>
      {props.etaDays != null && <Text style={s.value}>{t("card.eta", { days: props.etaDays })}</Text>}
      <Row label={t("card.includes")} value={props.includes.map((d) => `• ${d}`).join("\n")} />
      {props.actions.canPay && (
        <Button label={t("card.pay")} onPress={props.actions.onPay} loading={props.actions.busy} style={{ marginTop: space.lg }} />
      )}
    </View>
  );
}

function RecommendationCard({ text }: { text: string }) {
  const { t } = useTranslation();
  return (
    <View style={[s.card, { backgroundColor: colors.cream, borderColor: colors.green, borderWidth: 1.5 }]}>
      <Text style={[s.title, { color: colors.green }]}>{t("card.recommendation")}</Text>
      <Text style={s.value}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.blueSoft, borderRadius: radius.lg, padding: space.lg, marginTop: space.sm },
  title: { fontFamily: fonts.heading, fontSize: 18, color: colors.blueDeep, marginBottom: space.xs },
  label: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.blueDeep, textTransform: "uppercase" },
  value: { fontFamily: fonts.body, fontSize: 15, color: colors.ink, lineHeight: 21 },
  price: { fontFamily: fonts.heading, fontSize: 32, color: colors.ink, marginVertical: space.xs },
  actions: { flexDirection: "row", gap: space.sm, marginTop: space.lg },
  replies: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.sm },
  reply: { borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.blueDeep, paddingHorizontal: space.md, paddingVertical: space.sm, backgroundColor: colors.white },
  replyText: { fontFamily: fonts.bodyMedium, color: colors.blueDeep, fontSize: 14 },
});
