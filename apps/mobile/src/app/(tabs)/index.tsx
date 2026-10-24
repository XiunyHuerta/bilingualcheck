import { useQuery } from "@tanstack/react-query";
import { Link, router } from "expo-router";
import { useTranslation } from "react-i18next";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Body, Button, StatusPill } from "@/components/ui";
import { api, type ChatMessage, type Project } from "@/lib/api";
import { colors, fonts, radius, space } from "@/theme/tokens";

type ProjectRow = Project & { last_message: ChatMessage | null };

export default function Projects() {
  const { t } = useTranslation();
  const { data, isFetching, refetch } = useQuery({
    queryKey: ["projects"],
    queryFn: () => api<{ projects: ProjectRow[] }>("/v1/projects"),
  });
  const projects = data?.projects ?? [];

  return (
    <View style={{ flex: 1, padding: space.lg }}>
      <FlatList
        data={projects}
        keyExtractor={(p) => p.id}
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={() => void refetch()} />}
        ListEmptyComponent={isFetching ? undefined : <Body muted>{t("projects.empty")}</Body>}
        ItemSeparatorComponent={() => <View style={{ height: space.md }} />}
        renderItem={({ item }) => (
          <Link href={{ pathname: "/project/[id]", params: { id: item.id } }} asChild>
            <Pressable style={s.row}>
              <Text style={s.name} numberOfLines={1}>
                {item.brief?.business.name ?? `${item.source_language} → ${item.target_language ?? "…"}`}
              </Text>
              <StatusPill status={item.status} />
              {item.last_message && (
                <Text style={s.preview} numberOfLines={2}>
                  {item.last_message.content}
                </Text>
              )}
            </Pressable>
          </Link>
        )}
      />
      <Button label={t("projects.new")} onPress={() => router.push("/new")} />
    </View>
  );
}

const s = StyleSheet.create({
  row: { backgroundColor: colors.white, borderRadius: radius.md, padding: space.lg, gap: space.sm },
  name: { fontFamily: fonts.heading, fontSize: 18, color: colors.ink },
  preview: { fontFamily: fonts.body, fontSize: 14, color: colors.muted },
});
