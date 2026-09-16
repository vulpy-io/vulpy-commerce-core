/** Strip display formatting so `tel:` links dial correctly (+ and digits only). */
export function toTelHref(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  return digits ? `tel:${digits}` : "tel:";
}
