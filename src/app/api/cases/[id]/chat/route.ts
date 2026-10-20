import { randomUUID } from "node:crypto";
import { z } from "zod";
import { claimCaseChat, releaseCaseChat } from "@/lib/cases";
import { createTemporalClient } from "@/lib/temporal/client";
import { createCaseChatResponse } from "@/lib/temporal/case-chat-stream";
import { ensureCaseWorkflow } from "@/lib/temporal/start-case-workflow";

export const runtime = "nodejs";

const requestSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  channel: z.enum(["advocate", "patient"]).default("advocate"),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Send a user message to start the chat" }, { status: 400 });
  }

  let temporal;
  try {
    temporal = await createTemporalClient();
  } catch {
    return Response.json({ error: "Temporal is unavailable" }, { status: 503 });
  }

  const turnId = `turn-${randomUUID()}`;
  let workflowId: string;
  try {
    const started = await ensureCaseWorkflow(temporal.client, id);
    if (!started) {
      await temporal.close();
      return Response.json({ error: "Case not found" }, { status: 404 });
    }
    workflowId = started.workflowId;
  } catch (error) {
    console.error("Could not start case workflow", error);
    await temporal.close();
    return Response.json({ error: "Could not start the case agent" }, { status: 503 });
  }

  let claim;
  try {
    claim = await claimCaseChat(id, turnId, parsed.data.message, parsed.data.channel);
  } catch (error) {
    console.error("Could not reserve chat turn", error);
    await temporal.close();
    return Response.json({ error: "Could not start the chat" }, { status: 503 });
  }
  if (claim.status !== "claimed") {
    await temporal.close();
    return Response.json(
      { error: claim.status === "busy" ? "A reply is already in progress for this case" : "Case not found" },
      { status: claim.status === "busy" ? 409 : 404 },
    );
  }

  try {
    await temporal.client.workflow.getHandle(workflowId).signal("chat-requested", turnId);
    return createCaseChatResponse(temporal.client, workflowId, turnId, temporal.close);
  } catch (error) {
    console.error("Could not request case chat", error);
    try {
      await releaseCaseChat(id, claim.current.generation, turnId);
    } catch (releaseError) {
      console.error("Could not release chat reservation", { turnId, releaseError });
    } finally {
      await temporal.close();
    }
    return Response.json({ error: "Could not start the chat turn" }, { status: 503 });
  }
}
