import { tool } from "ai";
import { z } from "zod";
import type { ContactInput } from "../../lib/dme/cases";
import type { contactPCP } from "../../lib/dme/contact-pcp";
import { userReasonMessageSchema } from "./user-reason";

type ContactPCPAction = Omit<
  ContactInput,
  "toolCallId" | "reason" | "questions"
>;

export function createContactPCPTool(
  action: ContactPCPAction,
  contact: typeof contactPCP,
) {
  return tool({
    description:
      "Queue a mock PCP call to request missing orders, clinical records, " +
      "or clarification.",
    inputSchema: z.object({
      userReasonMessage: userReasonMessageSchema,
      reason: z.string().trim().min(1).max(500),
      questions: z.array(z.string().trim().min(1).max(300)).min(1).max(5),
    }),
    execute: async ({ reason, questions }, { toolCallId }) => {
      return contact({ ...action, toolCallId, reason, questions });
    },
  });
}
