import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { applyBriefDraft, BRIEF_FIELDS, briefEditDraft, type Brief, type BriefEditField, type BriefLabels } from "@bc/shared";
import * as DocumentPicker from "expo-document-picker";
import * as Linking from "expo-linking";
import { router, Stack, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { type ComponentRef, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FlatList, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { type CardActions, DeliveryCard, MessageCard } from "@/components/cards";
import { Bubble, Composer, EventNote, TypingBubble } from "@/components/chat";
import { Stepper, StepTimeline } from "@/components/stepper";
import { Body, Button, Card, Eyebrow, Heading, Screen, StatusPill } from "@/components/ui";
import { api, post, type ChatMessage, type ProjectDetail } from "@/lib/api";
import { realtimeEnabled, useProjectRealtime } from "@/lib/realtime";
import { colors, space } from "@/theme/tokens";
import { useResponsive } from "@/theme/responsive";
import { ProfessionalEntry } from "@/components/professional-entry";
import { AccountMenu } from "@/components/account-menu";

// Chat del proyecto (doc 06): mensajes del agente y del cliente + tarjetas.
// Las respuestas del agente llegan por Realtime (o por sondeo si no está configurado).

export default function ProjectChat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const { isDesktop, gutter } = useResponsive();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [pendingAssets, setPendingAssets] = useState<{ id: string; name: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const sending = useRef(false);
  const conversation = useRef<FlatList<ChatMessage>>(null);
  const nearBottom = useRef(true);
  const [editingBrief, setEditingBrief] = useState<{ field: BriefEditField; brief: Brief; updatedAt: string;
    labels: BriefLabels; previousDraft: string } | null>(null);

  useProjectRealtime(id);
  // También sondear con Realtime configurado: la conexión puede perderse o rechazar el JWT.
  const poll = realtimeEnabled() ? 15_000 : 3_000;

  const detail = useQuery({
    queryKey: ["project", id],
    queryFn: () => api<ProjectDetail>(`/v1/projects/${id}`),
    refetchInterval: poll,
  });
  const messages = useQuery({
    queryKey: ["messages", id],
    queryFn: async () => (await api<{ messages: ChatMessage[] }>(`/v1/projects/${id}/messages`)).messages,
    refetchInterval: poll,
  });

  const project = detail.data?.project;
  const refreshAll = () => {
    void queryClient.invalidateQueries({ queryKey: ["project", id] });
    void queryClient.invalidateQueries({ queryKey: ["messages", id] });
  };

  const send = useMutation({
    mutationFn: (message: { content: string; asset_ids: string[] }) =>
      post<{ message: ChatMessage }>(`/v1/projects/${id}/messages`, message),
    onMutate: async ({ content }) => {
      await queryClient.cancelQueries({ queryKey: ["messages", id] });
      const optimistic: ChatMessage = {
        id: `local-${Date.now()}`,
        project_id: id,
        role: "user",
        content,
        card: null,
        created_at: new Date().toISOString(),
        pending: true,
      };
      queryClient.setQueryData<ChatMessage[]>(["messages", id], (prev = []) => [...prev, optimistic]);
      return { optimisticId: optimistic.id };
    },
    onSuccess: ({ message }, _variables, context) => {
      queryClient.setQueryData<ChatMessage[]>(["messages", id], (prev = []) =>
        [...prev.filter(item => item.id !== context?.optimisticId && item.id !== message.id), message]);
      setDraft("");
      setPendingAssets([]);
      requestAnimationFrame(() => input.current?.focus());
    },
    onError: (_error, _variables, context) => {
      queryClient.setQueryData<ChatMessage[]>(["messages", id], (prev = []) => prev.filter(item => item.id !== context?.optimisticId));
    },
    onSettled: () => { sending.current = false; refreshAll(); },
  });
  const sendMessage = (content: string) => {
    if (sending.current || uploading || !content.trim()) return;
    sending.current = true;
    nearBottom.current = true;
    send.mutate({ content: content.trim(), asset_ids: pendingAssets.map(asset => asset.id) });
  };

  const confirmBrief = useMutation({ mutationFn: () => post(`/v1/projects/${id}/brief/confirm`), onSettled: refreshAll });
  const editBrief = useMutation({
    mutationFn: async () => {
      if (!editingBrief) return;
      let brief: Brief;
      try { brief = applyBriefDraft(editingBrief.brief, editingBrief.field, draft, editingBrief.labels); }
      catch { throw new Error(t("briefEditor.invalid")); }
      const fieldLabel = editingBrief.field === "all" ? t("card.briefTitle") : editingBrief.field === "market"
        ? t("card.market") : editingBrief.labels[editingBrief.field];
      return post(`/v1/projects/${id}/brief/edit`, { brief, expected_updated_at: editingBrief.updatedAt,
        content: `${fieldLabel}:\n${draft}`, ui_language: ["es", "pt"].includes(i18n.language.slice(0, 2)) ? i18n.language.slice(0, 2) : "en" });
    },
    onSuccess: () => { setDraft(editingBrief?.previousDraft ?? ""); setEditingBrief(null); refreshAll(); },
    onError: refreshAll,
  });
  const demoPay = useMutation({ mutationFn: () => post(`/v1/projects/${id}/payment/demo`), onSettled: refreshAll });
  const demoDelivery = useMutation({ mutationFn: () => post(`/v1/projects/${id}/demo/delivery`), onSettled: refreshAll });

  const pay = useMutation({
    mutationFn: async () => {
      const { purchase_url } = await post<{ purchase_url: string }>(`/v1/projects/${id}/quote/accept`, {
        platform: Platform.OS === "web" ? "web" : "native",
      });
      if (Platform.OS === "web") {
        window.location.assign(purchase_url);
        return;
      }
      await WebBrowser.openAuthSessionAsync(purchase_url, Linking.createURL("checkout/return"));
      router.push({ pathname: "/checkout/return", params: { project_id: id } });
    },
    onSettled: refreshAll,
  });

  async function attach() {
    const picked = await DocumentPicker.getDocumentAsync({ type: ["image/*", "application/pdf"], multiple: false });
    const file = picked.assets?.[0];
    if (picked.canceled || !file) return;
    setUploading(true);
    try {
      const mime = file.mimeType ?? "application/octet-stream";
      const { asset_id, upload_url } = await post<{ asset_id: string; upload_url: string }>(`/v1/projects/${id}/assets`, {
        filename: file.name,
        mime_type: mime,
      });
      const blob = await (await fetch(file.uri)).blob();
      const res = await fetch(upload_url, { method: "PUT", headers: { "Content-Type": mime }, body: blob });
      if (!res.ok) throw new Error(`upload ${res.status}`);
      await post(`/v1/projects/${id}/assets/${asset_id}/complete`);
      setPendingAssets((prev) => [...prev, { id: asset_id, name: file.name }]);
    } finally {
      setUploading(false);
    }
  }

  const canEditBrief = Boolean(detail.data?.brief_editable && !editingBrief && !editBrief.isPending);
  const actions: CardActions = {
    canConfirmBrief: Boolean(!editingBrief && project && !project.brief_confirmed && (project.status === "brief_ready" ||
      (project.status === "paid" && detail.data?.payment_is_demo))),
    canEditBrief,
    canPay: project?.status === "quoted" && !editingBrief,
    canDemoPay: Boolean(detail.data?.demo_payments_enabled && !detail.data.payment_is_demo && !editingBrief &&
      (project?.status === "quoted" || project?.status === "awaiting_payment")),
    paymentBusy: pay.isPending || demoPay.isPending,
    busy: confirmBrief.isPending || pay.isPending || demoPay.isPending || editBrief.isPending || Boolean(project?.agent_busy),
    onConfirmBrief: () => confirmBrief.mutate(),
    onCorrectBrief: (field = "all") => {
      if (!project?.brief || !detail.data?.brief_editable) return;
      const labels = Object.fromEntries(BRIEF_FIELDS.map(key => [key, t(`briefEditor.fields.${key.replaceAll(".", "_")}`)])) as BriefLabels;
      editBrief.reset();
      setEditingBrief({ field, brief: project.brief, updatedAt: project.updated_at, labels, previousDraft: draft });
      setDraft(briefEditDraft(project.brief, field, labels));
      requestAnimationFrame(() => input.current?.focus());
    },
    onPay: () => pay.mutate(),
    onDemoPay: () => demoPay.mutate(),
    onQuickReply: sendMessage,
    onOpenDelivery: (sid) => router.push({ pathname: "/project/[id]/delivery/[sid]", params: { id, sid } }),
    onNewProject: goal => router.push({ pathname: "/new", params: { goal } }),
  };
  const inert: CardActions = { ...actions, canConfirmBrief: false, canEditBrief: false, canPay: false, canDemoPay: false, onQuickReply: () => undefined };

  // Solo la última tarjeta de cada tipo es accionable.
  const list = messages.data ?? [];
  const lastCardIdx = new Map(list.flatMap((m, i) => (m.card ? [[m.card.type, i] as const] : [])));

  // Si el agente aún no publicó la tarjeta de entrega, se arma con los datos del servidor.
  const waiting = detail.data?.submissions.findLast((sub) => !sub.client_decision);
  const syntheticDelivery = project?.status === "in_review" && !lastCardIdx.has("delivery") ? waiting : undefined;
  const typing = Boolean(project?.agent_busy) || send.isPending || (list.length === 0 && messages.isFetched && project?.status === "intake");

  return (
    <Screen edges={["bottom"]}>
      <Stack.Screen
        options={{
          title: project?.brief?.business.name ?? t("projects.untitled"),
          headerRight: () => (project ? <View style={{ marginRight: space.sm, flexDirection: "row", alignItems: "center", gap: space.xs }}>
            {isDesktop && <StatusPill status={project.status} />}
            <AccountMenu />
          </View> : null),
        }}
      />
      <View style={{ paddingHorizontal: gutter, paddingVertical: space.sm }}>
        <Button label={t("v2.workspace")} compact variant="secondary" onPress={() => router.push({ pathname: "/project/[id]/workspace", params: { id } })} />
      </View>
      {project && !isDesktop && (
        <Stepper status={project.status} onPress={() => router.push({ pathname: "/project/[id]/timeline", params: { id } })} />
      )}
      <View style={[s.workspace, isDesktop && { flexDirection: "row", padding: gutter, gap: space.xl }]}>
        {project && isDesktop && <ScrollView style={s.sidebar} contentContainerStyle={{ gap: space.lg, padding: space.lg }}>
          <Eyebrow>{t("timeline.now")}</Eyebrow>
          <Heading level={2}>{project.brief?.business.name ?? t("projects.untitled")}</Heading>
          <StatusPill status={project.status} />
          <StepTimeline status={project.status} />
          <Body small muted>{t("card.moneyNote")}</Body>
          <Button label={t("chat.timeline")} variant="secondary" compact onPress={() => router.push({ pathname: "/project/[id]/timeline", params: { id } })} />
        </ScrollView>}
        <KeyboardAvoidingView style={[s.conversation, isDesktop && s.desktopConversation]} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
          <FlatList
            ref={conversation}
            data={list}
            keyboardShouldPersistTaps="handled"
            onScroll={({ nativeEvent }) => {
              nearBottom.current = nativeEvent.contentSize.height - nativeEvent.layoutMeasurement.height - nativeEvent.contentOffset.y < 100;
            }}
            scrollEventThrottle={100}
            onContentSizeChange={() => { if (nearBottom.current) conversation.current?.scrollToEnd({ animated: false }); }}
            keyExtractor={(m) => m.id}
            contentContainerStyle={s.list}
            ListHeaderComponent={project && ["recruiting", "in_progress", "in_review", "revision", "delivered"].includes(project.status) ?
              <ProfessionalEntry projectId={id} professionals={detail.data?.submissions ?? []} demo={detail.data?.payment_is_demo} /> : undefined}
            renderItem={({ item, index }) => {
              if (item.role === "system_event") {
                return item.content === "agent_error" ? <EventNote>{t("chat.agentError")}</EventNote> :
                  item.content === "agent_quota_exceeded" ? <EventNote>{t("chat.agentQuota")}</EventNote> : null;
              }
              const mine = item.role === "user";
              const live = item.card && lastCardIdx.get(item.card.type) === index;
              return (
                <View>
                  <Bubble mine={mine} text={item.content} pending={item.pending} showAvatar={index === 0 || list[index - 1]?.role === "user"} />
                  {item.card && (
                    <View style={s.cardSlot}>
                      <MessageCard card={item.card} actions={live ? actions : inert} />
                    </View>
                  )}
                </View>
              );
            }}
            ListFooterComponent={
              <View style={{ gap: space.md }}>
                {(detail.data?.payment_is_demo || (detail.data?.demo_payments_enabled &&
                  (project?.status === "quoted" || project?.status === "awaiting_payment"))) && (
                  <Card tone="gold" style={{ padding: space.lg, gap: space.md }}>
                    <Eyebrow>{t("card.demoPaymentTitle")}</Eyebrow>
                    <Body small>{t(detail.data?.payment_is_demo ? "card.demoPaymentDone" : "card.demoPaymentNote")}</Body>
                    {!detail.data?.payment_is_demo && (
                      <Button label={t("card.demoPay")} variant="secondary" loading={demoPay.isPending}
                        disabled={pay.isPending} onPress={() => demoPay.mutate()} />
                    )}
                    {demoPay.isError && <Body small>{t("card.demoPaymentError")}</Body>}
                    {detail.data?.payment_is_demo && ["paid", "recruiting", "in_progress", "revision"].includes(project?.status ?? "") && <>
                      <Body small>{t("card.demoWorkNote")}</Body>
                      <Button label={t("card.demoDelivery")} loading={demoDelivery.isPending} onPress={() => demoDelivery.mutate()} />
                      {demoDelivery.isError && <Body small>{t("card.demoDeliveryError")}</Body>}
                    </>}
                  </Card>
                )}
                {syntheticDelivery && (
                  <View style={s.cardSlot}>
                    <DeliveryCard submissionId={syntheticDelivery.id} review={syntheticDelivery.ai_review} onOpen={actions.onOpenDelivery} />
                  </View>
                )}
                {typing && <TypingBubble />}
              </View>
            }
          />
          {canEditBrief && (
            <Button label={t("briefEditor.editAll")} variant="ghost" compact onPress={() => actions.onCorrectBrief("all")} />
          )}
          {project?.brief_confirmed ? <View style={{ paddingHorizontal: space.lg, paddingVertical: space.sm, gap: space.xs }}>
            <Body small muted>{t("refinements.scopeHint")}</Body>
            <Button label={t("refinements.newProject")} compact variant="ghost" onPress={() => router.push("/new")} />
          </View> : null}
          {editingBrief && <View style={{ paddingHorizontal: space.lg, paddingVertical: space.sm, backgroundColor: colors.skySoft, gap: space.xs }}>
            <Body small>{t("briefEditor.editing", { field: editingBrief.field === "all" ? t("card.briefTitle") : editingBrief.field === "market"
              ? t("card.market") : editingBrief.labels[editingBrief.field] })}</Body>
            <Body small muted>{t("briefEditor.hint")}</Body>
            {editBrief.isError && <Body small>{editBrief.error.message}</Body>}
            <Button label={t("briefEditor.cancel")} variant="ghost" compact disabled={editBrief.isPending}
              onPress={() => { setDraft(editingBrief.previousDraft); setEditingBrief(null); editBrief.reset(); }} />
          </View>}
          {send.isError && <View style={{ paddingHorizontal: space.lg, paddingVertical: space.sm }}>
            <Body small>{t("chat.sendError")}</Body>
          </View>}
          <Composer
            value={draft}
            onChange={setDraft}
            onSend={() => editingBrief ? editBrief.mutate() : sendMessage(draft)}
            sendLabel={editingBrief ? t("briefEditor.save") : undefined}
            disabled={editBrief.isPending || send.isPending}
            editing={Boolean(editingBrief)}
            onAttach={() => void attach()}
            attachmentsEnabled={detail.data?.uploads_enabled ?? false}
            attachments={pendingAssets.map((a) => a.name)}
            uploading={uploading}
            inputRef={input}
          />
        </KeyboardAvoidingView>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  workspace: { flex: 1, minHeight: 0, minWidth: 0 },
  sidebar: { flexGrow: 0, flexShrink: 0, width: 300, backgroundColor: colors.sidebar, borderRadius: 22, borderWidth: 1, borderColor: colors.border },
  conversation: { flex: 1, minWidth: 0, minHeight: 0 },
  desktopConversation: { borderRadius: 22, overflow: "hidden", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cream },
  list: { padding: space.lg, gap: space.md, backgroundColor: colors.cream },
  cardSlot: { alignSelf: "stretch", marginLeft: 38 },
});
