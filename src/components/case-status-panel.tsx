import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { Case } from "@/lib/cases";

function StatusItem({ name, value }: { name: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{name}</dt>
      <dd className="mt-1">
        <Badge
          variant="outline"
          className="h-auto min-h-5 max-w-full justify-start whitespace-normal break-words text-left"
        >
          {value}
        </Badge>
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
  const supplierCalls = calls.filter((call) => call.kind === "supplier");
  const pcpCalls = calls.filter((call) => call.kind === "pcp");
  const patientCalls = calls.filter((call) => call.kind === "patient");
  const confirmedPatientDetails = Object.entries(patientDetails ?? {}).filter(([, value]) => Boolean(value));
  const selected = supplierCalls.find((call) => call.targetId === selectedSupplierId);
  const pcpStatus = pcpCalls.some((call) => call.status === "awaiting_response") ? "Awaiting mock response"
    : pcpCalls.some((call) => call.status === "scheduled") ? "Callback scheduled"
    : pcpCalls.length ? "Responded" : "Not contacted";
  const patientStatus = confirmedPatientDetails.length === 6 ? "Details confirmed"
    : patientCalls.some((call) => call.status === "awaiting_response") ? "Awaiting mock response"
    : patientCalls.some((call) => call.status === "scheduled") ? "Callback scheduled"
    : confirmedPatientDetails.length > 0 ? "Some details confirmed"
    : "Not contacted";

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
      </dl>

      <Separator />
      <section>
        <h3 className="text-sm font-semibold">Outreach</h3>
        {calls.length === 0 && <p className="mt-2 text-xs text-muted-foreground">Start the DME agent to review the intake and plan supplier, PCP, and patient calls.</p>}
        <div className="mt-2 space-y-2">
          {calls.map((call) => (
            <details key={call.id} className="rounded-lg border px-3 py-2 text-xs">
              <summary className="cursor-pointer font-medium">{call.targetName} · {call.status.replaceAll("_", " ")}{call.attempt > 1 ? ` · attempt ${call.attempt}` : ""}</summary>
              <p className="mt-2 text-muted-foreground">{call.reason}</p>
              {call.scheduledFor && <p className="mt-1 text-muted-foreground">Retry {new Date(call.scheduledFor).toLocaleString()}</p>}
              {call.response && <ul className="mt-2 list-disc space-y-1 pl-4 text-muted-foreground">{call.questions.map((question, index) => <li key={index}>{question} <span className="text-foreground">{call.response?.answers[index]}</span></li>)}</ul>}
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
