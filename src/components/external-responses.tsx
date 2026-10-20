"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Case, CaseCall } from "@/lib/cases";
import { DEMO_DOCUMENTS, MAX_CONTACT_ATTEMPTS } from "@/lib/dme-constants";
import { getFulfillmentStage } from "@/lib/dme/fulfillment";
import { FulfillmentResponseFields, type FulfillmentDraft } from "@/components/fulfillment-response-fields";
import { DeliveryTimeTravel } from "@/components/delivery-time-travel";
import { upcomingBookedDeliveryWindow } from "@/lib/dme/fulfillment";

const callKindLabel = { pcp: "PCP", supplier: "Supplier", patient: "Patient" };

function MockCallForm({ current, call, onSaved }: { current: Case; call: CaseCall; onSaved: () => void }) {
  const caseId = current.id;
  const [outcome, setOutcome] = useState<"answered" | "negative" | "no_response" | "blocked">("answered");
  const [issue, setIssue] = useState("");
  const [answers, setAnswers] = useState<string[]>(call.questions.map(() => ""));
  const [documents, setDocuments] = useState<string[]>(call.kind === "pcp" ? DEMO_DOCUMENTS.map((document) => document.kind) : []);
  const [accepts, setAccepts] = useState("");
  const [stock, setStock] = useState("");
  const [delivery, setDelivery] = useState("");
  const [enrollment, setEnrollment] = useState("");
  const [assignment, setAssignment] = useState("");
  const [serviceArea, setServiceArea] = useState("");
  const [saving, setSaving] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState("");
  const [fulfillment, setFulfillment] = useState<FulfillmentDraft>({});

  function setAnswer(index: number, value: string) {
    setAnswers((current) => current.map((answer, position) => position === index ? value : answer));
  }

  async function draftAnswers() {
    if (drafting || saving) return;
    setDrafting(true);
    setError("");
    try {
      const response = await fetch(`/api/cases/${encodeURIComponent(caseId)}/dme/draft-response`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callId: call.id }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Could not draft a mock response.");
      if (!Array.isArray(body.answers) || body.answers.length !== call.questions.length) throw new Error("The draft did not answer every question.");
      setAnswers(body.answers);
      if (call.purpose === "outreach" && call.kind === "supplier") {
        setAccepts(body.acceptsNewMedicare ? "yes" : "no");
        setStock(body.hasK0001 ? "yes" : "no");
        setDelivery(body.deliveryEstimate);
        setEnrollment(body.enrollmentConfirmed ? "yes" : "no");
        setAssignment(body.acceptsAssignment ? "yes" : "no");
        setServiceArea(body.servesArea ? "yes" : "no");
      }
      if (call.purpose !== "outreach") setFulfillment(body);
      setOutcome("answered");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not draft a mock response.");
    } finally {
      setDrafting(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const fulfillmentAnswers: Record<Exclude<CaseCall["purpose"], "outreach">, string[]> = {
      supplier_offer: [
        fulfillment.signedOrderReceived && fulfillment.clinicalRecordsReceived ? "Both documents received" : (fulfillment.missingDocuments ?? []).join("; ") || "Documents missing",
        fulfillment.deliveryAddressServed ? "Address served" : "Address not served",
        `${fulfillment.manufacturer ?? ""} ${fulfillment.model ?? ""}; ${fulfillment.hcpcs ?? ""}`,
        `${fulfillment.arrangement ?? ""}; ${fulfillment.authorizationRequirement ?? ""}; ${fulfillment.advanceNoticeRequirement ?? ""}`,
        fulfillment.costEstimate ?? "", fulfillment.rentalTerms ?? "", (fulfillment.deliveryWindows ?? []).filter(Boolean).join("; "),
      ],
      patient_arrangement: [fulfillment.agreementAccepted === undefined ? "" : fulfillment.agreementAccepted ? "Accepted" : "Declined", fulfillment.addressConfirmed === undefined && fulfillment.agreementAccepted ? "" : fulfillment.addressConfirmed ? "Confirmed" : "Not confirmed", fulfillment.agreementAccepted ? fulfillment.selectedSlotId ?? "" : "No window selected"],
      supplier_booking: [fulfillment.bookingConfirmed === undefined ? "" : fulfillment.bookingConfirmed ? `Confirmed: ${fulfillment.bookingReference ?? ""}; ${fulfillment.bookingInstructions ?? ""}` : "Booking rejected"],
      supplier_delivery: [fulfillment.delivered === undefined ? "" : fulfillment.delivered ? `Delivered ${fulfillment.equipmentDelivered ?? ""}; proof ${fulfillment.proofReference ?? ""}; ${fulfillment.receiptStatus ?? ""}; at ${fulfillment.deliveredAt ?? ""}` : "Not delivered"],
      patient_delivery: [fulfillment.patientConfirmed === undefined ? "" : fulfillment.patientConfirmed ? `Correct equipment received and ${fulfillment.usable ? "usable" : "not usable"}` : fulfillment.issue ?? ""],
    };
    const finalAnswers = call.purpose !== "outreach" ? fulfillmentAnswers[call.purpose] : call.kind === "supplier"
      ? answers.map((answer, index) => index === 0 ? (accepts === "yes" ? "Yes" : "No") : index === 1 ? (stock === "yes" ? "Yes" : "No") : index === 2 ? delivery.trim()
        : index === 3 ? (enrollment === "yes" ? "Yes" : "No") : index === 4 ? (assignment === "yes" ? "Yes" : "No")
        : index === 5 ? (serviceArea === "yes" ? "Yes" : "No") : answer.trim())
      : answers.map((answer) => answer.trim());
    if (outcome === "answered" && (finalAnswers.some((answer) => !answer) || (call.purpose === "outreach" && call.kind === "supplier" && (!accepts || !stock || !delivery.trim() || !enrollment || !assignment || !serviceArea)))) {
      setError("Answer every question before submitting.");
      return;
    }
    if ((outcome === "blocked" || outcome === "negative") && !issue.trim()) {
      setError(outcome === "blocked" ? "Describe what the care advocate needs to resolve." : "Describe why this contact cannot help yet.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/cases/${encodeURIComponent(caseId)}/dme/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callId: call.id,
          outcome,
          ...((outcome === "blocked" || outcome === "negative") ? { issue: issue.trim() } : {}),
          ...(outcome === "answered" ? {
            answers: finalAnswers,
            documents: call.purpose === "outreach" && call.kind === "pcp" ? documents : [],
            ...(call.purpose === "outreach" && call.kind === "supplier" ? { acceptsNewMedicare: accepts === "yes", hasK0001: stock === "yes", deliveryEstimate: delivery.trim(),
              enrollmentConfirmed: enrollment === "yes", acceptsAssignment: assignment === "yes", servesArea: serviceArea === "yes" } : {}),
            ...(call.purpose !== "outreach" ? { ...fulfillment, timeZone: fulfillment.timeZone ?? "America/Chicago" } : {}),
          } : {}),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Could not save the mock response.");
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the mock response.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1">
        <p className="text-sm font-medium">{call.targetName}</p>
        <p className="text-xs text-muted-foreground">{callKindLabel[call.kind]} · {call.purpose.replaceAll("_", " ")} · Attempt {call.attempt} · {call.reason}</p>
        {call.kind === "pcp" && call.supplierCallsAtStart.length > 0 && (
          <p className="text-xs text-muted-foreground">Supplier calls at PCP outreach: {call.supplierCallsAtStart.join(", ")}</p>
        )}
      </div>

      <Button type="button" variant="outline" size="sm" onClick={draftAnswers} disabled={drafting || saving} className="w-full">
        {drafting ? <LoaderCircle className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
        {drafting ? "Drafting mock answers…" : "Fill answers with AI"}
      </Button>
      <p className="text-xs text-muted-foreground">Review and edit the generated answers before saving.</p>

      <div className="space-y-1.5">
        <Label>Call outcome</Label>
        <Select value={outcome} onValueChange={(value) => setOutcome(value as "answered" | "negative" | "no_response" | "blocked")}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="answered">Answered</SelectItem>
            <SelectItem value="negative">{call.kind === "supplier" && call.purpose === "outreach" ? "Cannot fulfill — try next supplier" : "Cannot help — escalate"}</SelectItem>
            <SelectItem value="no_response">{call.attempt >= MAX_CONTACT_ATTEMPTS ? "No response — escalate" : "No response — retry tomorrow"}</SelectItem>
            <SelectItem value="blocked">Answered, but needs care advocate</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {outcome === "answered" && call.purpose !== "outreach" && (
        <FulfillmentResponseFields current={current} call={call} draft={fulfillment} onChange={(change) => setFulfillment((previous) => ({ ...previous, ...change }))} />
      )}
      {outcome === "answered" && call.purpose === "outreach" && (
        <>
          <div className="space-y-3">
            {call.questions.map((question, index) => (
              <div key={`${call.id}-${index}`} className="space-y-1.5">
                <Label htmlFor={`answer-${index}`}>{question}</Label>
                {call.kind === "supplier" && [0, 1, 3, 4, 5].includes(index) ? (
                  <Select value={index === 0 ? accepts : index === 1 ? stock : index === 3 ? enrollment : index === 4 ? assignment : serviceArea}
                    onValueChange={index === 0 ? setAccepts : index === 1 ? setStock : index === 3 ? setEnrollment : index === 4 ? setAssignment : setServiceArea}>
                    <SelectTrigger id={`answer-${index}`} className="w-full"><SelectValue placeholder="Select answer" /></SelectTrigger>
                    <SelectContent><SelectItem value="yes">Yes</SelectItem><SelectItem value="no">No</SelectItem></SelectContent>
                  </Select>
                ) : call.kind === "supplier" && index === 2 ? (
                  <Input id={`answer-${index}`} value={delivery} onChange={(event) => setDelivery(event.target.value)} placeholder="e.g. 3 business days" />
                ) : (
                  <Textarea id={`answer-${index}`} value={answers[index]} onChange={(event) => setAnswer(index, event.target.value)} rows={2} className="min-h-16 text-sm" />
                )}
              </div>
            ))}
          </div>
          {call.kind === "pcp" && (
            <div className="space-y-2 rounded-lg border p-3">
              <p className="text-xs font-medium">Attachments included by default</p>
              {DEMO_DOCUMENTS.map((document) => (
                <div key={document.kind} className="flex items-center gap-2">
                  <Checkbox
                    id={`doc-${document.kind}`}
                    checked={documents.includes(document.kind)}
                    onCheckedChange={(checked) => setDocuments((current) => checked ? [...current, document.kind] : current.filter((kind) => kind !== document.kind))}
                  />
                  <Label htmlFor={`doc-${document.kind}`} className="text-xs font-normal">{document.name}</Label>
                  <a href={document.path} target="_blank" rel="noreferrer" className="ml-auto text-xs text-primary underline">View</a>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {outcome === "no_response" && <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">{call.attempt >= MAX_CONTACT_ATTEMPTS ? "After three unanswered attempts, this call will be escalated to a care advocate." : "The call will be marked unanswered. Temporal will reopen this mock call tomorrow."}</p>}
      {outcome === "negative" && <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">{call.kind === "supplier" && call.purpose === "outreach" ? "This supplier will be marked unable to fulfill, and the agent can try the next one." : "This contact's response will be sent to the care advocate."}</p>}
      {(outcome === "blocked" || outcome === "negative") && (
        <div className="space-y-1.5">
          <Label htmlFor="call-issue">{outcome === "blocked" ? "What needs the advocate’s help?" : "Why can’t this contact help yet?"}</Label>
          <Textarea id="call-issue" value={issue} onChange={(event) => setIssue(event.target.value)} rows={3} />
        </div>
      )}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      <Button type="submit" size="sm" disabled={saving} className="w-full">
        {saving && <LoaderCircle className="size-3.5 animate-spin" />}
        Save response
      </Button>
    </form>
  );
}

export function ExternalResponses({ current }: { current: Case }) {
  const router = useRouter();
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<string[]>([]);
  const pending = current.coordination.calls.filter((call) =>
    call.status === "awaiting_response" && !submitted.includes(`${call.id}:${call.attempt}`),
  );
  const selected = pending.find((call) => call.id === selectedCallId) ?? pending[0];
  const deliveryTravelSlot = upcomingBookedDeliveryWindow(current);

  useEffect(() => {
    const timer = setInterval(() => router.refresh(), 1500);
    return () => clearInterval(timer);
  }, [router]);

  return (
    <div className="space-y-4">
      {deliveryTravelSlot && <DeliveryTimeTravel caseId={current.id} slot={deliveryTravelSlot} />}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">External responses</h2>
          <p className="text-sm text-muted-foreground">Simulate answers from the supplier, PCP, or patient. No external system is contacted.</p>
        </div>
        <p className="text-xs text-muted-foreground">{pending.length} pending</p>
      </div>

      {pending.length > 0 ? (
        <div className="space-y-4">
          {pending.length > 1 && (
            <div className="max-w-xl space-y-1.5">
              <Label htmlFor="pending-call">Pending call</Label>
              <Select value={selected?.id} onValueChange={setSelectedCallId}>
                <SelectTrigger id="pending-call" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {pending.map((call) => <SelectItem key={call.id} value={call.id}>{callKindLabel[call.kind]} · {call.purpose.replaceAll("_", " ")}: {call.targetName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {selected && (
            <Card className="max-w-2xl py-0">
              <CardContent className="p-5">
                <MockCallForm
                  key={`${selected.id}:${selected.attempt}`}
                  current={current}
                  call={selected}
                  onSaved={() => {
                    setSubmitted((previous) => [...previous, `${selected.id}:${selected.attempt}`]);
                    setSelectedCallId(null);
                    router.refresh();
                  }}
                />
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        <Card className="max-w-2xl">
          <CardContent className="py-8 text-sm text-muted-foreground">
            {getFulfillmentStage(current) === "completed"
              ? "Delivery is verified by supplier proof and patient confirmation. No responses remain."
              : "No responses to enter right now. This page will update when the agent queues another mock call."}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
