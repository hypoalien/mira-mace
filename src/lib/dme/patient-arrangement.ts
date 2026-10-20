import { updateCase, type CaseCall } from "../cases";
import { hasCoordinationReadiness, hasOpenCall, hasValidAgreement, hasValidSupplierOffer } from "./fulfillment";
import { matches, type DmeAction, type ContactResult } from "./cases";

export async function confirmPatientArrangement(input: DmeAction & { toolCallId: string; patientMessage: string }) {
  return updateCase<ContactResult>(input.caseId, (current) => {
    if (!matches(current, input)) return null;
    const callId = `${input.workflowId}:${input.toolCallId}`;
    const prior = current.coordination.calls.find((call) => call.id === callId);
    if (prior) return { next: current, result: { status: prior.status, callId } };
    const offer = current.fulfillment.offer;
    if (!hasCoordinationReadiness(current) || !hasValidSupplierOffer(current) || !offer || offer.supplierId !== current.coordination.selectedSupplierId) return { next: current, result: { status: "not_ready" } };
    if (hasValidAgreement(current)) return { next: current, result: { status: "already_agreed" } };
    if (hasOpenCall(current, "patient_arrangement")) return { next: current, result: { status: "already_pending" } };
    const patientMessage = input.patientMessage.trim();
    if (!patientMessage) throw new Error("A patient-facing message is required");
    const call: CaseCall = {
      id: callId, kind: "patient", purpose: "patient_arrangement", targetId: "PATIENT", targetName: current.intake.patient.name,
      offerCallId: offer.callId,
      patientMessage,
      reason: `Confirm ${current.intake.equipment.name} from ${current.coordination.calls.find((item) => item.targetId === offer.supplierId)?.targetName ?? "the selected supplier"}.`,
      questions: [
        `The estimated patient cost is ${offer.costEstimate}. Do you accept this cost and the rental terms: ${offer.rentalTerms}?`,
        `Is ${current.coordination.patientDetails?.deliveryAddress} the correct delivery address?`,
        `Which available delivery window do you prefer: ${offer.slots.map((slot) => `${slot.window} (${slot.timeZone})`).join("; ")}?`,
      ], supplierCallsAtStart: [], status: "awaiting_response", attempt: 1, attemptHistory: [],
      scheduledFor: null, createdAt: new Date().toISOString(), response: null,
    };
    return { next: {
      ...current,
      updatedAt: new Date().toISOString(),
      patientMessages: [...current.patientMessages, { role: "assistant", content: patientMessage, turnId: `patient-request:${call.id}` }],
      coordination: { ...current.coordination, calls: [...current.coordination.calls, call] },
    }, result: { status: "awaiting_response", callId, target: call.targetName } };
  });
}
