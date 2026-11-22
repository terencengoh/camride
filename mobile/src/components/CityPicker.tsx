import { ScrollView } from "react-native";
import { useI18n } from "../lib/i18n";
import { type Place, PLACES } from "../lib/places";
import { Chip } from "./ui";

/** Horizontal list: the 10 regional capitals first, then extra cities. */
export function CityPicker({ value, onChange }: { value: string; onChange: (p: Place) => void }) {
  const { lang } = useI18n();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 4 }}>
      {PLACES.map((p) => (
        <Chip
          key={p.id}
          label={`${p.name}${p.capital ? " ★" : ""} · ${lang === "fr" ? p.regionFr : p.region}`}
          selected={p.id === value}
          onPress={() => onChange(p)}
        />
      ))}
    </ScrollView>
  );
}
