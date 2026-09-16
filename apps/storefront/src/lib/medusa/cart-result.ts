import type { HttpTypes } from "@medusajs/types";
import type { CartIssue } from "@/lib/medusa/cart-issues";

export type EnrichedCartResult = {
  cart: HttpTypes.StoreCart | null;
  issues: CartIssue[];
  checkoutBlocked: boolean;
};
