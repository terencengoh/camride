import { useEffect, useState } from "react";
import { supabase } from "./supabase";

/**
 * Loads one row and keeps it live via Supabase Realtime (postgres_changes, RLS-aware).
 * Pass id = null to pause.
 */
export function useRealtimeRow<T extends { id: string }>(table: string, id: string | null, columns = "*"): { row: T | null; reload: () => void } {
  const [state, setState] = useState<{ id: string; row: T } | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!id) return;
    let active = true;
    supabase.from(table).select(columns).eq("id", id).maybeSingle().then(({ data }) => {
      if (active && data) setState({ id, row: data as unknown as T });
    });
    const channel = supabase
      .channel(`${table}:${id}:${nonce}`)
      .on("postgres_changes", { event: "*", schema: "public", table, filter: `id=eq.${id}` }, (payload) => {
        if (payload.new && Object.keys(payload.new).length) {
          setState((prev) => ({ id, row: { ...(prev?.id === id ? prev.row : {}), ...(payload.new as T) } }));
        }
      })
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [table, id, columns, nonce]);

  return { row: id && state?.id === id ? state.row : null, reload: () => setNonce((n) => n + 1) };
}

/**
 * Rows where `column = value` (optionally limited to some statuses), newest first,
 * reloaded whenever a matching row changes. Pass value = null to pause.
 */
export function useRealtimeQuery<T>(table: string, column: string, value: string | null, statuses?: readonly string[]): T[] {
  const [state, setState] = useState<{ key: string; rows: T[] } | null>(null);
  const statusKey = statuses?.join(",") ?? "";
  useEffect(() => {
    if (!value) return;
    const key = `${value}|${statusKey}`;
    let active = true;
    const load = async () => {
      let q = supabase.from(table).select("*").eq(column, value);
      if (statusKey) q = q.in("status", statusKey.split(","));
      const { data } = await q.order("created_at", { ascending: false }).limit(50);
      if (active) setState({ key, rows: (data ?? []) as T[] });
    };
    load();
    const channel = supabase
      .channel(`${table}:${column}:${value}:${statusKey}`)
      .on("postgres_changes", { event: "*", schema: "public", table, filter: `${column}=eq.${value}` }, () => load())
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [table, column, value, statusKey]);
  return value && state?.key === `${value}|${statusKey}` ? state.rows : EMPTY;
}

const EMPTY: never[] = [];
