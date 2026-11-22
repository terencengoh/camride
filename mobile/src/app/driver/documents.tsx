// Driver/courier documents: photo or gallery upload to the private "driver-documents" Storage bucket
// (path <user id>/<type>-<timestamp>.jpg, enforced by Storage RLS) + a driver_documents row for review.
// Admins approve each document in the dashboard; when all required ones are approved the account is verified.
import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useState } from "react";
import { Text } from "react-native";
import { Button, Card, H1, Muted, Row, Screen } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { useI18n, type TKey } from "../../lib/i18n";
import { supabase } from "../../lib/supabase";
import { colors } from "../../lib/theme";
import type { DocStatus, DocType } from "../../lib/types";

const docPath = (uid: string, type: DocType, ext: string) => `${uid}/${type}-${Date.now()}.${ext}`;

const STATUS_COLOR = { missing: colors.muted, pending: colors.orange, approved: colors.green, rejected: colors.red } as const;

export default function DocumentsScreen() {
  const { t } = useI18n();
  const { session } = useAuth();
  const uid = session?.user.id ?? null;
  const [docs, setDocs] = useState<DocStatus[] | null>(null);
  const [busy, setBusy] = useState<DocType | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const fetchDocs = useCallback(async () => {
    const { data } = await supabase.rpc("driver_document_status");
    return ((data ?? []) as DocStatus[]).filter((d) => d.required || d.status !== "missing");
  }, []);
  useEffect(() => {
    let active = true;
    fetchDocs().then((d) => active && setDocs(d));
    return () => {
      active = false;
    };
  }, [fetchDocs]);

  const upload = async (type: DocType, source: "camera" | "library") => {
    if (!uid) return;
    setErr(null);
    if (source === "camera") {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return;
    }
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.6, allowsEditing: false, exif: false };
    const res = source === "camera" ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (res.canceled || !res.assets[0]) return;
    const asset = res.assets[0];
    setBusy(type);
    try {
      const contentType = asset.mimeType ?? "image/jpeg";
      const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
      const path = docPath(uid, type, ext);
      const body = await (await fetch(asset.uri)).arrayBuffer();
      const { error: upErr } = await supabase.storage.from("driver-documents").upload(path, body, { contentType, upsert: false });
      if (upErr) throw upErr;
      const { error: rowErr } = await supabase.from("driver_documents").insert({ driver_id: uid, doc_type: type, storage_path: path });
      if (rowErr) throw rowErr;
      setDocs(await fetchDocs());
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen>
      <H1>{t("documents")}</H1>
      <Muted>{t("docsHelp")}</Muted>
      {err ? <Text style={{ color: colors.red }}>{err}</Text> : null}
      {!docs ? <Muted>…</Muted> : null}
      {docs?.map((d) => (
        <Card key={d.doc_type}>
          <Row>
            <Text style={{ flex: 1, fontWeight: "800" }}>{t(`doc_${d.doc_type}` as TKey)}</Text>
            <Text style={{ fontWeight: "700", color: STATUS_COLOR[d.status] }}>{t(`ds_${d.status}` as TKey)}</Text>
          </Row>
          {d.status === "rejected" && d.reviewer_note ? <Muted>{d.reviewer_note}</Muted> : null}
          {d.status !== "approved" ? (
            busy === d.doc_type ? <Muted>{t("uploading")}</Muted> : (
              <Row>
                <Button title={t("takePhoto")} variant="secondary" onPress={() => upload(d.doc_type, "camera")} />
                <Button title={t("upload")} variant="secondary" onPress={() => upload(d.doc_type, "library")} />
              </Row>
            )
          ) : null}
        </Card>
      ))}
    </Screen>
  );
}
