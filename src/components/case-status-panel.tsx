import { StatusBadge } from "@/components/status-badge";
import { Separator } from "@/components/ui/separator";
import type { Case } from "@/lib/cases";
import { patientDetailsSchema } from "@/lib/patient-details";
import { getFulfillmentStage, hasValidSupplierDeliveryEvidence, hasValidPatientDeliveryConfirmation } from "@/lib/dme/fulfillment";
import { caseNowMs } from "@/lib/dme/demo-clock";

function StatusItem({ name, value }: { name: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{name}</dt>
      <dd className="mt-1">
        <StatusBadge value={value} className="h-auto min-h-5 max-w-full justify-start whitespace-normal break-words text-left" />
      </dd>
    </div>
  );
}

export function CaseStatusPanel({
  current,
  supplierCount,
}: {
  current: Case;
  supplierCount: number;
}) {
  const { calls, documents, patientDetails, selectedSupplierId, state } = current.coordination;
  const supplierCalls = calls.filter((call) => call.kind === "supplier" && call.purpose === "outreach");
  const pcpCalls = calls.filter((call) => call.kind === "pcp");
  const patientCalls = calls.filter((call) => call.kind === "patient" && call.purpose === "outreach");
  const pendingTaskCallIds = new Set(current.humanTasks.filter((task) => task.status === "pending").map((task) => task.callId));
  const confirmedPatientDetails = Object.entries(patientDetails ?? {}).filter(([, value]) => Boolean(value));
  const selected = supplierCalls.find((call) => call.targetId === selectedSupplierId);
  const pcpStatus = pcpCalls.some((call) => call.status === "awaiting_response") ? "Waiting for reply"
    : pcpCalls.some((call) => call.status === "scheduled") ? "Callback scheduled"
    : pcpCalls.some((call) => call.status === "escalated" && pendingTaskCallIds.has(call.id)) ? "Needs advocate"
    : pcpCalls.some((call) => call.status === "escalated") ? "Follow-up needed"
    : pcpCalls.length ? "Responded" : "Not contacted";
  const patientStatus = patientDetailsSchema.safeParse(patientDetails).success ? "Details confirmed"
    : patientCalls.some((call) => call.status === "awaiting_response") ? "Waiting for reply"
    : patientCalls.some((call) => call.status === "scheduled") ? "Callback scheduled"
    : patientCalls.some((call) => call.status === "escalated" && pendingTaskCallIds.has(call.id)) ? "Needs advocate"
    : patientCalls.some((call) => call.status === "escalated") ? "Follow-up needed"
    : confirmedPatientDetails.length > 0 ? "Some details confirmed"
    : "Not contacted";
  const { referralReview, offer, agreement, booking, notification, delivery } = current.fulfillment;
  const stage = getFulfillmentStage(current);

  return (
    <div className="space-y-4 p-4">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <StatusItem name="DME agent" value={state.replaceAll("_", " ")} />
        <StatusItem name="PCP" value={pcpStatus} />
        <StatusItem name="Patient" value={patientStatus} />
        <StatusItem name="Signed order" value={documents.some((document) => document.kind === "signed_order") ? "Received" : "Needed"} />
        <StatusItem name="Clinical records" value={documents.some((document) => document.kind === "clinical_records") ? "Received" : "Needed"} />
        <StatusItem name="Supplier outreach" value={`${supplierCalls.length} of ${supplierCount} called`} />
        <StatusItem name="Selected supplier" value={selected?.targetName ?? "None yet"} />
        <StatusItem name="Fulfillment" value={stage.replaceAll("_", " ")} />
      </dl>

      <Separator />
      <section className="space-y-2 text-xs">
        <h3 className="text-sm font-semibold">Fulfillment</h3>
        {state === "completed" && stage !== "completed" && <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-amber-950">This saved run used earlier evidence rules. Reset the case to replay it with the current checks.</p>}
        {current.demoClockOffsetMs > 0 && <p>Demo time: {new Date(caseNowMs(current)).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Chicago" })} Chicago time</p>}
        <p>Supplier referral review: {referralReview
          ? `${referralReview.signedOrderReceived ? "order received" : "order missing"}; ${referralReview.clinicalRecordsReceived ? "records received" : "records missing"}${referralReview.missingDocuments.length ? `; missing: ${referralReview.missingDocuments.join(", ")}` : ""}`
          : "Awaiting supplier confirmation of documents"}</p>
        <p>Supplier offer: {offer ? `${offer.manufacturer} ${offer.model} · ${offer.hcpcs} · ${offer.arrangement} · ${offer.costEstimate}; ${offer.rentalTerms}` : "Awaiting reviewed equipment, cost, terms, and delivery windows"}</p>
        {offer && <p>Requirements: authorization {offer.authorizationRequirement} ({offer.authorizationReady ? "resolved" : "open"}); advance notice {offer.advanceNoticeRequirement} ({offer.advanceNoticeReady ? "resolved" : "open"}); delivery address {offer.deliveryAddressServed ? "served" : "not confirmed"}</p>}
        {offer && <p>Offered windows: {offer.slots.map((slot) => `${slot.window} (${slot.timeZone})`).join("; ")}</p>}
        <p>Patient agreement: {agreement?.status ?? "Pending"}{agreement?.selectedSlotId ? ` · ${offer?.slots.find((slot) => slot.id === agreement.selectedSlotId)?.window ?? agreement.selectedSlotId}` : ""}</p>
        <p>Booking: {booking?.status ?? "Not requested"}{booking?.reference ? ` · ${booking.reference}` : ""}{booking?.instructions ? ` · ${booking.instructions}` : ""}</p>
        <p>Patient notification: {notification ? "Recorded" : "Pending"}</p>
        {notification && <p className="rounded-md border p-2 text-muted-foreground">{notification.message}</p>}
        <p>Delivery: supplier proof {hasValidSupplierDeliveryEvidence(current) ? `${delivery.supplierEvidence?.proofReference} · ${delivery.supplierEvidence?.equipmentDelivered} · ${delivery.supplierEvidence?.receiptStatus}` : delivery.supplierEvidence ? "reported; evidence needs re-verification" : "pending"}; patient confirmation {hasValidPatientDeliveryConfirmation(current) ? "correct equipment received and usable" : delivery.patientConfirmation ? "reported; needs recheck" : "pending"}</p>
      </section>

      <Separator />
      <section>
        <h3 className="text-sm font-semibold">Calls and responses</h3>
        {calls.length === 0 && <p className="mt-2 text-xs text-muted-foreground">Start the DME agent to review the intake and plan supplier, PCP, and patient calls.</p>}
        <div className="mt-2 space-y-2">
          {calls.map((call) => (
            <details key={call.id} className="rounded-lg border px-3 py-2 text-xs">
              <summary className="cursor-pointer font-medium">{call.targetName} · {call.purpose.replaceAll("_", " ")} · {call.status.replaceAll("_", " ")}{call.attempt > 1 ? ` · attempt ${call.attempt}` : ""}</summary>
              <p className="mt-2 text-muted-foreground">{call.reason}</p>
              {call.scheduledFor && <p className="mt-1 text-muted-foreground">Retry {new Date(call.scheduledFor).toLocaleString()}</p>}
              {call.attemptHistory.length > 0 && <ol className="mt-2 space-y-1 text-muted-foreground">{call.attemptHistory.map((attempt, index) => {
                const advocateResponse = attempt.outcome === "answered" && call.attemptHistory
                  .slice(0, index).some((prior) => prior.attempt === attempt.attempt && prior.outcome === "no_response");
                return <li key={`${attempt.recordedAt}-${index}`}>{advocateResponse ? "Advocate response" : `Attempt ${attempt.attempt}`}: {attempt.outcome === "no_response" ? "No answer" : attempt.outcome === "negative" ? "Could not help yet" : attempt.outcome === "blocked" ? "Needs advocate" : "Answered"}{attempt.detail ? ` · ${attempt.detail}` : ""}</li>;
              })}</ol>}
              {call.response?.issue && <p className="mt-2 text-muted-foreground">Response: {call.response.issue}</p>}
              {call.response && !call.response.issue && <ul className="mt-2 list-disc space-y-1 pl-4 text-muted-foreground">{call.questions.map((question, index) => <li key={index}>{question} <span className="text-foreground">{call.response?.answers[index]}</span></li>)}</ul>}
            </details>
          ))}
        </div>
      </section>
      {documents.length > 0 && (
        <>
          <Separator />
          <section>
            <h3 className="text-sm font-semibold">PCP documents</h3>
            <ul className="mt-2 space-y-1 text-xs">{documents.map((document) => <li key={document.kind}><a className="text-primary underline" href={document.path} target="_blank" rel="noreferrer">{document.name}</a></li>)}</ul>
          </section>
        </>
      )}
      {confirmedPatientDetails.length > 0 && (
        <>
          <Separator />
          <section className="space-y-1 text-xs">
            <h3 className="text-sm font-semibold">Confirmed patient details</h3>
            {confirmedPatientDetails.map(([field, value]) => <p key={field}>{field}: {value}</p>)}
          </section>
        </>
      )}
      {current.coordination.summary && (
        <>
          <Separator />
          <section><h3 className="text-sm font-semibold">Agent update</h3><p className="mt-2 text-xs leading-5 text-muted-foreground">{current.coordination.summary}</p></section>
        </>
      )}
    </div>
  );
}
