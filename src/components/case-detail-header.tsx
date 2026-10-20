import { StatusBadge } from "@/components/status-badge";
import { ResetCaseButton } from "@/components/reset-case-button";
import { DmeControls } from "@/components/dme-controls";
import { AutoMockControls } from "@/components/auto-mock-controls";
import type { Case } from "@/lib/cases";
import type { AwaitedSuppliers } from "@/lib/suppliers";

function formatTime(value: string) {
  return (
    new Date(value).toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }) + " UTC"
  );
}

export function CaseDetailHeader({ current, suppliers }: { current: Case; suppliers: AwaitedSuppliers }) {
  const { patient, equipment, pcp } = current.intake;
  const patientDetails = current.coordination.patientDetails;

  return (
    <header className="border-b pb-3">
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{patient.name}</h1>
          <StatusBadge value={current.status} className="px-2.5 py-1 font-semibold" />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <p className="text-xs text-muted-foreground">Created {formatTime(current.createdAt)}</p>
          <DmeControls current={current} />
          <AutoMockControls current={current} suppliers={suppliers} />
          <ResetCaseButton caseId={current.id} />
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <span><span className="text-muted-foreground">Age</span> {patient.age}</span>
        <span><span className="text-muted-foreground">Phone</span> {patientDetails?.phone ?? "Not confirmed"}</span>
        <span><span className="text-muted-foreground">Address</span> {patientDetails?.address ?? "Not confirmed"}</span>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-3 lg:grid-cols-[1.15fr_1.35fr_1.75fr]">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Insurance</dt>
          <dd className="mt-1 text-sm font-medium">{patient.insurance}</dd>
          <dd className="mt-1 text-xs text-muted-foreground">{patient.hasSupplement ? "Supplemental coverage" : "No supplemental plan"}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Equipment</dt>
          <dd className="mt-1 text-sm font-medium">{equipment.name}</dd>
          <dd className="mt-1 text-xs text-muted-foreground">HCPCS: {equipment.hcpcs}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">PCP</dt>
          <dd className="mt-1 text-sm font-medium">{pcp.name}</dd>
          <dd className="mt-1 text-xs text-muted-foreground">{pcp.practice} · {pcp.location} · {pcp.phone}</dd>
        </div>
      </dl>

      <blockquote className="mt-3 flex flex-wrap gap-x-3 gap-y-1 rounded-lg border-l-2 border-primary/50 bg-muted/40 px-3 py-2">
        <span className="shrink-0 pt-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Intake status</span>
        <p className="min-w-0 flex-1 text-sm">{pcp.notes}</p>
      </blockquote>
    </header>
  );
}
