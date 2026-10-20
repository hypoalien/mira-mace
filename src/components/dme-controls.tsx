"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, ExternalLink, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAgentStart } from "@/components/agent-start-context";
import type { Case } from "@/lib/cases";

export function DmeControls({ current }: { current: Case }) {
  const router = useRouter();
  const { starting, setStarting } = useAgentStart();
  const [error, setError] = useState("");
  const externalUrl = `/cases/${encodeURIComponent(current.id)}/external`;
  const pending = current.coordination.calls.filter((call) => call.status === "awaiting_response");
  const needsResume = current.coordination.state === "ready";

  useEffect(() => {
    if (!current.coordination.workflowId || current.coordination.state === "completed" || current.coordination.state === "error") return;
    const timer = setInterval(() => router.refresh(), 2500);
    return () => clearInterval(timer);
  }, [current.coordination.workflowId, current.coordination.state, router]);

  useEffect(() => {
    if (current.coordination.state !== "not_started") setStarting(false);
  }, [current.coordination.state, setStarting]);

  async function start() {
    if (starting) return;
    setStarting(true);
    setError("");
    try {
      const response = await fetch(`/api/cases/${encodeURIComponent(current.id)}/dme/start`, { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Could not start the DME agent.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start the DME agent.");
      setStarting(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {error && <span role="alert" className="text-xs text-destructive">{error}</span>}
      {current.coordination.state === "running" && (
        <span role="status" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <LoaderCircle className="size-3 animate-spin" aria-hidden="true" /> Agent working
        </span>
      )}
      {(!current.coordination.workflowId || current.coordination.state === "error" || needsResume) && (
        <Button type="button" size="xs" onClick={start} disabled={starting}>
          {starting ? <LoaderCircle className="size-3 animate-spin" /> : <Bot className="size-3" />}
          {current.coordination.state === "error" ? "Restart DME agent" : needsResume ? "Continue DME agent" : "Start DME agent"}
        </Button>
      )}
      {pending.length > 0 && (
        <Button asChild variant="outline" size="xs">
          <a href={externalUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="size-3" />
            External responses ({pending.length})
          </a>
        </Button>
      )}
    </div>
  );
}
