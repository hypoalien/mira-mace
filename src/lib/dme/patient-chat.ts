import { openai } from "@ai-sdk/openai";
import { config } from "dotenv";
import { generateText, Output } from "ai";
import { z } from "zod";
import { getCase, patientDetailsSchema, updateCase } from "../cases";
import type { DmeAction } from "./cases";
import { matches } from "./cases";

const extractedDetailsSchema = patientDetailsSchema.shape;
const fieldNames = patientDetailsSchema.keyof().options;
const extractionSchema = z.object(Object.fromEntries(
  fieldNames.map((field) => [field, extractedDetailsSchema[field].nullable()]),
) as { [K in typeof fieldNames[number]]: z.ZodNullable<typeof extractedDetailsSchema[K]> });

export async function capturePatientMessage(action: DmeAction, turnId: string, message: string) {
  const current = await getCase(action.caseId);
  if (!current || !matches(current, action) || !current.patientMessages.some((item) => item.turnId === turnId && item.role === "user")) return;
  const missing = fieldNames.filter((field) => !current.coordination.patientDetails?.[field]);
  if (missing.length === 0) return;

  config({ path: ".env.worker.local", quiet: true });
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is needed to extract patient details");
  const { output } = await generateText({
    model: openai("gpt-4o-mini"),
    output: Output.object({ schema: extractionSchema }),
    abortSignal: AbortSignal.timeout(30_000),
    system: `Extract only patient details explicitly provided in the latest patient message. Return null for every absent field. Do not guess from the case or from the care team's questions. A home address alone does not establish a delivery address; the patient must explicitly say where the equipment should be delivered. An answer such as "deliver it to my home address" may use an already known home address for deliveryAddress. phone is the patient's own number, not an alternate contact. contactDetails can contain a stated contact preference or time even without an alternate contact. Return clean values without conversational prefixes.`,
    prompt: JSON.stringify({ latestPatientMessage: message, knownPatientDetails: current.coordination.patientDetails, missingFields: missing }),
  });

  const extracted = Object.fromEntries(missing.flatMap((field) => {
    const value = output[field]?.trim();
    if (!value) return [];
    if (field === "deliveryAddress" && !/deliver|ship|drop.?off|bring (?:it|the wheelchair)/i.test(message)) return [];
    if (field === "phone") {
      const digits = value.replace(/\D/g, "");
      if (digits.length < 10 || !message.replace(/\D/g, "").includes(digits)) return [];
    }
    return [[field, value]];
  }));
  if (Object.keys(extracted).length === 0) return;

  await updateCase(action.caseId, (latest) => {
    if (!matches(latest, action) || !latest.patientMessages.some((item) => item.turnId === turnId && item.role === "user")) return null;
    const patientDetails = patientDetailsSchema.partial().parse({ ...extracted, ...latest.coordination.patientDetails });
    const now = new Date().toISOString();
    const calls = latest.coordination.calls.map((call) => {
      if (call.kind !== "patient" || call.purpose !== "outreach" || call.status !== "awaiting_response" || !call.questionFields?.every((field) => patientDetails[field as keyof typeof patientDetails])) return call;
      return {
        ...call,
        status: "completed" as const,
        scheduledFor: null,
        response: { answeredAt: now, answers: call.questionFields.map((field) => patientDetails[field as keyof typeof patientDetails]!), sourceTurnId: turnId },
      };
    });
    return {
      next: { ...latest, updatedAt: now, coordination: { ...latest.coordination, patientDetails, calls, summary: null } },
      result: true,
    };
  });
}
