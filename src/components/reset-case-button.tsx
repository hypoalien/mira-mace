"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ResetCaseButton({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState("");

  async function reset() {
    if (resetting) return;
    setResetting(true);
    setError("");
    try {
      const response = await fetch(`/api/cases/${encodeURIComponent(caseId)}/reset`, { method: "POST" });
      if (!response.ok) throw new Error("Could not reset this case.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not reset this case.");
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-destructive" role="alert">{error}</span>}
      <Button type="button" variant="outline" size="xs" onClick={reset} disabled={resetting}>
        {resetting ? <LoaderCircle className="size-3 animate-spin" /> : <RotateCcw className="size-3" />}
        Reset case
      </Button>
    </div>
  );
}
