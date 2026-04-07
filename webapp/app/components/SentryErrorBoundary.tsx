"use client";

import * as Sentry from "@sentry/nextjs";

export function SentryErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <Sentry.ErrorBoundary fallback={<p className="p-8 text-sm text-gray-500">Something went wrong.</p>}>
      {children}
    </Sentry.ErrorBoundary>
  );
}
