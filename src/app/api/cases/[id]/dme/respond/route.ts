import { z } from "zod";
import { recordMockResponse } from "@/lib/dme/responses";
import { createTemporalClient } from "@/lib/temporal/client";

export const runtime = "nodejs";

const requestSchema = z.object({
  callId: z.string().min(1),
  outcome: z.enum(["answered", "negative", "no_response", "blocked"]),
  issue: z.string().optional(),
  answers: z.array(z.string()).optional(),
  documents: z.array(z.enum(["signed_order", "clinical_records"])).optional(),
  acceptsNewMedicare: z.boolean().optional(),
  hasK0001: z.boolean().optional(),
  deliveryEstimate: z.string().optional(),
  enrollmentConfirmed: z.boolean().optional(),
  acceptsAssignment: z.boolean().optional(),
  servesArea: z.boolean().optional(),
  costEstimate: z.string().optional(),
  rentalTerms: z.string().optional(),
  signedOrderReceived: z.boolean().optional(),
  clinicalRecordsReceived: z.boolean().optional(),
  missingDocuments: z.array(z.string()).optional(),
  deliveryAddressServed: z.boolean().optional(),
  manufacturer: z.string().optional(),
  model: z.string().optional(),
  hcpcs: z.string().optional(),
  arrangement: z.string().optional(),
  authorizationRequirement: z.string().optional(),
  advanceNoticeRequirement: z.string().optional(),
  authorizationReady: z.boolean().optional(),
  advanceNoticeReady: z.boolean().optional(),
  deliveryWindows: z.array(z.string()).optional(),
  timeZone: z.string().optional(),
  agreementAccepted: z.boolean().optional(),
  addressConfirmed: z.boolean().optional(),
  selectedSlotId: z.string().optional(),
  bookingConfirmed: z.boolean().optional(),
  bookingReference: z.string().optional(),
  bookingInstructions: z.string().optional(),
  delivered: z.boolean().optional(),
  proofReference: z.string().optional(),
  deliveredAt: z.string().optional(),
  equipmentDelivered: z.string().optional(),
  receiptStatus: z.string().optional(),
  patientConfirmed: z.boolean().optional(),
  usable: z.boolean().optional(),
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
