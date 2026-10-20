import { TemporalProvider } from "@temporalio/ai-sdk/workflow";
import { condition, patched, proxyActivities, setHandler, uuid4 } from "@temporalio/workflow";
import { WorkflowStream } from "@temporalio/workflow-streams/workflow";
import { runChatAgent } from "../../ai/agents/chat-agent";
import type { ChatActivity } from "../../lib/chat-activity";
import { runDmeAgent } from "../../ai/agents/dme-agent";
import { prepareAgentStep } from "../../ai/context";
import type * as activities from "./activities";
import { chatActivityTopic, chatCompletionTopic, chatTextTopic, type ChatCompletion } from "./constants";
import { caseUpdated, chatRequested } from "./signals";
import type { DmeAction } from "../../lib/dme/cases";

const a = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 seconds",
  retry: { maximumAttempts: 5 },
});
const autoMockActivities = proxyActivities<Pick<typeof activities, "processAutoMockResponses" | "getNextAutoMockAt">>({
  startToCloseTimeout: "3 minutes",
  retry: { maximumAttempts: 3 },
});

async function runCoordination(action: DmeAction) {
  const roundId = `round-${uuid4()}`;
  await a.markAgentRunning(action);
  await a.beginCoordinationRound(action, roundId);
  try {
    const model = new TemporalProvider({ languageModel: { streamingTopic: chatTextTopic(roundId) } }).languageModel("gpt-4o-mini");
    const result = await runDmeAgent(model, action, a, async (activity) => {
      await a.recordCoordinationActivity(action, roundId, activity);
    });
    if (result.activities.length === 0) await a.discardCoordinationRound(action, roundId);
    else await a.recordAgentRound(action, roundId, result.answer);
  } catch (error) {
    await a.recordCoordinationFailure(action, roundId);
    throw error;
  }
}

async function runStatusUpdate(action: DmeAction, expectedUpdatedAt: string) {
  const updateId = `update-${uuid4()}`;
  const model = new TemporalProvider({ languageModel: { streamingTopic: chatTextTopic(updateId) } }).languageModel("gpt-4o-mini");
  const result = await runDmeAgent(model, action, a, async () => undefined, true);
  await a.recordAgentUpdate(action, updateId, expectedUpdatedAt, result.answer);
}

async function runChat(action: DmeAction, turnId: string, streams: WorkflowStream) {
  const completion = streams.topic<ChatCompletion>(chatCompletionTopic(turnId));
  const activityTopic = streams.topic<ChatActivity>(chatActivityTopic(turnId));
  try {
    const context = await a.loadDmeContext(action);
    if (!context || context.current.activeChat?.turnId !== turnId) throw new Error("Chat turn is no longer active");
    await a.markAgentRunning(action);

    const result = await runChatAgent(
      new TemporalProvider({ languageModel: { streamingTopic: chatTextTopic(turnId) } }).languageModel("gpt-4o-mini"),
      action,
      context.current.activeChat.channel === "patient" ? context.current.patientMessages : context.current.messages,
      context.current.activeChat.userMessage,
      a,
      (activity) => activityTopic.publish(activity),
      context.current.activeChat.channel,
    );

    await a.markAgentWaiting(action);
    const saved = await a.persistChatExchange(action.caseId, action.generation, turnId, result.answer, result.activities);
    if (saved === "discarded") throw new Error("The case changed before the reply could be saved");
    if (context.current.activeChat.channel === "patient") {
      try {
        await a.capturePatientMessage(action, turnId, context.current.activeChat.userMessage);
      } catch (error) {
        console.error("Could not extract details from patient chat", error);
      }
    }
    completion.publish({ status: "done" });
  } catch (error) {
    await a.releaseChatReservation(action.caseId, action.generation, turnId);
    await a.markAgentWaiting(action);
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

      if (shouldRunCoordination) {
        const latest = await a.loadDmeContext(action);
        if (!latest) return;
        const step = await prepareAgentStep(action, async () => latest);
        if (step.activeTools.length) await runCoordination(action);
        else if (latest.current.coordination.summary === null) await runStatusUpdate(action, latest.current.updatedAt);
        else await a.markAgentWaiting(action);
        const mocked = latest.current.autoMock?.enabled ? await autoMockActivities.processAutoMockResponses(action) : 0;
        if (mocked) {
          shouldRunCoordination = true;
          continue;
        }
      }
      shouldRunCoordination = false;

      if (eventCount > seenEvents) {
        seenEvents = eventCount;
        shouldRunCoordination = true;
        continue;
      }

      const nextFollowUp = await a.getNextFollowUpAt(action);
      const nextAutoMock = context.current.autoMock?.enabled && patched("auto-mock-delivery-window-v1")
        ? await autoMockActivities.getNextAutoMockAt(action) : null;
      const nextWake = [nextFollowUp, nextAutoMock].filter((value): value is string => Boolean(value)).sort()[0];
      const delay = nextWake ? Math.max(0, new Date(nextWake).getTime() - Date.now()) : undefined;
      if (delay === undefined) await condition(() => eventCount > seenEvents);
      else if (delay > 0) await condition(() => eventCount > seenEvents, delay);

      const gotResponse = eventCount > seenEvents;
      seenEvents = eventCount;
      const due = await a.dispatchDueFollowUps(action);
      shouldRunCoordination = gotResponse || Boolean(due) || Boolean(nextAutoMock && new Date(nextAutoMock).getTime() <= Date.now());
    }
  } catch (error) {
    await a.recordAgentError(action);
    throw error;
  }
}
