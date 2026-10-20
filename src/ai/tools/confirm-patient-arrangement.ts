import { tool } from "ai";
import { z } from "zod";
import type { DmeAction } from "../../lib/dme/cases";
import type { confirmPatientArrangement } from "../../lib/dme/patient-arrangement";
import { userReasonMessageSchema } from "./user-reason";

export function createConfirmPatientArrangementTool(action: DmeAction, confirm: typeof confirmPatientArrangement) {
  return tool({
    description: "Ask the patient to explicitly agree to the verified supplier cost and rental terms, confirm the delivery address, and choose an offered window. Queues a mock patient response.",
    inputSchema: z.object({
      userReasonMessage: userReasonMessageSchema,
      patientMessage: z.string().trim().min(1).max(1500).describe("A natural patient-facing message that explains the recorded cost and terms, asks for explicit agreement, confirms the delivery address, and offers the recorded delivery windows"),
    }),
    execute: ({ patientMessage }, { toolCallId }) => confirm({ ...action, toolCallId, patientMessage }),
  });
}
