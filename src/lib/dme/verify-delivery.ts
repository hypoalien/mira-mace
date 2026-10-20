import { updateCase, type CaseCall } from "../cases";
import { getFulfillmentStage, hasOpenCall, hasValidSupplierDeliveryEvidence, hasValidPatientDeliveryConfirmation } from "./fulfillment";
import { matches, type DmeAction, type ContactResult } from "./cases";

export async function requestSupplierDeliveryEvidence(input: DmeAction & { toolCallId: string }) {
  return queueDeliveryCall(input, "supplier_delivery");
}

export async function requestPatientDeliveryConfirmation(input: DmeAction & { toolCallId: string; patientMessage: string }) {
  return queueDeliveryCall(input, "patient_delivery");
}

function queueDeliveryCall(input: DmeAction & { toolCallId: string; patientMessage?: string }, purpose: "supplier_delivery" | "patient_delivery") {
  return updateCase<ContactResult>(input.caseId, (current) => {
    if (!matches(current, input)) return null;
    const callId = `${input.workflowId}:${input.toolCallId}`;
    const prior = current.coordination.calls.find((call) => call.id === callId);
    if (prior) return { next: current, result: { status: prior.status, callId } };
    if (getFulfillmentStage(current) !== "delivery") return { next: current, result: { status: "not_ready" } };
    const alreadyRecorded = purpose === "supplier_delivery" ? hasValidSupplierDeliveryEvidence(current) : hasValidPatientDeliveryConfirmation(current);
    if (alreadyRecorded) return { next: current, result: { status: "already_verified" } };
    if (purpose === "patient_delivery" && !hasValidSupplierDeliveryEvidence(current)) return { next: current, result: { status: "supplier_evidence_required" } };
    if (hasOpenCall(current, purpose)) return { next: current, result: { status: "already_pending" } };
    const supplier = current.coordination.calls.find((call) => call.targetId === current.coordination.selectedSupplierId)!;
    const patient = purpose === "patient_delivery";
    const patientMessage = patient ? input.patientMessage?.trim() : undefined;
    if (patient && !patientMessage) throw new Error("A patient-facing message is required");
    const call: CaseCall = {
      id: callId, kind: patient ? "patient" : "supplier", purpose,
      targetId: patient ? "PATIENT" : supplier.targetId,
      targetName: patient ? current.intake.patient.name : supplier.targetName,
      patientMessage,
      reason: patient ? "Confirm delivery and check for equipment issues." : "Obtain delivery proof from the supplier.",
      questions: patient
        ? [`Did you receive the correct ${current.intake.equipment.name}, can you use it, and is there any delivery or equipment issue?`]
        : [`Was the booked ${current.fulfillment.offer?.manufacturer} ${current.fulfillment.offer?.model} delivered? Identify the equipment, delivery time, proof reference, and receipt or signature status.`],
      supplierCallsAtStart: [], status: "awaiting_response", attempt: 1, attemptHistory: [],
      scheduledFor: null, createdAt: new Date().toISOString(), response: null,
    };
    return { next: {
      ...current,
      updatedAt: new Date().toISOString(),
      patientMessages: patient
        ? [...current.patientMessages, { role: "assistant", content: patientMessage!, turnId: `patient-request:${call.id}` }]
        : current.patientMessages,
      coordination: { ...current.coordination, calls: [...current.coordination.calls, call] },
    }, result: { status: "awaiting_response", callId, target: call.targetName } };
  });
}
