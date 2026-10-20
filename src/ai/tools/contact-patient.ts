import { tool } from "ai";
import { z } from "zod";
import type { PatientContactInput } from "../../lib/dme/cases";
import type { contactPatient } from "../../lib/dme/contact-patient";

type ContactPatientAction = Omit<PatientContactInput, "toolCallId" | "reason" | "questions">;

export function createContactPatientTool(action: ContactPatientAction, contact: typeof contactPatient) {
  return tool({
    description:
      "Queue a mock patient call for details still missing from the case. " +
      "Choose only missing fields shown in the current case context and write a clear question for each.",
    inputSchema: z.object({
      reason: z.string().trim().min(1).max(500),
      questions: z.array(z.object({
        field: z.string().trim().min(1).describe("Exact field name from missingPatientFields in the case context"),
        question: z.string().trim().min(1).max(300),
      })).min(1).max(6),
    }),
    execute: async ({ reason, questions }, { toolCallId }) => {
      return contact({ ...action, toolCallId, reason, questions });
    },
  });
}
