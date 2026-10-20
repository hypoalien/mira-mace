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

/** Initial overview only; coordination statuses are not wired up yet. */
export function CaseStatusPanel({
  current,
  supplierCount,
}: {
  current: Case;
  supplierCount: number;
}) {
  const { patient, suppliersContacted } = current.intake;
  const intakeGaps = [
    !patient.phone && "Patient phone not provided",
    !patient.address && "Delivery address not provided",
  ].filter((value): value is string => Boolean(value));

  return (
    <div className="space-y-4 p-4">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <StatusItem name="PCP" value="Not contacted" />
        <StatusItem name="Written order" value="Not yet submitted" />
        <StatusItem name="Supplier outreach" value={`${suppliersContacted} of ${supplierCount} contacted`} />
        <StatusItem name="Evidence readiness" value="Not assessed" />
        <StatusItem name="Delivery" value="Not started" />
        <StatusItem name="Selected supplier" value="None" />
      </dl>

      <Separator />
      <section>
        <h3 className="text-sm font-semibold">Intake gaps</h3>
        {intakeGaps.length ? (
          <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-muted-foreground">
            {intakeGaps.map((gap) => <li key={gap}>{gap}</li>)}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">None recorded.</p>
        )}
      </section>
    </div>
  );
}
