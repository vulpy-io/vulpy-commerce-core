import { revalidatePath, revalidateTag } from "next/cache";
// Seed runs happen OUTSIDE a Next request; next/cache revalidatePath then
// throws "Invariant: static generation store missing". Guard so hooks are
// no-ops there (release defect #211 fix). In-request behavior is unchanged.
// Signatures mirror next/cache so existing call sites typecheck unchanged
// (revalidateTag may take an optional second arg in newer Next versions).
export function safeRevalidatePath(path: string, type?: "page" | "layout") {
  try { revalidatePath(path, type as never); } catch { /* no request ctx */ }
}
export function safeRevalidateTag(tag: string, profile?: string | Record<string, unknown>) {
  try { revalidateTag(tag, (profile ?? "max") as never); } catch { /* no request ctx */ }
}
