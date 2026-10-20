import { getCase, updateCase, type AutoMockScenario, type Case, type CaseCall } from "../cases";
import { DEMO_DOCUMENTS } from "../dme-constants";
import { draftMockResponse, draftNegativeMockIssue } from "./draft-response";
import { bookedDeliveryWindow, deliveryWindowTimes } from "./delivery-timing";
import { hasValidSupplierDeliveryEvidence } from "./fulfillment";
import { matches, type DmeAction } from "./cases";
import { caseNowMs, realWakeTime } from "./demo-clock";
import { recordMockResponse, type MockResponse } from "./responses";

export function behaviorFor(call: CaseCall, scenario: AutoMockScenario) {
  const attempts = call.purpose === "outreach"
    ? call.kind === "supplier" ? scenario.suppliers[call.targetId] : scenario[call.kind]
    : scenario.fulfillment[call.purpose];
  return attempts?.[Math.min(call.attempt - 1, 2)];
}

export async function getNextAutoMockAt(action: DmeAction): Promise<string | null> {
  const current = await getCase(action.caseId);
  if (!current || !matches(current, action) || !current.autoMock.enabled) return null;
  const deliveryPending = current.coordination.calls.some((call) => call.purpose === "supplier_delivery" && call.status === "awaiting_response");
  if (!deliveryPending) return null;
  const slot = bookedDeliveryWindow(current);
  const start = slot ? new Date(deliveryWindowTimes(slot).start).toISOString() : null;
  return start && Date.parse(start) > caseNowMs(current) ? realWakeTime(current, start) : null;
}

function answersFor(call: CaseCall, draft: Record<string, unknown> & { answers: string[] }) {
  if (call.purpose === "outreach") {
    if (call.kind !== "supplier") return draft.answers;
    return call.questions.map((_, index) => index === 0 ? (draft.acceptsNewMedicare ? "Yes" : "No")
      : index === 1 ? (draft.hasK0001 ? "Yes" : "No")
      : index === 2 ? String(draft.deliveryEstimate)
      : index === 3 ? (draft.enrollmentConfirmed ? "Yes" : "No")
      : index === 4 ? (draft.acceptsAssignment ? "Yes" : "No")
      : index === 5 ? (draft.servesArea ? "Yes" : "No") : draft.answers[index]);
  }
  switch (call.purpose) {
    case "supplier_offer": return [
      draft.signedOrderReceived && draft.clinicalRecordsReceived ? "Both documents received; none missing" : (draft.missingDocuments as string[]).join("; "),
      draft.deliveryAddressServed ? "Delivery address served" : "Outside service area",
      `${draft.manufacturer} ${draft.model}; ${draft.hcpcs}`,
      `${draft.arrangement}; authorization: ${draft.authorizationRequirement}; advance notice: ${draft.advanceNoticeRequirement}`,
      String(draft.costEstimate), String(draft.rentalTerms), (draft.deliveryWindows as string[]).join("; "),
    ];
    case "patient_arrangement": return [draft.agreementAccepted ? "Accepted" : "Declined", draft.addressConfirmed ? "Confirmed" : "Not confirmed", String(draft.selectedSlotId)];
    case "supplier_booking": return draft.bookingConfirmed ? [`Confirmed: ${draft.bookingReference}; ${draft.bookingInstructions}`] : draft.answers;
    case "supplier_delivery": return [draft.delivered ? `Delivered ${draft.equipmentDelivered}; proof ${draft.proofReference}; ${draft.receiptStatus}; at ${draft.deliveredAt}` : "Not delivered"];
    case "patient_delivery": return [draft.patientConfirmed ? `Correct equipment received and ${draft.usable ? "usable" : "not usable"}` : String(draft.issue)];
  }
}

export async function draftMockOutcome(current: Case, call: CaseCall, behavior: "positive" | "negative" | "no_response"): Promise<MockResponse> {
  if (behavior === "no_response") return { outcome: "no_response" };
  if (behavior === "negative" && !(call.kind === "supplier" && call.purpose === "outreach")) {
    return { outcome: "negative", issue: await draftNegativeMockIssue(current, call) };
  }
  const draft = await draftMockResponse(current, call, behavior === "negative");
  if (call.purpose === "supplier_delivery") {
    const slot = bookedDeliveryWindow(current);
    if (!slot) throw new Error("A booked delivery window is required");
    draft.deliveredAt = new Date(Math.min(caseNowMs(current), deliveryWindowTimes(slot).end)).toISOString();
  }
  if (behavior === "positive" && call.kind === "supplier" && call.purpose === "outreach") {
    draft.acceptsNewMedicare = true;
    draft.hasK0001 = true;
    draft.enrollmentConfirmed = true;
    draft.acceptsAssignment = true;
    draft.servesArea = true;
  }
  if (call.purpose === "patient_arrangement") {
    const slots = current.fulfillment.offer?.slots ?? [];
    draft.agreementAccepted = true;
    draft.addressConfirmed = true;
    draft.selectedSlotId = slots.some((slot) => slot.id === draft.selectedSlotId) ? draft.selectedSlotId : slots[0]?.id;
  }
  if (behavior === "negative" && call.kind === "supplier") {
    draft.acceptsNewMedicare = false;
    draft.hasK0001 = false;
    draft.deliveryEstimate = "Unavailable";
  }
  return {
    outcome: "answered",
    ...(call.purpose !== "outreach" ? draft : {}),
    answers: answersFor(call, draft),
    documents: call.kind === "pcp" && call.purpose === "outreach" ? DEMO_DOCUMENTS.map((document) => document.kind) : [],
    ...(call.kind === "supplier" && call.purpose === "outreach" ? {
      acceptsNewMedicare: Boolean(draft.acceptsNewMedicare),
      hasK0001: Boolean(draft.hasK0001),
      deliveryEstimate: String(draft.deliveryEstimate),
      enrollmentConfirmed: Boolean(draft.enrollmentConfirmed),
      acceptsAssignment: Boolean(draft.acceptsAssignment),
      servesArea: Boolean(draft.servesArea),
    } : {}),
  } as MockResponse;
}

export async function processAutoMockResponses(action: DmeAction, callId?: string): Promise<number> {
  const current = await getCase(action.caseId);
  if (!current || !matches(current, action) || !current.autoMock.enabled || !current.autoMock.scenario) return 0;
  let saved = 0;
  for (const call of current.coordination.calls.filter((item) => item.status === "awaiting_response" && (!callId || item.id === callId))) {
    try {
      const latest = await getCase(action.caseId);
      if (!latest || !matches(latest, action) || !latest.autoMock.enabled || !latest.autoMock.scenario) break;
      const liveCall = latest.coordination.calls.find((item) => item.id === call.id && item.status === "awaiting_response");
      if (!liveCall) continue;
      if (liveCall.purpose === "supplier_delivery") {
        const slot = bookedDeliveryWindow(latest);
        if (!slot || deliveryWindowTimes(slot).start > caseNowMs(latest)) continue;
      }
      if (liveCall.purpose === "patient_delivery" && !hasValidSupplierDeliveryEvidence(latest)) continue;
      const behavior = behaviorFor(liveCall, latest.autoMock.scenario);
      if (!behavior) throw new Error(`No scenario configured for ${liveCall.targetName}`);
      const response = await draftMockOutcome(latest, liveCall, behavior);
      const beforeSave = await getCase(action.caseId);
      if (!beforeSave || !matches(beforeSave, action) || !beforeSave.autoMock.enabled || behaviorFor(liveCall, beforeSave.autoMock.scenario!) !== behavior) break;
      const result = await recordMockResponse(action.caseId, liveCall.id, response);
      if (result && result.status !== "already_recorded") saved += 1;
    } catch (error) {
      console.error("Auto mock response failed", { caseId: action.caseId, callId: call.id, error });
      await updateCase(action.caseId, (latest) => {
        if (!matches(latest, action)) return null;
        return { next: { ...latest, updatedAt: new Date().toISOString(), autoMock: { ...latest.autoMock, enabled: false, error: error instanceof Error ? error.message : "Could not generate a response" } }, result: true };
      });
      break;
    }
  }
  return saved;
}
