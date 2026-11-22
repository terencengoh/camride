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
  payment_method: PayMethod;
  payment_status: "unpaid" | "pending" | "paid" | "failed";
  created_at: string;
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
