// Mobile money checkout: choose MTN / Orange, enter the number, the provider pushes a prompt to the
// customer's phone, and the final status arrives through Realtime on the payments row.
import { useEffect, useState } from "react";
import { Modal, Text, View } from "react-native";
import { api } from "../lib/api";
import { fcfa } from "../lib/format";
import { useI18n } from "../lib/i18n";
import { detectOperator, normalizeCmPhone } from "../lib/phone";
import { useRealtimeRow } from "../lib/realtime";
import { colors } from "../lib/theme";
import { Button, Chip, Field, Muted, Row } from "./ui";

interface Props {
  visible: boolean;
  target: { trip_id: string } | { order_id: string };
  amount: number;
  defaultMethod?: "mtn" | "orange";
  onClose: () => void;
  onPaid: () => void;
}

const OP_NAME = { mtn: "MTN Mobile Money", orange: "Orange Money" } as const;

export function PayModal({ visible, target, amount, defaultMethod = "mtn", onClose, onPaid }: Props) {
  const { t, lang } = useI18n();
  const [method, setMethod] = useState<"mtn" | "orange">(defaultMethod);
  const [phone, setPhone] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [ussd, setUssd] = useState<string>("");
  const { row: payment } = useRealtimeRow<{ id: string; status: string }>("payments", paymentId, "id,status");

  const failed = payment?.status === "failed";
  const waiting = !!paymentId && !failed;
  const shownErr = failed ? t("payFailed") : err;

  useEffect(() => {
    if (payment?.status === "successful") onPaid();
  }, [payment?.status, onPaid]);

  const submit = async () => {
    setErr(null);
    const n = normalizeCmPhone(phone);
    if (!n) return setErr(t("badPhone"));
    const op = detectOperator(n);
    if (op && op !== method) return setErr(t("wrongOperator", { op: OP_NAME[op] }));
    setBusy(true);
    try {
      const res = await api.pay(target, method, n);
      setPaymentId(res.payment_id);
      setUssd(res.ussd_code ?? (method === "mtn" ? "*126#" : "#150*50#"));
    } catch (e) {
      setErr(t("error", { msg: (e as Error).message }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" }}>
        <View style={{ backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, gap: 10 }}>
          <Text style={{ fontSize: 20, fontWeight: "800" }}>{t("payTitle")}</Text>
          <Text style={{ fontSize: 26, fontWeight: "800", color: colors.green }}>{fcfa(amount, lang)}</Text>
          {waiting ? (
            <>
              <Muted>{t("approveOnPhone", { ussd })}</Muted>
              <Button title={t("cancel")} variant="secondary" onPress={onClose} />
            </>
          ) : (
            <>
              <Row>
                <Chip label="MTN MoMo" accent={colors.mtn} selected={method === "mtn"} onPress={() => setMethod("mtn")} />
                <Chip label="Orange Money" accent={colors.orange} selected={method === "orange"} onPress={() => setMethod("orange")} />
              </Row>
              <Field label={t("payPhone")} keyboardType="phone-pad" placeholder={method === "mtn" ? "67X XXX XXX" : "69X XXX XXX"} value={phone} onChangeText={setPhone} />
              {shownErr ? <Text style={{ color: colors.red }}>{shownErr}</Text> : null}
              <Button title={t("payNow", { amount: fcfa(amount, lang) })} onPress={submit} loading={busy} />
              <Button title={t("cancel")} variant="secondary" onPress={onClose} />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}
