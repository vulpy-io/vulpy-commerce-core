"use client";

import { RefreshRouteOnSave as PayloadRefreshRouteOnSave } from "@payloadcms/live-preview-react";
import { useRouter } from "next/navigation";

export default function RefreshRouteOnSave() {
  const router = useRouter();

  return (
    <PayloadRefreshRouteOnSave
      depth={2}
      refresh={() => router.refresh()}
      serverURL={process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3000"}
    />
  );
}
