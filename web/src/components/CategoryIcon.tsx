import { Banknote, CircleEllipsis, CirclePlus, Car, GraduationCap, Gamepad2, Gift, HandCoins, HeartPulse, House, Landmark, Laptop, Percent, Repeat, ShoppingBag, Users, Utensils, Wrench, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Icons for the default top categories (presets); the owner's own categories get a letter in a tinted circle.
const icons: Record<string, LucideIcon> = {
  food: Utensils,
  transport: Car,
  home: House,
  family: Users,
  health: HeartPulse,
  shopping: ShoppingBag,
  fun: Gamepad2,
  learning: GraduationCap,
  "work-tools": Wrench,
  subscriptions: Repeat,
  "bank-fees": Landmark,
  other: CircleEllipsis,
  salary: Banknote,
  freelance: Laptop,
  interest: Percent,
  cashback: HandCoins,
  "gifts-received": Gift,
  "other-income": CirclePlus,
};

const tints = ["bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200", "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200", "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200", "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200", "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200", "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200"];

function hash(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

/** `category` is a path ("food/coffee"); its top segment picks the icon. `name` gives the letter for custom categories. */
export function CategoryIcon({ category, name, transfer, className }: { category?: string | null; name?: string; transfer?: boolean; className?: string }) {
  const box = "flex size-9 shrink-0 items-center justify-center rounded-full";
  if (transfer) return <span aria-hidden className={cn(box, "bg-muted text-muted-foreground", className)}><ArrowIcon /></span>;
  const top = (category ?? "other").split("/")[0]!;
  const Icon = icons[top];
  if (Icon) return <span aria-hidden className={cn(box, "bg-muted text-foreground", className)}><Icon className="size-4" /></span>;
  const letter = ([...(name ?? top)][0] ?? "?").toUpperCase();
  return <span aria-hidden className={cn(box, "text-sm font-medium", tints[hash(top) % tints.length], className)}>{letter}</span>;
}

import { ArrowLeftRight } from "lucide-react";
const ArrowIcon = () => <ArrowLeftRight className="size-4" />;
