"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CreateCaseButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function createCase() {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/cases", { method: "POST" });
      if (!response.ok) throw new Error("Could not create the case. Try again.");
      const created: { id: string } = await response.json();
      router.push(`/cases/${created.id}`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create the case.");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <Button type="button" onClick={createCase} disabled={pending}>
        <Plus aria-hidden="true" />
        {pending ? "Creating case…" : "Create case from intake"}
      </Button>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
    </div>
  );
}
