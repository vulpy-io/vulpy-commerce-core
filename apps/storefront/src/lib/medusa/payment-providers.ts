export function isSystemDefaultPayment(providerId: string) {
  return providerId.includes("system");
}

export function getPaymentProviderLabel(providerId: string) {
  if (providerId.includes("stripe")) {
    return "Card payment";
  }

  if (isSystemDefaultPayment(providerId)) {
    return "Cash on delivery";
  }

  return providerId.replace("pp_", "").replace(/_/g, " ");
}
