import { TemporalProvider } from "@temporalio/ai-sdk/workflow";
import { condition, proxyActivities, setHandler } from "@temporalio/workflow";
import { WorkflowStream } from "@temporalio/workflow-streams/workflow";
import { runChatAgent } from "../../ai/agents/chat-agent";
import { runDmeAgent } from "../../ai/agents/dme-agent";
import type * as activities from "./activities";
import { chatCompletionTopic, chatTextTopic, type ChatCompletion } from "./constants";
import { caseUpdated, chatRequested } from "./signals";
import type { DmeAction } from "../../lib/dme/cases";

const a = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 seconds",
  retry: { maximumAttempts: 5 },
});

const provider = new TemporalProvider();

async function runCoordination(action: DmeAction) {
  await a.markAgentRunning(action);
  await runDmeAgent(provider.languageModel("gpt-4o-mini"), action, a);
  await a.recordAgentRound(action);
}

async function runChat(action: DmeAction, turnId: string, streams: WorkflowStream) {
  const completion = streams.topic<ChatCompletion>(chatCompletionTopic(turnId));
  try {
    const context = await a.loadDmeContext(action);
    if (!context || context.current.activeChat?.turnId !== turnId) throw new Error("Chat turn is no longer active");
    await a.markAgentRunning(action);

    const answer = await runChatAgent(
      new TemporalProvider({ languageModel: { streamingTopic: chatTextTopic(turnId) } }).languageModel("gpt-4o-mini"),
      action,
      context.current.messages,
      context.current.activeChat.userMessage,
      a,
    );

    await a.recordAgentRound(action);
    const saved = await a.persistChatExchange(action.caseId, action.generation, turnId, answer);
    if (saved === "discarded") throw new Error("The case changed before the reply could be saved");
    completion.publish({ status: "done" });
  } catch (error) {
    await a.releaseChatReservation(action.caseId, action.generation, turnId);
    await a.recordAgentRound(action);
    completion.publish({ status: "error", message: error instanceof Error ? error.message : "The agent could not answer" });
  }
}

export async function dmeCaseWorkflow(action: DmeAction): Promise<void> {
  const streams = new WorkflowStream();
  const pendingChats: string[] = [];
  let eventCount = 0;
  let seenEvents = 0;
  let shouldRunCoordination = true;
  setHandler(caseUpdated, () => { eventCount += 1; });
  setHandler(chatRequested, (turnId) => { pendingChats.push(turnId); eventCount += 1; });

  try {
    while (true) {
      const context = await a.loadDmeContext(action);
      if (!context) return; // Reset creates a new generation and retires this workflow.

      const turnId = pendingChats.shift();
      if (turnId) {
        await runChat(action, turnId, streams);
        shouldRunCoordination = true;
        continue;
      }

      const needsPatientDetails = context.missingPatientFields.length > 0;
      if (shouldRunCoordination && (needsPatientDetails || !["ready", "blocked"].includes(context.current.coordination.state))) {
        await runCoordination(action);
      }
      shouldRunCoordination = false;

      if (eventCount > seenEvents) {
        seenEvents = eventCount;
        shouldRunCoordination = true;
        continue;
      }

      const nextFollowUp = await a.getNextFollowUpAt(action);
      const delay = nextFollowUp ? Math.max(0, new Date(nextFollowUp).getTime() - Date.now()) : undefined;
      if (delay === undefined) await condition(() => eventCount > seenEvents);
      else if (delay > 0) await condition(() => eventCount > seenEvents, delay);

      const gotResponse = eventCount > seenEvents;
      seenEvents = eventCount;
      const due = await a.dispatchDueFollowUps(action);
      shouldRunCoordination = gotResponse || Boolean(due);
    }
  } catch (error) {
    await a.recordAgentError(action);
    throw error;
  }
}
