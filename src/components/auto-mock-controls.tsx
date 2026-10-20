"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { AutoMockScenario, Case } from "@/lib/cases";

type Behavior = AutoMockScenario["pcp"][number];
type Attempts = [Behavior, Behavior, Behavior];
type Supplier = { id: string; name: string; medicareEnrolled: boolean };

function ScenarioSelect({ value, onChange, label }: { value: Behavior; onChange: (value: Behavior) => void; label: string }) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as Behavior)}>
      <SelectTrigger size="sm" className="w-40" aria-label={`${label} response`}><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="positive">Respond positively</SelectItem>
        <SelectItem value="negative">Respond negatively</SelectItem>
        <SelectItem value="no_response">No response</SelectItem>
      </SelectContent>
    </Select>
  );
}

function AttemptChoices({ attempts, onChange, label, supplier = false }: {
  attempts: Attempts;
  onChange: (attempts: Attempts) => void;
  label: string;
  supplier?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      {attempts.map((value, index) => {
        const priorAttempts = attempts.slice(0, index);
        if (priorAttempts.some((outcome) => outcome === "positive" || (supplier && outcome === "negative"))) return null;
        return (
          <div key={index} className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">Attempt {index + 1}</span>
            <ScenarioSelect value={value} label={`${label} attempt ${index + 1}`} onChange={(next) => {
              const updated = [...attempts] as Attempts;
              updated[index] = next;
              onChange(updated);
            }} />
          </div>
        );
      })}
    </div>
  );
}

export function AutoMockControls({ current, suppliers }: { current: Case; suppliers: Supplier[] }) {
  const router = useRouter();
  const supplierIds = new Set(suppliers.filter((supplier) => supplier.medicareEnrolled).map((supplier) => supplier.id));
  for (const call of current.coordination.calls) if (call.kind === "supplier") supplierIds.add(call.targetId);
  const scenarioSuppliers = suppliers.filter((supplier) => supplierIds.has(supplier.id));
  const defaultScenario: AutoMockScenario = {
    suppliers: Object.fromEntries(scenarioSuppliers.map((supplier) => [supplier.id, ["positive", "positive", "positive"]])),
    pcp: ["positive", "positive", "positive"], patient: ["positive", "positive", "positive"],
    fulfillment: {
      supplier_offer: ["positive", "positive", "positive"],
      patient_arrangement: ["positive", "positive", "positive"],
      supplier_booking: ["positive", "positive", "positive"],
      supplier_delivery: ["positive", "positive", "positive"],
      patient_delivery: ["positive", "positive", "positive"],
    },
  };
  const withCurrentSuppliers = (saved: AutoMockScenario | null): AutoMockScenario => saved
    ? { ...saved, suppliers: { ...defaultScenario.suppliers, ...saved.suppliers } }
    : defaultScenario;
  const [scenario, setScenario] = useState<AutoMockScenario>(withCurrentSuppliers(current.autoMock.scenario));
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const enabled = current.autoMock.enabled;
  const [error, setError] = useState("");

  async function save(nextEnabled: boolean, nextScenario = scenario) {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/cases/${encodeURIComponent(current.id)}/dme/auto-mock`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: nextEnabled, scenario: nextScenario }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Could not save the auto mock scenario.");
      setOpen(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the auto mock scenario.");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="flex items-center gap-1.5 rounded-lg border px-2 py-1">
        <Switch
          id={`auto-mock-${current.id}`}
          checked={enabled}
          disabled={saving}
          onCheckedChange={(next) => {
            if (next && !current.autoMock.scenario) { setOpen(true); return; }
            void save(next, withCurrentSuppliers(scenario));
          }}
          aria-label="Auto mock external responses"
        />
        <Label htmlFor={`auto-mock-${current.id}`} className="text-xs whitespace-nowrap">Auto mock</Label>
        <Button type="button" variant="ghost" size="icon-xs" aria-label="Configure auto mock scenario" title="Configure scenario" onClick={() => { setScenario(withCurrentSuppliers(current.autoMock.scenario)); setOpen(true); }}>
          <Settings2 className="size-3.5" />
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[min(760px,90dvh)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Auto mock scenario</DialogTitle>
            <DialogDescription>Configure each request separately. Attempts restart at 1 for each new request. An unanswered call retries tomorrow, up to three attempts; a supplier that cannot provide the wheelchair moves to the next supplier.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[55dvh] space-y-4 overflow-y-auto pr-1">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Initial outreach</p>
              {(["pcp", "patient"] as const).map((kind) => (
                <div key={kind} className="space-y-2 rounded-md border px-3 py-2">
                  <span className="text-sm font-medium">{kind === "pcp" ? `${current.intake.pcp.practice} (PCP)` : `${current.intake.patient.name} (patient)`}</span>
                  <AttemptChoices attempts={scenario[kind] as Attempts} label={kind} onChange={(attempts) => setScenario((previous) => ({ ...previous, [kind]: attempts }))} />
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">After a supplier is found</p>
              {([
                ["supplier_offer", "Supplier referral review, equipment, cost, and delivery windows"],
                ["patient_arrangement", "Patient rental approval and delivery window"],
                ["supplier_booking", "Supplier delivery booking"],
                ["supplier_delivery", "Supplier proof of delivery"],
                ["patient_delivery", "Patient confirmation after delivery"],
              ] as const).map(([purpose, label]) => (
                <div key={purpose} className="space-y-2 rounded-md border px-3 py-2">
                  <span className="text-sm font-medium">{label}</span>
                  <AttemptChoices attempts={scenario.fulfillment[purpose] as Attempts} label={label} onChange={(attempts) => setScenario((previous) => ({
                    ...previous, fulfillment: { ...previous.fulfillment, [purpose]: attempts },
                  }))} />
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Suppliers</p>
              {scenarioSuppliers.map((supplier) => (
                <div key={supplier.id} className="space-y-2 rounded-md border px-3 py-2">
                  <span className="min-w-0 text-sm font-medium">{supplier.name}</span>
                  <AttemptChoices supplier attempts={(scenario.suppliers[supplier.id] ?? ["positive", "positive", "positive"]) as Attempts} label={supplier.name} onChange={(attempts) => setScenario((previous) => ({ ...previous, suppliers: { ...previous.suppliers, [supplier.id]: attempts } }))} />
                </div>
              ))}
            </div>
          </div>
          {current.autoMock.error && <p role="alert" className="text-xs text-destructive">Auto mock stopped: {current.autoMock.error}</p>}
          {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="button" size="sm" disabled={saving} onClick={() => void save(enabled || !current.autoMock.scenario)}>
              {saving && <LoaderCircle className="size-3.5 animate-spin" />}
              {enabled || !current.autoMock.scenario ? "Save and enable" : "Save scenario"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
