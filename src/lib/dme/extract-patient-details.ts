import { openai } from "@ai-sdk/openai";
import { generateText, Output } from "ai";
import { config } from "dotenv";
import { z } from "zod";
import { patientDetailsSchema, type CaseCall, type PatientDetails } from "../cases";

const extractedContactSchema = z.object({
  address: z.string().trim().min(1).nullable(),
  phone: z.string().trim().min(1).nullable(),
  deliveryAddress: z.string().trim().min(1).nullable(),
});

const contactFields = ["address", "phone", "deliveryAddress"] as const;

export async function extractPatientDetails(call: CaseCall, answers: string[]): Promise<Partial<PatientDetails>> {
  const fields = call.questionFields;
  if (!fields || fields.length !== answers.length) throw new Error("Patient call is missing its question mapping");

  const pairs = fields.map((field, index) => ({ field, question: call.questions[index], answer: answers[index] }));
  const requested = pairs.filter((pair) => contactFields.some((field) => field === pair.field));
  const details: Record<string, string> = Object.fromEntries(
    pairs.filter((pair) => !requested.includes(pair)).map((pair) => [pair.field, pair.answer.trim()]),
  );
  if (requested.length === 0) return patientDetailsSchema.partial().parse(details);

  config({ path: ".env.worker.local", quiet: true });
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is needed to extract patient contact details");

  const { output } = await generateText({
    model: openai("gpt-4o-mini"),
    output: Output.object({ schema: extractedContactSchema }),
    abortSignal: AbortSignal.timeout(30_000),
    system: [
      "Extract patient contact details from the supplied mock call answers. Return only information explicitly stated in the answers.",
      "address is the patient's current home address; deliveryAddress is where equipment should be delivered. They may be equal.",
      "phone is the patient's own preferred phone number from the phone answer, not a caregiver or alternate number.",
      "Return clean contact values without conversational prefixes such as 'My address is' or 'You can reach me at'.",
      "Use null for any detail that was not provided. Do not infer missing details from other case context.",
    ].join("\n"),
    prompt: JSON.stringify(requested),
  });

  for (const { field, answer } of requested) {
    const value = output[field as typeof contactFields[number]];
    if (!value) throw new Error(`Could not extract ${field} from the patient answer. Please provide it explicitly.`);
    if (field === "phone") {
      const digits = value.replace(/\D/g, "");
      if (digits.length < 10 || !answer.replace(/\D/g, "").includes(digits)) {
        throw new Error("The patient phone number could not be verified in the phone answer.");
      }
    }
    details[field] = value;
  }
  return patientDetailsSchema.partial().parse(details);
}
