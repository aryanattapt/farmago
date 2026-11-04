import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';
import type { Product } from '../lib/types';

type CartItem = Product & { quantity: number };
type CartState = {
  items: CartItem[];
  quantity: number;
  subtotal: number;
  changeQuantity: (product: Product, delta: number) => void;
};

const CartContext = createContext<CartState | null>(null);

export function CartProvider({ children }: PropsWithChildren) {
  // shortcut: cart resets when app closes, add persistence with native account support.
  const [items, setItems] = useState<CartItem[]>([]);
  const changeQuantity = useCallback((product: Product, delta: number) => {
    setItems((current) => {
      const found = current.find((item) => item.id === product.id);
      if (!found) return delta > 0 && product.available ? [...current, { ...product, quantity: delta }] : current;

      return current.flatMap((item) => {
        if (item.id !== product.id) return [item];
        const quantity = item.quantity + delta;
        return quantity > 0 ? [{ ...item, quantity }] : [];
      });
    });
  }, []);
  const value = useMemo(() => ({
    items,
    quantity: items.reduce((total, item) => total + item.quantity, 0),
    subtotal: items.reduce((total, item) => total + item.indicativePrice * item.quantity, 0),
    changeQuantity,
  }), [items, changeQuantity]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const value = useContext(CartContext);
  if (!value) throw new Error('useCart must be used inside CartProvider.');
  return value;
}
