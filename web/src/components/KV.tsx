import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A label and its value on one line (definition list row). */
export function KV({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4 py-1.5 text-sm", className)}>
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right break-words tabular-nums">{children}</dd>
    </div>
  );
}
