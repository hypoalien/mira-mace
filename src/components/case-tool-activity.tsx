"use client";

import { Task, TaskContent, TaskItem, TaskTrigger } from "@/components/ai-elements/task";
import type { ChatActivity } from "@/lib/chat-activity";
import type { CaseCall } from "@/lib/cases";

const labels: Record<string, [string, string]> = {
  contactSupplier: ["Calling supplier…", "Called supplier"],
  contactPCP: ["Calling PCP…", "Called PCP"],
  contactPatient: ["Calling patient…", "Called patient"],
  requestHumanAssistance: ["Requesting advocate help…", "Advocate task created"],
  requestSupplierOffer: ["Requesting supplier offer…", "Supplier offer requested"],
  confirmPatientArrangement: ["Asking patient to confirm…", "Patient confirmation requested"],
  bookDelivery: ["Requesting delivery booking…", "Delivery booking requested"],
  notifyPatient: ["Preparing patient notification…", "Patient notification recorded"],
  requestSupplierDeliveryEvidence: ["Requesting supplier delivery proof…", "Supplier delivery proof requested"],
  requestPatientDeliveryConfirmation: ["Requesting patient delivery confirmation…", "Patient delivery confirmation requested"],
};

function parseObject(value?: string): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function titleFor(activity: ChatActivity, call: CaseCall | undefined, result: Record<string, unknown> | null) {
  const [running, completed] = labels[activity.toolName] ?? [`Running ${activity.toolName}…`, `${activity.toolName} completed`];
  if (activity.status === "running") return running;
  if (activity.status === "failed") return `${activity.toolName} failed`;
  if (call) {
    if (call.status === "scheduled") return `${completed} · callback scheduled`;
    if (call.status === "escalated") return `${completed} · needs advocate`;
    return `${completed} · ${call.status === "completed" ? "response received" : "awaiting response"}`;
  }
  switch (result?.status) {
    case "already_pending": return `${completed} · already pending`;
    case "already_complete":
    case "supplier_selected": return `${completed} · already complete`;
    case "directory_exhausted": return "No eligible suppliers remain";
    case "not_ready": return `${completed} · waiting for prerequisites`;
    default: return completed;
  }
}

function questionsFrom(input: Record<string, unknown> | null): string[] {
  const raw = input?.questions ?? input?.requirements;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (typeof item === "string") return [item];
    if (item && typeof item === "object" && "question" in item && typeof item.question === "string") return [item.question];
    return [];
  });
}

function resultDescription(result: Record<string, unknown> | null, call: CaseCall | undefined) {
  if (call) {
    if (call.status === "awaiting_response") return `Call request queued for ${call.targetName}. Waiting for a reply.`;
    if (call.status === "scheduled") return `No answer yet. A follow-up call to ${call.targetName} is scheduled.`;
    if (call.status === "escalated") return `The call to ${call.targetName} needs care advocate review.`;
    return `A response from ${call.targetName} was recorded.`;
  }
  switch (result?.status) {
    case "already_pending": return "This request is already waiting for a response.";
    case "already_complete": return "This step is already complete.";
    case "supplier_selected": return "A supplier has already been selected.";
    case "directory_exhausted": return "No eligible suppliers remain in the directory.";
    case "not_ready": return "This step is waiting for the required information.";
    default: return null;
  }
}

export function CaseToolActivity({ activity, calls }: { activity: ChatActivity; calls: CaseCall[] }) {
  const input = parseObject(activity.input);
  const result = parseObject(activity.output);
  const call = calls.find((item) => item.id === result?.callId || item.id === activity.toolCallId);
  const title = titleFor(activity, call, result);
  const explanation = typeof input?.userReasonMessage === "string" ? input.userReasonMessage
    : typeof input?.reason === "string" ? input.reason : null;
  const reason = typeof input?.reason === "string" ? input.reason : null;
  const questions = questionsFrom(input);
  const outcome = resultDescription(result, call);

  return (
    <Task defaultOpen={false} className="my-2">
      <TaskTrigger title={title} />
      {explanation && <p className="mt-1 pl-6 text-xs leading-5 text-muted-foreground">{explanation}</p>}
      <TaskContent className="text-xs">
        {reason && <TaskItem><span className="font-medium text-foreground">Why: </span>{reason}</TaskItem>}
        {questions.length > 0 && (
          <TaskItem>
            <p className="font-medium text-foreground">Asked</p>
            <ul className="mt-1 list-disc space-y-1 pl-4">{questions.map((question, index) => <li key={index}>{question}</li>)}</ul>
          </TaskItem>
        )}
        {outcome && <TaskItem>{outcome}</TaskItem>}
        {call?.response && (
          <TaskItem>
            <p className="font-medium text-foreground">Response</p>
            {call.response.answers.map((answer, index) => <p key={index} className="mt-1 whitespace-pre-wrap">{call.questions[index]} <span className="text-foreground">{answer}</span></p>)}
            {call.response.issue && <p className="mt-1 text-rose-700">{call.response.issue}</p>}
          </TaskItem>
        )}
        {activity.status === "running" && <TaskItem>Sending the request…</TaskItem>}
        {activity.status === "failed" && <TaskItem>This request could not be completed.</TaskItem>}
      </TaskContent>
    </Task>
  );
}
