import { updateCase, type CaseCall } from "../cases";
import { hasOpenCall, hasReferralPrerequisites, hasValidSupplierOffer } from "./fulfillment";
import { matches, type DmeAction, type ContactResult } from "./cases";

export async function requestSupplierOffer(input: DmeAction & { toolCallId: string; reason: string }) {
  return updateCase<ContactResult>(input.caseId, (current) => {
    if (!matches(current, input)) return null;
    const callId = `${input.workflowId}:${input.toolCallId}`;
    const prior = current.coordination.calls.find((call) => call.id === callId);
    if (prior) return { next: current, result: { status: prior.status, callId } };
    const supplierId = current.coordination.selectedSupplierId;
    if (!supplierId) return { next: current, result: { status: "supplier_not_selected" } };
    if (!hasReferralPrerequisites(current)) return { next: current, result: { status: "referral_not_ready" } };
    if (current.humanTasks.some((task) => task.status === "pending" && task.blockerKey.startsWith(`referral:${supplierId}:`))) return { next: current, result: { status: "referral_needs_advocate" } };
    if (hasValidSupplierOffer(current) && current.fulfillment.booking?.status !== "rejected") return { next: current, result: { status: "offer_recorded" } };
    if (hasOpenCall(current, "supplier_offer")) return { next: current, result: { status: "already_pending" } };
    const supplier = current.coordination.calls.find((call) => call.purpose === "outreach" && call.kind === "supplier" && call.targetId === supplierId && call.status === "completed");
    if (!supplier) return { next: current, result: { status: "supplier_not_qualified" } };
    const call: CaseCall = {
      id: callId, kind: "supplier", purpose: "supplier_offer", targetId: supplierId, targetName: supplier.targetName,
      reason: input.reason, questions: [
        "Did you receive the signed wheelchair order and clinical records? List each missing or unusable item specifically.",
        `Can you serve the confirmed delivery address, ${current.coordination.patientDetails!.deliveryAddress}?`,
        `What manufacturer, model, and planned HCPCS code will you supply for ${current.intake.equipment.name}?`,
        "Is this a rental or purchase, and are authorization or advance notice steps required?",
        `What is the patient's estimated cost for ${current.intake.equipment.name}?`,
        "What are the rental terms?",
        "Which delivery windows are available, and in what time zone?",
      ], supplierCallsAtStart: [], status: "awaiting_response", attempt: 1, attemptHistory: [],
      scheduledFor: null, createdAt: new Date().toISOString(), response: null,
    };
    return { next: { ...current, updatedAt: new Date().toISOString(), coordination: { ...current.coordination, calls: [...current.coordination.calls, call] } }, result: { status: "awaiting_response", callId, target: call.targetName } };
  });
}
