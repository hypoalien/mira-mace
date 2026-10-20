import { z } from "zod";
import { getCase, updateCase, type Case, type CaseCall, type CaseDocument } from "../cases";
import { DEMO_DOCUMENTS, MAX_CONTACT_ATTEMPTS } from "../dme-constants";
import { addHumanTask } from "./human-tasks";
import { applyFulfillmentAnswer } from "./fulfillment-responses";
import { extractPatientDetails } from "./extract-patient-details";
import { caseNowIso, caseNowMs } from "./demo-clock";
import { validateDemoDocuments } from "./document-text";

const responseSchema = z.discriminatedUnion("outcome", [
  z.object({ outcome: z.literal("no_response") }),
  z.object({ outcome: z.literal("negative"), issue: z.string().trim().min(1).max(2000) }),
  z.object({ outcome: z.literal("blocked"), issue: z.string().trim().min(1).max(2000) }),
  z.object({
    outcome: z.literal("answered"),
    answers: z.array(z.string().trim()),
    documents: z.array(z.enum(["signed_order", "clinical_records"])).default([]),
    acceptsNewMedicare: z.boolean().optional(),
    hasK0001: z.boolean().optional(),
    deliveryEstimate: z.string().trim().optional(),
    enrollmentConfirmed: z.boolean().optional(),
    acceptsAssignment: z.boolean().optional(),
    servesArea: z.boolean().optional(),
    costEstimate: z.string().trim().optional(),
    rentalTerms: z.string().trim().optional(),
    signedOrderReceived: z.boolean().optional(),
    clinicalRecordsReceived: z.boolean().optional(),
    missingDocuments: z.array(z.string().trim()).optional(),
    deliveryAddressServed: z.boolean().optional(),
    manufacturer: z.string().trim().optional(),
    model: z.string().trim().optional(),
    hcpcs: z.string().trim().optional(),
    arrangement: z.string().trim().optional(),
    authorizationRequirement: z.string().trim().optional(),
    advanceNoticeRequirement: z.string().trim().optional(),
    authorizationReady: z.boolean().optional(),
    advanceNoticeReady: z.boolean().optional(),
    deliveryWindows: z.array(z.string().trim()).optional(),
    timeZone: z.string().trim().optional(),
    agreementAccepted: z.boolean().optional(),
    addressConfirmed: z.boolean().optional(),
    selectedSlotId: z.string().optional(),
    bookingConfirmed: z.boolean().optional(),
    bookingReference: z.string().optional(),
    bookingInstructions: z.string().optional(),
    delivered: z.boolean().optional(),
    proofReference: z.string().optional(),
    deliveredAt: z.string().optional(),
    equipmentDelivered: z.string().optional(),
    receiptStatus: z.string().optional(),
    patientConfirmed: z.boolean().optional(),
    usable: z.boolean().optional(),
    issue: z.string().trim().optional(),
  }),
]);

export type MockResponse = z.infer<typeof responseSchema>;
type HumanResolution = { taskId: string; resolution: string };

function nextDay(current: Case) {
  return new Date(caseNowMs(current) + 24 * 60 * 60 * 1000).toISOString();
}

export async function recordMockResponse(caseId: string, callId: string, raw: unknown, humanResolution?: HumanResolution) {
  const response = responseSchema.parse(raw);
  if (humanResolution && response.outcome !== "answered") throw new Error("A care advocate resolution must answer the call");
  const candidate = response.outcome === "answered" ? await getCase(caseId) : null;
  const patientCall = candidate?.coordination.calls.find((call) => call.id === callId && (call.status === "awaiting_response" || humanResolution) && call.kind === "patient" && call.purpose === "outreach");
  if (patientCall && response.outcome === "answered" && (response.answers.length !== patientCall.questions.length || response.answers.some((answer) => !answer))) {
    throw new Error("Answer every question before submitting");
  }
  const extractedPatientDetails = patientCall && response.outcome === "answered"
    ? await extractPatientDetails(patientCall, response.answers)
    : null;
  const pcpCall = candidate?.coordination.calls.find((call) => call.id === callId && (call.status === "awaiting_response" || humanResolution) && call.kind === "pcp");
  if (pcpCall && response.outcome === "answered" && response.documents.length) {
    await validateDemoDocuments(candidate!, response.documents);
  }
  return updateCase(caseId, (current) => {
    const call = current.coordination.calls.find((item) => item.id === callId);
    if (!call) return null;
    const task = humanResolution && current.humanTasks.find((item) => item.id === humanResolution.taskId && item.callId === callId && item.status === "pending");
    if (humanResolution && !task) throw new Error("The care advocate task is no longer pending for this call");
    if (!task && call.status !== "awaiting_response") return { next: current, result: { status: "already_recorded", workflowId: current.coordination.workflowId } };
    const working: Case = task ? {
      ...current,
      humanTasks: current.humanTasks.map((item) => item.id === task.id
        ? { ...item, status: "resolved", resolution: humanResolution!.resolution, resolvedAt: new Date().toISOString() }
        : item),
    } : current;

    const now = caseNowIso(current);
    if (response.outcome === "no_response") {
      const escalate = call.attempt >= MAX_CONTACT_ATTEMPTS;
      const updated: CaseCall = {
        ...call, status: escalate ? "escalated" : "scheduled", scheduledFor: escalate ? null : nextDay(current),
        attemptHistory: [...call.attemptHistory, { attempt: call.attempt, outcome: response.outcome, recordedAt: now }],
        response: call.response,
      };
      const tasks = escalate ? addHumanTask(current, {
        type: "unanswered_outreach",
        title: `Follow up with ${call.targetName}`,
        description: `${call.targetName} did not resolve the request after ${call.attempt} simulated contact attempts. The care advocate should determine how to reach them or provide another path forward.`,
        blockerKey: `call:${call.id}:unanswered`,
        sourceToolCallId: `no-response:${call.id}`,
        callId: call.id,
      }).tasks : current.humanTasks;
      return {
        next: { ...current, updatedAt: now, humanTasks: tasks, coordination: { ...current.coordination, calls: current.coordination.calls.map((item) => item.id === callId ? updated : item) } },
        result: { status: escalate ? "escalated" : "scheduled", workflowId: current.coordination.workflowId },
      };
    }

    if (response.outcome === "negative") {
      const supplierDeclined = call.kind === "supplier" && call.purpose === "outreach";
      const updated: CaseCall = {
        ...call, status: supplierDeclined ? "completed" : "escalated", scheduledFor: null,
        attemptHistory: [...call.attemptHistory, { attempt: call.attempt, outcome: "negative", recordedAt: now, detail: response.issue }],
        response: { answeredAt: now, answers: [response.issue], issue: response.issue },
      };
      const tasks = supplierDeclined ? current.humanTasks : addHumanTask(current, {
        type: call.kind === "pcp" ? "provider_issue" : "other",
        title: `Resolve ${call.targetName} response`,
        description: `${call.targetName} cannot complete the request: ${response.issue}`,
        blockerKey: `call:${call.id}:negative`, sourceToolCallId: `negative:${call.id}`, callId: call.id,
      }).tasks;
      return { next: { ...current, updatedAt: now, humanTasks: tasks, coordination: { ...current.coordination, calls: current.coordination.calls.map((item) => item.id === callId ? updated : item), summary: null } }, result: { status: updated.status, workflowId: current.coordination.workflowId } };
    }

    if (response.outcome === "blocked") {
      const updated: CaseCall = {
        ...call,
        status: "escalated",
        scheduledFor: null,
        attemptHistory: [...call.attemptHistory, { attempt: call.attempt, outcome: "blocked", recordedAt: now, detail: response.issue }],
        response: { answeredAt: now, answers: [], issue: response.issue },
      };
      const { tasks } = addHumanTask(current, {
        type: call.kind === "pcp" ? "provider_issue" : "other",
        title: `Resolve ${call.targetName} blocker`,
        description: `${call.targetName} reported: ${response.issue}. The care advocate should resolve this issue and record the outcome.`,
        blockerKey: `call:${call.id}:blocked`,
        sourceToolCallId: `blocked:${call.id}`,
        callId: call.id,
      });
      return {
        next: { ...current, updatedAt: now, humanTasks: tasks, coordination: { ...current.coordination, summary: null, calls: current.coordination.calls.map((item) => item.id === callId ? updated : item) } },
        result: { status: "escalated", workflowId: current.coordination.workflowId },
      };
    }

    if (response.answers.length !== call.questions.length || response.answers.some((answer) => !answer)) throw new Error("Answer every question before submitting");
    if (call.purpose !== "outreach") {
      const next = applyFulfillmentAnswer(working, call, response, now);
      return { next: {
        ...next,
        patientMessages: call.kind === "patient"
          ? [...next.patientMessages, { role: "user", content: response.answers.join("\n"), turnId: `patient-response:${call.id}` }]
          : next.patientMessages,
        coordination: { ...next.coordination, summary: null },
      }, result: { status: "completed", workflowId: current.coordination.workflowId } };
    }
    if (call.kind === "supplier" && (response.acceptsNewMedicare === undefined || response.hasK0001 === undefined || !response.deliveryEstimate
      || response.enrollmentConfirmed === undefined || response.acceptsAssignment === undefined || response.servesArea === undefined)) {
      throw new Error("Complete supplier enrollment, assignment, service area, Medicare intake, stock, and delivery fields");
    }
    const updated: CaseCall = {
      ...call, status: "completed", scheduledFor: null,
      attemptHistory: [...call.attemptHistory, { attempt: call.attempt, outcome: "answered", recordedAt: now }],
      response: { answeredAt: now, answers: response.answers, acceptsNewMedicare: response.acceptsNewMedicare, hasK0001: response.hasK0001, deliveryEstimate: response.deliveryEstimate,
        enrollmentConfirmed: response.enrollmentConfirmed, acceptsAssignment: response.acceptsAssignment, servesArea: response.servesArea },
    };
    const documents: CaseDocument[] = call.kind === "pcp"
      ? response.documents.map((kind) => {
          const file = DEMO_DOCUMENTS.find((document) => document.kind === kind)!;
          return { ...file, receivedAt: now };
        })
      : [];
    const existing = working.coordination.documents.filter((document) => !documents.some((added) => added.kind === document.kind));
    const selectedSupplierId = call.kind === "supplier" && response.acceptsNewMedicare && response.hasK0001 && response.deliveryEstimate
      && response.enrollmentConfirmed && response.acceptsAssignment && response.servesArea
      ? (working.coordination.selectedSupplierId ?? call.targetId)
      : working.coordination.selectedSupplierId;
    const patientDetails = call.kind === "patient"
      ? { ...working.coordination.patientDetails, ...extractedPatientDetails }
      : working.coordination.patientDetails;
    return {
      next: {
        ...working, updatedAt: now,
        patientMessages: call.kind === "patient"
          ? [...working.patientMessages, { role: "user", content: response.answers.join("\n"), turnId: `patient-response:${call.id}` }]
          : working.patientMessages,
        coordination: {
          ...working.coordination,
          summary: null,
          calls: working.coordination.calls.map((item) => item.id === callId ? updated : item),
          documents: [...existing, ...documents], selectedSupplierId, patientDetails,
        },
      },
      result: { status: "completed", workflowId: current.coordination.workflowId },
    };
  });
}
