import { openai } from "@ai-sdk/openai";
import { config } from "dotenv";
import { generateText, Output } from "ai";
import { z } from "zod";
import type { Case, HumanTask } from "../cases";
import { draftMockOutcome } from "./auto-mock";
import type { MockResponse } from "./responses";

const resolutionSchema = z.object({ resolution: z.string().trim().min(1).max(2000) });

export async function draftHumanResolution(current: Case, task: HumanTask): Promise<{ resolution: string; response?: MockResponse }> {
  config({ path: ".env.worker.local", quiet: true });
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is needed to draft a resolution");

  const call = current.coordination.calls.find((item) => item.id === task.callId);
  if (call) {
    const response = await draftMockOutcome(current, call, "positive");
    if (response.outcome !== "answered") throw new Error("The generated response did not answer the call");
    return { resolution: response.answers.join("\n"), response };
  }
  const { output } = await generateText({
    model: openai("gpt-4o-mini"),
    output: Output.object({ schema: resolutionSchema }),
    abortSignal: AbortSignal.timeout(30_000),
    system: [
      "Draft a concise, positive care advocate resolution for a fictional DME coordination demo.",
      "Describe the specific action that resolves the blocker.",
      "Do not claim an actual external contact occurred; this is a simulated response for the demo.",
      "Do not add facts beyond the response and case context.",
      "Write in the advocate's first person, as a resolution note. Use plain text and no placeholders.",
    ].join("\n"),
    prompt: JSON.stringify({
      task: { type: task.type, title: task.title, description: task.description },
      case: {
        patientName: current.intake.patient.name,
        careArea: current.intake.pcp.location,
        equipment: current.intake.equipment.name,
        documentsReceived: current.coordination.documents.map((document) => document.kind),
        patientDetails: current.coordination.patientDetails,
        selectedSupplierId: current.coordination.selectedSupplierId,
      },
    }),
  });

  return { resolution: output.resolution };
}

export async function extractHumanResolutionAnswers(resolution: string, questions: string[]): Promise<string[]> {
  config({ path: ".env.worker.local", quiet: true });
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is needed to read the resolution");
  const { output } = await generateText({
    model: openai("gpt-4o-mini"),
    output: Output.object({ schema: z.object({ answers: z.array(z.string().trim().nullable()).length(questions.length) }) }),
    abortSignal: AbortSignal.timeout(30_000),
    system: "Extract one answer for each question from the care advocate's resolution, in question order. Return null when the resolution does not explicitly answer a question. Do not infer or invent details.",
    prompt: JSON.stringify({ resolution, questions }),
  });
  if (output.answers.some((answer) => !answer)) throw new Error("Answer every patient question in the resolution before resolving this task.");
  return output.answers as string[];
}
