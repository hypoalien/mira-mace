import { z } from "zod";
import { getCase } from "@/lib/cases";
import { draftMockResponse } from "@/lib/dme/draft-response";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = z.object({ callId: z.string().min(1) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Select a pending call." }, { status: 400 });
  const current = await getCase(id);
  if (!current) return Response.json({ error: "Case not found." }, { status: 404 });
  const call = current.coordination.calls.find((item) => item.id === parsed.data.callId && item.status === "awaiting_response");
  if (!call) return Response.json({ error: "Pending call not found." }, { status: 404 });
  try {
    return Response.json(await draftMockResponse(current, call));
  } catch (error) {
    console.error("Could not draft mock call response", { caseId: id, callId: call.id, error });
    return Response.json({ error: "Could not draft a response. Please try again or fill it manually." }, { status: 503 });
  }
}
