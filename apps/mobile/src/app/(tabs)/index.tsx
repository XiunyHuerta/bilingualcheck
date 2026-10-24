import { languageName } from "@bc/shared";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Reveal } from "@/components/motion";
import { MiniProgress } from "@/components/stepper";
import { Avatar, Body, Button, Card, EmptyState, Heading, Screen, StatusPill } from "@/components/ui";
import { api, type ChatMessage, type Project } from "@/lib/api";
import { colors, fonts, space } from "@/theme/tokens";

type ProjectRow = Project & { last_message: ChatMessage | null };

export default function Projects() {
  const { t, i18n } = useTranslation();
  const { data, isFetching, isError, refetch } = useQuery({
    queryKey: ["projects"],
    queryFn: () => api<{ projects: ProjectRow[] }>("/v1/projects"),
  });
  const projects = data?.projects ?? [];

  return (
    <Screen blobs edges={[]}>
      <FlatList
        data={projects}
        keyExtractor={(p) => p.id}
        contentContainerStyle={s.list}
        refreshControl={<RefreshControl refreshing={isFetching && projects.length > 0} onRefresh={() => void refetch()} tintColor={colors.cobalt} />}
        ItemSeparatorComponent={() => <View style={{ height: space.lg }} />}
        ListEmptyComponent={
          isFetching ? (
            <ActivityIndicator color={colors.cobalt} style={{ marginTop: space.xxl }} />
          ) : isError ? (
            <Card tone="coral">
              <Body small>{t("common.loadError")}</Body>
              <Button label={t("common.retry")} variant="secondary" compact onPress={() => void refetch()} style={{ marginTop: space.md, alignSelf: "flex-start" }} />
            </Card>
          ) : (
            <EmptyState title={t("projects.empty")} body={t("projects.emptyBody")} />
          )
        }
        renderItem={({ item, index }) => {
          const name = item.brief?.business.name ?? t("projects.untitled");
          const pair = `${languageName(item.source_language, i18n.language)} → ${item.target_language ? languageName(item.target_language, i18n.language) : "…"}`;
          return (
            <Reveal delay={Math.min(index, 6) * 60}>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push({ pathname: "/project/[id]", params: { id: item.id } })}
                style={({ pressed }) => pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] }}
              >
                <Card>
                  <View style={s.head}>
                    <Avatar kind="owner" label={item.brief?.business.name ?? item.source_language} size={40} />
                    <View style={{ flex: 1 }}>
                      <Heading level={3}>{name}</Heading>
                      <Text style={s.pair}>{pair}</Text>
                    </View>
                  </View>
                  <View style={{ marginTop: space.md, gap: space.sm }}>
                    <StatusPill status={item.status} />
                    <MiniProgress status={item.status} />
                  </View>
                  {item.last_message && item.last_message.role !== "system_event" && (
                    <Text style={s.preview} numberOfLines={2}>
                      {item.last_message.content}
                    </Text>
                  )}
                </Card>
              </Pressable>
            </Reveal>
          );
        }}
      />
      <View style={s.footer}>
        <Button label={t("projects.new")} onPress={() => router.push("/new")} />
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  list: { padding: space.lg, paddingBottom: space.xl, flexGrow: 1 },
  head: { flexDirection: "row", alignItems: "center", gap: space.md },
  pair: { fontFamily: fonts.italic, fontSize: 14, color: colors.muted },
  preview: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.muted, marginTop: space.md },
  footer: { padding: space.lg, paddingTop: space.sm },
});
