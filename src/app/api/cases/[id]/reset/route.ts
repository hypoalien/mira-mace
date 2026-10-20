import { resetCase } from "@/lib/cases";
import { getCase } from "@/lib/cases";
import { createTemporalClient } from "@/lib/temporal/client";

export const runtime = "nodejs";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const previous = await getCase(id);
  const current = await resetCase(id);
  if (!current) return Response.json({ error: "Case not found" }, { status: 404 });
  if (previous?.coordination.workflowId) {
    try {
      const temporal = await createTemporalClient();
      try {
        await temporal.client.workflow.getHandle(previous.coordination.workflowId).cancel();
      } finally {
        await temporal.close();
      }
    } catch (error) {
      // The new case generation also prevents a late workflow from writing back.
      console.error("Could not cancel previous DME workflow", error);
    }
  }
  return Response.json(current);
}
