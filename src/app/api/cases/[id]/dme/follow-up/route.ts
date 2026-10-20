import { z } from "zod";
import { runScheduledFollowUpNow } from "@/lib/dme/cases";
import { processAutoMockResponses } from "@/lib/dme/auto-mock";
import { createTemporalClient } from "@/lib/temporal/client";

export const runtime = "nodejs";

const requestSchema = z.object({ callId: z.string().min(1) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Choose a scheduled call." }, { status: 400 });

  const followUp = await runScheduledFollowUpNow(id, parsed.data.callId);
  if (!followUp) return Response.json({ error: "Scheduled call not found." }, { status: 404 });
  if (!followUp.workflowId) return Response.json({ error: "The case workflow is not running." }, { status: 409 });

  if (followUp.autoMockEnabled) {
    await processAutoMockResponses({ caseId: id, generation: followUp.generation, workflowId: followUp.workflowId });
  }

  let warning: string | undefined;
  try {
    const temporal = await createTemporalClient();
    try {
      await temporal.client.workflow.getHandle(followUp.workflowId).signal("case-updated");
    } finally {
      await temporal.close();
    }
  } catch (error) {
    console.error("Could not run scheduled follow-up", error);
    warning = "The follow-up advanced, but Temporal could not be notified. Restart the DME agent to continue coordination.";
  }

  return Response.json({ status: "advanced", attempt: followUp.attempt, demoNow: followUp.demoNow, advancedCallCount: followUp.advancedCallCount, warning });
}
