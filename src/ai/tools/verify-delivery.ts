import { tool } from "ai";
import { z } from "zod";
import type { DmeAction } from "../../lib/dme/cases";
import type { requestPatientDeliveryConfirmation, requestSupplierDeliveryEvidence } from "../../lib/dme/verify-delivery";
import { userReasonMessageSchema } from "./user-reason";

export function createSupplierDeliveryEvidenceTool(action: DmeAction, request: typeof requestSupplierDeliveryEvidence) {
  return tool({
    description: "Ask the supplier for delivered status, delivery time, and proof reference after the patient has been notified. Queues a mock response.",
    inputSchema: z.object({ userReasonMessage: userReasonMessageSchema }),
    execute: (_input, { toolCallId }) => request({ ...action, toolCallId }),
  });
}

export function createPatientDeliveryConfirmationTool(action: DmeAction, request: typeof requestPatientDeliveryConfirmation) {
  return tool({
    description: "Ask the patient whether the correct equipment arrived and whether there is an issue. Queues a mock response.",
    inputSchema: z.object({
      userReasonMessage: userReasonMessageSchema,
      patientMessage: z.string().trim().min(1).max(1000).describe("Natural patient-facing message asking whether the correct equipment arrived and whether there were any issues"),
    }),
    execute: ({ patientMessage }, { toolCallId }) => request({ ...action, toolCallId, patientMessage }),
  });
}
