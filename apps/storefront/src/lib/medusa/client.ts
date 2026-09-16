import Medusa from "@medusajs/js-sdk";
import { cookies } from "next/headers";

const MEDUSA_BACKEND_URL = process.env.MEDUSA_BACKEND_URL ?? "";
const MEDUSA_PUBLISHABLE_KEY = process.env.MEDUSA_PUBLISHABLE_KEY ?? "";

const medusa = new Medusa({
  baseUrl: MEDUSA_BACKEND_URL,
  publishableKey: MEDUSA_PUBLISHABLE_KEY,
  // Server has no localStorage; default "nostore" means setToken() is a no-op and
  // authenticated store requests (e.g. customer.create after auth.register) fail.
  auth: {
    jwtTokenStorageMethod: "memory",
  },
});

export async function getMedusaClient() {
  const cookieStore = await cookies();
  const token = cookieStore.get("_medusa_jwt")?.value;

  if (token) {
    await medusa.client.setToken(token);
  } else {
    await medusa.client.clearToken();
  }

  return medusa;
}

// Separate instance that never reads cookies or sets an auth token. Safe to call
// inside `unstable_cache` (reading cookies there throws). The publishable key still
// carries sales-channel scope, so inventory/stock-aware responses are unaffected.
// Only use for public, customer-agnostic reads (e.g. /store/shop/catalog, region-only
// pricing). Never use for customer/cart/auth-scoped requests.
const publicMedusa = new Medusa({
  baseUrl: MEDUSA_BACKEND_URL,
  publishableKey: MEDUSA_PUBLISHABLE_KEY,
});

export function getPublicMedusaClient() {
  return publicMedusa;
}

export default medusa;
