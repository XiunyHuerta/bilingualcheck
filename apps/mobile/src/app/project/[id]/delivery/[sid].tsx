import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, Stack, useLocalSearchParams } from "expo-router";
import * as Linking from "expo-linking";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { CriteriaList } from "@/components/cards";
import { Pop, Reveal } from "@/components/motion";
import { Avatar, Body, Button, Card, Eyebrow, Field, Heading, HonestyTag, Pill, Screen } from "@/components/ui";
import { api, post, type ProjectDetail } from "@/lib/api";
import { useConceptDemo } from "@/lib/health";
import { colors, fonts, radius, space, tones } from "@/theme/tokens";

// Revisión de una entrega (doc 06): qué cambió culturalmente, evaluación de la IA y
// la decisión del cliente. El estado lo cambia el servidor; aquí solo se envía la decisión.

type Decision = "approve" | "request_changes";

export default function DeliveryReview() {
  const { id, sid } = useLocalSearchParams<{ id: string; sid: string }>();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const simulated = useConceptDemo();
  const [asking, setAsking] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [sent, setSent] = useState<"approved" | "changes_requested" | null>(null);

  const detail = useQuery({ queryKey: ["project", id], queryFn: () => api<ProjectDetail>(`/v1/projects/${id}`),
    refetchInterval: (query) => ["in_review", "revision"].includes(query.state.data?.project.status ?? "") ? 5_000 : false });
  const submission = detail.data?.submissions.find((sub) => sub.id === sid);
  const review = submission?.ai_review ?? null;

  const decide = useMutation({
    mutationFn: (input: { decision: Decision; feedback?: string }) => post(`/v1/projects/${id}/submissions/${sid}/decision`, input),
    onSuccess: (_, input) => {
      setSent(input.decision === "approve" ? "approved" : "changes_requested");
      setAsking(false);
      void queryClient.invalidateQueries({ queryKey: ["project", id] });
      void queryClient.invalidateQueries({ queryKey: ["messages", id] });
    },
  });

  const decided = sent ?? submission?.client_decision ?? null;
  const canDecide = detail.data?.project.status === "in_review" && !decided && Boolean(review);
  const download = useMutation({ mutationFn: async () => {
    const result = await api<{ url: string }>(`/v1/projects/${id}/assets/${submission!.delivery_asset_id}/url`);
    await Linking.openURL(result.url);
  } });
  const retryReview = useMutation({ mutationFn: () => post(`/v1/projects/${id}/submissions/${sid}/review`),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["project", id] }); } });
  const pro = submission?.participant_summary;

  return (
    <Screen blobs edges={["bottom"]}>
      <Stack.Screen options={{ title: t("review.title") }} />
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {detail.isLoading ? (
          <ActivityIndicator color={colors.cobalt} style={{ marginTop: space.xxl }} />
        ) : !submission ? (
          <Card tone="coral">
            <Body small>{t("review.notFound")}</Body>
            <Button label={t("common.back")} variant="secondary" compact onPress={() => router.back()} style={{ marginTop: space.md, alignSelf: "flex-start" }} />
          </Card>
        ) : (
          <>
            <Reveal>
              <Card>
                <View style={s.proHead}>
                  <Avatar kind="human" label={pro?.name ?? t("review.professional")} size={48} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Eyebrow style={{ color: tones.coral.fg }}>{t("review.professional")}</Eyebrow>
                    <Heading level={3}>{pro?.name ?? t("review.professional")}</Heading>
                  </View>
                </View>
                {pro && pro.experience.length > 0 && (
                  <View style={s.tags}>
                    {pro.experience.map((e) => (
                      <Pill key={e} tone="neutral" label={e} />
                    ))}
                  </View>
                )}
                {/* Con Terac en `replay` el perfil es simulado: no se presenta como una persona real. */}
                {simulated && (
                  <View style={{ marginTop: space.md }}>
                    <HonestyTag kind="illustrative" />
                  </View>
                )}
                <Body small muted style={{ marginTop: space.md }}>
                  {simulated ? t("review.illustrativeNote") : t("review.professionalNote")}
                </Body>
              </Card>
            </Reveal>

            {submission.delivery_text ? (
              <Card style={{ marginTop: space.xl }}>
                <Heading level={2}>{t("review.contentTitle")}</Heading>
                <Body small style={{ marginTop: space.md }}>{submission.delivery_text}</Body>
                {submission.delivery_asset_id ? <Button label={t("review.download")} variant="secondary"
                  onPress={() => download.mutate()} loading={download.isPending} style={{ marginTop: space.md }} /> : null}
                {download.isError ? <Body small>{t("review.downloadError")}</Body> : null}
              </Card>
            ) : null}
            <Reveal delay={100} style={{ marginTop: space.xl }}>
              <Card tone="sky">
                <View style={s.aiHead}>
                  <Avatar kind="agent" size={28} />
                  <Text style={s.aiTitle}>{t("review.aiTitle")}</Text>
                  {review && <Pill tone={review.meets_brief ? "sage" : "coral"} label={review.meets_brief ? `✓ ${t("review.meets")}` : t("review.needsLook")} />}
                </View>
                {review ? (
                  <View style={{ gap: space.lg, marginTop: space.md }}>
                    <View style={s.block}>
                      <Text style={s.blockTitle}>{t("review.culturalTitle")}</Text>
                      <Text style={s.blockText}>{review.cultural_changes_explained}</Text>
                    </View>
                    {review.criteria.length > 0 && (
                      <View style={{ gap: space.sm }}>
                        <Text style={s.blockTitle}>
                          {t("review.criteriaTitle")} · {t("review.criteriaCount", { met: review.criteria.filter((c) => c.met).length, total: review.criteria.length })}
                        </Text>
                        <CriteriaList criteria={review.criteria} />
                      </View>
                    )}
                    {review.issues.length > 0 && (
                      <View style={[s.block, { backgroundColor: tones.coral.bg }]}>
                        <Text style={[s.blockTitle, { color: tones.coral.fg }]}>{t("review.issuesTitle")}</Text>
                        {review.issues.map((issue) => (
                          <Text key={issue} style={s.blockText}>
                            • {issue}
                          </Text>
                        ))}
                      </View>
                    )}
                  </View>
                ) : (
                  <Body small style={{ marginTop: space.md }}>
                    {t("review.pending")}
                  </Body>
                )}
                {submission.review_error ? <View style={{ marginTop: space.md, gap: space.sm }}>
                  <Body small>{t("review.retryHint")}</Body>
                  <Button label={t("review.retry")} variant="secondary" onPress={() => retryReview.mutate()} loading={retryReview.isPending} />
                  {retryReview.isError ? <Body small>{t("review.error")}</Body> : null}
                </View> : null}
              </Card>
            </Reveal>

            <Reveal delay={200} style={{ marginTop: space.xl, gap: space.md }}>
              <Heading level={2}>{t("review.decisionTitle")}</Heading>

              {decided === "approved" && (
                <Pop>
                  <Card tone="sage">
                    <Text style={[s.resultTitle, { color: tones.sage.fg }]}>✓ {t("review.approved")}</Text>
                    <Body small>{t("review.approvedBody")}</Body>
                  </Card>
                </Pop>
              )}
              {decided === "changes_requested" && (
                <Pop>
                  <Card tone="coral">
                    <Text style={[s.resultTitle, { color: tones.coral.fg }]}>{t("review.changesSent")}</Text>
                    <Body small>{t("review.changesSentBody")}</Body>
                    {(submission.client_feedback ?? "") !== "" && (
                      <Body small muted style={{ marginTop: space.sm }}>
                        “{submission.client_feedback}”
                      </Body>
                    )}
                  </Card>
                </Pop>
              )}

              {decide.isError && (
                <Card tone="coral" style={{ padding: space.lg }}>
                  <Body small>{t("review.error")}</Body>
                </Card>
              )}

              {canDecide && !asking && (
                <View style={{ gap: space.sm }}>
                  <Button label={t("review.approve")} onPress={() => decide.mutate({ decision: "approve" })} loading={decide.isPending} />
                  <Button
                    label={t("review.requestChanges")}
                    variant="secondary"
                    disabled={decide.isPending}
                    onPress={() => {
                      setFeedback(review?.suggested_revision_request ?? "");
                      setAsking(true);
                    }}
                  />
                </View>
              )}

              {canDecide && asking && (
                <View style={{ gap: space.sm }}>
                  <Field
                    value={feedback}
                    onChangeText={setFeedback}
                    placeholder={t("review.changesPlaceholder")}
                    multiline
                    autoFocus
                    style={{ minHeight: 110, textAlignVertical: "top" }}
                  />
                  <Button
                    label={t("review.sendChanges")}
                    onPress={() => decide.mutate({ decision: "request_changes", feedback: feedback.trim() || undefined })}
                    loading={decide.isPending}
                    disabled={!feedback.trim()}
                  />
                  <Button label={t("review.cancel")} variant="ghost" onPress={() => setAsking(false)} disabled={decide.isPending} />
                </View>
              )}

              <Text style={s.note}>{t("review.approvalNote")}</Text>
            </Reveal>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: space.xxl },
  proHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.md },
  aiHead: { flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" },
  aiTitle: { flex: 1, fontFamily: fonts.heading, fontSize: 16, color: colors.cobalt },
  block: { backgroundColor: colors.white, borderRadius: radius.field, padding: space.lg, gap: space.xs },
  blockTitle: { fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 1.2, textTransform: "uppercase", color: colors.muted },
  blockText: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.ink },
  resultTitle: { fontFamily: fonts.heading, fontSize: 18, marginBottom: space.xs },
  note: { fontFamily: fonts.italic, fontSize: 13, lineHeight: 18, color: colors.muted },
});
