import { z } from "zod";
import { autoMockScenarioSchema, getCase, updateCase } from "@/lib/cases";
import { listSuppliers } from "@/lib/suppliers";
import { createTemporalClient } from "@/lib/temporal/client";
import { ensureCaseWorkflow } from "@/lib/temporal/start-case-workflow";

export const runtime = "nodejs";

const requestSchema = z.object({ enabled: z.boolean(), scenario: autoMockScenarioSchema });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Choose a response for every contact." }, { status: 400 });
  const suppliers = await listSuppliers();
  const current = await getCase(id);
  if (!current) return Response.json({ error: "Case not found." }, { status: 404 });
  const ids = new Set(suppliers.filter((supplier) => supplier.medicareEnrolled).map((supplier) => supplier.id));
  for (const call of current.coordination.calls) if (call.kind === "supplier") ids.add(call.targetId);
  if ([...ids].some((supplierId) => !parsed.data.scenario.suppliers[supplierId])) {
    return Response.json({ error: "Choose a response for every supplier." }, { status: 400 });
  }
  const result = await updateCase(id, (current) => ({
    next: {
      ...current,
      updatedAt: new Date().toISOString(),
      autoMock: { enabled: parsed.data.enabled, scenario: parsed.data.scenario, error: null },
    },
    result: { workflowId: current.coordination.workflowId, generation: current.generation },
  }));
  if (!result) return Response.json({ error: "Case not found." }, { status: 404 });

  if (parsed.data.enabled && result.workflowId) {
    try {
      const temporal = await createTemporalClient();
      try {
        const current = await getCase(id);
        if (current?.generation !== result.generation) return Response.json({ error: "The case was reset. Refresh and try again." }, { status: 409 });
        const started = await ensureCaseWorkflow(temporal.client, id);
        if (started && !started.started) await temporal.client.workflow.getHandle(started.workflowId).signal("case-updated");
      } finally {
        await temporal.close();
      }
    } catch (error) {
      console.error("Could not notify DME workflow of auto mock configuration", error);
      return Response.json({ error: "Scenario saved, but the workflow could not be notified. Restart the DME agent." }, { status: 503 });
    }
  }
  return Response.json({ enabled: parsed.data.enabled, scenario: parsed.data.scenario });
}
