import { updateCase, type CaseCall } from "../cases";
import { hasConfirmedBooking, hasCoordinationReadiness, hasOpenCall, hasValidAgreement } from "./fulfillment";
import { matches, type DmeAction, type ContactResult } from "./cases";

export async function bookDelivery(input: DmeAction & { toolCallId: string }) {
  return updateCase<ContactResult>(input.caseId, (current) => {
    if (!matches(current, input)) return null;
    const callId = `${input.workflowId}:${input.toolCallId}`;
    const prior = current.coordination.calls.find((call) => call.id === callId);
    if (prior) return { next: current, result: { status: prior.status, callId } };
    if (hasConfirmedBooking(current)) return { next: current, result: { status: "already_confirmed" } };
    if (!hasCoordinationReadiness(current) || !hasValidAgreement(current)) return { next: current, result: { status: "agreement_required" } };
    if (hasOpenCall(current, "supplier_booking")) return { next: current, result: { status: "already_pending" } };
    const offer = current.fulfillment.offer!;
    const slot = offer.slots.find((item) => item.id === current.fulfillment.agreement?.selectedSlotId)!;
    const supplier = current.coordination.calls.find((call) => call.targetId === offer.supplierId)!;
    const call: CaseCall = {
      id: callId, kind: "supplier", purpose: "supplier_booking", targetId: offer.supplierId, targetName: supplier.targetName,
      offerCallId: offer.callId,
      reason: `Request booking for the patient's agreed ${current.intake.equipment.name} delivery window.`,
      questions: [`Can you confirm booking ${slot.window} ${slot.timeZone} at ${current.fulfillment.agreement?.deliveryAddress}, provide a booking reference, and state delivery instructions?`],
      supplierCallsAtStart: [], status: "awaiting_response", attempt: 1, attemptHistory: [],
      scheduledFor: null, createdAt: new Date().toISOString(), response: null,
    };
    return {
      next: { ...current, updatedAt: new Date().toISOString(), fulfillment: { ...current.fulfillment, booking: { callId, supplierId: offer.supplierId, slotId: slot.id, status: "pending", reference: null, confirmedAt: null } }, coordination: { ...current.coordination, calls: [...current.coordination.calls, call] } },
      result: { status: "awaiting_response", callId, target: call.targetName },
    };
  });
}
