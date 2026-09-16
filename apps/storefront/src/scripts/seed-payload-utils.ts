export function stripPayloadManagedIds<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripPayloadManagedIds(item)) as T;
  }
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      if (key !== "id") { result[key] = stripPayloadManagedIds(child); }
    }
    return result as T;
  }
  return value;
}
