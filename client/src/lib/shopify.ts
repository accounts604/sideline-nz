export interface ShopifyCollection {
  handle: string;
  title: string;
  description: string;
  image: { url: string; altText: string | null } | null;
}

export interface ShopifyProduct {
  id: string;
  handle: string;
  title: string;
  description: string;
  tags: string[];
  featuredImage: { url: string; altText: string | null } | null;
  priceRange: {
    minVariantPrice: { amount: string; currencyCode: string };
  };
  variants: {
    edges: {
      node: {
        id: string;
        title: string;
        availableForSale: boolean;
        price: { amount: string; currencyCode: string };
      };
    }[];
  };
}

export interface ShopifyCart {
  id: string;
  checkoutUrl: string;
}

export async function fetchCollections(): Promise<ShopifyCollection[]> {
  const res = await fetch("/api/shopify/collections");
  if (!res.ok) throw new Error("Failed to fetch collections");
  return res.json();
}

export async function fetchCollectionByHandle(handle: string): Promise<{
  collection: ShopifyCollection;
  products: ShopifyProduct[];
} | null> {
  const res = await fetch("/api/shopify/collections/" + encodeURIComponent(handle));
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to fetch collection");
  return res.json();
}

export async function fetchFeaturedProducts(): Promise<ShopifyProduct[]> {
  const res = await fetch("/api/shopify/products");
  if (!res.ok) throw new Error("Failed to fetch products");
  return res.json();
}

export function formatPrice(amount: string, currencyCode = "NZD"): string {
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: currencyCode,
  }).format(parseFloat(amount));
}
