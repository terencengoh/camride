// Help & support: emergency numbers, legal pages, and tickets (support_tickets, answered from the admin dashboard).
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Linking, Text } from "react-native";
import { Button, Card, Field, H1, Muted, Row, Screen } from "../components/ui";
import { useAuth } from "../lib/auth";
import { shortDate } from "../lib/format";
import { useI18n } from "../lib/i18n";
import { supabase } from "../lib/supabase";
import { colors } from "../lib/theme";

interface Ticket { id: string; subject: string; message: string; status: string; admin_reply: string | null; created_at: string }

export default function SupportScreen() {
  const { t, lang } = useI18n();
  const { session } = useAuth();
  const uid = session?.user.id ?? null;
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const fetchTickets = useCallback(async () => {
    const { data } = await supabase.from("support_tickets").select("id,subject,message,status,admin_reply,created_at").order("created_at", { ascending: false }).limit(20);
    return (data ?? []) as Ticket[];
  }, []);
  useEffect(() => {
    let active = true;
    fetchTickets().then((r) => active && setTickets(r));
    return () => {
      active = false;
    };
  }, [fetchTickets]);

  const send = async () => {
    if (!uid || subject.trim().length < 3 || message.trim().length < 3) return;
    setBusy(true);
    const { error } = await supabase.from("support_tickets").insert({ user_id: uid, subject: subject.trim(), message: message.trim() });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: error.message });
    setSubject("");
    setMessage("");
    setMsg({ ok: true, text: t("ticketSent") });
    setTickets(await fetchTickets());
  };

  return (
    <Screen>
      <H1>{t("support")}</H1>
      <Card style={{ backgroundColor: "#fde8e8", borderColor: colors.red }}>
        <Text style={{ fontWeight: "800", color: colors.red }}>{t("emergencyNumbers")}</Text>
        <Row>
          <Button title="117" variant="danger" onPress={() => Linking.openURL("tel:117")} />
          <Button title="118" variant="danger" onPress={() => Linking.openURL("tel:118")} />
          <Button title="119" variant="danger" onPress={() => Linking.openURL("tel:119")} />
        </Row>
      </Card>
      <Field label={t("subject")} value={subject} onChangeText={setSubject} maxLength={120} />
      <Field label={t("message")} value={message} onChangeText={setMessage} multiline numberOfLines={4} maxLength={4000} style={{ minHeight: 100, textAlignVertical: "top" }} />
      <Button title={t("send")} onPress={send} loading={busy} disabled={subject.trim().length < 3 || message.trim().length < 3} />
      {msg ? <Text style={{ color: msg.ok ? colors.green : colors.red }}>{msg.text}</Text> : null}
      {tickets.length ? <Text style={{ fontSize: 18, fontWeight: "800" }}>{t("myTickets")}</Text> : null}
      {tickets.map((tk) => (
        <Card key={tk.id}>
          <Text style={{ fontWeight: "800" }}>{tk.subject}</Text>
          <Muted>{`${shortDate(tk.created_at, lang)} · ${tk.status}`}</Muted>
          <Text>{tk.message}</Text>
          {tk.admin_reply ? <Text style={{ color: colors.green }}>{`${t("reply")}: ${tk.admin_reply}`}</Text> : null}
        </Card>
      ))}
      <Row>
        <Button title={t("terms")} variant="secondary" onPress={() => router.push("/legal/terms")} />
        <Button title={t("privacy")} variant="secondary" onPress={() => router.push("/legal/privacy")} />
      </Row>
    </Screen>
  );
}
