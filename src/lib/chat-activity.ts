import { z } from "zod";

export const chatActivitySchema = z.object({
  toolCallId: z.string(),
  toolName: z.string(),
  status: z.enum(["running", "completed", "failed"]),
  input: z.string().optional(),
  output: z.string().optional(),
});

export type ChatActivity = z.infer<typeof chatActivitySchema>;

export function formatToolValue(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}
