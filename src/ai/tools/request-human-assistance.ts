import { tool } from "ai";
import { z } from "zod";
import type { DmeAction } from "../../lib/dme/cases";
import type { createHumanTask } from "../../lib/dme/human-tasks";
import { userReasonMessageSchema } from "./user-reason";

export function createHumanAssistanceTool(action: DmeAction, createTask: typeof createHumanTask) {
  return tool({
    description:
      "Create a care advocate task when all enrolled suppliers have been contacted and none can fulfill the case. " +
      "Pending PCP, patient, or supplier responses are not blockers. Do not duplicate a pending task.",
    inputSchema: z.object({
      userReasonMessage: userReasonMessageSchema,
      type: z.enum(["clinical_clarification", "missing_information", "provider_issue", "other"]),
      blockerKey: z.string().trim().min(1).max(120).describe("Stable short key for this specific blocker"),
      title: z.string().trim().min(1).max(120),
      description: z.string().trim().min(1).max(1000).describe("Explain what the advocate must do"),
      callId: z.string().optional(),
    }),
    execute: async (input, { toolCallId }) => createTask({
      ...action,
      toolCallId,
      type: input.type,
      blockerKey: input.blockerKey,
      title: input.title,
      description: input.description,
      callId: input.callId,
    }),
  });
}
