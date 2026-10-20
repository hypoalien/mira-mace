import { travelToBookedDeliveryWindow } from "@/lib/dme/travel-to-delivery";
import { createTemporalClient } from "@/lib/temporal/client";

export const runtime = "nodejs";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const advanced = await travelToBookedDeliveryWindow(id);
  if (!advanced) return Response.json({ error: "There is no future booked delivery window to travel to." }, { status: 409 });

  if (advanced.workflowId) {
    try {
      const temporal = await createTemporalClient();
      try {
        await temporal.client.workflow.getHandle(advanced.workflowId).signal("case-updated");
      } finally {
        await temporal.close();
      }
    } catch (error) {
      console.error("Delivery time advanced, but Temporal could not be notified", { caseId: id, error });
      return Response.json({ ...advanced, warning: "Demo time advanced, but the agent could not be notified. Restart the DME agent to continue." }, { status: 202 });
    }
  }
  return Response.json(advanced);
}
