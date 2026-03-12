import { useQuery } from "@tanstack/react-query";
import {
  fetchCollections,
  fetchCollectionByHandle,
  fetchFeaturedProducts,
  type ShopifyCollection,
  type ShopifyProduct,
} from "@/lib/shopify";

export function useCollections() {
  return useQuery<ShopifyCollection[]>({
    queryKey: ["shopify", "collections"],
    queryFn: () => fetchCollections(),
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });
}

export function useCollectionByHandle(handle: string) {
  return useQuery({
    queryKey: ["shopify", "collection", handle],
    queryFn: () => fetchCollectionByHandle(handle),
    enabled: !!handle,
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });
}

export function useFeaturedProducts() {
  return useQuery<ShopifyProduct[]>({
    queryKey: ["shopify", "featured-products"],
    queryFn: () => fetchFeaturedProducts(),
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });
}
