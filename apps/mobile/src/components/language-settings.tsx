import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api, type User } from "@/lib/api";
import i18n, { changeUILanguage } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { space } from "@/theme/tokens";
import { Body, Button, Card, Heading } from "./ui";
import { LanguagePicker } from "./language-picker";

export function LanguageSettings({ initial, onContinue }: { initial?: boolean; onContinue?: () => void }) {
  const { t } = useTranslation();
  const token = useSession(state => state.token);
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: async (language: string) => {
      await changeUILanguage(language);
      if (!token) return;
      return api<{ user: User }>("/v1/me", { method: "PATCH", body: JSON.stringify({ ui_language: language }) });
    },
    onSuccess: result => {
      if (result) client.setQueryData(["me", token], result);
    },
  });
  return <Card tone={initial ? "sky" : undefined} style={{ gap: space.lg }}>
    <Heading level={3}>{t(initial ? "refinements.chooseLanguage" : "profile.uiLanguage")}</Heading>
    <Body small muted>{t("refinements.languageHint")}</Body>
    <LanguagePicker />
    {save.isError ? <><Body small>{t("refinements.languageSaveError")}</Body><Button label={t("common.retry")} compact variant="ghost" onPress={() => save.mutate(i18n.language)} /></> : null}
    {onContinue ? <Button label={t("v2.nextStep")} compact loading={save.isPending} disabled={save.isError} onPress={() => save.mutate(i18n.language, { onSuccess: onContinue })} /> : null}
  </Card>;
}
