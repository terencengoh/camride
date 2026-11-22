// Earnings wallet shared by drivers/couriers and restaurants: balance from the double-entry ledger
// (my_wallets / my_ledger), statement, payout history and a payout request to MTN / Orange money.
// Payouts are approved by an admin, then sent by the payouts-process Edge Function.
import { useCallback, useEffect, useState } from "react";
import { Text } from "react-native";
import { fcfa, shortDate } from "../lib/format";
import { useI18n, type TKey } from "../lib/i18n";
import { detectOperator, normalizeCmPhone } from "../lib/phone";
import { supabase } from "../lib/supabase";
import { colors } from "../lib/theme";
import type { LedgerLine, PayoutRequest, Wallet as WalletRow } from "../lib/types";
import { Button, Card, Chip, Field, Muted, Row } from "./ui";

interface Loaded { wallets: WalletRow[]; lines: LedgerLine[]; payouts: PayoutRequest[]; minPayout: number }

async function fetchWallet(kind: WalletRow["kind"]): Promise<Loaded> {
  const [{ data: wallets }, { data: setting }] = await Promise.all([
    supabase.rpc("my_wallets"),
    supabase.from("platform_settings").select("value").eq("key", "min_payout_xaf").maybeSingle(),
  ]);
  const mine = ((wallets ?? []) as WalletRow[]).filter((w) => w.kind === kind);
  const first = mine[0];
  const [{ data: lines }, { data: payouts }] = first
    ? await Promise.all([
      supabase.rpc("my_ledger", { p_account: first.account_id, p_limit: 50 }),
      supabase.from("payout_requests").select("id,amount_xaf,phone,method,status,review_note,created_at").eq("account_id", first.account_id)
        .order("created_at", { ascending: false }).limit(20),
    ])
    : [{ data: [] }, { data: [] }];
  return { wallets: mine, lines: (lines ?? []) as LedgerLine[], payouts: (payouts ?? []) as PayoutRequest[], minPayout: Number(setting?.value ?? 1000) };
}

export function Wallet({ kind }: { kind: WalletRow["kind"] }) {
  const { t, lang } = useI18n();
  const [data, setData] = useState<Loaded | null>(null);
  const [amount, setAmount] = useState("");
  const [phone, setPhone] = useState("");
  const [method, setMethod] = useState<"mtn" | "orange">("mtn");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => fetchWallet(kind).then(setData), [kind]);
  useEffect(() => {
    let active = true;
    fetchWallet(kind).then((d) => active && setData(d));
    return () => {
      active = false;
    };
  }, [kind]);

  if (!data) return <Muted>…</Muted>;
  const w = data.wallets[0];
  if (!w) return <Muted>{t("none")}</Muted>;
  const available = Number(w.balance_xaf);

  const request = async () => {
    setMsg(null);
    const n = normalizeCmPhone(phone);
    const value = parseInt(amount, 10);
    if (!n) return setMsg({ ok: false, text: t("badPhone") });
    const op = detectOperator(n);
    if (op !== method) return setMsg({ ok: false, text: t("wrongOperator", { op: op === "orange" ? "Orange Money" : op === "mtn" ? "MTN Mobile Money" : "?" }) });
    if (!Number.isInteger(value) || value < data.minPayout) return setMsg({ ok: false, text: t("minPayout", { amount: fcfa(data.minPayout, lang) }) });
    setBusy(true);
    const { error } = await supabase.rpc("request_payout", { p_account: w.account_id, p_amount: value, p_phone: n, p_method: method });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: error.message });
    setMsg({ ok: true, text: t("payoutRequested") });
    setAmount("");
    reload();
  };

  return (
    <>
      <Card>
        <Muted>{t("balance")}</Muted>
        <Text style={{ fontSize: 28, fontWeight: "900", color: available < 0 ? colors.red : colors.green }}>{fcfa(available, lang)}</Text>
        {Number(w.pending_payout_xaf) > 0 ? <Muted>{t("pendingPayout", { amount: fcfa(w.pending_payout_xaf, lang) })}</Muted> : null}
        {available < 0 ? <Muted>{t("cashOwedNote")}</Muted> : null}
      </Card>
      {available >= data.minPayout && Number(w.pending_payout_xaf) === 0 ? (
        <Card>
          <Text style={{ fontWeight: "800" }}>{t("requestPayout")}</Text>
          <Muted>{t("minPayout", { amount: fcfa(data.minPayout, lang) })}</Muted>
          <Row>
            <Chip label="MTN MoMo" accent={colors.mtn} selected={method === "mtn"} onPress={() => setMethod("mtn")} />
            <Chip label="Orange Money" accent={colors.orange} selected={method === "orange"} onPress={() => setMethod("orange")} />
          </Row>
          <Field label={t("amount")} keyboardType="number-pad" value={amount} onChangeText={setAmount} placeholder={String(available)} />
          <Field label={t("payoutPhone")} keyboardType="phone-pad" value={phone} onChangeText={setPhone} placeholder="6XX XXX XXX" />
          <Button title={t("requestPayout")} onPress={request} loading={busy} />
        </Card>
      ) : null}
      {msg ? <Text style={{ color: msg.ok ? colors.green : colors.red }}>{msg.text}</Text> : null}
      {data.payouts.length ? <Text style={{ fontSize: 18, fontWeight: "800" }}>{t("payouts")}</Text> : null}
      {data.payouts.map((p) => (
        <Row key={p.id}>
          <Text style={{ flex: 1 }}>{`${shortDate(p.created_at, lang)} · ${p.method.toUpperCase()} · ${t(`ps_${p.status}` as TKey)}`}</Text>
          <Text style={{ fontWeight: "700" }}>{fcfa(p.amount_xaf, lang)}</Text>
        </Row>
      ))}
      <Text style={{ fontSize: 18, fontWeight: "800" }}>{t("statement")}</Text>
      {data.lines.length === 0 ? <Muted>{t("none")}</Muted> : null}
      {data.lines.map((l) => (
        <Row key={l.entry_id}>
          <Text style={{ flex: 1 }}>{`${shortDate(l.created_at, lang)} · ${t(`tx_${l.kind}` as TKey)}`}</Text>
          <Text style={{ fontWeight: "700", color: Number(l.amount_xaf) < 0 ? colors.red : colors.green }}>
            {`${Number(l.amount_xaf) > 0 ? "+" : ""}${fcfa(l.amount_xaf, lang)}`}
          </Text>
        </Row>
      ))}
    </>
  );
}
