import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function statusColors(value: string) {
  const status = value.toLowerCase().replaceAll("_", " ");
  if (/not confirmed|needed|verification/.test(status)) {
    return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300";
  }
  if (/completed|confirmed|received|booking confirmed|details confirmed|responded|notified/.test(status)) {
    return "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300";
  }
  if (/needs advocate|blocked|error|failed|rejected|follow-up needed/.test(status)) {
    return "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300";
  }
  if (/follow-up scheduled|callback scheduled/.test(status)) {
    return "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-300";
  }
  if (/awaiting|pending|waiting|some details/.test(status)) {
    return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300";
  }
  if (/agent working|running|coordinating|coordination|booking|delivery|patient confirmation|notification/.test(status)) {
    return "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300";
  }
  return "border-border bg-muted text-muted-foreground";
}

export function StatusBadge({ value, className }: { value: string; className?: string }) {
  return (
    <Badge variant="outline" className={cn("gap-1.5 border px-2 py-0.5 text-xs font-medium", statusColors(value), className)}>
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current" />
      {value.replaceAll("_", " ")}
    </Badge>
  );
}
