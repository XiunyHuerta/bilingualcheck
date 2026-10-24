import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import type { ChatMessage, Project } from "./api";
import { config } from "./config";
import { useSession } from "./session";

// Realtime de Supabase sobre messages y projects (doc 06). El JWT de sesión
// del backend sirve como token de acceso: RLS filtra por su `sub`.

let client: SupabaseClient | null = null;

function supabase() {
  if (!config.supabaseUrl || !config.supabaseAnonKey) return null;
  client ??= createClient(config.supabaseUrl, config.supabaseAnonKey, {
    accessToken: async () => useSession.getState().token,
  });
  return client;
}

/** Mantiene al día la caché de React Query con los cambios del proyecto. */
export function useProjectRealtime(projectId: string) {
  const queryClient = useQueryClient();
  const token = useSession((s) => s.token);

  useEffect(() => {
    const sb = supabase();
    if (!sb || !token) return;
    void sb.realtime.setAuth(token);
    const channel = sb
      .channel(`project:${projectId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `project_id=eq.${projectId}` },
        (payload) => {
          const message = payload.new as ChatMessage;
          queryClient.setQueryData<ChatMessage[]>(["messages", projectId], (prev = []) =>
            prev.some((m) => m.id === message.id) ? prev : [...prev.filter((m) => !(m.pending && m.content === message.content)), message],
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "projects", filter: `id=eq.${projectId}` },
        (payload) => {
          queryClient.setQueryData(["project", projectId], (prev: { project: Project } | undefined) =>
            prev ? { ...prev, project: { ...prev.project, ...(payload.new as Project) } } : prev,
          );
          void queryClient.invalidateQueries({ queryKey: ["project", projectId] });
        },
      )
      .subscribe();
    return () => {
      void sb.removeChannel(channel);
    };
  }, [projectId, token, queryClient]);
}

export const realtimeEnabled = () => supabase() !== null;
