// Seed Team Store Products to Stripe
// Run with: npx tsx scripts/seed-products.ts

import { getUncachableStripeClient } from "../server/stripeClient";

interface ProductData {
  name: string;
  description: string;
  storeSlug: string;
  category: string;
  sizes: string[];
  price: number; // in cents
  image?: string;
}

const TEAM_STORE_PRODUCTS: ProductData[] = [
  // Manurewa Women's Rugby
  { name: "Home Jersey 2025", description: "Official match jersey", storeSlug: "manurewa-womens-rugby", category: "jersey", sizes: ["XS", "S", "M", "L", "XL", "2XL"], price: 8900 },
  { name: "Training Tee", description: "Breathable training top", storeSlug: "manurewa-womens-rugby", category: "training", sizes: ["XS", "S", "M", "L", "XL", "2XL"], price: 4500 },
  { name: "Club Hoodie", description: "Warm club hoodie", storeSlug: "manurewa-womens-rugby", category: "supporter", sizes: ["XS", "S", "M", "L", "XL", "2XL", "3XL"], price: 7500 },
  { name: "Match Shorts", description: "Official match shorts", storeSlug: "manurewa-womens-rugby", category: "jersey", sizes: ["XS", "S", "M", "L", "XL", "2XL"], price: 5500 },

  // Marist Samoa NZ RFC
  { name: "Match Jersey", description: "Official match jersey", storeSlug: "marist-samoa-nz-rfc", category: "jersey", sizes: ["S", "M", "L", "XL", "2XL", "3XL"], price: 9500 },
  { name: "Supporters Tee", description: "Show your support", storeSlug: "marist-samoa-nz-rfc", category: "supporter", sizes: ["S", "M", "L", "XL", "2XL", "3XL"], price: 4000 },
  { name: "Training Singlet", description: "Lightweight training singlet", storeSlug: "marist-samoa-nz-rfc", category: "training", sizes: ["S", "M", "L", "XL", "2XL"], price: 3500 },
  { name: "Club Cap", description: "Embroidered club cap", storeSlug: "marist-samoa-nz-rfc", category: "accessories", sizes: ["One Size"], price: 2900 },

  // American Samoa Tag
  { name: "Tag Jersey", description: "Official tag jersey", storeSlug: "american-samoa-tag", category: "jersey", sizes: ["XS", "S", "M", "L", "XL", "2XL"], price: 7500 },
  { name: "Training Tee", description: "Quick-dry training tee", storeSlug: "american-samoa-tag", category: "training", sizes: ["XS", "S", "M", "L", "XL", "2XL"], price: 4000 },
  { name: "Team Shorts", description: "Lightweight team shorts", storeSlug: "american-samoa-tag", category: "jersey", sizes: ["XS", "S", "M", "L", "XL", "2XL"], price: 4500 },
  { name: "Sports Bag", description: "Team kit bag", storeSlug: "american-samoa-tag", category: "accessories", sizes: ["One Size"], price: 5500 },

  // Mangere East Queenz
  { name: "Game Day Jersey", description: "Official match jersey", storeSlug: "mangere-east-queenz", category: "jersey", sizes: ["XS", "S", "M", "L", "XL", "2XL"], price: 9500 },
  { name: "Training Singlet", description: "Training singlet", storeSlug: "mangere-east-queenz", category: "training", sizes: ["XS", "S", "M", "L", "XL", "2XL"], price: 4500 },
  { name: "Supporters Hoodie", description: "Warm supporter hoodie", storeSlug: "mangere-east-queenz", category: "supporter", sizes: ["XS", "S", "M", "L", "XL", "2XL", "3XL"], price: 8500 },
  { name: "Team Shorts", description: "Match shorts", storeSlug: "mangere-east-queenz", category: "jersey", sizes: ["XS", "S", "M", "L", "XL", "2XL"], price: 5000 },
];

async function seedProducts() {
  console.log("Starting product seed...");
  
  const stripe = await getUncachableStripeClient();
  
  for (const productData of TEAM_STORE_PRODUCTS) {
    try {
      // Check if product already exists
      const existing = await stripe.products.search({
        query: `name:'${productData.name}' AND metadata['store_slug']:'${productData.storeSlug}'`
      });
      
      if (existing.data.length > 0) {
        console.log(`Product already exists: ${productData.name} (${productData.storeSlug})`);
        continue;
      }
      
      // Create product
      const product = await stripe.products.create({
        name: productData.name,
        description: productData.description,
        metadata: {
          store_slug: productData.storeSlug,
          category: productData.category,
          sizes: productData.sizes.join(","),
        },
      });
      
      // Create price for each size
      for (const size of productData.sizes) {
        await stripe.prices.create({
          product: product.id,
          unit_amount: productData.price,
          currency: "nzd",
          metadata: {
            size,
          },
        });
      }
      
      console.log(`Created: ${productData.name} (${productData.storeSlug}) with ${productData.sizes.length} size variants`);
    } catch (error: any) {
      console.error(`Error creating ${productData.name}:`, error.message);
    }
  }
  
  console.log("Product seed complete!");
}

seedProducts().catch(console.error);
