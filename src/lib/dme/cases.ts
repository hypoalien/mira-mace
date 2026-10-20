import { randomUUID } from "node:crypto";
import { getCase, patientDetailsSchema, updateCase, type Case } from "../cases";
import { listSuppliers } from "../suppliers";

export type DmeAction = { caseId: string; generation: string; workflowId: string };
export type ContactInput = DmeAction & { toolCallId: string; reason: string; questions: string[] };
export type PatientContactInput = DmeAction & { toolCallId: string; reason: string; questions: Array<{ field: string; question: string }> };
export type ContactResult = { status: string; callId?: string; target?: string; supplierId?: string; supplierCallsAtStart?: string[] };

export function matches(current: Case, action: DmeAction) {
  return current.generation === action.generation && current.coordination.workflowId === action.workflowId;
}

export async function startDmeCase(caseId: string, replaceWorkflowId?: string) {
  return updateCase(caseId, (current) => {
    const existing = current.coordination.workflowId;
    if (existing && current.coordination.state !== "error" && existing !== replaceWorkflowId) return { next: current, result: { workflowId: existing, generation: current.generation, started: false } };
    const workflowId = `dme-${caseId}-${current.generation}-${randomUUID().slice(0, 8)}`;
    return {
      next: {
        ...current,
        updatedAt: new Date().toISOString(),
        coordination: { ...current.coordination, workflowId, state: "running" },
      },
      result: { workflowId, generation: current.generation, started: true },
    };
  });
}

export async function releaseDmeStart(action: DmeAction) {
  await updateCase(action.caseId, (current) => {
    if (!matches(current, action)) return null;
    return { next: { ...current, coordination: { ...current.coordination, workflowId: null, state: "not_started" } }, result: true };
  });
}

export async function loadDmeContext(action: DmeAction) {
  const current = await getCase(action.caseId);
  if (!current || !matches(current, action)) return null;
  const missingPatientFields = patientDetailsSchema.keyof().options.filter((field) => !current.coordination.patientDetails?.[field]);
  return { current, suppliers: await listSuppliers(), missingPatientFields };
}

export async function markAgentRunning(action: DmeAction) {
  await updateCase(action.caseId, (current) => {
    if (!matches(current, action)) return null;
    return {
      next: { ...current, updatedAt: new Date().toISOString(), coordination: { ...current.coordination, state: "running" } },
      result: true,
    };
  });
}

export async function getNextFollowUpAt(action: DmeAction) {
  const context = await loadDmeContext(action);
  if (!context) return null;
  return context.current.coordination.calls
    .filter((call) => call.status === "scheduled" && call.scheduledFor)
    .map((call) => call.scheduledFor!)
    .sort()[0] ?? null;
}

export async function dispatchDueFollowUps(action: DmeAction) {
  return updateCase(action.caseId, (current) => {
    if (!matches(current, action)) return null;
    const now = new Date().toISOString();
    const due = current.coordination.calls.filter((call) => call.status === "scheduled" && call.scheduledFor && call.scheduledFor <= now);
    if (due.length === 0) return { next: current, result: 0 };
    const dueIds = new Set(due.map((call) => call.id));
    const calls = current.coordination.calls.map((call) => dueIds.has(call.id)
      ? { ...call, status: "awaiting_response" as const, scheduledFor: null, attempt: call.attempt + 1 }
      : call);
    return { next: { ...current, updatedAt: now, coordination: { ...current.coordination, calls, state: "waiting" } }, result: due.length };
  });
}

export async function recordAgentRound(action: DmeAction) {
  const suppliers = await listSuppliers();
  return updateCase(action.caseId, (current) => {
    if (!matches(current, action)) return null;
    const patientConfirmed = patientDetailsSchema.safeParse(current.coordination.patientDetails).success;
    const ready = current.coordination.documents.length === 2 && Boolean(current.coordination.selectedSupplierId) && patientConfirmed;
    const supplierCalls = current.coordination.calls.filter((call) => call.kind === "supplier");
    const noMoreSuppliers = suppliers.filter((supplier) => supplier.medicareEnrolled).every((supplier) => supplierCalls.some((call) => call.targetId === supplier.id));
    const blocked = !current.coordination.selectedSupplierId && noMoreSuppliers && supplierCalls.every((call) => call.status === "completed");
    const waiting = current.coordination.calls.filter((call) => call.status === "awaiting_response").map((call) => call.targetName);
    const scheduled = current.coordination.calls.filter((call) => call.status === "scheduled").map((call) => call.targetName);
    const selected = supplierCalls.find((call) => call.targetId === current.coordination.selectedSupplierId);
    const clean = blocked
      ? `All ${supplierCalls.length} enrolled suppliers have been called; none confirmed they can take the K0001 case. The advocate needs another supplier option.`
      : ready
      ? `PCP documents and patient contact details received; ${selected?.targetName ?? "a supplier"} can take the K0001 case.${scheduled.length ? ` Next-day follow-up remains scheduled for ${scheduled.join(" and ")}.` : ""} The case is ready for the advocate's next step.`
      : `${supplierCalls.length} supplier${supplierCalls.length === 1 ? "" : "s"} called; ${current.coordination.documents.length} of 2 PCP documents received; patient details ${patientConfirmed ? "confirmed" : "pending"}.${waiting.length ? ` Awaiting mock responses from ${waiting.join(" and ")}.` : ""}${scheduled.length ? ` Next-day follow-up scheduled for ${scheduled.join(" and ")}.` : ""}`;
    const updated = {
      ...current,
      updatedAt: new Date().toISOString(),
      coordination: { ...current.coordination, summary: clean, state: blocked ? "blocked" as const : ready ? "ready" as const : "waiting" as const },
      messages: clean !== current.coordination.summary
        ? [...current.messages, { role: "assistant" as const, content: `DME agent: ${clean}` }]
        : current.messages,
    };
    return { next: updated, result: ready };
  });
}

export async function recordAgentError(action: DmeAction) {
  await updateCase(action.caseId, (current) => {
    if (!matches(current, action)) return null;
    return { next: { ...current, coordination: { ...current.coordination, state: "error" } }, result: true };
  });
}
