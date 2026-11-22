import { Home, ArrowLeftRight, Landmark, CalendarClock, BarChart3, CreditCard, Upload, Settings, type LucideIcon } from "lucide-react";

import type { Features as ServerFeatures } from "@/lib/types";

export type Features = ServerFeatures | Record<string, unknown> | undefined;

export interface NavItem {
  id: string;
  path: string;
  icon: LucideIcon;
  labelKey: string;
  /** Shown in the phone bottom tab bar; the others go under More. */
  tab?: boolean;
  /** Hook for `me.features`: hide an item when the ledger does not need it. Omitted = always shown. */
  show?: (features: Features) => boolean;
}

export const mainNav: NavItem[] = [
  { id: "home", path: "/", icon: Home, labelKey: "nav.home", tab: true },
  { id: "transactions", path: "/transactions", icon: ArrowLeftRight, labelKey: "nav.transactions", tab: true },
  { id: "accounts", path: "/accounts", icon: Landmark, labelKey: "nav.accounts", tab: true },
  { id: "cards", path: "/cards", icon: CreditCard, labelKey: "nav.cards", show: (f) => f?.cards === true },
  { id: "plans", path: "/plans", icon: CalendarClock, labelKey: "nav.plans", show: (f) => f?.plans === true },
  { id: "reports", path: "/reports", icon: BarChart3, labelKey: "nav.reports", tab: true },
  { id: "import", path: "/import", icon: Upload, labelKey: "nav.import", show: (f) => f?.imports === true },
];

export const settingsNav: NavItem = { id: "settings", path: "/settings", icon: Settings, labelKey: "nav.settings" };

export const visible = (items: NavItem[], features: Features) => items.filter((i) => !i.show || i.show(features));

export const isActive = (item: NavItem, location: string) => (item.path === "/" ? location === "/" : location === item.path || location.startsWith(`${item.path}/`));
