import { randomUUID } from "node:crypto";
import { getCase, updateCase, type Case, type HumanTask } from "../cases";
import { listSuppliers } from "../suppliers";
import { extractPatientDetails } from "./extract-patient-details";
import { extractHumanResolutionAnswers } from "./draft-human-resolution";
import { matches, type DmeAction } from "./cases";

type TaskDraft = Pick<HumanTask, "type" | "title" | "description" | "blockerKey" | "sourceToolCallId"> & {
  callId?: string;
};

export function addHumanTask(current: Case, draft: TaskDraft) {
  const existing = current.humanTasks.find((task) => task.sourceToolCallId === draft.sourceToolCallId)
    ?? current.humanTasks.find((task) => task.status === "pending" && task.blockerKey === draft.blockerKey)
    ?? current.humanTasks.find((task) => task.status === "pending" && task.callId && task.callId === draft.callId)
    ?? current.humanTasks.find((task) => task.status === "pending" && task.type === draft.type && task.title.trim().toLowerCase() === draft.title.trim().toLowerCase());
  if (existing) return { task: existing, tasks: current.humanTasks };

  const task: HumanTask = {
    ...draft,
    id: randomUUID(),
    caseId: current.id,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  return { task, tasks: [...current.humanTasks, task] };
}

export type CreateHumanTaskInput = DmeAction & TaskDraft & { toolCallId: string };

export async function createHumanTask(input: Omit<CreateHumanTaskInput, "sourceToolCallId">) {
  const suppliers = await listSuppliers();
  return updateCase<{ taskId: string | null; status: string }>(input.caseId, (current) => {
    if (!matches(current, input)) return null;
    const supplierCalls = current.coordination.calls.filter((call) => call.kind === "supplier");
    const supplierOptionsExhausted = !current.coordination.selectedSupplierId
      && suppliers.filter((supplier) => supplier.medicareEnrolled).every((supplier) =>
        supplierCalls.some((call) => call.targetId === supplier.id))
      && supplierCalls.filter((call) => call.purpose === "outreach").every((call) => call.status === "completed" || call.status === "escalated");
    if (!supplierOptionsExhausted) {
      return { next: current, result: { taskId: null, status: "not_needed" } };
    }
    const { task, tasks } = addHumanTask(current, {
      type: input.type,
      title: input.title,
      description: input.description,
      blockerKey: input.blockerKey,
      sourceToolCallId: `${input.workflowId}:${input.toolCallId}`,
      callId: input.callId,
    });
    return {
      next: { ...current, updatedAt: new Date().toISOString(), humanTasks: tasks },
      result: { taskId: task.id, status: task.status },
    };
  });
}

export async function resolveHumanTask(input: { caseId: string; taskId: string; resolution: string; answers?: string[] }) {
  const snapshot = await getCase(input.caseId);
  const sourceTask = snapshot?.humanTasks.find((item) => item.id === input.taskId);
  const patientCall = sourceTask?.type === "unanswered_outreach" && (sourceTask.status === "pending" || input.answers)
    ? snapshot?.coordination.calls.find((item) => item.id === sourceTask.callId && item.kind === "patient" && item.purpose === "outreach")
    : null;
  const answers = patientCall
    ? input.answers ?? await extractHumanResolutionAnswers(input.resolution, patientCall.questions)
    : null;
  if (patientCall && (answers?.length !== patientCall.questions.length || answers.some((answer) => !answer.trim()))) {
    throw new Error("Answer every patient question before resolving this task.");
  }
  const extractedDetails = patientCall && answers ? await extractPatientDetails(patientCall, answers) : null;

  return updateCase(input.caseId, (current) => {
    const task = current.humanTasks.find((item) => item.id === input.taskId);
    if (!task) return null;
    if (task.status === "resolved" && !answers) return { next: current, result: { task, workflowId: current.coordination.workflowId } };

    const now = new Date().toISOString();
    const resolved: HumanTask = { ...task, status: "resolved", resolution: input.resolution, resolvedAt: task.resolvedAt ?? now };
    const patientDetails = extractedDetails
      ? { ...current.coordination.patientDetails, ...extractedDetails }
      : current.coordination.patientDetails;
    const calls = patientCall && answers ? current.coordination.calls.map((call) => {
      if (call.kind !== "patient" || call.purpose !== "outreach" || !["awaiting_response", "scheduled", "escalated"].includes(call.status)
        || !call.questionFields?.every((field) => patientDetails?.[field as keyof typeof patientDetails])) return call;
      return {
        ...call, status: "completed" as const, scheduledFor: null,
        response: {
          answeredAt: now,
          answers: call.id === patientCall.id ? answers : call.questionFields.map((field) => patientDetails![field as keyof typeof patientDetails]!),
          sourceTurnId: `advocate-resolution:${task.id}`,
        },
      };
    }) : current.coordination.calls;
    return {
      next: {
        ...current,
        updatedAt: now,
        humanTasks: current.humanTasks.map((item) => item.id === task.id ? resolved : item),
        coordination: { ...current.coordination, patientDetails, calls, summary: null },
      },
      result: { task: resolved, workflowId: current.coordination.workflowId },
    };
  });
}
