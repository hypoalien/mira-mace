import { getCase } from "@/lib/cases";
import { draftHumanResolution } from "@/lib/dme/draft-human-resolution";

export const runtime = "nodejs";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  const { id, taskId } = await params;
  const current = await getCase(id);
  if (!current) return Response.json({ error: "Case not found." }, { status: 404 });
  const task = current.humanTasks.find((item) => item.id === taskId && item.status === "pending");
  if (!task) return Response.json({ error: "Pending care advocate task not found." }, { status: 404 });

  try {
    return Response.json(await draftHumanResolution(current, task));
  } catch (error) {
    console.error("Could not draft care advocate resolution", { caseId: id, taskId, error });
    return Response.json({ error: "Could not generate a resolution. Please try again." }, { status: 503 });
  }
}
