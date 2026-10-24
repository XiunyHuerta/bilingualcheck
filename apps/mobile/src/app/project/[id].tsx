import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import * as Linking from "expo-linking";
import { router, Stack, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { type ComponentRef, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MessageCard } from "@/components/cards";
import { StatusPill } from "@/components/ui";
import { api, post, type ChatMessage, type ProjectDetail } from "@/lib/api";
import { realtimeEnabled, useProjectRealtime } from "@/lib/realtime";
import { colors, fonts, radius, space } from "@/theme/tokens";

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

  const actions = {
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
  };

  // Solo la última tarjeta de cada tipo es accionable.
  const list = messages.data ?? [];
  const lastCardIdx = new Map(list.flatMap((m, i) => (m.card ? [[m.card.type, i] as const] : [])));

  return (
    <SafeAreaView edges={["bottom"]} style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: project?.brief?.business.name ?? "",
          headerRight: () => (project ? <StatusPill status={project.status} /> : null),
        }}
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
        <FlatList
          data={list}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: space.lg, gap: space.md }}
          renderItem={({ item, index }) => {
            if (item.role === "system_event") {
              return item.content === "agent_error" ? <Text style={s.event}>{t("chat.agentError")}</Text> : null;
            }
            const mine = item.role === "user";
            const live = item.card && lastCardIdx.get(item.card.type) === index;
            return (
              <View style={{ alignItems: mine ? "flex-end" : "flex-start" }}>
                <View style={[s.bubble, mine ? s.mine : s.agent, item.pending && { opacity: 0.6 }]}>
                  <Text style={s.text}>{item.content}</Text>
                </View>
                {item.card && (
                  <View style={{ alignSelf: "stretch" }}>
                    <MessageCard
                      card={item.card}
                      actions={live ? actions : { ...actions, canConfirmBrief: false, canPay: false, onQuickReply: () => undefined }}
                    />
                  </View>
                )}
              </View>
            );
          }}
          ListFooterComponent={project?.agent_busy || send.isPending ? <Text style={s.event}>{t("chat.typing")}</Text> : undefined}
        />
        {(pendingAssets.length > 0 || uploading) && (
          <Text style={s.attachments}>{uploading ? t("chat.uploading") : pendingAssets.map((a) => `📎 ${a.name}`).join("  ")}</Text>
        )}
        <View style={s.composer}>
          <Pressable onPress={attach} style={s.attach} accessibilityLabel={t("chat.attach")} accessibilityRole="button">
            <Text style={{ fontSize: 22, color: colors.blueDeep }}>＋</Text>
          </Pressable>
          <TextInput
            ref={input}
            value={draft}
            onChangeText={setDraft}
            placeholder={t("chat.placeholder")}
            multiline
            style={s.input}
          />
          <Pressable
            onPress={() => draft.trim() && send.mutate(draft.trim())}
            style={[s.send, !draft.trim() && { opacity: 0.5 }]}
            accessibilityRole="button"
          >
            <Text style={s.sendText}>{t("chat.send")}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  bubble: { maxWidth: "85%", borderRadius: radius.lg, paddingHorizontal: space.lg, paddingVertical: space.md },
  agent: { backgroundColor: colors.blueSoft, borderBottomLeftRadius: radius.sm },
  mine: { backgroundColor: colors.white, borderBottomRightRadius: radius.sm },
  text: { fontFamily: fonts.body, fontSize: 16, color: colors.ink, lineHeight: 22 },
  event: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, textAlign: "center", marginTop: space.sm },
  attachments: { paddingHorizontal: space.lg, fontFamily: fonts.body, color: colors.muted },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: space.sm, padding: space.md, borderTopWidth: 1, borderTopColor: colors.border },
  attach: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  input: { flex: 1, backgroundColor: colors.white, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm, fontFamily: fonts.body, fontSize: 16, maxHeight: 120 },
  send: { backgroundColor: colors.blueDeep, borderRadius: radius.pill, paddingHorizontal: space.lg, paddingVertical: space.sm + 2 },
  sendText: { color: colors.white, fontFamily: fonts.bodyMedium },
});
