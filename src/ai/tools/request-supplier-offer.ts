import { tool } from "ai";
import { z } from "zod";
import type { DmeAction } from "../../lib/dme/cases";
import type { requestSupplierOffer } from "../../lib/dme/supplier-offer";
import { userReasonMessageSchema } from "./user-reason";

export function createRequestSupplierOfferTool(action: DmeAction, request: typeof requestSupplierOffer) {
  return tool({
    description: "Ask the selected supplier to review the PCP documents and delivery address, list missing items, confirm equipment and coding, authorization and notice requirements, patient cost, rental or purchase terms, and delivery windows. This queues a mock response.",
    inputSchema: z.object({ userReasonMessage: userReasonMessageSchema, reason: z.string().trim().min(1).max(500) }),
    execute: ({ reason }, { toolCallId }) => request({ ...action, toolCallId, reason }),
  });
}
