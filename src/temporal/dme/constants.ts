export const CASE_TASK_QUEUE = "dme-case-agent";

export function chatTextTopic(turnId: string) {
  return `chat-text-${turnId}`;
}

export function chatCompletionTopic(turnId: string) {
  return `chat-completion-${turnId}`;
}

export type ChatCompletion = { status: "done" } | { status: "error"; message: string };
