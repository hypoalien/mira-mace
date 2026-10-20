import { updateCase, type CaseCall } from "../cases";
import { listSuppliers } from "../suppliers";
import { matches, type ContactInput, type ContactResult } from "./cases";

export async function contactSupplier(input: ContactInput) {
  const suppliers = await listSuppliers();
  return updateCase<ContactResult>(input.caseId, (current) => {
    if (!matches(current, input)) return null;
    const callId = `${input.workflowId}:${input.toolCallId}`;
    const prior = current.coordination.calls.find((call) => call.id === callId);
    if (prior) return { next: current, result: { status: prior.status, callId, target: prior.targetName } };
    if (current.coordination.selectedSupplierId) return { next: current, result: { status: "supplier_selected" } };
    const pendingTaskCallIds = new Set(current.humanTasks.filter((task) => task.status === "pending").map((task) => task.callId));
    const open = current.coordination.calls.find((call) => call.kind === "supplier" && call.purpose === "outreach" && (
      call.status === "awaiting_response" || call.status === "scheduled" || (call.status === "escalated" && pendingTaskCallIds.has(call.id))
    ));
    if (open) return { next: current, result: { status: "already_pending", callId: open.id, target: open.targetName } };
    const contacted = new Set(current.coordination.calls.filter((call) => call.kind === "supplier").map((call) => call.targetId));
    const supplier = suppliers.find((item) => item.medicareEnrolled && !contacted.has(item.id));
    if (!supplier) return { next: current, result: { status: "directory_exhausted" } };

    const required = [
      "Are you taking new Medicare patients?",
      `Do you have a standard manual wheelchair (${current.intake.equipment.hcpcs}) in stock?`,
      "How soon could you deliver it?",
      "Can you confirm that your supplier enrollment with Medicare is active?",
      "Do you accept Medicare assignment for this wheelchair?",
      `Do you serve the patient's area near ${current.intake.pcp.location}? We will confirm the exact delivery address during referral review.`,
    ];
    const extra = input.questions.map((question) => question.trim()).filter((question) => {
      const lower = question.toLowerCase();
      return question && !/medicare|k0001|stock|deliver|assignment|service area|enroll/.test(lower);
    });
    const questions = [...new Set([...required, ...extra])].slice(0, 9);
    const call: CaseCall = {
      id: callId, kind: "supplier", purpose: "outreach", targetId: supplier.id, targetName: supplier.name,
      reason: input.reason, questions, supplierCallsAtStart: [], status: "awaiting_response",
      attempt: 1, attemptHistory: [], scheduledFor: null, createdAt: new Date().toISOString(), response: null,
    };
    return {
      next: { ...current, updatedAt: new Date().toISOString(), coordination: { ...current.coordination, calls: [...current.coordination.calls, call], state: current.coordination.state === "running" ? "running" : "waiting" } },
      result: { status: "awaiting_response", callId, target: supplier.name, supplierId: supplier.id },
    };
  });
}
