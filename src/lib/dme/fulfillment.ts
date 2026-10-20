import type { Case } from "../cases";
import { patientDetailsSchema } from "../patient-details";
import { bookedDeliveryWindow, deliveryWindowTimes } from "./delivery-timing";
import { caseNowMs } from "./demo-clock";

export type FulfillmentStage = "coordination" | "patient_confirmation" | "booking" | "notification" | "delivery" | "completed";

export function hasQualifiedSupplier(current: Case) {
  return current.coordination.calls.some((call) => call.kind === "supplier" && call.purpose === "outreach"
    && call.targetId === current.coordination.selectedSupplierId && call.status === "completed"
    && call.response?.acceptsNewMedicare && call.response.hasK0001 && call.response.deliveryEstimate
    && call.response.enrollmentConfirmed && call.response.acceptsAssignment && call.response.servesArea);
}

export function hasCoordinationReadiness(current: Case) {
  const documents = current.coordination.documents;
  return hasQualifiedSupplier(current)
    && documents.some((document) => document.kind === "signed_order")
    && documents.some((document) => document.kind === "clinical_records")
    && patientDetailsSchema.safeParse(current.coordination.patientDetails).success;
}

export function hasReferralPrerequisites(current: Case) {
  return Boolean(hasQualifiedSupplier(current) && current.coordination.patientDetails?.deliveryAddress
    && ["signed_order", "clinical_records"].every((kind) => current.coordination.documents.some((document) => document.kind === kind)));
}

export function hasValidSupplierOffer(current: Case) {
  const { offer, referralReview } = current.fulfillment;
  if (!offer || !referralReview || offer.supplierId !== current.coordination.selectedSupplierId
    || referralReview.supplierId !== offer.supplierId || referralReview.callId !== offer.callId
    || !referralReview.signedOrderReceived || !referralReview.clinicalRecordsReceived || referralReview.missingDocuments.length) return false;
  return Boolean(offer.manufacturer && offer.model && offer.hcpcs === current.intake.equipment.hcpcs
    && offer.arrangement && offer.authorizationRequirement && offer.advanceNoticeRequirement
    && offer.authorizationReady && offer.advanceNoticeReady && offer.deliveryAddressServed);
}

export function hasValidAgreement(current: Case) {
  const { offer, agreement } = current.fulfillment;
  return Boolean(hasValidSupplierOffer(current) && offer && agreement?.status === "accepted"
    && agreement.offerCallId === offer.callId
    && agreement.addressConfirmed
    && agreement.deliveryAddress === current.coordination.patientDetails?.deliveryAddress
    && offer.supplierId === current.coordination.selectedSupplierId
    && offer.slots.some((slot) => slot.id === agreement.selectedSlotId));
}

export function hasConfirmedBooking(current: Case) {
  const { offer, agreement, booking } = current.fulfillment;
  return hasValidAgreement(current) && Boolean(booking?.status === "confirmed"
    && booking.reference && booking.instructions
    && booking.supplierId === offer?.supplierId
    && booking.slotId === agreement?.selectedSlotId);
}

export function upcomingBookedDeliveryWindow(current: Case) {
  if (!hasConfirmedBooking(current) || current.fulfillment.notification?.bookingCallId !== current.fulfillment.booking?.callId) return null;
  if (!current.coordination.calls.some((call) => call.purpose === "supplier_delivery" && call.status === "awaiting_response")) return null;
  const slot = bookedDeliveryWindow(current);
  return slot && caseNowMs(current) < deliveryWindowTimes(slot).start ? slot : null;
}

export function hasValidSupplierDeliveryEvidence(current: Case) {
  const evidence = current.fulfillment.delivery.supplierEvidence;
  const slot = bookedDeliveryWindow(current);
  if (!evidence || !slot || !hasConfirmedBooking(current)) return false;
  const recordedCall = current.coordination.calls.find((call) => call.id === evidence.callId && call.purpose === "supplier_delivery" && call.status === "completed");
  const deliveredAt = Date.parse(evidence.deliveredAt);
  const recorded = recordedCall?.response?.delivery;
  if (!recorded?.delivered || Number.isNaN(deliveredAt)
    || !evidence.equipmentDelivered || !evidence.receiptStatus || !["signed_by_patient", "signed_by_caregiver", "carrier_tracking"].includes(evidence.receiptStatus)
    || recorded.equipmentDelivered !== evidence.equipmentDelivered
    || recorded.receiptStatus !== evidence.receiptStatus
    || !current.fulfillment.offer?.manufacturer || !current.fulfillment.offer.model
    || !evidence.equipmentDelivered.toLowerCase().includes(current.fulfillment.offer.manufacturer.toLowerCase())
    || !evidence.equipmentDelivered.toLowerCase().includes(current.fulfillment.offer.model.toLowerCase())
    || /\b(?:not yet|awaiting|pending|unconfirmed|not delivered|no proof)\b/i.test(`${evidence.proofReference} ${evidence.receiptStatus} ${recordedCall?.response?.answers.join(" ") ?? ""}`)) return false;
  const { start, end } = deliveryWindowTimes(slot);
  return deliveredAt >= start && deliveredAt <= end && deliveredAt <= caseNowMs(current)
    && deliveredAt <= Date.parse(recordedCall?.response?.answeredAt ?? "");
}

export function hasValidPatientDeliveryConfirmation(current: Case) {
  const confirmation = current.fulfillment.delivery.patientConfirmation;
  if (!confirmation || !hasValidSupplierDeliveryEvidence(current)) return false;
  const recordedCall = current.coordination.calls.find((call) => call.id === confirmation.callId && call.purpose === "patient_delivery" && call.status === "completed");
  return Boolean(recordedCall?.response?.delivery?.patientConfirmed && recordedCall?.response?.delivery?.usable
    && confirmation.usable
    && Date.parse(confirmation.confirmedAt) >= Date.parse(current.fulfillment.delivery.supplierEvidence!.deliveredAt)
    && Date.parse(confirmation.confirmedAt) <= caseNowMs(current));
}

export function getFulfillmentStage(current: Case): FulfillmentStage {
  if (!hasCoordinationReadiness(current)) return "coordination";
  if (!hasValidSupplierOffer(current)) return "patient_confirmation";
  if (!hasValidAgreement(current)) return "patient_confirmation";
  if (!hasConfirmedBooking(current)) return "booking";
  if (current.fulfillment.notification?.bookingCallId !== current.fulfillment.booking?.callId) return "notification";
  if (!hasValidSupplierDeliveryEvidence(current) || !hasValidPatientDeliveryConfirmation(current)
    || current.humanTasks.some((task) => task.status === "pending")) return "delivery";
  return "completed";
}

export function hasOpenCall(current: Case, purpose: Case["coordination"]["calls"][number]["purpose"]) {
  const pendingTaskCallIds = new Set(current.humanTasks.filter((task) => task.status === "pending").map((task) => task.callId));
  return current.coordination.calls.some((call) => call.purpose === purpose && (
    call.status === "awaiting_response" || call.status === "scheduled"
      || (call.status === "escalated" && pendingTaskCallIds.has(call.id))
  ));
}
