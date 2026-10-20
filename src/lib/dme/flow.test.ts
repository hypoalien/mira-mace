import assert from "node:assert/strict";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { createCaseFromIntake, getCase, updateCase, type CaseCall } from "../cases";
import { DEMO_DOCUMENTS } from "../dme-constants";
import { caseNowIso } from "./demo-clock";
import { validateDemoDocuments } from "./document-text";
import { requestSupplierOffer } from "./supplier-offer";
import { contactSupplier } from "./contact-supplier";
import { confirmPatientArrangement } from "./patient-arrangement";
import { bookDelivery } from "./book-delivery";
import { notifyPatient } from "./notify-patient";
import { requestPatientDeliveryConfirmation, requestSupplierDeliveryEvidence } from "./verify-delivery";
import { getFulfillmentStage, hasValidSupplierDeliveryEvidence, hasValidSupplierOffer } from "./fulfillment";
import { recordMockResponse } from "./responses";
import { travelToBookedDeliveryWindow } from "./travel-to-delivery";
import { runScheduledFollowUpNow } from "./cases";
import { prepareAgentStep } from "../../ai/context";
import { loadDmeContext } from "./cases";

test("a supplier decline moves on without scheduling another call", async () => {
  const created = await createCaseFromIntake();
  const filename = path.join(process.cwd(), "data", "cases", `${created.id}.json`);
  try {
    const call: CaseCall = {
      id: "supplier-decline", kind: "supplier", purpose: "outreach", targetId: "SUP-001", targetName: "Lakeshore Home Medical Equipment",
      reason: "Check availability", questions: ["Can you supply this wheelchair?"], supplierCallsAtStart: [],
      status: "awaiting_response", attempt: 1, attemptHistory: [], scheduledFor: null, createdAt: created.createdAt, response: null,
    };
    await updateCase(created.id, (current) => ({ next: { ...current, coordination: { ...current.coordination, calls: [call] } }, result: true }));
    await recordMockResponse(created.id, call.id, { outcome: "negative", issue: "No K0001 stock" });
    const current = await getCase(created.id);
    assert.equal(current?.coordination.calls[0].status, "completed");
    assert.equal(current?.coordination.calls[0].scheduledFor, null);
    assert.equal(current?.humanTasks.length, 0);
  } finally {
    await unlink(filename).catch(() => undefined);
  }
});

test("a supplier that answers without stock is skipped immediately", async () => {
  const created = await createCaseFromIntake();
  const filename = path.join(process.cwd(), "data", "cases", `${created.id}.json`);
  const action = { caseId: created.id, generation: created.generation, workflowId: `test-${created.id}` };
  try {
    await updateCase(created.id, (current) => ({ next: { ...current, coordination: { ...current.coordination, workflowId: action.workflowId } }, result: true }));
    const first = await contactSupplier({ ...action, toolCallId: "first", reason: "Check availability", questions: [] });
    assert.equal(first?.supplierId, "SUP-001");
    assert(first?.callId);
    const current = await getCase(created.id);
    const call = current?.coordination.calls.find((item) => item.id === first.callId);
    assert(call);
    await recordMockResponse(created.id, call.id, {
      outcome: "answered", answers: ["Yes", "No", "Unavailable", "Yes", "Yes", "Yes"],
      acceptsNewMedicare: true, hasK0001: false, deliveryEstimate: "Unavailable",
      enrollmentConfirmed: true, acceptsAssignment: true, servesArea: true,
    });
    const second = await contactSupplier({ ...action, toolCallId: "second", reason: "Try another supplier", questions: [] });
    assert.equal(second?.supplierId, "SUP-002");
    const after = await getCase(created.id);
    assert.equal(after?.coordination.calls[0].status, "completed");
    assert.equal(after?.coordination.calls[0].scheduledFor, null);
  } finally {
    await unlink(filename).catch(() => undefined);
  }
});

test("referral review, agreement, booking, and delivery require consistent evidence", async () => {
  const created = await createCaseFromIntake();
  const filename = path.join(process.cwd(), "data", "cases", `${created.id}.json`);
  const action = { caseId: created.id, generation: created.generation, workflowId: `test-${created.id}` };
  try {
    await validateDemoDocuments(created, ["signed_order", "clinical_records"]);
    await updateCase(created.id, (current) => ({
      next: {
        ...current,
        coordination: {
          ...current.coordination,
          workflowId: action.workflowId,
          state: "waiting",
          selectedSupplierId: "SUP-001",
          documents: DEMO_DOCUMENTS.map((document) => ({ ...document, receivedAt: current.createdAt })),
          patientDetails: {
            address: "123 Maple Lane, Chicago, IL 60614", phone: "(312) 555-1234", contactDetails: "Phone in afternoons",
            deliveryAddress: "123 Maple Lane, Chicago, IL 60614", homeAccessibility: "Ramp and wide doorways",
            mobilityNeeds: "Needs wheelchair for indoor mobility", caregiverSupport: "Daughter can assist with transfers",
          },
          calls: [{
            id: "qualified-supplier", kind: "supplier", purpose: "outreach", targetId: "SUP-001", targetName: "Lakeshore Home Medical Equipment",
            reason: "Check availability", questions: [], supplierCallsAtStart: [], status: "completed", attempt: 1,
            attemptHistory: [], scheduledFor: null, createdAt: current.createdAt,
            response: { answeredAt: current.createdAt, answers: [], acceptsNewMedicare: true, hasK0001: true,
              deliveryEstimate: "Two days", enrollmentConfirmed: true, acceptsAssignment: true, servesArea: true },
          }],
        },
      }, result: true,
    }));

    const offerRequest = await requestSupplierOffer({ ...action, toolCallId: "offer", reason: "Review referral and offer" });
    assert(offerRequest?.callId);
    const offerCase = await getCase(created.id);
    assert(offerCase);
    const offerCall = offerCase.coordination.calls.find((call) => call.id === offerRequest.callId)!;
    const window = new Date(Date.now() + 4 * 86_400_000).toISOString().slice(0, 10) + " 09:00-12:00";
    await recordMockResponse(created.id, offerCall.id, {
      outcome: "answered", answers: offerCall.questions.map(() => "Confirmed"),
      signedOrderReceived: true, clinicalRecordsReceived: true, missingDocuments: [], deliveryAddressServed: true,
      manufacturer: "Demo Mobility", model: "Standard K0001", hcpcs: "K0001", arrangement: "Monthly rental",
      authorizationRequirement: "None", advanceNoticeRequirement: "None", authorizationReady: true, advanceNoticeReady: true,
      costEstimate: "$60 per month", rentalTerms: "Monthly rental", deliveryWindows: [window], timeZone: "America/Chicago",
    });
    const reviewed = await getCase(created.id);
    assert(reviewed && hasValidSupplierOffer(reviewed));

    const arrangement = await confirmPatientArrangement({ ...action, toolCallId: "agreement", patientMessage: "Please review the rental offer and choose a delivery window." });
    assert(arrangement?.callId);
    const selectedSlotId = reviewed.fulfillment.offer!.slots[0].id;
    await recordMockResponse(created.id, arrangement.callId, {
      outcome: "answered", answers: ["Accepted", "Confirmed", selectedSlotId],
      agreementAccepted: true, addressConfirmed: true, selectedSlotId,
    });
    const booking = await bookDelivery({ ...action, toolCallId: "booking" });
    assert(booking?.callId);
    for (const attempt of [1, 2, 3]) {
      await recordMockResponse(created.id, booking.callId, { outcome: "no_response" });
      if (attempt < 3) assert(await runScheduledFollowUpNow(created.id, booking.callId));
    }
    const escalated = await getCase(created.id);
    const task = escalated?.humanTasks.find((item) => item.callId === booking.callId && item.status === "pending");
    assert(task);
    assert.equal(escalated?.fulfillment.booking?.status, "pending");
    await recordMockResponse(created.id, booking.callId, {
      outcome: "answered", answers: ["Confirmed"], bookingConfirmed: true,
      bookingReference: "BKG-123", bookingInstructions: "Deliver to the ramp entrance and call ahead",
    }, { taskId: task.id, resolution: "Mock supplier response confirmed booking BKG-123 with delivery instructions." });
    const resolved = await getCase(created.id);
    assert.equal(resolved?.humanTasks.find((item) => item.id === task.id)?.status, "resolved");
    assert.equal(resolved?.coordination.calls.find((call) => call.id === booking.callId)?.status, "completed");
    assert.equal(resolved?.fulfillment.booking?.status, "confirmed");
    assert.deepEqual((await prepareAgentStep(action, loadDmeContext)).activeTools, ["notifyPatient"]);
    await notifyPatient({ ...action, toolCallId: "notice", patientMessage: "Your delivery is booked. The supplier will call ahead." });
    const supplierDelivery = await requestSupplierDeliveryEvidence({ ...action, toolCallId: "proof" });
    assert(supplierDelivery?.callId);
    assert(await travelToBookedDeliveryWindow(created.id));
    const deliveryCase = await getCase(created.id);
    assert(deliveryCase);
    const deliveredAt = caseNowIso(deliveryCase);
    await assert.rejects(recordMockResponse(created.id, supplierDelivery.callId, {
      outcome: "answered", answers: ["Not yet delivered"], delivered: true,
      proofReference: "Not yet delivered", deliveredAt,
      equipmentDelivered: "Demo Mobility Standard K0001", receiptStatus: "Pending",
    }), /receipt|conflicts/);
    await recordMockResponse(created.id, supplierDelivery.callId, {
      outcome: "answered", answers: ["Delivered Demo Mobility Standard K0001"], delivered: true,
      proofReference: "POD-123", deliveredAt,
      equipmentDelivered: "Demo Mobility Standard K0001", receiptStatus: "signed_by_patient",
    });
    const proven = await getCase(created.id);
    assert(proven && hasValidSupplierDeliveryEvidence(proven));
    const patientDelivery = await requestPatientDeliveryConfirmation({ ...action, toolCallId: "patient-proof", patientMessage: "Did your wheelchair arrive and can you use it?" });
    assert(patientDelivery?.callId);
    await recordMockResponse(created.id, patientDelivery.callId, {
      outcome: "answered", answers: ["Correct equipment received and usable"], patientConfirmed: true, usable: true, issue: "",
    });
    const finished = await getCase(created.id);
    assert(finished);
    assert.equal(getFulfillmentStage(finished), "completed");
  } finally {
    await unlink(filename).catch(() => undefined);
  }
});
