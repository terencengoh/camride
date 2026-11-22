// All ten regions of Cameroon (regional capital = map centre) plus extra major cities.
// Same ids as the `cities` seed in supabase/seed.sql.
export interface Place {
  id: string;
  name: string;
  region: string;
  regionFr: string;
  lat: number;
  lng: number;
  capital: boolean;
}

export const PLACES: Place[] = [
  { id: "douala", name: "Douala", region: "Littoral", regionFr: "Littoral", lat: 4.0511, lng: 9.7679, capital: true },
  { id: "yaounde", name: "Yaoundé", region: "Centre", regionFr: "Centre", lat: 3.848, lng: 11.5021, capital: true },
  { id: "ngaoundere", name: "Ngaoundéré", region: "Adamawa", regionFr: "Adamaoua", lat: 7.3277, lng: 13.5847, capital: true },
  { id: "bertoua", name: "Bertoua", region: "East", regionFr: "Est", lat: 4.5772, lng: 13.6846, capital: true },
  { id: "maroua", name: "Maroua", region: "Far North", regionFr: "Extrême-Nord", lat: 10.5956, lng: 14.3247, capital: true },
  { id: "garoua", name: "Garoua", region: "North", regionFr: "Nord", lat: 9.3017, lng: 13.3921, capital: true },
  { id: "bamenda", name: "Bamenda", region: "Northwest", regionFr: "Nord-Ouest", lat: 5.9631, lng: 10.1591, capital: true },
  { id: "bafoussam", name: "Bafoussam", region: "West", regionFr: "Ouest", lat: 5.4781, lng: 10.4176, capital: true },
  { id: "ebolowa", name: "Ebolowa", region: "South", regionFr: "Sud", lat: 2.9, lng: 11.15, capital: true },
  { id: "buea", name: "Buea", region: "Southwest", regionFr: "Sud-Ouest", lat: 4.1527, lng: 9.241, capital: true },
  { id: "limbe", name: "Limbe", region: "Southwest", regionFr: "Sud-Ouest", lat: 4.0167, lng: 9.2, capital: false },
  { id: "kumba", name: "Kumba", region: "Southwest", regionFr: "Sud-Ouest", lat: 4.6363, lng: 9.4469, capital: false },
  { id: "kribi", name: "Kribi", region: "South", regionFr: "Sud", lat: 2.9395, lng: 9.91, capital: false },
  { id: "dschang", name: "Dschang", region: "West", regionFr: "Ouest", lat: 5.45, lng: 10.0667, capital: false },
  { id: "nkongsamba", name: "Nkongsamba", region: "Littoral", regionFr: "Littoral", lat: 4.9547, lng: 9.9404, capital: false },
];

export const DEFAULT_PLACE = PLACES[0]; // Douala

export const placeById = (id?: string | null): Place => PLACES.find((p) => p.id === id) ?? DEFAULT_PLACE;

export function inCameroon(lat: number, lng: number): boolean {
  return lat >= 1.6 && lat <= 13.1 && lng >= 8.4 && lng <= 16.25;
}

export function nearestPlace(lat: number, lng: number): Place {
  let best = DEFAULT_PLACE;
  let bestD = Infinity;
  for (const p of PLACES) {
    const d = (p.lat - lat) ** 2 + ((p.lng - lng) * Math.cos((lat * Math.PI) / 180)) ** 2;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}
