import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";

export interface CartItem {
  id: string;
  productId: string;
  priceId: string;
  productName: string;
  productImage: string | null;
  size: string | null;
  quantity: number;
  unitAmount: number;
  currency: string;
}

interface CartState {
  id: string | null;
  storeSlug: string | null;
  items: CartItem[];
  subtotal: number;
  itemCount: number;
  isOpen: boolean;
  isLoading: boolean;
}

interface CartContextType extends CartState {
  openCart: () => void;
  closeCart: () => void;
  toggleCart: () => void;
  setStoreSlug: (slug: string) => void;
  addItem: (item: Omit<CartItem, "id">) => Promise<void>;
  updateQuantity: (itemId: string, quantity: number) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  checkout: () => Promise<string | null>;
  refreshCart: () => Promise<void>;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

// Generate or retrieve session ID
function getSessionId(): string {
  let sessionId = localStorage.getItem("cart_session_id");
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem("cart_session_id", sessionId);
  }
  return sessionId;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CartState>({
    id: null,
    storeSlug: null,
    items: [],
    subtotal: 0,
    itemCount: 0,
    isOpen: false,
    isLoading: false,
  });

  const sessionId = typeof window !== "undefined" ? getSessionId() : "";

  const refreshCart = useCallback(async () => {
    if (!state.storeSlug) return;
    
    setState(s => ({ ...s, isLoading: true }));
    
    try {
      const res = await fetch(`/api/cart?store=${state.storeSlug}`, {
        headers: { "x-session-id": sessionId },
      });
      
      if (res.ok) {
        const cart = await res.json();
        setState(s => ({
          ...s,
          id: cart.id,
          items: cart.items,
          subtotal: cart.subtotal,
          itemCount: cart.itemCount,
          isLoading: false,
        }));
      }
    } catch (e) {
      console.error("Failed to refresh cart:", e);
    } finally {
      setState(s => ({ ...s, isLoading: false }));
    }
  }, [state.storeSlug, sessionId]);

  // Fetch cart when store changes
  useEffect(() => {
    if (state.storeSlug) {
      refreshCart();
    }
  }, [state.storeSlug, refreshCart]);

  const setStoreSlug = useCallback((slug: string) => {
    setState(s => ({ ...s, storeSlug: slug }));
  }, []);

  const openCart = useCallback(() => {
    setState(s => ({ ...s, isOpen: true }));
  }, []);

  const closeCart = useCallback(() => {
    setState(s => ({ ...s, isOpen: false }));
  }, []);

  const toggleCart = useCallback(() => {
    setState(s => ({ ...s, isOpen: !s.isOpen }));
  }, []);

  const addItem = useCallback(async (item: Omit<CartItem, "id">) => {
    if (!state.storeSlug) return;
    
    setState(s => ({ ...s, isLoading: true }));
    
    try {
      const res = await fetch(`/api/cart/items?store=${state.storeSlug}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-id": sessionId,
        },
        body: JSON.stringify(item),
      });
      
      if (res.ok) {
        const cart = await res.json();
        setState(s => ({
          ...s,
          id: cart.id,
          items: cart.items,
          subtotal: cart.subtotal,
          itemCount: cart.itemCount,
          isOpen: true, // Open cart after adding
          isLoading: false,
        }));
      }
    } catch (e) {
      console.error("Failed to add item:", e);
    } finally {
      setState(s => ({ ...s, isLoading: false }));
    }
  }, [state.storeSlug, sessionId]);

  const updateQuantity = useCallback(async (itemId: string, quantity: number) => {
    try {
      await fetch(`/api/cart/items/${itemId}`, {
        method: "PATCH",
        headers: { 
          "Content-Type": "application/json",
          "x-session-id": sessionId,
        },
        body: JSON.stringify({ quantity }),
      });
      
      await refreshCart();
    } catch (e) {
      console.error("Failed to update quantity:", e);
    }
  }, [refreshCart, sessionId]);

  const removeItem = useCallback(async (itemId: string) => {
    try {
      await fetch(`/api/cart/items/${itemId}`, {
        method: "DELETE",
        headers: {
          "x-session-id": sessionId,
        },
      });
      
      await refreshCart();
    } catch (e) {
      console.error("Failed to remove item:", e);
    }
  }, [refreshCart, sessionId]);

  const checkout = useCallback(async (): Promise<string | null> => {
    if (!state.storeSlug || state.items.length === 0) return null;
    
    setState(s => ({ ...s, isLoading: true }));
    
    try {
      const res = await fetch(`/api/checkout?store=${state.storeSlug}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-id": sessionId,
        },
      });
      
      if (res.ok) {
        const { url } = await res.json();
        return url;
      }
      
      return null;
    } catch (e) {
      console.error("Checkout failed:", e);
      return null;
    } finally {
      setState(s => ({ ...s, isLoading: false }));
    }
  }, [state.storeSlug, state.items.length, sessionId]);

  return (
    <CartContext.Provider
      value={{
        ...state,
        openCart,
        closeCart,
        toggleCart,
        setStoreSlug,
        addItem,
        updateQuantity,
        removeItem,
        checkout,
        refreshCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within CartProvider");
  }
  return context;
}

export function formatPrice(cents: number, currency = "nzd"): string {
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}
