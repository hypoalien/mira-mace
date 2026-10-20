import { z } from "zod";
import { getCase } from "@/lib/cases";
import { draftMockOutcome } from "@/lib/dme/auto-mock";
import { recordMockResponse } from "@/lib/dme/responses";
import { createTemporalClient } from "@/lib/temporal/client";

export const runtime = "nodejs";

const requestSchema = z.object({
  callId: z.string().min(1),
  outcome: z.enum(["positive", "negative", "no_response"]),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Choose how the contact responded." }, { status: 400 });

  const current = await getCase(id);
  if (!current) return Response.json({ error: "Case not found." }, { status: 404 });
  if (current.autoMock.enabled) return Response.json({ error: "Turn off Auto mock before choosing a response here." }, { status: 409 });
  const call = current.coordination.calls.find((item) => item.id === parsed.data.callId && item.status === "awaiting_response");
  if (!call) return Response.json({ error: "This request is no longer waiting for a response." }, { status: 409 });

  try {
    const response = await draftMockOutcome(current, call, parsed.data.outcome);
    const latest = await getCase(id);
    if (!latest || latest.generation !== current.generation || latest.autoMock.enabled) {
      return Response.json({ error: "The case or mock settings changed. Refresh and try again." }, { status: 409 });
    }
    const recorded = await recordMockResponse(id, call.id, response);
    if (!recorded || recorded.status === "already_recorded") {
      return Response.json({ error: "This request has already been answered." }, { status: 409 });
    }

    if (recorded.workflowId) {
      const temporal = await createTemporalClient();
      try {
        await temporal.client.workflow.getHandle(recorded.workflowId).signal("case-updated");
      } finally {
        await temporal.close();
      }
    }
    return Response.json(recorded);
  } catch (error) {
    console.error("Could not record quick mock response", { caseId: id, callId: call.id, error });
    return Response.json({ error: error instanceof Error ? error.message : "Could not record the response." }, { status: 503 });
  }
}
