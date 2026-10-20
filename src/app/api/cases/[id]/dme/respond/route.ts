import { z } from "zod";
import { recordMockResponse } from "@/lib/dme/responses";
import { createTemporalClient } from "@/lib/temporal/client";

export const runtime = "nodejs";

const requestSchema = z.object({
  callId: z.string().min(1),
  outcome: z.enum(["answered", "no_response"]),
  answers: z.array(z.string()).optional(),
  documents: z.array(z.enum(["signed_order", "clinical_records"])).optional(),
  acceptsNewMedicare: z.boolean().optional(),
  hasK0001: z.boolean().optional(),
  deliveryEstimate: z.string().optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid mock response" }, { status: 400 });

  let recorded;
  try {
    recorded = await recordMockResponse(id, parsed.data.callId, parsed.data);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Invalid mock response" }, { status: 400 });
  }
  if (!recorded) return Response.json({ error: "Pending call not found" }, { status: 404 });

  if (recorded.workflowId) {
    try {
      const temporal = await createTemporalClient();
      try {
        await temporal.client.workflow.getHandle(recorded.workflowId).signal("case-updated");
      } finally {
        await temporal.close();
      }
    } catch (error) {
      console.error("Could not notify DME workflow of mock response", error);
      return Response.json({ error: "Response saved, but Temporal notification failed. Please submit again." }, { status: 503 });
    }
  }
  return Response.json(recorded);
}
