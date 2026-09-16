"use client";

import { Suspense } from "react";
import SearchTracker from "./SearchTracker";

export default function SearchAnalytics({
  keyword,
  resultCount,
  category,
}: {
  keyword: string;
  resultCount: number;
  category?: string | false;
}) {
  return (
    <Suspense fallback={null}>
      <SearchTracker
        category={category}
        keyword={keyword}
        resultCount={resultCount}
      />
    </Suspense>
  );
}
