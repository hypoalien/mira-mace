import { patientDetailsSchema, updateCase, type CaseCall } from "../cases";
import { matches, type PatientContactInput, type ContactResult } from "./cases";

export async function contactPatient(input: PatientContactInput) {
  return updateCase<ContactResult>(input.caseId, (current) => {
    if (!matches(current, input)) return null;

    const callId = `${input.workflowId}:${input.toolCallId}`;
    const prior = current.coordination.calls.find((call) => call.id === callId);
    if (prior) return { next: current, result: { status: prior.status, callId, target: prior.targetName } };
    const missing = new Set<string>(patientDetailsSchema.keyof().options.filter((field) => !current.coordination.patientDetails?.[field]));
    if (missing.size === 0) return { next: current, result: { status: "already_complete" } };

    const open = current.coordination.calls.find((call) => call.kind === "patient" && call.status !== "completed");
    if (open) return { next: current, result: { status: "already_pending", callId: open.id, target: open.targetName } };
    const requested = input.questions.map(({ field, question }) => ({ field, question: question.trim() }));
    if (requested.length === 0 || requested.some(({ field, question }) => !missing.has(field) || !question) || new Set(requested.map(({ field }) => field)).size !== requested.length) {
      throw new Error("Patient questions must target distinct missing details");
    }
    const call: CaseCall = {
      id: callId,
      kind: "patient",
      targetId: "PATIENT",
      targetName: current.intake.patient.name,
      reason: input.reason,
      questions: requested.map(({ question }) => question),
      questionFields: requested.map(({ field }) => field),
      supplierCallsAtStart: [],
      status: "awaiting_response",
      attempt: 1,
      scheduledFor: null,
      createdAt: new Date().toISOString(),
      response: null,
    };
    return {
      next: { ...current, updatedAt: new Date().toISOString(), coordination: { ...current.coordination, calls: [...current.coordination.calls, call], state: "waiting" } },
      result: { status: "awaiting_response", callId, target: call.targetName },
    };
  });
}
