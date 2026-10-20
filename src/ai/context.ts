import type { DmeAction, loadDmeContext } from "../lib/dme/cases";
import { DME_AGENT_INSTRUCTIONS } from "./prompts";
import { getFulfillmentStage, hasConfirmedBooking, hasCoordinationReadiness, hasOpenCall, hasReferralPrerequisites, hasValidAgreement, hasValidSupplierOffer, hasValidSupplierDeliveryEvidence, hasValidPatientDeliveryConfirmation } from "../lib/dme/fulfillment";

export type LoadDmeContext = typeof loadDmeContext;
type AgentToolName = "contactPCP" | "contactSupplier" | "contactPatient" | "requestHumanAssistance" | "requestSupplierOffer" | "confirmPatientArrangement" | "bookDelivery" | "notifyPatient" | "requestSupplierDeliveryEvidence" | "requestPatientDeliveryConfirmation";

export async function prepareAgentStep(action: DmeAction, loadContext: LoadDmeContext) {
  const context = await loadContext(action);
  if (!context) return { activeTools: [] as AgentToolName[] };

  const { current, suppliers, missingPatientFields, documentContents } = context;
  const calls = current.coordination.calls;
  const supplierCalls = calls.filter((call) => call.kind === "supplier" && call.purpose === "outreach");
  const pendingSupplierTasks = new Set(current.humanTasks.filter((task) => task.status === "pending").map((task) => task.callId));
  const supplierOpen = supplierCalls.some((call) => call.status === "awaiting_response" || call.status === "scheduled" || (call.status === "escalated" && pendingSupplierTasks.has(call.id)));
  const availableSupplier = suppliers.some((supplier) => supplier.medicareEnrolled && !supplierCalls.some((call) => call.targetId === supplier.id));
  const pendingHumanCallIds = new Set(current.humanTasks.filter((task) => task.status === "pending").map((task) => task.callId));
  const stillOpen = (call: typeof calls[number]) => call.status === "awaiting_response" || call.status === "scheduled" || (call.status === "escalated" && pendingHumanCallIds.has(call.id));
  const pcpOpen = calls.some((call) => call.kind === "pcp" && call.purpose === "outreach" && stillOpen(call));
  const patientOpen = calls.some((call) => call.kind === "patient" && call.purpose === "outreach" && stillOpen(call));
  const missingDocuments = current.coordination.documents.length < 2;
  const activeTools: AgentToolName[] = [];
  if (!current.coordination.selectedSupplierId && !supplierOpen && availableSupplier) activeTools.push("contactSupplier");
  if (missingDocuments && !pcpOpen) activeTools.push("contactPCP");
  if (missingPatientFields.length > 0 && !patientOpen) activeTools.push("contactPatient");
  const supplierOptionsExhausted = !current.coordination.selectedSupplierId
    && !supplierOpen
    && !availableSupplier
    && supplierCalls.every((call) => call.status === "completed" || call.status === "escalated");
  if (supplierOptionsExhausted) activeTools.push("requestHumanAssistance");
  const fulfillment = current.fulfillment;
  const referralReady = hasReferralPrerequisites(current);
  const referralBlocked = current.humanTasks.some((task) => task.status === "pending" && task.blockerKey.startsWith(`referral:${current.coordination.selectedSupplierId}:`));
  if (current.coordination.selectedSupplierId && referralReady && !referralBlocked && (!hasValidSupplierOffer(current) || fulfillment.booking?.status === "rejected") && !hasOpenCall(current, "supplier_offer")) activeTools.push("requestSupplierOffer");
  if (hasCoordinationReadiness(current) && hasValidSupplierOffer(current) && fulfillment.booking?.status !== "rejected" && !hasValidAgreement(current) && !hasOpenCall(current, "patient_arrangement")) activeTools.push("confirmPatientArrangement");
  if (hasCoordinationReadiness(current) && hasValidAgreement(current) && !fulfillment.booking && !hasOpenCall(current, "supplier_booking")) activeTools.push("bookDelivery");
  if (hasCoordinationReadiness(current) && hasConfirmedBooking(current) && fulfillment.notification?.bookingCallId !== fulfillment.booking?.callId) activeTools.push("notifyPatient");
  if (getFulfillmentStage(current) === "delivery") {
    if (!hasValidSupplierDeliveryEvidence(current) && !hasOpenCall(current, "supplier_delivery")) activeTools.push("requestSupplierDeliveryEvidence");
    if (hasValidSupplierDeliveryEvidence(current) && !hasValidPatientDeliveryConfirmation(current) && !hasOpenCall(current, "patient_delivery")) activeTools.push("requestPatientDeliveryConfirmation");
  }

  return {
    activeTools,
    system: `${DME_AGENT_INSTRUCTIONS}\n\nCurrent authoritative case context:\n${JSON.stringify({
      intake: current.intake,
      requiredDocuments: ["signed_order", "clinical_records"],
      receivedDocuments: current.coordination.documents,
      documentContents,
      supplierDirectory: suppliers,
      supplierCalls,
      pcpCalls: calls.filter((call) => call.kind === "pcp"),
      patientCalls: calls.filter((call) => call.kind === "patient"),
      patientDetails: current.coordination.patientDetails,
      patientConversation: current.patientMessages.slice(-20),
      missingPatientFields,
      selectedSupplierId: current.coordination.selectedSupplierId,
      fulfillment: current.fulfillment,
      fulfillmentStage: getFulfillmentStage(current),
      supplierDeliveryValid: hasValidSupplierDeliveryEvidence(current),
      patientDeliveryValid: hasValidPatientDeliveryConfirmation(current),
      humanTasks: current.humanTasks,
    })}`,
  };
}
