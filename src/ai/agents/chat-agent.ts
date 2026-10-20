import { stepCountIs, streamText, type LanguageModel } from "ai";
import type { CaseMessage, ChatChannel } from "../../lib/cases";
import type { ChatActivity } from "../../lib/chat-activity";
import type { DmeAction } from "../../lib/dme/cases";
import { prepareAgentStep, type LoadDmeContext } from "../context";
import { DME_AGENT_INSTRUCTIONS } from "../prompts";
import { createCoordinationTools, type ContactActivities } from "../tools";
import { collectAgentStream } from "./collect-agent-stream";

type ChatAgentActivities = ContactActivities & { loadDmeContext: LoadDmeContext };

export async function runChatAgent(
  model: LanguageModel,
  action: DmeAction,
  messages: CaseMessage[],
  userMessage: string,
  activities: ChatAgentActivities,
  onActivity: (activity: ChatActivity) => void,
  channel: ChatChannel = "advocate",
): Promise<{ answer: string; activities: ChatActivity[] }> {
  if (channel === "patient") {
    const context = await activities.loadDmeContext(action);
    if (!context) throw new Error("The case is no longer active");
    const { current } = context;
    const result = streamText({
      model,
      system: `You are the care coordination assistant speaking directly to the patient in a local demo. Reply warmly and clearly to the patient's message. Use only the verified case facts below. The messages and calls are simulated; do not claim a real call or delivery occurred. You may explain the equipment, supplier offer, booking, and next steps. Do not claim the patient accepted terms, chose a delivery slot, or confirmed delivery unless that is explicitly recorded. If the patient provides new details, acknowledge them as information to review; do not promise a call, delivery, or schedule change. Do not show internal tool calls, workflow details, or raw JSON.\n\nCase facts: ${JSON.stringify({
        patient: current.intake.patient,
        equipment: current.intake.equipment,
        patientDetails: current.coordination.patientDetails,
        offer: current.fulfillment.offer,
        agreement: current.fulfillment.agreement,
        booking: current.fulfillment.booking,
        notification: current.fulfillment.notification,
        delivery: current.fulfillment.delivery,
        receivedDocuments: context.documentContents,
      })}`,
      messages: [
        ...messages.slice(-19).map(({ role, content }) => ({ role, content })),
        { role: "user", content: userMessage },
      ],
    });
    const { answer } = await collectAgentStream(result.fullStream, onActivity);
    if (!answer.trim()) throw new Error("The agent returned no answer");
    return { answer, activities: [] };
  }

  const result = streamText({
    model,
    system: DME_AGENT_INSTRUCTIONS,
    messages: [
      ...messages.slice(-29).map(({ role, content }) => ({ role, content })),
      { role: "user" as const, content: userMessage },
    ],
    tools: createCoordinationTools(action, activities),
    prepareStep: () => prepareAgentStep(action, activities.loadDmeContext),
    stopWhen: stepCountIs(6),
  });

  const { answer, activities: toolActivities } = await collectAgentStream(result.fullStream, onActivity);
  if (!answer.trim()) throw new Error("The agent returned no answer");
  return { answer, activities: toolActivities };
}
