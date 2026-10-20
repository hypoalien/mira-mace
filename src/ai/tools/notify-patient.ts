import { tool } from "ai";
import { z } from "zod";
import type { DmeAction } from "../../lib/dme/cases";
import type { notifyPatient } from "../../lib/dme/notify-patient";
import { userReasonMessageSchema } from "./user-reason";

export function createNotifyPatientTool(action: DmeAction, notify: typeof notifyPatient) {
  return tool({
    description: "Record a simulated patient notification using only the supplier-confirmed booking reference, delivery window, cost, and terms. No real message is sent.",
    inputSchema: z.object({
      userReasonMessage: userReasonMessageSchema,
      patientMessage: z.string().trim().min(1).max(1500).describe("Patient-facing booking notice using only the recorded supplier, delivery address and window, booking reference, cost, and terms"),
    }),
    execute: ({ patientMessage }, { toolCallId }) => notify({ ...action, toolCallId, patientMessage }),
  });
}
