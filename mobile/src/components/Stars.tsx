import { Pressable, Text, View } from "react-native";

export function Stars({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "center", gap: 8, marginVertical: 8 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Pressable key={i} onPress={() => onChange(i)} accessibilityLabel={`${i}`} hitSlop={6}>
          <Text style={{ fontSize: 38, color: i <= value ? "#f5b800" : "#cfd6d1" }}>★</Text>
        </Pressable>
      ))}
    </View>
  );
}
