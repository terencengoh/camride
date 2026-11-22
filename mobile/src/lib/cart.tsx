import { createContext, type ReactNode, useContext, useMemo, useState } from "react";
import type { MenuItem } from "./types";

interface CartLine {
  item: MenuItem;
  quantity: number;
}

interface CartValue {
  restaurantId: string | null;
  lines: CartLine[];
  count: number;
  subtotal: number;
  add: (item: MenuItem) => void;
  remove: (itemId: string) => void;
  clear: () => void;
}

const CartContext = createContext<CartValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [lines, setLines] = useState<CartLine[]>([]);

  const value = useMemo<CartValue>(() => ({
    restaurantId,
    lines,
    count: lines.reduce((s, l) => s + l.quantity, 0),
    subtotal: lines.reduce((s, l) => s + l.quantity * l.item.price_xaf, 0),
    add: (item) => {
      // One restaurant per cart: adding from another restaurant starts a new cart.
      if (restaurantId && restaurantId !== item.restaurant_id) {
        setRestaurantId(item.restaurant_id);
        setLines([{ item, quantity: 1 }]);
        return;
      }
      setRestaurantId(item.restaurant_id);
      setLines((prev) => {
        const found = prev.find((l) => l.item.id === item.id);
        if (found) return prev.map((l) => (l.item.id === item.id ? { ...l, quantity: Math.min(50, l.quantity + 1) } : l));
        return [...prev, { item, quantity: 1 }];
      });
    },
    remove: (itemId) =>
      setLines((prev) => prev.flatMap((l) => (l.item.id !== itemId ? [l] : l.quantity > 1 ? [{ ...l, quantity: l.quantity - 1 }] : []))),
    clear: () => {
      setLines([]);
      setRestaurantId(null);
    },
  }), [restaurantId, lines]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}
