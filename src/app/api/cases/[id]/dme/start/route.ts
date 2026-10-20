import { createTemporalClient } from "@/lib/temporal/client";
import { ensureCaseWorkflow } from "@/lib/temporal/start-case-workflow";

export const runtime = "nodejs";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const temporal = await createTemporalClient();
    try {
      const started = await ensureCaseWorkflow(temporal.client, id);
      if (!started) return Response.json({ error: "Case not found" }, { status: 404 });
      if (!started.started) await temporal.client.workflow.getHandle(started.workflowId).signal("case-updated");
      return Response.json({ workflowId: started.workflowId, status: started.started ? "started" : "already_started" }, { status: started.started ? 202 : 200 });
    } finally {
      await temporal.close();
    }
  } catch (error) {
    console.error("Could not start DME workflow", error);
    return Response.json({ error: "Could not start the DME agent" }, { status: 503 });
  }
}
