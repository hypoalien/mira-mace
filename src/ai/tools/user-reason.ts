import { z } from "zod";

export const userReasonMessageSchema = z.string().trim().min(1).max(240)
  .describe("One plain-language sentence for the advocate explaining why this action is needed now.");
