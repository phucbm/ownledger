import { ArrowDownUp, BadgePercent, BellRing, CalendarClock, ChartLine, ChartPie, Coins, CreditCard, Gauge, Landmark, PiggyBank, Receipt, Scale, Wallet, WandSparkles, Zap, type LucideIcon } from "lucide-react";
import { lazy, type ComponentType } from "react";
import type { Features, Widget } from "@/lib/types";
import type { WidgetProps } from "./shared";

/**
 * Widget registry: type -> component, plus what edit mode (step 7) needs: its title key, the options its settings
 * dialog edits (same names as `WIDGET_TYPES` in src/engine/dashboard.ts), its default size on the 12-column grid and
 * when the catalogue offers it.
 */
export type WidgetHue = "spend" | "money" | "cards" | "time" | "alert";

export interface WidgetDef {
  type: string;
  titleKey: string;
  /** Small line icon beside the title; `hue` is its family colour (spend, money, cards, time, alert), the only colour it adds. */
  icon: LucideIcon;
  hue: WidgetHue;
  component: ComponentType<WidgetProps>;
  options?: string[];
  size: { w: number; h: number };
  /** Min size when resizing (edit mode). */
  min?: { w: number; h: number };
  /** The catalogue offers it only when this is true (default: always). */
  available?: (f: Features | undefined) => boolean;
}

// Each widget is its own chunk: Recharts and the rest load after Home paints, outside the first-load budget.
const Account = lazy(() => import("./Account"));
const Cards = lazy(() => import("./Cards"));
const Cashback = lazy(() => import("./Cashback"));
const CardsValue = lazy(() => import("./CardsValue"));
const WhichCard = lazy(() => import("./WhichCard"));
const Attention = lazy(() => import("./Attention"));
const ByCategory = lazy(() => import("./ByCategory"));
const ChartWidget = lazy(() => import("./ChartWidget"));
const Deposits = lazy(() => import("./Deposits"));
const IncomeSpending = lazy(() => import("./IncomeSpending"));
const Left = lazy(() => import("./Left"));
const NetWorth = lazy(() => import("./NetWorth"));
const Pace = lazy(() => import("./Pace"));
const Recent = lazy(() => import("./Recent"));
const Unusual = lazy(() => import("./Unusual"));
const Upcoming = lazy(() => import("./Upcoming"));


const cards = (f: Features | undefined) => Boolean(f?.cards);

export const widgetRegistry: Record<string, WidgetDef> = Object.fromEntries(
  (
    [
      { type: "pace", icon: Gauge, hue: "spend", titleKey: "widget.pace", component: Pace, size: { w: 6, h: 4 }, min: { w: 4, h: 3 } },
      { type: "attention", icon: BellRing, hue: "alert", titleKey: "widget.attention", component: Attention, size: { w: 6, h: 4 }, min: { w: 3, h: 2 } },
      { type: "unusual", icon: Zap, hue: "alert", titleKey: "widget.unusual", component: Unusual, size: { w: 6, h: 4 }, min: { w: 3, h: 2 }, available: (f) => (f?.historyMonths ?? 0) >= 2 },
      { type: "net_worth", icon: Wallet, hue: "money", titleKey: "widget.netWorth", component: NetWorth, size: { w: 6, h: 4 }, min: { w: 3, h: 3 } },
      { type: "left", icon: Coins, hue: "money", titleKey: "widget.left", component: Left, size: { w: 4, h: 3 }, min: { w: 3, h: 2 } },
      { type: "by_category", icon: ChartPie, hue: "spend", titleKey: "widget.byCategory", component: ByCategory, options: ["period"], size: { w: 6, h: 5 }, min: { w: 3, h: 3 } },
      { type: "income_spending", icon: ArrowDownUp, hue: "time", titleKey: "widget.incomeSpending", component: IncomeSpending, options: ["months"], size: { w: 6, h: 4 }, min: { w: 4, h: 3 } },
      { type: "recent", icon: Receipt, hue: "time", titleKey: "widget.recent", component: Recent, options: ["count"], size: { w: 6, h: 5 }, min: { w: 3, h: 3 } },
      { type: "account", icon: Landmark, hue: "time", titleKey: "widget.account", component: Account, options: ["account"], size: { w: 6, h: 4 }, min: { w: 3, h: 3 }, available: (f) => (f?.accounts ?? 0) > 0 },
      { type: "upcoming", icon: CalendarClock, hue: "time", titleKey: "widget.upcoming", component: Upcoming, size: { w: 6, h: 5 }, min: { w: 4, h: 4 }, available: (f) => Boolean(f?.plans || f?.cards) },
      { type: "deposits", icon: PiggyBank, hue: "money", titleKey: "widget.deposits", component: Deposits, size: { w: 6, h: 3 }, min: { w: 3, h: 2 }, available: (f) => Boolean(f?.deposits) },
      { type: "chart", icon: ChartLine, hue: "time", titleKey: "widget.chart", component: ChartWidget, options: ["query", "chart", "title"], size: { w: 6, h: 4 }, min: { w: 3, h: 2 } },
      { type: "cards", icon: CreditCard, hue: "cards", titleKey: "widget.cards", component: Cards, size: { w: 6, h: 5 }, min: { w: 3, h: 3 }, available: cards },
      { type: "cashback", icon: BadgePercent, hue: "money", titleKey: "widget.cashback", component: Cashback, size: { w: 6, h: 4 }, min: { w: 3, h: 3 }, available: cards },
      { type: "which_card", icon: WandSparkles, hue: "cards", titleKey: "widget.which_card", component: WhichCard, size: { w: 6, h: 4 }, min: { w: 3, h: 3 }, available: cards },
      { type: "cards_value", icon: Scale, hue: "cards", titleKey: "widget.cards_value", component: CardsValue, size: { w: 6, h: 4 }, min: { w: 3, h: 3 }, available: cards },
    ] satisfies WidgetDef[]
  ).map((d) => [d.type, d]),
);

/** The component for a widget; an unknown type (a newer server) renders nothing. */
export const widgetComponent = (w: Widget): ComponentType<WidgetProps> | null => widgetRegistry[w.type]?.component ?? null;
