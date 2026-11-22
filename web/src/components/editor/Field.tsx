import { useId, type ReactNode } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** A label above a control. `children(id)` gets the id to put on the control so the label names it. */
export function Field({ label, hint, children, className }: { label: string; hint?: string; children: (id: string) => ReactNode; className?: string }) {
  const id = useId();
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className ?? ""}`}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children(id)}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** A shadcn select over a list of `{ value, label }`. */
export function OptionSelect({ id, value, options, onChange }: { id?: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="min-h-11 w-full md:min-h-8">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} className="min-h-11 md:min-h-8">
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
