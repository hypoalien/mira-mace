import { tool } from "ai";
import { z } from "zod";
import type { PatientContactInput } from "../../lib/dme/cases";
import type { contactPatient } from "../../lib/dme/contact-patient";
import { userReasonMessageSchema } from "./user-reason";

type ContactPatientAction = Omit<PatientContactInput, "toolCallId" | "reason" | "patientMessage" | "questions">;

export function createContactPatientTool(action: ContactPatientAction, contact: typeof contactPatient) {
  return tool({
    description:
      "Queue a mock patient call for details still missing from the case. " +
      "Choose only missing fields shown in the current case context. Write a clear question for each field, and a warm, concise patientMessage that naturally asks for those same details in one chat message.",
    inputSchema: z.object({
      userReasonMessage: userReasonMessageSchema,
      reason: z.string().trim().min(1).max(500),
      patientMessage: z.string().trim().min(1).max(1500).describe("Patient-facing chat message that politely asks for every detail in questions, without sounding like a form or mentioning internal fields"),
      questions: z.array(z.object({
        field: z.string().trim().min(1).describe("Exact field name from missingPatientFields in the case context"),
        question: z.string().trim().min(1).max(300),
      })).min(1).max(10),
    }),
    execute: async ({ reason, patientMessage, questions }, { toolCallId }) => {
      return contact({ ...action, toolCallId, reason, patientMessage, questions });
    },
  });
}
