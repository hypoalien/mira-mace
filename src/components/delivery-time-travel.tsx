"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DeliverySlot } from "@/lib/cases";

export function DeliveryTimeTravel({ caseId, slot, inline = false }: { caseId: string; slot: DeliverySlot; inline?: boolean }) {
  const router = useRouter();
  const [advancing, setAdvancing] = useState(false);
  const [error, setError] = useState("");

  async function advance() {
    if (advancing) return;
    setAdvancing(true);
    setError("");
    try {
      const response = await fetch(`/api/cases/${encodeURIComponent(caseId)}/dme/travel-to-delivery`, { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Could not advance demo time.");
      if (body.warning) setError(body.warning);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not advance demo time.");
    } finally {
      setAdvancing(false);
    }
  }

  return (
    <div className={inline ? "rounded-md bg-muted/50 p-2 text-xs" : "max-w-[90%] rounded-lg border bg-muted/40 p-3 text-xs"}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Clock3 className="size-4 text-muted-foreground" aria-hidden="true" />
          <span>Booked delivery: {slot.window} ({slot.timeZone})</span>
        </div>
        <Button type="button" size="xs" variant="outline" disabled={advancing} onClick={advance}>
          {advancing ? "Advancing…" : "Travel to delivery window"}
        </Button>
      </div>
      {error && <p role="alert" className="mt-2 text-destructive">{error}</p>}
    </div>
  );
}
