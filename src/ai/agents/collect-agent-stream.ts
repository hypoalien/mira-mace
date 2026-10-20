import type { TextStreamPart, ToolSet } from "ai";
import { formatToolValue, type ChatActivity } from "../../lib/chat-activity";

export async function collectAgentStream(
  stream: AsyncIterable<TextStreamPart<ToolSet>>,
  onActivity: (activity: ChatActivity) => void | Promise<void>,
): Promise<{ answer: string; activities: ChatActivity[] }> {
  let answer = "";
  const activities = new Map<string, ChatActivity>();

  for await (const part of stream) {
    if (part.type === "text-delta") answer += part.text;

    if (part.type === "tool-call") {
      const activity: ChatActivity = {
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        status: "running",
        input: formatToolValue(part.input),
      };
      activities.set(part.toolCallId, activity);
      await onActivity(activity);
    }

    if (part.type === "tool-result" || part.type === "tool-error") {
      const activity: ChatActivity = {
        ...activities.get(part.toolCallId),
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        status: part.type === "tool-result" ? "completed" : "failed",
        output: formatToolValue(part.type === "tool-result" ? part.output : part.error),
      };
      activities.set(part.toolCallId, activity);
      await onActivity(activity);
    }
  }

  return { answer, activities: [...activities.values()] };
}
