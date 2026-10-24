import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import * as Linking from "expo-linking";
import { router, Stack, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { type ComponentRef, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FlatList, KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from "react-native";
import { type CardActions, DeliveryCard, MessageCard } from "@/components/cards";
import { Bubble, Composer, EventNote, TypingBubble } from "@/components/chat";
import { Stepper } from "@/components/stepper";
import { Screen, StatusPill } from "@/components/ui";
import { api, post, type ChatMessage, type ProjectDetail } from "@/lib/api";
import { realtimeEnabled, useProjectRealtime } from "@/lib/realtime";
import { colors, space } from "@/theme/tokens";

// Chat del proyecto (doc 06): mensajes del agente y del cliente + tarjetas.
// Las respuestas del agente llegan por Realtime (o por sondeo si no está configurado).

export default function ProjectChat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [pendingAssets, setPendingAssets] = useState<{ id: string; name: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const input = useRef<ComponentRef<typeof TextInput>>(null);

  useProjectRealtime(id);
  const poll = realtimeEnabled() ? false : 3_000;

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
    mutationFn: (content: string) =>
      post(`/v1/projects/${id}/messages`, { content, asset_ids: pendingAssets.map((a) => a.id) }),
    onMutate: (content) => {
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
      setDraft("");
      setPendingAssets([]);
    },
    onSettled: refreshAll,
  });

  const confirmBrief = useMutation({ mutationFn: () => post(`/v1/projects/${id}/brief/confirm`), onSettled: refreshAll });

  const pay = useMutation({
    mutationFn: async () => {
      const { purchase_url } = await post<{ purchase_url: string }>(`/v1/projects/${id}/quote/accept`);
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

  const actions: CardActions = {
    canConfirmBrief: project?.status === "brief_ready" && !project.brief_confirmed,
    canPay: project?.status === "quoted",
    busy: confirmBrief.isPending || pay.isPending,
    onConfirmBrief: () => confirmBrief.mutate(),
    onCorrectBrief: () => {
      setDraft(t("card.correctHint") + " ");
      input.current?.focus();
    },
    onPay: () => pay.mutate(),
    onQuickReply: (text: string) => send.mutate(text),
    onOpenDelivery: (sid) => router.push({ pathname: "/project/[id]/delivery/[sid]", params: { id, sid } }),
  };
  const inert: CardActions = { ...actions, canConfirmBrief: false, canPay: false, onQuickReply: () => undefined };

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
          headerRight: () => (project ? <View style={{ marginRight: space.lg }}><StatusPill status={project.status} /></View> : null),
        }}
      />
      {project && (
        <Stepper status={project.status} onPress={() => router.push({ pathname: "/project/[id]/timeline", params: { id } })} />
      )}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
        <FlatList
          data={list}
          keyExtractor={(m) => m.id}
          contentContainerStyle={s.list}
          renderItem={({ item, index }) => {
            if (item.role === "system_event") {
              return item.content === "agent_error" ? <EventNote>{t("chat.agentError")}</EventNote> : null;
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
              {syntheticDelivery && (
                <View style={s.cardSlot}>
                  <DeliveryCard submissionId={syntheticDelivery.id} review={syntheticDelivery.ai_review} onOpen={actions.onOpenDelivery} />
                </View>
              )}
              {typing && <TypingBubble />}
            </View>
          }
        />
        <Composer
          value={draft}
          onChange={setDraft}
          onSend={() => send.mutate(draft.trim())}
          onAttach={() => void attach()}
          attachments={pendingAssets.map((a) => a.name)}
          uploading={uploading}
          inputRef={input}
        />
      </KeyboardAvoidingView>
    </Screen>
  );
}

const s = StyleSheet.create({
  list: { padding: space.lg, gap: space.md, backgroundColor: colors.cream },
  cardSlot: { alignSelf: "stretch", marginLeft: 38 },
});
