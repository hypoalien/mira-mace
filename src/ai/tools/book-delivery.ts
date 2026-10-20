import { tool } from "ai";
import { z } from "zod";
import type { DmeAction } from "../../lib/dme/cases";
import type { bookDelivery } from "../../lib/dme/book-delivery";
import { userReasonMessageSchema } from "./user-reason";

export function createBookDeliveryTool(action: DmeAction, book: typeof bookDelivery) {
  return tool({
    description: "Ask the selected supplier to confirm the patient's agreed delivery slot. The booking stays pending until the supplier's mock response includes a confirmation reference.",
    inputSchema: z.object({ userReasonMessage: userReasonMessageSchema }),
    execute: (_input, { toolCallId }) => book({ ...action, toolCallId }),
  });
}
