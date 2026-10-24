import { languageName } from "@bc/shared";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Body, Button } from "@/components/ui";
import { api, post } from "@/lib/api";
import i18n, { UI_LANGUAGES } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { space } from "@/theme/tokens";

export default function Profile() {
  const { t } = useTranslation();
  const signOut = useSession((s) => s.signOut);
  return (
    <View style={{ flex: 1, padding: space.lg, gap: space.md }}>
      <Body>{t("profile.uiLanguage")}</Body>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        {UI_LANGUAGES.map((l) => (
          <Button
            key={l}
            label={languageName(l, l)}
            variant={i18n.language === l ? "primary" : "secondary"}
            onPress={() => {
              void i18n.changeLanguage(l);
              void api("/v1/me", { method: "PATCH", body: JSON.stringify({ ui_language: l }) }).catch(() => undefined);
            }}
          />
        ))}
      </View>
      <View style={{ flex: 1 }} />
      <Button
        label={t("profile.signOut")}
        variant="secondary"
        onPress={() => {
          void post("/v1/auth/logout").finally(signOut);
        }}
      />
    </View>
  );
}
