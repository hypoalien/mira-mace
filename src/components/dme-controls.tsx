"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Bot, LoaderCircle, PhoneCall } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Case, CaseCall } from "@/lib/cases";
import { DEMO_DOCUMENTS } from "@/lib/dme-constants";

const callKindLabel = { pcp: "PCP", supplier: "Supplier", patient: "Patient" };

function MockCallForm({ caseId, call, onSaved }: { caseId: string; call: CaseCall; onSaved: () => void }) {
  const [outcome, setOutcome] = useState<"answered" | "no_response">("answered");
  const [answers, setAnswers] = useState<string[]>(call.questions.map(() => ""));
  const [documents, setDocuments] = useState<string[]>(call.kind === "pcp" ? DEMO_DOCUMENTS.map((document) => document.kind) : []);
  const [accepts, setAccepts] = useState("");
  const [stock, setStock] = useState("");
  const [delivery, setDelivery] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function setAnswer(index: number, value: string) {
    setAnswers((current) => current.map((answer, position) => position === index ? value : answer));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const finalAnswers = call.kind === "supplier"
      ? answers.map((answer, index) => index === 0 ? (accepts === "yes" ? "Yes" : "No") : index === 1 ? (stock === "yes" ? "Yes" : "No") : index === 2 ? delivery.trim() : answer.trim())
      : answers.map((answer) => answer.trim());
    if (outcome === "answered" && (finalAnswers.some((answer) => !answer) || (call.kind === "supplier" && (!accepts || !stock || !delivery.trim())))) {
      setError("Answer every question before submitting.");
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
          ...(outcome === "answered" ? {
            answers: finalAnswers,
            documents: call.kind === "pcp" ? documents : [],
            ...(call.kind === "supplier" ? { acceptsNewMedicare: accepts === "yes", hasK0001: stock === "yes", deliveryEstimate: delivery.trim() } : {}),
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
        <p className="text-xs text-muted-foreground">{callKindLabel[call.kind]} · Attempt {call.attempt} · {call.reason}</p>
        {call.kind === "pcp" && call.supplierCallsAtStart.length > 0 && (
          <p className="text-xs text-muted-foreground">Supplier calls at PCP outreach: {call.supplierCallsAtStart.join(", ")}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>Call outcome</Label>
        <Select value={outcome} onValueChange={(value) => setOutcome(value as "answered" | "no_response")}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="answered">Answered</SelectItem>
            <SelectItem value="no_response">No response — retry tomorrow</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {outcome === "answered" && (
        <>
          <div className="space-y-3">
            {call.questions.map((question, index) => (
              <div key={`${call.id}-${index}`} className="space-y-1.5">
                <Label htmlFor={`answer-${index}`}>{question}</Label>
                {call.kind === "supplier" && index < 2 ? (
                  <Select value={index === 0 ? accepts : stock} onValueChange={index === 0 ? setAccepts : setStock}>
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

      {outcome === "no_response" && <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">The call will be marked unanswered. Temporal will reopen this mock call tomorrow.</p>}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      <Button type="submit" size="sm" disabled={saving} className="w-full">
        {saving && <LoaderCircle className="size-3.5 animate-spin" />}
        Save response
      </Button>
    </form>
  );
}

export function DmeControls({ current }: { current: Case }) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [open, setOpen] = useState(false);
  const seenPending = useRef(new Set<string>());
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const pending = useMemo(() => current.coordination.calls.filter((call) => call.status === "awaiting_response"), [current.coordination.calls]);
  const unfinished = current.coordination.calls.some((call) => call.status !== "completed");
  const needsPatientContact = Object.keys(current.coordination.patientDetails ?? {}).length < 6 && current.coordination.state === "ready";
  const selected = pending.find((call) => call.id === selectedCallId) ?? pending[0];
  const pendingKey = pending.map((call) => `${call.id}:${call.attempt}`).join("|");

  useEffect(() => {
    const fresh = pending.find((call) => !seenPending.current.has(`${call.id}:${call.attempt}`));
    for (const call of pending) seenPending.current.add(`${call.id}:${call.attempt}`);
    if (fresh) {
      setSelectedCallId(fresh.id);
      setOpen(true);
    }
  }, [pendingKey, pending]);

  useEffect(() => {
    if (open || !current.coordination.workflowId || (current.coordination.state === "ready" && !unfinished) || current.coordination.state === "blocked" || current.coordination.state === "error") return;
    const timer = setInterval(() => router.refresh(), 2500);
    return () => clearInterval(timer);
  }, [current.coordination.workflowId, current.coordination.state, unfinished, open, router]);

  async function start() {
    if (starting) return;
    setStarting(true);
    setError("");
    try {
      const response = await fetch(`/api/cases/${encodeURIComponent(current.id)}/dme/start`, { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Could not start the DME agent.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start the DME agent.");
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {error && <span role="alert" className="text-xs text-destructive">{error}</span>}
      {current.coordination.state === "running" && (
        <span role="status" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <LoaderCircle className="size-3 animate-spin" aria-hidden="true" /> Agent working
        </span>
      )}
      {(!current.coordination.workflowId || current.coordination.state === "error" || needsPatientContact) && (
        <Button type="button" size="xs" onClick={start} disabled={starting}>
          {starting ? <LoaderCircle className="size-3 animate-spin" /> : <Bot className="size-3" />}
          {current.coordination.state === "error" ? "Restart DME agent" : needsPatientContact ? "Continue DME agent" : "Start DME agent"}
        </Button>
      )}
      {pending.length > 0 && (
        <Button type="button" variant="outline" size="xs" onClick={() => setOpen(true)}>
          <PhoneCall className="size-3" />
          Simulate external responses ({pending.length})
        </Button>
      )}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-xl">
          <SheetHeader className="border-b pr-12">
            <SheetTitle>Simulate external response</SheetTitle>
            <SheetDescription>Enter what the PCP, supplier, or patient said. These are mock calls; no external system is contacted.</SheetDescription>
          </SheetHeader>
          <div className="space-y-4 p-4">
          {pending.length > 1 && (
            <div className="space-y-1.5">
              <Label>Pending call</Label>
              <Select value={selected?.id} onValueChange={setSelectedCallId}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{pending.map((call) => <SelectItem key={call.id} value={call.id}>{callKindLabel[call.kind]}: {call.targetName}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          {selected && <MockCallForm key={selected.id} caseId={current.id} call={selected} onSaved={() => { setOpen(false); setSelectedCallId(null); router.refresh(); }} />}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
