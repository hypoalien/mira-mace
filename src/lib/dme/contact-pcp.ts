import { updateCase, type CaseCall } from "../cases";
import { DEMO_DOCUMENTS } from "../dme-constants";
import { matches, type ContactInput, type ContactResult } from "./cases";

export async function contactPCP(input: ContactInput) {
  return updateCase<ContactResult>(input.caseId, (current) => {
    if (!matches(current, input)) return null;
    const callId = `${input.workflowId}:${input.toolCallId}`;
    const prior = current.coordination.calls.find((call) => call.id === callId);
    if (prior) return { next: current, result: { status: prior.status, callId, target: prior.targetName } };
    const pendingTaskCallIds = new Set(current.humanTasks.filter((task) => task.status === "pending").map((task) => task.callId));
    const open = current.coordination.calls.find((call) => call.kind === "pcp" && (
      call.status === "awaiting_response" || call.status === "scheduled" || (call.status === "escalated" && pendingTaskCallIds.has(call.id))
    ));
    if (open) return { next: current, result: { status: "already_pending", callId: open.id, target: open.targetName } };
    const missing = DEMO_DOCUMENTS.filter((document) => !current.coordination.documents.some((saved) => saved.kind === document.kind));
    if (missing.length === 0) return { next: current, result: { status: "already_complete" } };
    const required = [
      ...(missing.some((doc) => doc.kind === "signed_order") ? ["Can you provide a signed wheelchair order identifying the patient, equipment, order date, and ordering clinician?"] : []),
      ...(missing.some((doc) => doc.kind === "clinical_records") ? ["Can you provide clinical records covering home mobility limitations, why a cane or walker is insufficient, and patient or caregiver wheelchair use?"] : []),
    ];
    const extra = input.questions.map((question) => question.trim()).filter((question) => {
      const lower = question.toLowerCase();
      return question && !/signed|order|prescription|clinical|mobility|walker|cane/.test(lower);
    });
    const questions = [...new Set([...required, ...extra])].slice(0, 8);
    const supplierCallsAtStart = current.coordination.calls.filter((call) => call.kind === "supplier").map((call) => `${call.targetName}: ${call.status}`);
    const call: CaseCall = {
      id: callId, kind: "pcp", purpose: "outreach", targetId: "PCP", targetName: current.intake.pcp.practice,
      reason: input.reason, questions, supplierCallsAtStart, status: "awaiting_response",
      attempt: 1, attemptHistory: [], scheduledFor: null, createdAt: new Date().toISOString(), response: null,
    };
    return {
      next: { ...current, updatedAt: new Date().toISOString(), coordination: { ...current.coordination, calls: [...current.coordination.calls, call], state: current.coordination.state === "running" ? "running" : "waiting" } },
      result: { status: "awaiting_response", callId, target: call.targetName, supplierCallsAtStart },
    };
  });
}
