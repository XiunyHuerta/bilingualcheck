import { ActivityIndicator, View } from "react-native";
import { colors } from "@/theme/tokens";

// Destino del redirect de OAuth. expo-auth-session recoge el código en sign-in;
// esta pantalla solo evita una ruta "no encontrada" mientras tanto.
export default function AuthCallback() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.cream }}>
      <ActivityIndicator color={colors.blueDeep} />
    </View>
  );
}
