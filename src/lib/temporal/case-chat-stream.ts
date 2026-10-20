import type { Client } from "@temporalio/client";
import { WorkflowStreamClient } from "@temporalio/workflow-streams/client";
import { chatActivityTopic, chatCompletionTopic, chatTextTopic, type ChatCompletion } from "@/temporal/dme/constants";
import type { ChatActivity } from "@/lib/chat-activity";

type ChatEvent =
  | { type: "delta"; text: string }
  | { type: "activity"; activity: ChatActivity }
  | { type: "done" }
  | { type: "error"; message: string };

type ModelStreamPart = { type: string; delta?: string };

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function createCaseChatResponse(client: Client, workflowId: string, turnId: string, close: () => Promise<void>): Response {
  let disconnected = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = (event: ChatEvent) => {
        if (!disconnected) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      void (async () => {
        try {
          const subscriber = WorkflowStreamClient.create(client, workflowId);
          const textTopic = chatTextTopic(turnId);
          const doneTopic = chatCompletionTopic(turnId);
          const activityTopic = chatActivityTopic(turnId);
          let finished = false;
          for await (const item of subscriber.subscribe<Uint8Array | ChatCompletion | ChatActivity>([textTopic, activityTopic, doneTopic], 0, { resultType: true })) {
            if (item.topic === doneTopic) {
              const completion = item.data as ChatCompletion;
              emit(completion.status === "done" ? { type: "done" } : { type: "error", message: completion.message });
              finished = true;
              break;
            }
            if (item.topic === activityTopic) {
              emit({ type: "activity", activity: item.data as ChatActivity });
              continue;
            }
            const part = JSON.parse(decoder.decode(item.data as Uint8Array)) as ModelStreamPart;
            if (part.type === "text-delta" && part.delta) emit({ type: "delta", text: part.delta });
          }
          if (!finished) emit({ type: "error", message: "The case workflow ended before the reply completed." });
        } catch (error) {
          console.error("Case chat stream failed", { workflowId, turnId, error });
          emit({ type: "error", message: "The response could not be completed. Please try again." });
        } finally {
          try {
            await close();
          } catch (error) {
            console.error("Could not close Temporal connection", { workflowId, error });
          } finally {
            if (!disconnected) controller.close();
          }
        }
      })();
    },
    cancel() {
      // The same workflow continues the chat turn and persists it after a disconnect.
      disconnected = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
