const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  processing: "Processing",
  completed: "Completed",
  delivered: "Delivered",
  canceled: "Cancelled",
  cancelled: "Cancelled",
  archived: "Archived",
  requires_action: "Action required",
  on_hold: "On hold",
};

export function formatOrderDate(value?: string | Date | null) {
  if (!value) {
    return "—";
  }

  return new Date(value).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function translateOrderStatus(status?: string | null) {
  if (!status) {
    return "—";
  }

  const normalized = status.toLowerCase();
  return ORDER_STATUS_LABELS[normalized] ?? status;
}

export function getOrderStatusClass(status?: string | null) {
  const normalized = status?.toLowerCase() ?? "";

  if (normalized === "completed" || normalized === "delivered") {
    return "bg-green-light-6 text-green";
  }

  if (
    normalized === "canceled" ||
    normalized === "cancelled" ||
    normalized === "archived"
  ) {
    return "bg-red-light-6 text-status-danger";
  }

  if (
    normalized === "pending" ||
    normalized === "processing" ||
    normalized === "requires_action"
  ) {
    return "bg-yellow-light-4 text-yellow";
  }

  return "bg-gray-1 text-content-muted";
}
