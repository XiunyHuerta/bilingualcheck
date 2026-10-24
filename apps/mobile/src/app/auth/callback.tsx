import { ActivityIndicator } from "react-native";
import { Screen } from "@/components/ui";
import { colors } from "@/theme/tokens";

// Destino del redirect de OAuth. expo-auth-session recoge el código en sign-in;
// esta pantalla solo evita una ruta "no encontrada" mientras tanto.
export default function AuthCallback() {
  return (
    <Screen blobs style={{ alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator color={colors.cobalt} />
    </Screen>
  );
}
