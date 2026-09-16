export default function medusaError(error: unknown): never {
  const err = error as {
    response?: { data?: { message?: string } | string; status?: number };
    request?: unknown;
    message?: string;
    config?: { url?: string; baseURL?: string };
  };

  if (err.response) {
    const responseData = err.response.data;
    const message =
      (typeof responseData === "object" &&
        responseData !== null &&
        "message" in responseData &&
        responseData.message) ||
      (typeof responseData === "string" ? responseData : null) ||
      "Request failed";
    const text = String(message);
    throw new Error(`${text.charAt(0).toUpperCase()}${text.slice(1)}.`);
  }

  if (err.request) {
    throw new Error("No response received from Medusa backend.");
  }

  throw new Error(err.message ?? "Unknown error");
}
