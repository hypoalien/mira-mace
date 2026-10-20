"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Question, QuestionActions, QuestionDescription, QuestionOption, QuestionOptions, QuestionPrompt, QuestionSubmit, type QuestionValue } from "@/components/ai-elements/question";
import { Button } from "@/components/ui/button";
import { DeliveryTimeTravel } from "@/components/delivery-time-travel";
import type { CaseCall, DeliverySlot } from "@/lib/cases";

const purposeLabels: Record<CaseCall["purpose"], string> = {
  outreach: "Initial outreach",
  supplier_offer: "Cost, rental terms, and delivery options",
  patient_arrangement: "Rental approval and delivery window",
  supplier_booking: "Delivery booking",
  supplier_delivery: "Proof of delivery",
  patient_delivery: "Confirmation after delivery",
};

export function QuickResponseStack({ caseId, calls, deliveryTravelSlot }: { caseId: string; calls: CaseCall[]; deliveryTravelSlot: DeliverySlot | null }) {
  const router = useRouter();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, QuestionValue>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  if (calls.length === 0) return null;

  const index = Math.min(selectedIndex, calls.length - 1);
  const call = calls[index];
  const draftKey = `${call.id}:${call.attempt}`;

  async function submit(outcome: string) {
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`/api/cases/${encodeURIComponent(caseId)}/dme/quick-response`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callId: call.id, outcome }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Could not record the response.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not record the response.");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="max-w-[90%]" aria-label="Mock external responses">
      <div className="relative pb-3">
        {calls.length > 2 && <div aria-hidden="true" className="pointer-events-none absolute inset-x-5 top-3 bottom-0 rounded-lg border bg-muted/60" />}
        {calls.length > 1 && <div aria-hidden="true" className="pointer-events-none absolute inset-x-2.5 top-1.5 bottom-1.5 rounded-lg border bg-muted" />}
        <Question
          key={draftKey}
          selectionMode="single"
          disabled={submitting}
          value={drafts[draftKey] ?? { selectedValues: [], text: "" }}
          onValueChange={(value) => setDrafts((current) => ({ ...current, [draftKey]: value }))}
          className="relative z-10 space-y-3 p-3"
          onSubmit={({ selectedValues }) => submit(selectedValues[0])}
        >
          <QuestionPrompt>Mock the responses</QuestionPrompt>
          <QuestionDescription className="text-xs">{call.targetName} · {purposeLabels[call.purpose]} · Attempt {call.attempt}</QuestionDescription>
          {call.purpose === "supplier_delivery" && deliveryTravelSlot && <DeliveryTimeTravel caseId={caseId} slot={deliveryTravelSlot} inline />}
          <QuestionOptions aria-label={`Response from ${call.targetName}`}>
            <QuestionOption size="sm" value="positive" disabled={call.purpose === "supplier_delivery" && Boolean(deliveryTravelSlot)}>Positively</QuestionOption>
            <QuestionOption size="sm" value="negative">Negatively</QuestionOption>
            <QuestionOption size="sm" value="no_response">No response</QuestionOption>
          </QuestionOptions>
          <QuestionActions className="justify-between">
            <Link href={`/cases/${encodeURIComponent(caseId)}/external`} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground underline underline-offset-2">
              See questions and edit answers
            </Link>
            <QuestionSubmit size="sm">{submitting ? "Generating…" : "Record response"}</QuestionSubmit>
          </QuestionActions>
          {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
        </Question>
      </div>
      {calls.length > 1 && (
        <nav className="flex items-center justify-between px-1" aria-label="Pending response navigation">
          <Button type="button" size="xs" variant="ghost" disabled={submitting || index === 0} onClick={() => { setSelectedIndex(index - 1); setError(""); }} aria-label="Previous pending response">
            <ChevronLeft className="size-3.5" /> Back
          </Button>
          <span className="text-xs text-muted-foreground" aria-live="polite">{index + 1} of {calls.length}</span>
          <Button type="button" size="xs" variant="ghost" disabled={submitting || index === calls.length - 1} onClick={() => { setSelectedIndex(index + 1); setError(""); }} aria-label="Next pending response">
            Next <ChevronRight className="size-3.5" />
          </Button>
        </nav>
      )}
    </section>
  );
}
