import { randomUUID } from "node:crypto";
import { getCase, patientDetailsSchema, updateCase, type Case } from "../cases";
import type { ChatActivity } from "../chat-activity";
import { listSuppliers } from "../suppliers";
import { getFulfillmentStage } from "./fulfillment";
import { readReceivedDocuments } from "./document-text";
import { caseNowIso, caseNowMs, realWakeTime } from "./demo-clock";

export type DmeAction = { caseId: string; generation: string; workflowId: string };
export type ContactInput = DmeAction & { toolCallId: string; reason: string; questions: string[] };
export type PatientContactInput = DmeAction & { toolCallId: string; reason: string; patientMessage: string; questions: Array<{ field: string; question: string }> };
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
  const [suppliers, documentContents] = await Promise.all([
    listSuppliers(),
    readReceivedDocuments(current.coordination.documents),
  ]);
  return { current, suppliers, missingPatientFields, documentContents };
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

export async function markAgentWaiting(action: DmeAction) {
  await updateCase(action.caseId, (current) => {
    if (!matches(current, action)) return null;
    const state = getFulfillmentStage(current) === "completed" ? "completed" as const : "waiting" as const;
    if (current.coordination.state === state) return { next: current, result: true };
    return { next: { ...current, updatedAt: new Date().toISOString(), coordination: { ...current.coordination, state } }, result: true };
  });
}

export async function getNextFollowUpAt(action: DmeAction) {
  const context = await loadDmeContext(action);
  if (!context) return null;
  return context.current.coordination.calls
    .filter((call) => call.status === "scheduled" && call.scheduledFor)
    .map((call) => realWakeTime(context.current, call.scheduledFor!))
    .sort()[0] ?? null;
}

export async function runScheduledFollowUpNow(caseId: string, callId: string) {
  return updateCase(caseId, (current) => {
    const call = current.coordination.calls.find((item) => item.id === callId);
    if (!current.coordination.workflowId || !call || call.status !== "scheduled" || !call.scheduledFor) return null;
    const realNow = Date.now();
    const demoNowMs = Math.max(caseNowMs(current, realNow), Date.parse(call.scheduledFor));
    const demoNow = new Date(demoNowMs).toISOString();
    const dueIds = new Set(current.coordination.calls
      .filter((item) => item.status === "scheduled" && item.scheduledFor && Date.parse(item.scheduledFor) <= demoNowMs)
      .map((item) => item.id));
    return {
      next: {
        ...current,
        demoClockOffsetMs: demoNowMs - realNow,
        updatedAt: demoNow,
        coordination: {
          ...current.coordination,
          calls: current.coordination.calls.map((item) => dueIds.has(item.id)
            ? { ...item, status: "awaiting_response" as const, scheduledFor: null, attempt: item.attempt + 1 }
            : item),
        },
      },
      result: { workflowId: current.coordination.workflowId, generation: current.generation, autoMockEnabled: current.autoMock.enabled, attempt: call.attempt + 1, demoNow, advancedCallCount: dueIds.size },
    };
  });
}

export async function dispatchDueFollowUps(action: DmeAction) {
  return updateCase(action.caseId, (current) => {
    if (!matches(current, action)) return null;
    const now = caseNowIso(current);
    const due = current.coordination.calls.filter((call) => call.status === "scheduled" && call.scheduledFor && call.scheduledFor <= now);
    if (due.length === 0) return { next: current, result: 0 };
    const dueIds = new Set(due.map((call) => call.id));
    const calls = current.coordination.calls.map((call) => dueIds.has(call.id)
      ? { ...call, status: "awaiting_response" as const, scheduledFor: null, attempt: call.attempt + 1 }
      : call);
    return { next: { ...current, updatedAt: now, coordination: { ...current.coordination, calls, state: "waiting" } }, result: due.length };
  });
}

export async function beginCoordinationRound(action: DmeAction, roundId: string) {
  await updateCase(action.caseId, (current) => {
    if (!matches(current, action)) return null;
    return {
      next: {
        ...current,
        updatedAt: new Date().toISOString(),
        messages: [...current.messages, { role: "assistant", content: "Thinking…", turnId: roundId, activities: [] }],
      },
      result: true,
    };
  });
}

export async function discardCoordinationRound(action: DmeAction, roundId: string) {
  await updateCase(action.caseId, (current) => {
    if (!matches(current, action)) return null;
    return {
      next: {
        ...current,
        updatedAt: new Date().toISOString(),
        messages: current.messages.filter((message) => message.turnId !== roundId),
        coordination: { ...current.coordination, state: "waiting" },
      },
      result: true,
    };
  });
}

export async function recordCoordinationActivity(action: DmeAction, roundId: string, activity: ChatActivity) {
  await updateCase(action.caseId, (current) => {
    if (!matches(current, action)) return null;
    const messages = current.messages.map((message) => {
      if (message.turnId !== roundId) return message;
      const activities = message.activities ?? [];
      const index = activities.findIndex((item) => item.toolCallId === activity.toolCallId);
      return {
        ...message,
        activities: index < 0 ? [...activities, activity] : activities.map((item, position) => position === index ? activity : item),
      };
    });
    return { next: { ...current, updatedAt: new Date().toISOString(), messages }, result: true };
  });
}

export async function recordCoordinationFailure(action: DmeAction, roundId: string) {
  await updateCase(action.caseId, (current) => {
    if (!matches(current, action)) return null;
    const messages = current.messages.map((message) => message.turnId === roundId
      ? { ...message, content: "I couldn't finish reviewing this case. Please try again." }
      : message);
    return { next: { ...current, updatedAt: new Date().toISOString(), messages }, result: true };
  });
}

export async function recordAgentRound(action: DmeAction, roundId: string, generatedSummary: string) {
  const summary = generatedSummary.trim();
  const suppliers = await listSuppliers();
  return updateCase(action.caseId, (current) => {
    if (!matches(current, action)) return null;
    const pendingHumanTasks = current.humanTasks.filter((task) => task.status === "pending");
    const stage = getFulfillmentStage(current);
    const completed = stage === "completed";
    const supplierCalls = current.coordination.calls.filter((call) => call.kind === "supplier" && call.purpose === "outreach");
    const noMoreSuppliers = suppliers.filter((supplier) => supplier.medicareEnrolled).every((supplier) => supplierCalls.some((call) => call.targetId === supplier.id));
    const blocked = !current.coordination.selectedSupplierId && noMoreSuppliers && supplierCalls.every((call) => call.status === "completed" || call.status === "escalated") && pendingHumanTasks.length === 0;
    const updated = {
      ...current,
      updatedAt: new Date().toISOString(),
      coordination: { ...current.coordination, summary: summary || current.coordination.summary, state: blocked ? "blocked" as const : completed ? "completed" as const : "waiting" as const },
      messages: current.messages.map((message) => message.turnId === roundId ? { ...message, content: summary || "\u200B" } : message),
    };
    return { next: updated, result: completed };
  });
}

export async function recordAgentUpdate(action: DmeAction, updateId: string, expectedUpdatedAt: string, generatedSummary: string) {
  const summary = generatedSummary.trim();
  if (!summary) throw new Error("The agent finished without an update");
  return updateCase(action.caseId, (current) => {
    if (!matches(current, action)) return null;
    if (current.messages.some((message) => message.turnId === updateId)) return { next: current, result: true };
    // A newer external response should be reviewed in its own pass.
    if (current.updatedAt !== expectedUpdatedAt) return { next: current, result: false };
    const state = getFulfillmentStage(current) === "completed" ? "completed" as const : "waiting" as const;
    return {
      next: {
        ...current,
        updatedAt: new Date().toISOString(),
        messages: [...current.messages, { role: "assistant", content: summary, turnId: updateId }],
        coordination: { ...current.coordination, summary, state },
      },
      result: true,
    };
  });
}

export async function recordAgentError(action: DmeAction) {
  await updateCase(action.caseId, (current) => {
    if (!matches(current, action)) return null;
    return { next: { ...current, coordination: { ...current.coordination, state: "error" } }, result: true };
  });
}
