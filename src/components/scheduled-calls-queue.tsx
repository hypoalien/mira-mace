"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { Queue, QueueItem, QueueItemContent, QueueItemDescription, QueueItemIndicator, QueueList, QueueSection, QueueSectionContent, QueueSectionLabel, QueueSectionTrigger } from "@/components/ai-elements/queue";
import { Button } from "@/components/ui/button";
import type { CaseCall } from "@/lib/cases";

export function ScheduledCallsQueue({ caseId, calls }: { caseId: string; calls: CaseCall[] }) {
  const router = useRouter();
  const [runningId, setRunningId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const scheduled = calls.filter((call) => call.status === "scheduled" && call.scheduledFor);
  if (scheduled.length === 0) return null;

  async function runNow(callId: string) {
    setRunningId(callId);
    setError("");
    try {
      const response = await fetch(`/api/cases/${encodeURIComponent(caseId)}/dme/follow-up`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Could not run the follow-up.");
      if (body.warning) setError(body.warning);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not run the follow-up.");
      router.refresh();
    } finally {
      setRunningId(null);
    }
  }

  return (
    <Queue className="mt-3 text-xs">
      <QueueSection defaultOpen>
        <QueueSectionTrigger>
          <QueueSectionLabel icon={<CalendarClock className="size-3.5" />} label="scheduled callbacks" count={scheduled.length} />
        </QueueSectionTrigger>
        <QueueSectionContent>
          <QueueList>
            {scheduled.map((call) => (
              <QueueItem key={call.id}>
                <div className="flex items-start gap-2">
                  <QueueItemIndicator className="mt-1 shrink-0 border-violet-500 bg-violet-100" />
                  <QueueItemContent className="text-foreground">{call.targetName} · {call.purpose === "patient_arrangement" ? "rental approval and delivery window" : call.purpose === "patient_delivery" ? "delivery confirmation" : call.purpose === "outreach" ? "case details" : call.purpose.replaceAll("_", " ")} · attempt {call.attempt + 1}</QueueItemContent>
                </div>
                <QueueItemDescription className="flex items-center justify-between gap-2">
                  <span>Scheduled {new Date(call.scheduledFor!).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</span>
                  <Button type="button" variant="outline" size="xs" disabled={runningId !== null} onClick={() => runNow(call.id)}>
                    {runningId === call.id ? "Advancing…" : "Travel to follow-up"}
                  </Button>
                </QueueItemDescription>
              </QueueItem>
            ))}
          </QueueList>
          {error && <p role="alert" className="px-3 pt-2 text-xs text-destructive">{error}</p>}
        </QueueSectionContent>
      </QueueSection>
    </Queue>
  );
}
