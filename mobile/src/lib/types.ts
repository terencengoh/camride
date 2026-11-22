export type Role = "rider" | "driver" | "courier" | "restaurant" | "admin";
export type VehicleType = "moto" | "car" | "comfort";
export type PayMethod = "mtn" | "orange" | "cash";
export type TripStatus = "requested" | "offered" | "accepted" | "arrived" | "in_progress" | "completed" | "cancelled" | "no_drivers";
export type OrderStatus = "pending_payment" | "placed" | "accepted" | "preparing" | "ready" | "picked_up" | "delivered" | "cancelled";

export interface Profile {
  id: string;
  full_name: string | null;
  phone: string | null;
  role: Role;
  city_id: string | null;
  lang: "fr" | "en";
}

export interface Trip {
  id: string;
  rider_id: string;
  driver_id: string | null;
  offered_driver_id: string | null;
  offer_expires_at: string | null;
  vehicle_type: VehicleType;
  status: TripStatus;
  pickup_lat: number;
  pickup_lng: number;
  pickup_address: string | null;
  dropoff_lat: number;
  dropoff_lng: number;
  dropoff_address: string | null;
  distance_km: number;
  duration_min: number;
  fare_xaf: number;
  discount_xaf: number;
  amount_due_xaf: number;
  promo_code: string | null;
  route_polyline: string | null;
  route_source: "osrm" | "estimate" | null;
  share_token: string;
  payment_method: PayMethod;
  payment_status: "unpaid" | "pending" | "paid" | "failed";
  created_at: string;
  completed_at?: string | null;
}

export interface Order {
  id: string;
  customer_id: string;
  restaurant_id: string;
  courier_id: string | null;
  offered_courier_id: string | null;
  status: OrderStatus;
  delivery_lat: number;
  delivery_lng: number;
  delivery_address: string | null;
  distance_km: number;
  subtotal_xaf: number;
  delivery_fee_xaf: number;
  total_xaf: number;
  discount_xaf: number;
  promo_code: string | null;
  payment_method: PayMethod;
  payment_status: "unpaid" | "pending" | "paid" | "failed";
  created_at: string;
}

export interface DriverRow {
  id: string;
  vehicle_type: VehicleType;
  is_courier: boolean;
  status: "offline" | "available" | "busy";
  lat: number | null;
  lng: number | null;
  heading: number | null;
  documents_verified: boolean;
  rating_avg: number;
}

export interface Quote {
  vehicle_type: VehicleType;
  distance_km: number;
  duration_min: number;
  fare_xaf: number;
}

export interface RestaurantNear {
  id: string;
  name: string;
  city_id: string;
  tags: string | null;
  emoji: string | null;
  is_open: boolean;
  lat: number;
  lng: number;
  distance_km: number;
  delivery_fee_xaf: number;
}

export interface MenuItem {
  id: string;
  restaurant_id: string;
  name: string;
  name_fr: string | null;
  description: string | null;
  description_fr: string | null;
  price_xaf: number;
  available: boolean;
}

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RouteInfo {
  polyline: string;
  source: "osrm" | "estimate";
}

export interface Wallet {
  account_id: string;
  kind: "driver_wallet" | "restaurant_wallet";
  restaurant_id: string | null;
  label: string;
  balance_xaf: number;
  pending_payout_xaf: number;
}

export interface LedgerLine {
  entry_id: number;
  created_at: string;
  kind: string;
  memo: string | null;
  amount_xaf: number;
  trip_id: string | null;
  order_id: string | null;
}

export interface PayoutRequest {
  id: string;
  amount_xaf: number;
  phone: string;
  method: "mtn" | "orange";
  status: "requested" | "approved" | "processing" | "paid" | "failed" | "rejected";
  review_note: string | null;
  created_at: string;
}

export type DocType = "id_card" | "driving_licence" | "vehicle_registration" | "insurance" | "profile_photo";

export interface DocStatus {
  doc_type: DocType;
  required: boolean;
  status: "missing" | "pending" | "approved" | "rejected";
  reviewer_note: string | null;
}
