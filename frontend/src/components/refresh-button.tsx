"use client";

import { useEffect, useRef, useState } from "react";

type RefreshButtonProps = {
  onRefresh: () => Promise<unknown>;
  className?: string;
  idleLabel?: string;
  refreshingLabel?: string;
  successLabel?: string;
};

export function RefreshButton({
  onRefresh,
  className = "ow-btn-secondary",
  idleLabel = "Refresh now",
  refreshingLabel = "Refreshing...",
  successLabel = "Updated",
}: RefreshButtonProps) {
  const [status, setStatus] = useState<"idle" | "refreshing" | "done">("idle");
  const resetTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimeoutRef.current != null) {
        window.clearTimeout(resetTimeoutRef.current);
      }
    };
  }, []);

  async function handleRefresh() {
    if (status == "refreshing") {
      return;
    }

    if (resetTimeoutRef.current != null) {
      window.clearTimeout(resetTimeoutRef.current);
      resetTimeoutRef.current = null;
    }

    setStatus("refreshing");

    try {
      await onRefresh();
      setStatus("done");
      resetTimeoutRef.current = window.setTimeout(() => {
        setStatus("idle");
        resetTimeoutRef.current = null;
      }, 1500);
    } catch {
      setStatus("idle");
    }
  }

  const label =
    status == "refreshing" ? refreshingLabel : status == "done" ? successLabel : idleLabel;

  return (
    <button
      type="button"
      onClick={() => void handleRefresh()}
      disabled={status == "refreshing"}
      className={className}
      aria-live="polite"
    >
      {label}
    </button>
  );
}
