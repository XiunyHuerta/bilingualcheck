import { Redirect } from "expo-router";
import { useSession } from "@/lib/session";

// Ruta desconocida. En web, al abrir la raíz sin sesión Expo Router cae en el grupo
// `/(auth)` (que no tiene pantalla propia): se devuelve a quien llega al inicio de su flujo.
export default function NotFound() {
  const signedIn = useSession((s) => Boolean(s.token));
  return <Redirect href={signedIn ? "/" : "/welcome"} />;
}
