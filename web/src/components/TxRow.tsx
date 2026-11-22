import { CategoryIcon } from "@/components/CategoryIcon";
import { Money } from "@/components/Money";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import type { Tx } from "@/lib/types";
import { viewTx, type TxNames } from "@/lib/tx";

/** One transaction in the feed style: icon, category (or Transfer), note and who underneath, amount right. */
export function TxRow({ tx, names, account, onOpen, selected, balance, showBalance, className }: { tx: Tx; names: TxNames; account?: string; onOpen?: () => void; selected?: boolean; balance?: number | null; showBalance?: boolean; className?: string }) {
  const { t } = useI18n();
  const v = viewTx(tx, names, account);
  const title = v.kind === "transfer" ? t("tx.transfer") : names.category(v.category);
  const under = [v.kind === "transfer" && (v.from.length || v.to.length) ? `${v.from.join(", ") || "?"} → ${v.to.join(", ") || "?"}` : null, tx.note, tx.who].filter(Boolean).join(" · ");
  const body = (
    <>
      <CategoryIcon category={v.category} name={title} transfer={v.kind === "transfer"} />
      <span className="flex min-w-0 flex-1 flex-col text-left">
        <span className={cn("truncate text-sm font-medium", tx.void && "line-through")}>{title}</span>
        {under && <span className="truncate text-xs text-muted-foreground">{under}</span>}
      </span>
      <span className="flex shrink-0 flex-col items-end">
        <Money amount={v.amount} tone={v.kind === "transfer" ? "transfer" : "auto"} className="text-sm font-medium" />
        {showBalance && balance != null && <Money amount={balance} className="text-xs text-muted-foreground" />}
      </span>
    </>
  );
  const cls = cn("flex min-h-14 w-full items-center gap-3 rounded-lg px-2 py-2 outline-none", onOpen && "hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50", selected && "bg-muted", className);
  return onOpen ? (
    <button type="button" className={cls} onClick={onOpen}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}
