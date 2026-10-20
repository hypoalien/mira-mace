"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquareText } from "lucide-react";
import { useAgentStart } from "@/components/agent-start-context";
import { PromptInput, PromptInputBody, PromptInputFooter, PromptInputSubmit, PromptInputTextarea } from "@/components/ai-elements/prompt-input";
import { Checkpoint, CheckpointIcon } from "@/components/ai-elements/checkpoint";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CaseToolActivity } from "@/components/case-tool-activity";
import { ScheduledCallsQueue } from "@/components/scheduled-calls-queue";
import { QuickResponseStack } from "@/components/quick-response-stack";
import { DeliveryTimeTravel } from "@/components/delivery-time-travel";
import type { Case, CaseCall, CaseCheckpoint, CaseMessage, ChatChannel, DeliverySlot } from "@/lib/cases";
import { Fragment } from "react";
import type { ChatActivity } from "@/lib/chat-activity";

type StreamEvent =
  | { type: "delta"; text: string }
  | { type: "activity"; activity: ChatActivity }
  | { type: "done" }
  | { type: "error"; message: string };

async function readChatStream(response: Response, onEvent: (event: StreamEvent) => void) {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? "Chat is unavailable. Please try again.");
  }
  if (!response.body) throw new Error("The response stream is unavailable.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed = false;

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line) continue;
      const event = JSON.parse(line) as StreamEvent;
      if (event.type === "error") throw new Error(event.message);
      onEvent(event);
      if (event.type === "done") completed = true;
    }
    if (done) break;
  }
  if (!completed) throw new Error("The response ended early. Please try again.");
}

export function CaseChatPanel({
  caseId,
  initialMessages,
  initialPatientMessages,
  initialCheckpoints,
  activeChat,
  agentWorking,
  autoMockEnabled,
  deliveryTravelSlot,
  recordedCalls = [],
}: {
  caseId: string;
  initialMessages: CaseMessage[];
  initialPatientMessages: CaseMessage[];
  initialCheckpoints: CaseCheckpoint[];
  activeChat: Case["activeChat"];
  agentWorking: boolean;
  autoMockEnabled: boolean;
  deliveryTravelSlot: DeliverySlot | null;
  recordedCalls: CaseCall[];
}) {
  const router = useRouter();
  const { starting } = useAgentStart();
  const [channel, setChannel] = useState<ChatChannel>("advocate");
  const [pending, setPending] = useState<{ channel: ChatChannel; baseCount: number; messages: CaseMessage[] } | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const messagesRef = useRef<HTMLDivElement>(null);
  const shouldFollowMessagesRef = useRef(true);
  const hasOpenRound = initialMessages.some((message) => message.turnId?.startsWith("round-") && message.content === "Thinking…");
  const awaitingReplies = recordedCalls.some((call) => call.status === "awaiting_response");
  const quickResponseCalls = autoMockEnabled ? [] : recordedCalls.filter((call) => call.status === "awaiting_response");
  const awaitingFollowUp = recordedCalls.some((call) => call.status === "scheduled");
  const waiting = (awaitingReplies || awaitingFollowUp) && !agentWorking && !starting && !hasOpenRound;
  const waitingLabel = awaitingReplies ? "Waiting for replies…" : "Waiting for scheduled follow-up…";
  const switchChannel = (next: ChatChannel) => {
    setChannel(next);
    setDraft("");
    setError("");
  };

  useEffect(() => {
    const container = messagesRef.current;
    if (container && shouldFollowMessagesRef.current) {
      container.scrollTop = container.scrollHeight;
    }
  }, [initialMessages, initialPatientMessages, pending, channel]);

  useEffect(() => {
    if ((!activeChat && !agentWorking && !hasOpenRound) || sending) return;
    const timer = setInterval(() => router.refresh(), 400);
    return () => clearInterval(timer);
  }, [activeChat, agentWorking, hasOpenRound, sending, router]);

  useEffect(() => {
    if (autoMockEnabled || quickResponseCalls.length === 0) return;
    const timer = setInterval(() => router.refresh(), 1500);
    return () => clearInterval(timer);
  }, [autoMockEnabled, quickResponseCalls.length, router]);

  const savedMessages = channel === "patient" ? initialPatientMessages : initialMessages;
  const pendingIsActive = Boolean(pending && pending.channel === channel && savedMessages.length <= pending.baseCount);
  const messages = pendingIsActive ? pending!.messages : savedMessages;
  const lastRoundIsThinking = messages.at(-1)?.turnId?.startsWith("round-") && messages.at(-1)?.content === "Thinking…";
  const channelChat = activeChat?.channel === channel ? activeChat : null;
  const visibleMessages: CaseMessage[] = channelChat && !pendingIsActive && !sending
    ? [...messages, { role: "user", content: channelChat.userMessage }, { role: "assistant", content: "" }]
    : channel === "advocate" && (agentWorking || starting) && !pendingIsActive && !sending && !lastRoundIsThinking
      ? [...messages, { role: "assistant", content: "" }]
      : messages;
  const hasTrackedOutreach = messages.some((message) => message.turnId?.startsWith("round-") && message.activities?.length);
  const recordedActivities: ChatActivity[] = hasTrackedOutreach ? [] : recordedCalls.map((call) => ({
    toolCallId: call.id,
    toolName: ({
      supplier_offer: "requestSupplierOffer",
      patient_arrangement: "confirmPatientArrangement",
      supplier_booking: "bookDelivery",
      supplier_delivery: "requestSupplierDeliveryEvidence",
      patient_delivery: "requestPatientDeliveryConfirmation",
      outreach: call.kind === "pcp" ? "contactPCP" : call.kind === "supplier" ? "contactSupplier" : "contactPatient",
    })[call.purpose],
    status: "completed",
    input: JSON.stringify({ reason: call.reason, questions: call.questions }, null, 2),
    output: JSON.stringify({ status: call.status, target: call.targetName, response: call.response }, null, 2),
  }));
  const renderCheckpoint = (checkpoint: CaseCheckpoint) => (
    <Checkpoint key={checkpoint.id} className="gap-2 py-1 text-xs" aria-label={`Case status: ${checkpoint.status}`}>
      <CheckpointIcon className="size-3.5" />
      <span className="shrink-0 font-medium">{checkpoint.status}</span>
      <time className="shrink-0 text-muted-foreground/70" dateTime={checkpoint.createdAt}>
        {new Date(checkpoint.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
      </time>
    </Checkpoint>
  );

  async function send(text: string) {
    const content = text.trim();
    if (!content || sending || activeChat) return;

    const nextMessages: CaseMessage[] = [...messages, { role: "user", content }];
    setPending({ channel, baseCount: savedMessages.length, messages: [...nextMessages, { role: "assistant", content: "" }] });
    setDraft("");
    setError("");
    setSending(true);

    try {
      const response = await fetch(`/api/cases/${encodeURIComponent(caseId)}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content, channel }),
      });
      await readChatStream(response, (streamEvent) => {
        if (streamEvent.type !== "delta" && streamEvent.type !== "activity") return;
        setPending((current) => current && ({ ...current, messages: current.messages.map((message, index) => {
          if (index !== current.messages.length - 1) return message;
          if (streamEvent.type === "delta") return { ...message, content: message.content + streamEvent.text };
          const activities = message.activities ?? [];
          const existing = activities.findIndex((activity) => activity.toolCallId === streamEvent.activity.toolCallId);
          const nextActivities = [...activities];
          if (existing >= 0) nextActivities[existing] = streamEvent.activity;
          else nextActivities.push(streamEvent.activity);
          return { ...message, activities: nextActivities };
        }) }));
      });
      router.refresh();
    } catch (cause) {
      setPending(null);
      setDraft(content);
      setError(cause instanceof Error ? cause.message : "Chat is unavailable. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Card className="h-full min-h-[560px] gap-0 overflow-hidden py-0 lg:min-h-0" aria-label="Case conversation">
      <CardHeader className="flex flex-row items-center gap-2 px-4 py-3">
        <MessageSquareText className="size-4 text-muted-foreground" aria-hidden="true" />
        <CardTitle className="sr-only">Conversation</CardTitle>
        <Tabs value={channel} onValueChange={(value) => switchChannel(value as ChatChannel)}>
          <TabsList className="h-8">
            <TabsTrigger value="advocate" className="text-xs" onClick={() => switchChannel("advocate")}>Care advocate</TabsTrigger>
            <TabsTrigger value="patient" className="text-xs" onClick={() => switchChannel("patient")}>Patient</TabsTrigger>
          </TabsList>
        </Tabs>
        {(sending || channelChat || (channel === "advocate" && (agentWorking || starting || hasOpenRound || waiting))) && (
          <span role="status" className="ml-auto text-xs"><Shimmer as="span">{channel === "advocate" && waiting ? waitingLabel : channel === "patient" ? "Replying…" : "Agent working…"}</Shimmer></span>
        )}
      </CardHeader>
      <Separator />
      <CardContent
        ref={messagesRef}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
        aria-live="polite"
        onScroll={(event) => {
          const container = event.currentTarget;
          shouldFollowMessagesRef.current = container.scrollHeight - container.scrollTop - container.clientHeight < 64;
        }}
      >
        {visibleMessages.length === 0 && (channel === "patient" || (recordedActivities.length === 0 && quickResponseCalls.length === 0 && !deliveryTravelSlot)) ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <MessageSquareText className="mb-3 size-6 text-muted-foreground/70" aria-hidden="true" />
            <p className="text-sm font-medium">{channel === "patient" ? "Patient conversation" : "Ask about this case"}</p>
            <p className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">
              {channel === "patient" ? "Write as the patient to ask a question or share information with the care team." : "Ask the agent about this case or its coordination work."}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {channel === "advocate" && initialCheckpoints.filter((checkpoint) => checkpoint.afterMessageCount === 0).map(renderCheckpoint)}
            {visibleMessages.map((message, index) => (
              <Fragment key={`${message.turnId ?? message.role}-${index}`}>
                <div key={index} className={message.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div className={message.role === "user"
                  ? "max-w-[85%] rounded-xl bg-primary px-3 py-2 text-sm text-primary-foreground"
                  : "max-w-[90%] whitespace-pre-wrap text-sm leading-6 text-foreground"}>
                  {channel === "advocate" && message.role === "assistant" && (!message.content || message.content === "Thinking…" || Boolean(message.activities?.length)) && (
                    <Reasoning isStreaming={!message.content || message.content === "Thinking…"} defaultOpen={!message.content || message.content === "Thinking…"} className="mb-2">
                      <ReasoningTrigger className="text-xs" />
                      <ReasoningContent>
                        {message.activities?.length
                          ? message.activities.map((activity) => <CaseToolActivity key={activity.toolCallId} activity={activity} calls={recordedCalls} />)
                          : <Shimmer as="span">Thinking…</Shimmer>}
                      </ReasoningContent>
                    </Reasoning>
                  )}
                  {channel === "patient" && <span className="mb-1 block text-[11px] font-medium opacity-70">{message.role === "user" ? "Patient" : "Care team"}</span>}
                  {message.content !== "Thinking…" && (message.content || (channel === "patient" ? <Shimmer as="span">Writing…</Shimmer> : ""))}
                </div>
                </div>
                {channel === "advocate" && initialCheckpoints.filter((checkpoint) => checkpoint.afterMessageCount === index + 1).map(renderCheckpoint)}
              </Fragment>
            ))}
            {channel === "advocate" && recordedActivities.length > 0 && (
              <Reasoning defaultOpen className="max-w-[90%]">
                <ReasoningTrigger getThinkingMessage={() => "Previously recorded outreach"} className="text-xs" />
                <ReasoningContent>
                  {recordedActivities.map((activity) => <CaseToolActivity key={activity.toolCallId} activity={activity} calls={recordedCalls} />)}
                </ReasoningContent>
              </Reasoning>
            )}
            {channel === "advocate" && <ScheduledCallsQueue caseId={caseId} calls={recordedCalls} />}
            {channel === "advocate" && autoMockEnabled && deliveryTravelSlot && <DeliveryTimeTravel caseId={caseId} slot={deliveryTravelSlot} />}
            {channel === "advocate" && <QuickResponseStack caseId={caseId} calls={quickResponseCalls} deliveryTravelSlot={deliveryTravelSlot} />}
            {channel === "advocate" && waiting && (
              <p role="status" className="text-xs"><Shimmer as="span">{waitingLabel}</Shimmer></p>
            )}
          </div>
        )}
      </CardContent>
      <Separator />
      <div className="space-y-1.5 p-3">
        <TooltipProvider>
          <PromptInput onSubmit={(message) => send(message.text)}>
            <PromptInputBody>
              <PromptInputTextarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={channel === "patient" ? "Write a patient message…" : "Ask about this case…"}
                aria-label={channel === "patient" ? "Patient message" : "Message"}
                disabled={sending || Boolean(activeChat)}
                className="min-h-12 text-sm"
              />
            </PromptInputBody>
            <PromptInputFooter>
              <span className="text-[11px] text-muted-foreground">Enter to send · Shift+Enter for a new line</span>
              <PromptInputSubmit disabled={!draft.trim() || sending || Boolean(activeChat)} status={sending ? "submitted" : "ready"} />
            </PromptInputFooter>
          </PromptInput>
        </TooltipProvider>
        {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
      </div>
    </Card>
  );
}
