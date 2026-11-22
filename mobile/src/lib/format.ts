import type { Lang } from "./i18n";

/** 12500 -> "12 500 FCFA" (fr) / "12,500 FCFA" (en). */
export function fcfa(amount: number | null | undefined, lang: Lang): string {
  const n = Math.round(Number(amount ?? 0));
  const s = n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, lang === "fr" ? " " : ",");
  return `${s} FCFA`;
}

export function km(value: number | null | undefined, lang: Lang): string {
  const v = Number(value ?? 0).toFixed(1);
  return `${lang === "fr" ? v.replace(".", ",") : v} km`;
}

export function shortDate(iso: string, lang: Lang): string {
  const d = new Date(iso);
  const pad = (x: number) => String(x).padStart(2, "0");
  const date = lang === "fr" ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}` : `${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
  return `${date} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
