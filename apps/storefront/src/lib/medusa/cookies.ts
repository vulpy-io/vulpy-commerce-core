import { cookies } from "next/headers";

const MEDUSA_CART_COOKIE = "_medusa_cart_id";
const MEDUSA_JWT_COOKIE = "_medusa_jwt";

const COOKIE_SECURE = process.env.NODE_ENV === "production";

// Cross-site iframe embedding (Vulpy demo shell, admin panels) requires
// SameSite=None. That attribute is only valid on Secure cookies, so fall
// back to Lax in non-HTTPS (dev) contexts.
const COOKIE_SAME_SITE: "none" | "lax" = COOKIE_SECURE ? "none" : "lax";

export async function getCartId() {
  const cookieStore = await cookies();
  return cookieStore.get(MEDUSA_CART_COOKIE)?.value;
}

export async function setCartId(cartId: string) {
  const cookieStore = await cookies();
  cookieStore.set(MEDUSA_CART_COOKIE, cartId, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
    sameSite: COOKIE_SAME_SITE,
    secure: COOKIE_SECURE,
  });
}

export async function removeCartId() {
  const cookieStore = await cookies();
  cookieStore.delete(MEDUSA_CART_COOKIE);
}

export async function getAuthToken() {
  const cookieStore = await cookies();
  return cookieStore.get(MEDUSA_JWT_COOKIE)?.value;
}

export async function setAuthToken(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(MEDUSA_JWT_COOKIE, token, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
    sameSite: COOKIE_SAME_SITE,
    secure: COOKIE_SECURE,
  });
}

export async function removeAuthToken() {
  const cookieStore = await cookies();
  cookieStore.delete(MEDUSA_JWT_COOKIE);
}
