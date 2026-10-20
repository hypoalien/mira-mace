import { defineSignal } from "@temporalio/workflow";

export const caseUpdated = defineSignal("case-updated");
export const chatRequested = defineSignal<[string]>("chat-requested");
