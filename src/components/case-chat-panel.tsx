"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, MessageSquareText, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import type { Case, CaseMessage } from "@/lib/cases";

type StreamEvent =
  | { type: "delta"; text: string }
  | { type: "done" }
  | { type: "error"; message: string };

async function readChatStream(response: Response, onText: (text: string) => void) {
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
      if (event.type === "delta") onText(event.text);
      if (event.type === "error") throw new Error(event.message);
      if (event.type === "done") completed = true;
    }
    if (done) break;
  }
  if (!completed) throw new Error("The response ended early. Please try again.");
}

export function CaseChatPanel({
  caseId,
  initialMessages,
  activeChat,
}: {
  caseId: string;
  initialMessages: CaseMessage[];
  activeChat: Case["activeChat"];
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<CaseMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!activeChat) return;
    const timer = setInterval(() => router.refresh(), 2000);
    return () => clearInterval(timer);
  }, [activeChat, router]);

  const visibleMessages: CaseMessage[] = activeChat
    ? [...messages, { role: "user", content: activeChat.userMessage }, { role: "assistant", content: "" }]
    : messages;

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || sending || activeChat) return;

    const previousMessages = messages;
    const nextMessages: CaseMessage[] = [...messages, { role: "user", content }];
    setMessages([...nextMessages, { role: "assistant", content: "" }]);
    setDraft("");
    setError("");
    setSending(true);

    try {
      const response = await fetch(`/api/cases/${encodeURIComponent(caseId)}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content }),
      });
      await readChatStream(response, (text) => {
        setMessages((current) => current.map((message, index) =>
          index === current.length - 1 ? { ...message, content: message.content + text } : message,
        ));
      });
      router.refresh();
    } catch (cause) {
      setMessages(previousMessages);
      setDraft(content);
      setError(cause instanceof Error ? cause.message : "Chat is unavailable. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Card className="h-[480px] gap-0 py-0 lg:h-[560px]" aria-label="Case conversation">
      <CardHeader className="flex flex-row items-center gap-2 px-4 py-3">
        <MessageSquareText className="size-4 text-muted-foreground" aria-hidden="true" />
        <CardTitle>Conversation</CardTitle>
        {(sending || activeChat) && (
          <span role="status" className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <LoaderCircle className="size-3 animate-spin" aria-hidden="true" /> Agent responding
          </span>
        )}
      </CardHeader>
      <Separator />
      <CardContent className="min-h-0 flex-1 overflow-y-auto px-4 py-4" aria-live="polite">
        {visibleMessages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <MessageSquareText className="mb-3 size-6 text-muted-foreground/70" aria-hidden="true" />
            <p className="text-sm font-medium">Ask about this case</p>
            <p className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">
              Ask the agent about this case or its coordination work.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {visibleMessages.map((message, index) => (
              <div key={index} className={message.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div className={message.role === "user"
                  ? "max-w-[85%] rounded-xl bg-primary px-3 py-2 text-sm text-primary-foreground"
                  : "max-w-[90%] whitespace-pre-wrap text-sm leading-6 text-foreground"}>
                  {message.content || <LoaderCircle className="size-4 animate-spin text-muted-foreground" aria-label="Responding" />}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </CardContent>
      <Separator />
      <form onSubmit={send} className="space-y-2 p-3">
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="Ask a question about this case..."
          aria-label="Message"
          disabled={sending || Boolean(activeChat)}
          rows={2}
          className="min-h-16 resize-none text-sm"
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-destructive" role="alert">{error}</p>
          <Button size="sm" type="submit" disabled={!draft.trim() || sending || Boolean(activeChat)} className="ml-auto">
            {sending ? <LoaderCircle className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
            Send
          </Button>
        </div>
      </form>
    </Card>
  );
}
