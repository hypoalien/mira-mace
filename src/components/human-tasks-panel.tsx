"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { HumanTask } from "@/lib/cases";
import type { MockResponse } from "@/lib/dme/responses";

function PendingTask({ caseId, task }: { caseId: string; task: HumanTask }) {
  const router = useRouter();
  const [resolution, setResolution] = useState("");
  const [draftResponse, setDraftResponse] = useState<MockResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [retryNotification, setRetryNotification] = useState(false);

  async function generateResolution() {
    if (saving || generating) return;
    setGenerating(true);
    setError("");
    try {
      const response = await fetch(`/api/cases/${encodeURIComponent(caseId)}/human-tasks/${encodeURIComponent(task.id)}/draft`, { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Could not generate a resolution.");
      setResolution(body.resolution);
      setDraftResponse(body.response ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not generate a resolution.");
    } finally {
      setGenerating(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resolution.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/cases/${encodeURIComponent(caseId)}/human-tasks/${encodeURIComponent(task.id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolution: resolution.trim(), ...(draftResponse ? { response: draftResponse } : {}) }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Could not save the resolution.");
      if (body.warning) {
        setError(body.warning);
        setRetryNotification(true);
        return;
      }
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the resolution.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2 rounded-lg border p-3">
      <p className="text-sm font-medium">{task.title}</p>
      <p className="text-xs leading-5 text-muted-foreground">{task.description}</p>
      <Label htmlFor={`resolution-${task.id}`} className="text-xs">Advocate resolution</Label>
      <Textarea id={`resolution-${task.id}`} value={resolution} onChange={(event) => setResolution(event.target.value)} rows={3} maxLength={2000} />
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={saving || generating || !resolution.trim()}>
          {saving && <LoaderCircle className="size-3.5 animate-spin" />}
          {retryNotification ? "Retry agent notification" : "Resolve task"}
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={saving || generating} onClick={generateResolution}>
          {generating ? <LoaderCircle className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
          {generating ? "Generating…" : "Generate resolution"}
        </Button>
      </div>
    </form>
  );
}

export function HumanTasksPanel({ caseId, tasks }: { caseId: string; tasks: HumanTask[] }) {
  if (tasks.length === 0) return null;
  const pending = tasks.filter((task) => task.status === "pending");
  const resolved = tasks.filter((task) => task.status === "resolved");

  return (
    <section className="space-y-3 border-t p-4" aria-label="Care advocate tasks">
      <div>
        <h3 className="text-sm font-semibold">Care advocate tasks</h3>
        <p className="text-xs text-muted-foreground">{pending.length} need attention</p>
      </div>
      {pending.map((task) => <PendingTask key={task.id} caseId={caseId} task={task} />)}
      {resolved.map((task) => (
        <div key={task.id} className="rounded-lg border p-3 text-xs">
          <p className="font-medium">{task.title} · Resolved</p>
          <p className="mt-1 text-muted-foreground">{task.resolution}</p>
        </div>
      ))}
    </section>
  );
}
