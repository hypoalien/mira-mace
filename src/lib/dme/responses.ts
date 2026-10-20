import { z } from "zod";
import { patientDetailsSchema, updateCase, type CaseCall, type CaseDocument } from "../cases";
import { DEMO_DOCUMENTS } from "../dme-constants";

const responseSchema = z.discriminatedUnion("outcome", [
  z.object({ outcome: z.literal("no_response") }),
  z.object({
    outcome: z.literal("answered"),
    answers: z.array(z.string().trim()),
    documents: z.array(z.enum(["signed_order", "clinical_records"])).default([]),
    acceptsNewMedicare: z.boolean().optional(),
    hasK0001: z.boolean().optional(),
    deliveryEstimate: z.string().trim().optional(),
  }),
]);

export type MockResponse = z.infer<typeof responseSchema>;

function nextDay() {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
}

export async function recordMockResponse(caseId: string, callId: string, raw: unknown) {
  const response = responseSchema.parse(raw);
  return updateCase(caseId, (current) => {
    const call = current.coordination.calls.find((item) => item.id === callId);
    if (!call) return null;
    if (call.status === "completed" || call.status === "scheduled") return { next: current, result: { status: "already_recorded", workflowId: current.coordination.workflowId } };
    if (call.status !== "awaiting_response") return null;

    const now = new Date().toISOString();
    if (response.outcome === "no_response") {
      const updated: CaseCall = { ...call, status: "scheduled", scheduledFor: nextDay() };
      return {
        next: { ...current, updatedAt: now, coordination: { ...current.coordination, calls: current.coordination.calls.map((item) => item.id === callId ? updated : item) } },
        result: { status: "scheduled", workflowId: current.coordination.workflowId },
      };
    }

    if (response.answers.length !== call.questions.length || response.answers.some((answer) => !answer)) throw new Error("Answer every question before submitting");
    if (call.kind === "supplier" && (response.acceptsNewMedicare === undefined || response.hasK0001 === undefined || !response.deliveryEstimate)) {
      throw new Error("Complete Medicare intake, stock, and delivery fields");
    }
    const updated: CaseCall = {
      ...call, status: "completed", scheduledFor: null,
      response: { answeredAt: now, answers: response.answers, acceptsNewMedicare: response.acceptsNewMedicare, hasK0001: response.hasK0001, deliveryEstimate: response.deliveryEstimate },
    };
    const documents: CaseDocument[] = call.kind === "pcp"
      ? response.documents.map((kind) => {
          const file = DEMO_DOCUMENTS.find((document) => document.kind === kind)!;
          return { ...file, receivedAt: now };
        })
      : [];
    const existing = current.coordination.documents.filter((document) => !documents.some((added) => added.kind === document.kind));
    const selectedSupplierId = call.kind === "supplier" && response.acceptsNewMedicare && response.hasK0001 && response.deliveryEstimate
      ? (current.coordination.selectedSupplierId ?? call.targetId)
      : current.coordination.selectedSupplierId;
    const patientDetails = call.kind === "patient"
      ? patientDetailsSchema.partial().parse({
          ...current.coordination.patientDetails,
          ...Object.fromEntries((call.questionFields?.length ? call.questionFields : patientDetailsSchema.keyof().options).map((field, index) => [field, response.answers[index]])),
        })
      : current.coordination.patientDetails;
    return {
      next: {
        ...current, updatedAt: now,
        coordination: {
          ...current.coordination,
          calls: current.coordination.calls.map((item) => item.id === callId ? updated : item),
          documents: [...existing, ...documents], selectedSupplierId, patientDetails,
        },
      },
      result: { status: "completed", workflowId: current.coordination.workflowId },
    };
  });
}
