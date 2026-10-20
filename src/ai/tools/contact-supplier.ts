import { tool } from "ai";
import { z } from "zod";
import type { ContactInput } from "../../lib/dme/cases";
import type { contactSupplier } from "../../lib/dme/contact-supplier";
import { userReasonMessageSchema } from "./user-reason";

export function createContactSupplierTool(
  action: Omit<ContactInput, "toolCallId" | "reason" | "questions">,
  contact: typeof contactSupplier,
) {
  return tool({
    description:
      "Queue a mock call to the next uncontacted enrolled supplier. The app chooses the supplier.",
    inputSchema: z.object({
      userReasonMessage: userReasonMessageSchema,
      reason: z.string().min(1),
      requirements: z.array(z.string().min(1)).min(1).max(6),
    }),
    execute: async ({ reason, requirements }, { toolCallId }) =>
      contact({ ...action, toolCallId, reason, questions: requirements }),
  });
}
