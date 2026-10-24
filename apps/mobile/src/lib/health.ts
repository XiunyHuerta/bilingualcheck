import { useQuery } from "@tanstack/react-query";
import { config } from "./config";

// /health indica si Terac corre en `replay` (respuestas grabadas). En ese caso la
// guía de estilo exige etiquetar el contenido como simulado ("Concept demo").
export function useConceptDemo(): boolean {
  const { data } = useQuery({
    queryKey: ["health"],
    queryFn: async () => (await (await fetch(`${config.apiUrl}/health`)).json()) as { terac_mode?: string },
    staleTime: 5 * 60_000,
    retry: false,
  });
  return data?.terac_mode === "replay";
}
