"use client";

import { Suspense } from "react";
import AnalyticsProviders from "./AnalyticsProviders";
import PageViewTracker from "./PageViewTracker";

export default function AnalyticsRoot({
  children,
  skipPageView = false,
}: {
  children: React.ReactNode;
  skipPageView?: boolean;
}) {
  return (
    <AnalyticsProviders>
      <Suspense fallback={null}>
        <PageViewTracker skip={skipPageView} />
      </Suspense>
      {children}
    </AnalyticsProviders>
  );
}
