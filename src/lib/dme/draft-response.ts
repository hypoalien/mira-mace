import { openai } from "@ai-sdk/openai";
import { config } from "dotenv";
import { generateText, Output } from "ai";
import { z } from "zod";
import type { Case, CaseCall } from "../cases";
import { suggestedDeliveryWindows } from "./delivery-windows";
import { bookedDeliveryWindow, deliveryWindowTimes } from "./delivery-timing";
import { hasValidSupplierDeliveryEvidence } from "./fulfillment";
import { caseNowMs } from "./demo-clock";

export async function draftMockResponse(current: Case, call: CaseCall, supplierNegative = false): Promise<Record<string, unknown> & { answers: string[] }> {
  if (call.purpose === "supplier_delivery") {
    const slot = bookedDeliveryWindow(current);
    if (!slot || caseNowMs(current) < deliveryWindowTimes(slot).start) throw new Error("The booked delivery window has not started. Travel to the window first.");
  }
  if (call.purpose === "patient_delivery" && !hasValidSupplierDeliveryEvidence(current)) {
    throw new Error("Wait for valid supplier delivery proof before confirming with the patient.");
  }
  const agreedSlot = call.purpose === "supplier_booking" ? bookedDeliveryWindow(current) : null;
  const bookingWindowExpired = Boolean(agreedSlot && deliveryWindowTimes(agreedSlot).end < caseNowMs(current));
  config({ path: ".env.worker.local", quiet: true });
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is missing from .env.worker.local.");

  const schema = z.object({
    answers: z.array(z.string().trim().min(1)).length(call.questions.length),
    ...(call.purpose === "outreach" && call.kind === "supplier" ? {
      acceptsNewMedicare: z.boolean(), hasK0001: z.boolean(), deliveryEstimate: z.string().trim().min(1),
      enrollmentConfirmed: z.boolean(), acceptsAssignment: z.boolean(), servesArea: z.boolean(),
    } : {}),
    ...(call.purpose === "supplier_offer" ? {
      costEstimate: z.string().trim().min(1), rentalTerms: z.string().trim().min(1),
      deliveryWindows: z.array(z.string().trim().min(1)).min(1).max(5), timeZone: z.string().trim().min(1),
      signedOrderReceived: z.literal(true), clinicalRecordsReceived: z.literal(true), missingDocuments: z.array(z.string()).length(0),
      deliveryAddressServed: z.literal(true), manufacturer: z.string().trim().min(1), model: z.string().trim().min(1),
      hcpcs: z.literal(current.intake.equipment.hcpcs), arrangement: z.string().trim().min(1),
      authorizationRequirement: z.string().trim().min(1), advanceNoticeRequirement: z.string().trim().min(1),
      authorizationReady: z.literal(true), advanceNoticeReady: z.literal(true),
    } : {}),
    ...(call.purpose === "patient_arrangement" ? {
      agreementAccepted: z.boolean(), addressConfirmed: z.boolean(), selectedSlotId: z.string().trim().min(1),
    } : {}),
    ...(call.purpose === "supplier_booking" ? {
      bookingConfirmed: z.literal(!bookingWindowExpired),
      bookingReference: bookingWindowExpired ? z.string() : z.string().trim().min(1),
      bookingInstructions: bookingWindowExpired ? z.string() : z.string().trim().min(1),
    } : {}),
    ...(call.purpose === "supplier_delivery" ? {
      delivered: z.literal(true), proofReference: z.string().trim().regex(/^POD-[A-Za-z0-9-]+$/), deliveredAt: z.string().datetime({ offset: true }),
      equipmentDelivered: z.string().trim().min(1), receiptStatus: z.enum(["signed_by_patient", "signed_by_caregiver", "carrier_tracking"]),
    } : {}),
    ...(call.purpose === "patient_delivery" ? {
      patientConfirmed: z.literal(true), usable: z.literal(true), issue: z.literal(""),
    } : {}),
  });

  const result = await generateText({
    model: openai("gpt-4o-mini"),
    output: Output.object({ schema }),
    abortSignal: AbortSignal.timeout(30_000),
    system: [
      "You draft fictional responses for a local DME coordination demo. No real call is taking place.",
      "Answer as the named contact would, concisely and consistently. Give one answer for every question, in order.",
      "Use plausible fictional details, not placeholders. Do not claim an external action beyond this simulated response.",
      call.purpose === "outreach" && call.kind === "supplier" ? supplierNegative
        ? "This supplier cannot fulfill the request: it is not accepting new Medicare patients or has no K0001 stock. Set at least one boolean false. Explain the unavailable delivery timing. Keep all answers consistent."
        : "This supplier confirms active Medicare enrollment, accepts assignment, serves the patient's area, accepts new Medicare patients, has K0001 in stock, and can deliver within a few business days. Keep the answers consistent with the fields." : "",
      call.purpose === "outreach" && call.kind === "pcp" ? "The requested signed order and clinical records are available for this demo." : "",
      call.purpose === "outreach" && call.kind === "patient" ? "Use fictional contact, address, and home access details. Insurance is already in intake; do not change it." : "",
      call.purpose === "supplier_offer" ? "Confirm receipt of both PCP documents with no missing items, service to the stated delivery address, and a specific manufacturer/model for the requested K0001 wheelchair. Describe rental or purchase terms, patient cost, and any authorization or advance notice requirement; mark both readiness flags true only if required steps are complete or not required. Delivery windows are supplied by the demo; use America/Chicago." : "",
      call.purpose === "patient_arrangement" ? "Accept the presented terms, confirm the address, and select an offered slot ID exactly." : "",
      call.purpose === "supplier_booking" ? bookingWindowExpired
        ? "The agreed delivery window has passed. Say it cannot be booked now and that fresh windows are needed. Do not provide a booking reference or delivery instructions."
        : "Confirm the agreed slot with a fictional booking reference and delivery instructions." : "",
      call.purpose === "supplier_delivery" ? "For this positive simulated response, confirm the booked wheelchair was delivered. Use a fictional proof reference in the format POD-123456 and identify the manufacturer/model. For a home handoff, receiptStatus must be signed_by_patient or signed_by_caregiver; use carrier_tracking only for shipment with tracking. Never write that delivery is pending or unconfirmed." : "",
      call.purpose === "patient_delivery" ? "Confirm the correct equipment was received, is usable, and there are no issues." : "",
    ].filter(Boolean).join("\n"),
    prompt: JSON.stringify({
      patient: current.intake.patient, equipment: current.intake.equipment, pcp: current.intake.pcp,
      knownPatientDetails: current.coordination.patientDetails, fulfillment: current.fulfillment,
      call: { kind: call.kind, purpose: call.purpose, target: call.targetName, reason: call.reason, questions: call.questions },
    }),
  });
  if (call.purpose === "supplier_offer") return { ...result.output, deliveryWindows: suggestedDeliveryWindows("America/Chicago", new Date(caseNowMs(current))), timeZone: "America/Chicago" };
  if (call.purpose === "supplier_delivery") {
    const slot = bookedDeliveryWindow(current)!;
    const offer = current.fulfillment.offer!;
    return { ...result.output, equipmentDelivered: `${offer.manufacturer} ${offer.model}`,
      deliveredAt: new Date(Math.min(caseNowMs(current), deliveryWindowTimes(slot).end)).toISOString() };
  }
  return result.output;
}

export async function draftNegativeMockIssue(current: Case, call: CaseCall): Promise<string> {
  config({ path: ".env.worker.local", quiet: true });
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is missing from .env.worker.local.");

  const { output } = await generateText({
    model: openai("gpt-4o-mini"),
    output: Output.object({ schema: z.object({ issue: z.string().trim().min(1).max(500) }) }),
    abortSignal: AbortSignal.timeout(30_000),
    system: "Draft a concise fictional negative response from this contact for a DME coordination demo. Explain why the requested information or action cannot be provided yet. Do not claim the request was fulfilled, invent case facts, or include internal workflow terms.",
    prompt: JSON.stringify({
      contact: call.targetName,
      kind: call.kind,
      purpose: call.purpose,
      reason: call.reason,
      questions: call.questions,
      knownCaseFacts: {
        equipment: current.intake.equipment.name,
        receivedDocuments: current.coordination.documents.map((document) => document.kind),
        patientDetails: current.coordination.patientDetails,
      },
    }),
  });
  return output.issue;
}
