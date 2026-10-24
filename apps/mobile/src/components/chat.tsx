import type { ComponentRef, Ref } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, fonts, radius, space } from "@/theme/tokens";
import { Reveal, TypingDots } from "./motion";
import { Avatar, Field, Pill } from "./ui";

// Burbujas y compositor del chat (guía §4): dueño a la derecha en cobalt,
// agente a la izquierda en sky-soft.

export function Bubble({ mine, text, pending, showAvatar }: { mine: boolean; text: string; pending?: boolean; showAvatar?: boolean }) {
  return (
    <Reveal style={[s.line, mine && { justifyContent: "flex-end" }]}>
      {!mine && <View style={s.avatarSlot}>{showAvatar && <Avatar kind="agent" size={30} />}</View>}
      <View style={[s.bubble, mine ? s.mine : s.agent, pending && { opacity: 0.6 }]}>
        <Text style={[s.text, mine && { color: colors.white }]} selectable>
          {text}
        </Text>
      </View>
    </Reveal>
  );
}

export function TypingBubble() {
  const { t } = useTranslation();
  return (
    <View style={s.line} accessibilityLabel={t("chat.typing")}>
      <View style={s.avatarSlot}>
        <Avatar kind="agent" size={30} />
      </View>
      <View style={[s.bubble, s.agent]}>
        <TypingDots />
      </View>
    </View>
  );
}

/** Aviso de sistema centrado ("el agente tuvo un problema"). */
export function EventNote({ children }: { children: string }) {
  return <Text style={s.event}>{children}</Text>;
}

export function Composer({ inputRef, ...props }: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onAttach: () => void;
  attachments: string[];
  uploading: boolean;
  inputRef: Ref<ComponentRef<typeof TextInput>>;
}) {
  const { t } = useTranslation();
  const canSend = props.value.trim().length > 0;
  return (
    <View style={s.composerWrap}>
      {(props.attachments.length > 0 || props.uploading) && (
        <View style={s.attachments}>
          {props.uploading && <Pill tone="sky" label={t("chat.uploading")} />}
          {props.attachments.map((name, i) => (
            <Pill key={`${name}-${i}`} tone="sage" label={`✓ ${name}`} />
          ))}
        </View>
      )}
      <View style={s.composer}>
        <Pressable onPress={props.onAttach} style={({ pressed }) => [s.attach, pressed && { opacity: 0.7 }]} accessibilityLabel={t("chat.attach")} accessibilityRole="button">
          <Text style={s.plus}>+</Text>
        </Pressable>
        <Field
          ref={inputRef}
          value={props.value}
          onChangeText={props.onChange}
          placeholder={t("chat.placeholder")}
          multiline
          style={s.input}
        />
        <Pressable
          onPress={() => canSend && props.onSend()}
          disabled={!canSend}
          style={({ pressed }) => [s.send, !canSend && { opacity: 0.45 }, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
          accessibilityLabel={t("chat.send")}
        >
          <Text style={s.sendText}>{t("chat.send")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  line: { flexDirection: "row", alignItems: "flex-end", gap: space.sm },
  avatarSlot: { width: 30, height: 30 },
  bubble: { maxWidth: "82%", paddingHorizontal: 16, paddingVertical: 11, borderRadius: 18 },
  mine: { backgroundColor: colors.cobalt, borderBottomRightRadius: radius.tail },
  agent: { backgroundColor: colors.skySoft, borderBottomLeftRadius: radius.tail },
  text: { fontFamily: fonts.body, fontSize: 16, lineHeight: 22, color: colors.ink },
  event: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, textAlign: "center", marginTop: space.sm },
  composerWrap: { backgroundColor: colors.sidebar, borderTopWidth: 1, borderTopColor: colors.border },
  attachments: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.md },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: space.sm, padding: space.md },
  attach: { width: 44, height: 44, borderRadius: radius.field, backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  plus: { fontFamily: fonts.heading, fontSize: 24, lineHeight: 28, color: colors.cobalt },
  input: { flex: 1, maxHeight: 120, minHeight: 44, paddingVertical: 11 },
  send: { height: 44, paddingHorizontal: space.lg + 2, borderRadius: radius.button, backgroundColor: colors.cobalt, alignItems: "center", justifyContent: "center" },
  sendText: { fontFamily: fonts.headingBold, fontSize: 15, color: colors.white },
});
