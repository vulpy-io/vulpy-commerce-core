"use client";

import type { CartIssue } from "@/lib/medusa/cart-issues";
import { formatCartIssueMessages } from "@/lib/medusa/cart-issues";

export default function CartIssuesNotice({ issues }: { issues: CartIssue[] }) {
  const messages = formatCartIssueMessages(issues);

  if (!messages.length) {
    return null;
  }

  return (
    <div className="space-y-2">
      {messages.map((message) => (
        <div
          className="rounded-md border border-yellow-light-2 bg-yellow-light-4 px-4 py-3 text-content-primary text-sm"
          key={message}
        >
          {message}
        </div>
      ))}
    </div>
  );
}
