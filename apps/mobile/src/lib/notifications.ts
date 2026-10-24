import type { CollaborationItem } from "@bc/shared";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { useSession } from "./session";

export type ClientNotice = CollaborationItem & {
  professional: { name: string | null; experience: string[] } | null; project_name: string | null;
};
export function useNotifications() {
  const token = useSession((s) => s.token);
  return useQuery({
    queryKey: ["notifications", token], enabled: Boolean(token),
    queryFn: () => api<{ notifications: ClientNotice[]; unread_count: number }>("/v1/notifications"),
    refetchInterval: 10_000,
  });
}
