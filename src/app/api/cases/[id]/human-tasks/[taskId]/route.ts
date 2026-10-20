import { z } from "zod";
import { getCase } from "@/lib/cases";
import { resolveHumanTask } from "@/lib/dme/human-tasks";
import { recordMockResponse } from "@/lib/dme/responses";
import { createTemporalClient } from "@/lib/temporal/client";
import { ensureCaseWorkflow } from "@/lib/temporal/start-case-workflow";

export const runtime = "nodejs";

const requestSchema = z.object({ resolution: z.string().trim().min(1).max(2000), answers: z.array(z.string().trim().min(1)).optional(), response: z.unknown().optional() });

export async function POST(request: Request, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  const { id, taskId } = await params;
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "A resolution is required" }, { status: 400 });

  let saved;
  try {
    const current = await getCase(id);
    const task = current?.humanTasks.find((item) => item.id === taskId);
    if (!task) return Response.json({ error: "Care advocate task not found" }, { status: 404 });
    if (task.status === "resolved") {
      saved = { task, workflowId: current?.coordination.workflowId };
    } else if (task.callId && parsed.data.response) {
      const recorded = await recordMockResponse(id, task.callId, parsed.data.response, { taskId, resolution: parsed.data.resolution });
      if (!recorded) return Response.json({ error: "The related call is no longer available." }, { status: 409 });
      const latest = await getCase(id);
      saved = { task: latest?.humanTasks.find((item) => item.id === taskId), workflowId: recorded.workflowId };
    } else {
      if (task.callId && !(task.type === "unanswered_outreach" && current?.coordination.calls.some((call) => call.id === task.callId && call.kind === "patient" && call.purpose === "outreach"))) {
        return Response.json({ error: "Generate a response that answers this call before resolving the task." }, { status: 400 });
      }
      saved = await resolveHumanTask({ caseId: id, taskId, resolution: parsed.data.resolution, answers: parsed.data.answers });
    }
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not resolve the task." }, { status: 400 });
  }
  if (!saved) return Response.json({ error: "Care advocate task not found" }, { status: 404 });

  try {
    const temporal = await createTemporalClient();
    try {
      const workflow = await ensureCaseWorkflow(temporal.client, id);
      if (workflow && !workflow.started) {
        await temporal.client.workflow.getHandle(workflow.workflowId).signal("case-updated");
      }
    } finally {
      await temporal.close();
    }
  } catch (error) {
    console.error("Care advocate resolution was saved, but the DME workflow could not be notified", error);
    return Response.json({ task: saved.task, warning: "Resolution saved, but the agent could not resume. Retry this request when Temporal is available." }, { status: 202 });
  }

  return Response.json({ task: saved.task });
}
