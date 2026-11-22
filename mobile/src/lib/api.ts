// Typed wrappers around the Edge Functions. Prices are always computed server-side.
import { supabase } from "./supabase";
import type { LatLng, Order, PayMethod, Quote, RouteInfo, Trip, VehicleType } from "./types";

async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    // FunctionsHttpError carries the JSON body in `context`.
    let msg = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try {
        const j = await ctx.json();
        if (j?.error) msg = j.error;
      } catch {
        /* keep default message */
      }
    }
    throw new Error(msg);
  }
  return data as T;
}

type Place = LatLng & { address?: string };

export type PromoPreview = { code: string; discounts: Record<string, number> } | { code: string; error: string };
export interface QuoteResult { quotes: Quote[]; route: RouteInfo; promo?: PromoPreview }
export interface OrderQuote { subtotal_xaf: number; delivery_fee_xaf: number; discount_xaf: number; total_xaf: number }

export const api = {
  quote: (pickup: Place, dropoff: Place, promo_code?: string) =>
    invoke<QuoteResult>("request-ride", { pickup, dropoff, quote_only: true, promo_code: promo_code || undefined }),

  requestRide: (pickup: Place, dropoff: Place, vehicle_type: VehicleType, payment_method: PayMethod, promo_code?: string) =>
    invoke<{ trip: Trip; match: { status: string } }>("request-ride", { pickup, dropoff, vehicle_type, payment_method, promo_code: promo_code || undefined }),

  rematch: (target: { trip_id: string } | { order_id: string }) => invoke<{ status: string }>("match-driver", target),

  quoteOrder: (restaurant_id: string, items: { menu_item_id: string; quantity: number }[], delivery: Place, payment_method: PayMethod, promo_code?: string) =>
    invoke<OrderQuote>("create-order", { restaurant_id, items, delivery, payment_method, promo_code: promo_code || undefined, quote_only: true }),

  createOrder: (restaurant_id: string, items: { menu_item_id: string; quantity: number }[], delivery: Place, payment_method: PayMethod, promo_code?: string) =>
    invoke<{ order: Order }>("create-order", { restaurant_id, items, delivery, payment_method, promo_code: promo_code || undefined }),

  pay: (target: { trip_id: string } | { order_id: string }, method: "mtn" | "orange", phone: string) =>
    invoke<{ payment_id: string; status: string; ussd_code?: string; checkout_url?: string | null }>("payments-initiate", { ...target, method, phone }),
};
