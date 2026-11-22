import { ChevronsUpDown } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useI18n } from "@/i18n";
import { fold } from "@/lib/fold";

export interface ComboOption {
  value: string;
  label: string;
  /** Extra text the search also matches. */
  keywords?: string[];
  /** Depth in a tree (categories). */
  depth?: number;
}
export interface ComboGroup {
  heading?: string;
  options: ComboOption[];
}

/** A searchable list in a popover (shadcn combobox pattern). Search ignores case and Vietnamese diacritics. */
export function Combobox({ label, groups, value, onSelect, className, ariaLabel }: { label: string; ariaLabel?: string; groups: ComboGroup[]; value?: string; onSelect: (v: string) => void; className?: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const current = groups.flatMap((g) => g.options).find((o) => o.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" aria-expanded={open} aria-label={ariaLabel ? `${ariaLabel}: ${current ? current.label : label}` : undefined} className={`min-h-11 justify-between gap-2 md:min-h-8 ${className ?? ""}`}>
          <span className="truncate">{current ? current.label : label}</span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(20rem,calc(100vw-2rem))] p-0">
        <Command filter={(v: string, search: string, kw?: string[]) => (fold([v, ...(kw ?? [])].join(" ")).includes(fold(search)) ? 1 : 0)}>
          <CommandInput placeholder={t("filter.search")} />
          <CommandList className="max-h-72">
            <CommandEmpty>{t("filter.noMatch")}</CommandEmpty>
            {groups.map((g, i) => (
              <CommandGroup key={g.heading ?? i} heading={g.heading}>
                {g.options.map((o) => (
                  <CommandItem
                    key={o.value}
                    value={o.value}
                    keywords={[o.label, ...(o.keywords ?? [])]}
                    data-checked={o.value === value}
                    className="min-h-11 md:min-h-8"
                    style={o.depth ? { paddingLeft: `${0.5 + o.depth * 1}rem` } : undefined}
                    onSelect={() => {
                      onSelect(o.value);
                      setOpen(false);
                    }}
                  >
                    <span className="truncate">{o.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
