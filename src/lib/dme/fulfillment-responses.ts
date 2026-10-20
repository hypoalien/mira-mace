import { patientDetailsSchema, type Case, type CaseCall, type DeliverySlot } from "../cases";
import { hasConfirmedBooking, hasCoordinationReadiness, hasReferralPrerequisites, hasValidSupplierOffer, hasValidSupplierDeliveryEvidence } from "./fulfillment";
import { addHumanTask } from "./human-tasks";
import { validateDeliveryWindows } from "./delivery-windows";
import { bookedDeliveryWindow, deliveryWindowTimes } from "./delivery-timing";
import { caseNowMs } from "./demo-clock";

export type FulfillmentAnswer = {
  answers: string[];
  costEstimate?: string;
  rentalTerms?: string;
  signedOrderReceived?: boolean;
  clinicalRecordsReceived?: boolean;
  missingDocuments?: string[];
  deliveryAddressServed?: boolean;
  manufacturer?: string;
  model?: string;
  hcpcs?: string;
  arrangement?: string;
  authorizationRequirement?: string;
  advanceNoticeRequirement?: string;
  authorizationReady?: boolean;
  advanceNoticeReady?: boolean;
  deliveryWindows?: string[];
  timeZone?: string;
  agreementAccepted?: boolean;
  addressConfirmed?: boolean;
  selectedSlotId?: string;
  bookingConfirmed?: boolean;
  bookingReference?: string;
  bookingInstructions?: string;
  delivered?: boolean;
  proofReference?: string;
  deliveredAt?: string;
  equipmentDelivered?: string;
  receiptStatus?: string;
  patientConfirmed?: boolean;
  usable?: boolean;
  issue?: string;
};

function completedCall(call: CaseCall, answer: FulfillmentAnswer, now: string, details: Omit<NonNullable<CaseCall["response"]>, "answeredAt" | "answers">) {
  return { ...call, status: "completed" as const, scheduledFor: null, response: { answeredAt: now, answers: answer.answers, ...details } };
}

function replaceCall(current: Case, updated: CaseCall) {
  return current.coordination.calls.map((call) => call.id === updated.id ? updated : call);
}

export function applyFulfillmentAnswer(current: Case, call: CaseCall, answer: FulfillmentAnswer, now: string): Case {
  if (call.purpose === "supplier_offer") {
    if (call.targetId !== current.coordination.selectedSupplierId) throw new Error("The selected supplier changed");
    if (!hasReferralPrerequisites(current)) throw new Error("PCP documents and the delivery address must be ready for supplier referral review");
    if (answer.signedOrderReceived === undefined || answer.clinicalRecordsReceived === undefined || !answer.missingDocuments
      || answer.deliveryAddressServed === undefined || answer.authorizationReady === undefined || answer.advanceNoticeReady === undefined) {
      throw new Error("Complete the supplier's document, service area, authorization, and notice review");
    }
    const costEstimate = answer.costEstimate?.trim();
    const rentalTerms = answer.rentalTerms?.trim();
    const manufacturer = answer.manufacturer?.trim();
    const model = answer.model?.trim();
    const hcpcs = answer.hcpcs?.trim();
    const arrangement = answer.arrangement?.trim();
    const authorizationRequirement = answer.authorizationRequirement?.trim();
    const advanceNoticeRequirement = answer.advanceNoticeRequirement?.trim();
    const windows = answer.deliveryWindows?.map((window) => window.trim()).filter(Boolean);
    const timeZone = answer.timeZone?.trim();
    if (!costEstimate || !rentalTerms || !timeZone || !windows?.length || !manufacturer || !model || !hcpcs || !arrangement
      || !authorizationRequirement || !advanceNoticeRequirement) throw new Error("Complete equipment, coding, cost, terms, requirements, and delivery windows");
    const missingDocuments = answer.missingDocuments.map((item) => item.trim()).filter(Boolean);
    const referralReview = { callId: call.id, supplierId: call.targetId, signedOrderReceived: answer.signedOrderReceived,
      clinicalRecordsReceived: answer.clinicalRecordsReceived, missingDocuments, reviewedAt: now };
    const problems = [
      ...missingDocuments,
      ...(!answer.signedOrderReceived ? ["Signed order not received"] : []),
      ...(!answer.clinicalRecordsReceived ? ["Clinical records not received"] : []),
      ...(!answer.deliveryAddressServed ? ["Supplier cannot serve the delivery address"] : []),
      ...(hcpcs !== current.intake.equipment.hcpcs ? [`Planned code ${hcpcs} differs from ${current.intake.equipment.hcpcs}`] : []),
      ...(!answer.authorizationReady ? [`Authorization unresolved: ${authorizationRequirement}`] : []),
      ...(!answer.advanceNoticeReady ? [`Advance notice unresolved: ${advanceNoticeRequirement}`] : []),
    ];
    const responseOffer = { costEstimate, rentalTerms, deliveryWindows: windows, timeZone,
      signedOrderReceived: answer.signedOrderReceived, clinicalRecordsReceived: answer.clinicalRecordsReceived, missingDocuments,
      deliveryAddressServed: answer.deliveryAddressServed, manufacturer, model, hcpcs, arrangement,
      authorizationRequirement, advanceNoticeRequirement, authorizationReady: answer.authorizationReady, advanceNoticeReady: answer.advanceNoticeReady };
    const updated = completedCall(call, answer, now, { offer: responseOffer });
    if (problems.length) {
      const tasks = addHumanTask(current, { type: "missing_information", title: "Resolve supplier referral review",
        description: `${call.targetName} reported: ${problems.join("; ")}. Resolve these before requesting a new supplier review.`,
        blockerKey: `referral:${call.targetId}:${call.id}`, sourceToolCallId: `referral:${call.id}`, callId: call.id }).tasks;
      return { ...current, updatedAt: now, humanTasks: tasks,
        coordination: { ...current.coordination, calls: replaceCall(current, updated) },
        fulfillment: { ...current.fulfillment, referralReview, offer: null, agreement: null, booking: null, notification: null,
          delivery: { supplierEvidence: null, patientConfirmation: null } } };
    }
    const validWindows = validateDeliveryWindows(windows, timeZone, new Date(caseNowMs(current)));
    const slots: DeliverySlot[] = validWindows.map((window, index) => ({ id: `${call.id}:slot-${index + 1}`, window, timeZone }));
    const offer = { callId: call.id, supplierId: call.targetId, equipment: current.intake.equipment.name, costEstimate, rentalTerms,
      manufacturer, model, hcpcs, arrangement, authorizationRequirement, advanceNoticeRequirement,
      authorizationReady: answer.authorizationReady, advanceNoticeReady: answer.advanceNoticeReady,
      deliveryAddressServed: answer.deliveryAddressServed, slots, receivedAt: now };
    return { ...current, updatedAt: now, coordination: { ...current.coordination, calls: replaceCall(current, updated) }, fulfillment: { ...current.fulfillment, referralReview, offer, agreement: null, booking: null, notification: null, delivery: { supplierEvidence: null, patientConfirmation: null } } };
  }

  if (call.purpose === "patient_arrangement") {
    const offer = current.fulfillment.offer;
    if (!hasCoordinationReadiness(current) || !hasValidSupplierOffer(current) || !offer || call.offerCallId !== offer.callId) throw new Error("The supplier offer changed; request patient agreement again");
    if (answer.agreementAccepted === undefined || (answer.agreementAccepted && answer.addressConfirmed === undefined)) throw new Error("Record explicit patient agreement and address confirmation");
    const addressConfirmed = answer.addressConfirmed ?? false;
    const selectedSlotId = answer.selectedSlotId?.trim() ?? null;
    if (answer.agreementAccepted && (!addressConfirmed || !offer.slots.some((slot) => slot.id === selectedSlotId))) throw new Error("Accepted agreement requires the confirmed address and an offered delivery window");
    const agreement = {
      callId: call.id, offerCallId: offer.callId,
      status: answer.agreementAccepted ? "accepted" as const : "declined" as const,
      addressConfirmed,
      deliveryAddress: patientDetailsSchema.parse(current.coordination.patientDetails).deliveryAddress,
      selectedSlotId: answer.agreementAccepted ? selectedSlotId : null,
      respondedAt: now,
    };
    const updated = completedCall(call, answer, now, { agreement: { accepted: answer.agreementAccepted, addressConfirmed, selectedSlotId: selectedSlotId ?? undefined } });
    const tasks = answer.agreementAccepted ? current.humanTasks : addHumanTask(current, {
      type: "other", title: "Resolve patient arrangement",
      description: `${current.intake.patient.name} did not accept the proposed cost, terms, address, or delivery options. Review the recorded response and resolve the concern before another offer is proposed.`,
      blockerKey: `arrangement:${offer.callId}`, sourceToolCallId: `arrangement:${call.id}`, callId: call.id,
    }).tasks;
    return { ...current, updatedAt: now, humanTasks: tasks, coordination: { ...current.coordination, calls: replaceCall(current, updated) }, fulfillment: { ...current.fulfillment, agreement, booking: null, notification: null, delivery: { supplierEvidence: null, patientConfirmation: null } } };
  }

  if (call.purpose === "supplier_booking") {
    const booking = current.fulfillment.booking;
    if (!booking || booking.callId !== call.id || call.offerCallId !== current.fulfillment.offer?.callId) throw new Error("Booking request is no longer current");
    if (answer.bookingConfirmed === undefined) throw new Error("Record whether the supplier confirmed booking");
    const reference = answer.bookingReference?.trim();
    const instructions = answer.bookingInstructions?.trim();
    if (answer.bookingConfirmed && (!reference || !instructions)) throw new Error("A confirmed booking needs a reference and delivery instructions");
    const updated = completedCall(call, answer, now, { booking: { confirmed: answer.bookingConfirmed, reference, instructions } });
    return { ...current, updatedAt: now, coordination: { ...current.coordination, calls: replaceCall(current, updated) }, fulfillment: { ...current.fulfillment, booking: { ...booking, status: answer.bookingConfirmed ? "confirmed" : "rejected", reference: answer.bookingConfirmed ? reference! : null, instructions: answer.bookingConfirmed ? instructions : undefined, confirmedAt: answer.bookingConfirmed ? now : null }, notification: null } };
  }

  if (call.purpose === "supplier_delivery" || call.purpose === "patient_delivery") {
    if (!hasConfirmedBooking(current) || current.fulfillment.notification?.bookingCallId !== current.fulfillment.booking?.callId) throw new Error("Delivery cannot be verified before booking and notification");
    if (call.purpose === "supplier_delivery") {
      if (answer.delivered === undefined) throw new Error("Record whether the supplier delivered the equipment");
      const proofReference = answer.proofReference?.trim();
      const deliveredAt = answer.deliveredAt?.trim();
      const equipmentDelivered = answer.equipmentDelivered?.trim();
      const receiptStatus = answer.receiptStatus?.trim();
      if (answer.delivered && (!proofReference || !deliveredAt || !equipmentDelivered || !receiptStatus || !["signed_by_patient", "signed_by_caregiver", "carrier_tracking"].includes(receiptStatus) || Number.isNaN(Date.parse(deliveredAt)))) throw new Error("Supplier delivery needs equipment identity, a signed receipt or tracking status, proof reference, and delivery time");
      if (answer.delivered) {
        const offer = current.fulfillment.offer;
        if (!offer?.manufacturer || !offer.model || !equipmentDelivered!.toLowerCase().includes(offer.manufacturer.toLowerCase())
          || !equipmentDelivered!.toLowerCase().includes(offer.model.toLowerCase())
          || /\b(?:not yet|awaiting|pending|unconfirmed|not delivered|no proof)\b/i.test(`${proofReference} ${receiptStatus} ${answer.answers.join(" ")}`)) {
          throw new Error("Supplier delivery proof conflicts with the booked equipment or says delivery is pending");
        }
        const slot = bookedDeliveryWindow(current);
        if (!slot) throw new Error("A booked delivery window is required");
        const { start, end } = deliveryWindowTimes(slot);
        const delivered = Date.parse(deliveredAt!);
        if (delivered < start || delivered > end || delivered > Date.parse(now)) {
          throw new Error("Delivery proof must be within the booked window and cannot be recorded before delivery");
        }
      }
      const updated = completedCall(call, answer, now, { delivery: { delivered: answer.delivered, proofReference, deliveredAt, equipmentDelivered, receiptStatus } });
      const tasks = answer.delivered ? current.humanTasks : addHumanTask(current, {
        type: "other", title: "Resolve missing delivery",
        description: `${call.targetName} reported that the equipment was not delivered. Investigate before verifying fulfillment.`,
        blockerKey: `delivery:${current.fulfillment.booking?.callId}:supplier`, sourceToolCallId: `delivery:${call.id}`, callId: call.id,
      }).tasks;
      return { ...current, updatedAt: now, humanTasks: tasks, coordination: { ...current.coordination, calls: replaceCall(current, updated) }, fulfillment: { ...current.fulfillment, delivery: { ...current.fulfillment.delivery, supplierEvidence: answer.delivered ? { callId: call.id, proofReference: proofReference!, deliveredAt: new Date(deliveredAt!).toISOString(), equipmentDelivered: equipmentDelivered!, receiptStatus: receiptStatus! } : null } } };
    }
    if (answer.patientConfirmed === undefined) throw new Error("Record the patient's delivery confirmation");
    if (answer.patientConfirmed && !hasValidSupplierDeliveryEvidence(current)) throw new Error("Wait for valid supplier delivery proof before confirming with the patient");
    const issue = answer.issue?.trim();
    if (answer.patientConfirmed && (!answer.usable || issue)) throw new Error("Patient confirmation requires usable equipment and no unresolved issue");
    if (!answer.patientConfirmed && !issue) throw new Error("Describe the patient's delivery issue");
    const updated = completedCall(call, answer, now, { delivery: { delivered: answer.patientConfirmed, patientConfirmed: answer.patientConfirmed, usable: answer.usable, issue } });
    const tasks = answer.patientConfirmed ? current.humanTasks : addHumanTask(current, {
      type: "other", title: "Resolve patient delivery issue",
      description: `${current.intake.patient.name} reported: ${issue}. Resolve this before closing delivery.`,
      blockerKey: `delivery:${current.fulfillment.booking?.callId}:patient`, sourceToolCallId: `delivery:${call.id}`, callId: call.id,
    }).tasks;
    return { ...current, updatedAt: now, humanTasks: tasks, coordination: { ...current.coordination, calls: replaceCall(current, updated) }, fulfillment: { ...current.fulfillment, delivery: { ...current.fulfillment.delivery, patientConfirmation: answer.patientConfirmed ? { callId: call.id, confirmedAt: now, usable: true } : null } } };
  }
  throw new Error("Unknown fulfillment call purpose");
}
