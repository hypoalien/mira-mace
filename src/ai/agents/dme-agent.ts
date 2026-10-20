import { streamText, stepCountIs, type LanguageModel } from "ai";
import type { ChatActivity } from "../../lib/chat-activity";
import type { DmeAction } from "../../lib/dme/cases";
import { prepareAgentStep, type LoadDmeContext } from "../context";
import { DME_AGENT_INSTRUCTIONS } from "../prompts";
import { createCoordinationTools, type ContactActivities } from "../tools";
import { collectAgentStream } from "./collect-agent-stream";
import { getFulfillmentStage, hasValidSupplierDeliveryEvidence, hasValidPatientDeliveryConfirmation } from "../../lib/dme/fulfillment";

type DmeAgentActivities = ContactActivities & {
  loadDmeContext: LoadDmeContext;
};

export async function runDmeAgent(
  model: LanguageModel,
  action: DmeAction,
  activities: DmeAgentActivities,
  onActivity: (activity: ChatActivity) => Promise<void>,
  statusOnly = false,
) {
  const context = statusOnly ? await activities.loadDmeContext(action) : null;
  const current = context?.current;
  const calls = current?.coordination.calls ?? [];
  const latestResponse = calls
    .filter((call) => call.response?.answeredAt)
    .sort((left, right) => right.response!.answeredAt.localeCompare(left.response!.answeredAt))[0];
  const supplierDeliveredAt = current?.fulfillment.delivery.supplierEvidence?.deliveredAt;
  const patientConfirmedAt = current?.fulfillment.delivery.patientConfirmation?.confirmedAt;
  const deliveryChronological = supplierDeliveredAt && patientConfirmedAt ? patientConfirmedAt >= supplierDeliveredAt : null;
  const supplierDeliveryValid = current ? hasValidSupplierDeliveryEvidence(current) : false;
  const patientDeliveryValid = current ? hasValidPatientDeliveryConfirmation(current) : false;
  const caseFacts = current ? {
    fulfillmentStage: getFulfillmentStage(current),
    supplierDeliveryValid,
    patientDeliveryValid,
    selectedSupplierId: current.coordination.selectedSupplierId,
    receivedDocuments: context!.documentContents,
    patientDetails: current.coordination.patientDetails,
    recentPatientConversation: current.patientMessages.slice(-4).map(({ role, content }) => ({ role, content })),
    missingPatientFields: context!.missingPatientFields,
    fulfillment: current.fulfillment,
    deliveryChronology: supplierDeliveredAt && patientConfirmedAt
      ? {
          supplierDeliveredAt,
          patientConfirmedAt,
          chronological: deliveryChronological,
        }
      : null,
    latestResponse: latestResponse ? { party: latestResponse.kind, purpose: latestResponse.purpose, target: latestResponse.targetName, response: latestResponse.response } : null,
    awaitingResponse: calls.filter((call) => call.status === "awaiting_response").map((call) => ({ party: call.kind, purpose: call.purpose, target: call.targetName })),
    scheduledFollowUps: calls.filter((call) => call.status === "scheduled").map((call) => ({ party: call.kind, purpose: call.purpose, target: call.targetName })),
    pendingHumanTasks: current.humanTasks.filter((task) => task.status === "pending"),
  } : null;
  const result = streamText({
    model,
    system: DME_AGENT_INSTRUCTIONS,
    prompt: statusOnly
      ? `A case update was recorded. Write a fresh update from this authoritative current snapshot: ${JSON.stringify(caseFacts)}. Focus on current progress and remaining work. A patient chat message does not prove a supplier action. Received documents include extracted PDF text. Only a recorded answer supplies facts; awaiting and scheduled calls have not answered. This is a local simulation: describe any delivery as a mock report, not independently verified real-world delivery. Supplier delivery is established only when supplierDeliveryValid is true; patient receipt is established only when patientDeliveryValid is true. If either is false, do not say delivery or patient receipt was confirmed, even if an earlier response claimed it. When both are false, explain that valid supplier proof must come first and the patient must then confirm again. In at most two short, plain sentences, explain progress and remaining work. Do not claim a new call was made, and do not include dates or times.`
      : "Review the current case and take useful coordination actions now. Finish with an update for the care advocate in at most two short, plain sentences. Check the PCP, supplier, and patient call lists in the latest case context. Mention each party whose call is awaiting response or follow-up is scheduled. For a scheduled call, say there was no answer and a follow-up is scheduled. Treat supplier delivery and patient receipt as unverified unless supplierDeliveryValid and patientDeliveryValid are true in the authoritative context. If old delivery reports are invalid, explain that fresh supplier proof is needed before asking the patient to confirm receipt again. Do not include dates or times; the UI displays the exact schedule. Never imply that a queued call was answered. Avoid status jargon and repeating case details already visible on the page.",
    tools: createCoordinationTools(action, activities),
    prepareStep: async () => {
      const step = await prepareAgentStep(action, activities.loadDmeContext);
      return {
        ...step,
        activeTools: statusOnly ? [] : step.activeTools,
        toolChoice: statusOnly ? "auto" as const : step.activeTools.some((name) => name !== "requestHumanAssistance") ? "required" as const : "auto" as const,
      };
    },
    stopWhen: stepCountIs(6),
  });
  const { activities: toolActivities } = await collectAgentStream(result.fullStream, onActivity);
  return { answer: await result.text, activities: toolActivities };
}
