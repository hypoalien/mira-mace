import type { Client } from "@temporalio/client";
import { releaseDmeStart, startDmeCase } from "@/lib/dme/cases";
import { CASE_TASK_QUEUE } from "@/temporal/dme/constants";

export async function ensureCaseWorkflow(client: Client, caseId: string) {
  let started = await startDmeCase(caseId);
  if (!started) return null;
  if (!started.started) {
    try {
      const existing = await client.workflow.getHandle(started.workflowId).describe();
      if (existing.status.name === "RUNNING") return started;
    } catch {
      // A stored workflow ID may predate a Temporal server reset.
    }
    started = await startDmeCase(caseId, started.workflowId);
    if (!started || !started.started) return started;
  }

  try {
    await client.workflow.start("dmeCaseWorkflow", {
      workflowId: started.workflowId,
      taskQueue: CASE_TASK_QUEUE,
      args: [{ caseId, generation: started.generation, workflowId: started.workflowId }],
    });
    return started;
  } catch (error) {
    await releaseDmeStart({ caseId, generation: started.generation, workflowId: started.workflowId });
    throw error;
  }
}
