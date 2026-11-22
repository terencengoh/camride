// Supabase phone OTP: signInWithOtp({ phone }) then verifyOtp({ phone, token, type: "sms" }).
// Requires an SMS provider configured in the Supabase project (see docs/ARCHITECTURE.md).
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, Text } from "react-native";
import { Button, Field, H1, Muted, Row, Screen } from "../components/ui";
import { isConfigured } from "../lib/env";
import { useI18n } from "../lib/i18n";
import { normalizeCmPhone, toE164 } from "../lib/phone";
import { supabase } from "../lib/supabase";
import { colors } from "../lib/theme";

export default function SignIn() {
  const { t, lang, setLang } = useI18n();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);

  const send = async () => {
    setErr(null);
    const n = normalizeCmPhone(phone);
    if (!n) return setErr(t("badPhone"));
    if (!accepted) return setErr(t("mustAcceptTerms"));
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ phone: toE164(n) });
    setBusy(false);
    if (error) return setErr(t("error", { msg: error.message }));
    setSentTo(toE164(n));
  };

  const verify = async () => {
    if (!sentTo) return;
    setErr(null);
    setBusy(true);
    const { data, error } = await supabase.auth.verifyOtp({ phone: sentTo, token: code.trim(), type: "sms" });
    if (!error && data.user) {
      // Record consent (Law No. 2024/017) on the profile.
      await supabase.from("profiles").update({ accepted_terms_at: new Date().toISOString() }).eq("id", data.user.id);
    }
    setBusy(false);
    if (error) return setErr(t("error", { msg: error.message }));
    router.replace("/");
  };

  return (
    <Screen>
      <H1>{t("appName")}</H1>
      <Button title={lang === "fr" ? "English" : "Français"} variant="secondary" onPress={() => setLang(lang === "fr" ? "en" : "fr")} />
      {!isConfigured ? <Text style={{ color: colors.red }}>{t("notConfigured")}</Text> : null}
      <H1>{t("signInTitle")}</H1>
      {!sentTo ? (
        <>
          <Field label={t("phone")} placeholder="+237 6XX XXX XXX" keyboardType="phone-pad" autoComplete="tel" value={phone} onChangeText={setPhone} />
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: accepted }} onPress={() => setAccepted(!accepted)}>
            <Row style={{ alignItems: "flex-start" }}>
              <Text style={{ fontSize: 22, color: colors.green }}>{accepted ? "☑" : "☐"}</Text>
              <Text style={{ flex: 1, color: colors.ink }}>{t("acceptTerms")}</Text>
            </Row>
          </Pressable>
          <Row>
            <Button title={t("terms")} variant="secondary" onPress={() => router.push("/legal/terms")} />
            <Button title={t("privacy")} variant="secondary" onPress={() => router.push("/legal/privacy")} />
          </Row>
          <Button title={t("sendCode")} onPress={send} loading={busy} disabled={!accepted} />
        </>
      ) : (
        <>
          <Muted>{t("codeSent", { phone: sentTo })}</Muted>
          <Field label={t("code")} keyboardType="number-pad" autoComplete="one-time-code" maxLength={6} value={code} onChangeText={setCode} />
          <Button title={t("verify")} onPress={verify} loading={busy} disabled={code.trim().length < 6} />
        </>
      )}
      {err ? <Text style={{ color: colors.red }}>{err}</Text> : null}
    </Screen>
  );
}
