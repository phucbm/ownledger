import { AskAI } from "@/components/AskAI";
import { CategoryIcon } from "@/components/CategoryIcon";
import { Money } from "@/components/Money";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useI18n } from "@/i18n";
import { formatDate } from "@/lib/format";
import type { Tx } from "@/lib/types";
import { viewTx, type TxNames } from "@/lib/tx";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right break-words">{children}</dd>
    </div>
  );
}

/** Every line of a transaction, its tags, who, event and id; "Ask AI to edit this" copies a prompt naming the id. */
export function TxPanel({ tx, names, onClose, account }: { tx: Tx | null; names: TxNames; onClose: () => void; account?: string }) {
  const { t, lang } = useI18n();
  const phone = useMediaQuery("(max-width: 767px)");
  const v = tx ? viewTx(tx, names, account) : null;
  const title = tx && v ? (v.kind === "transfer" ? t("tx.transfer") : names.category(v.category)) : "";
  return (
    <Sheet open={Boolean(tx)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side={phone ? "bottom" : "right"} className={phone ? "max-h-[85svh] overflow-auto rounded-t-xl" : "overflow-auto sm:max-w-md"}>
        {tx && v && (
          <>
            <SheetHeader>
              <div className="flex items-center gap-3">
                <CategoryIcon category={v.category} name={title} transfer={v.kind === "transfer"} />
                <div className="min-w-0">
                  <SheetTitle className="truncate">{tx.note || title}</SheetTitle>
                  <SheetDescription>
                    {formatDate(tx.date, lang, { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })}
                    {tx.time ? ` · ${tx.time}` : ""}
                  </SheetDescription>
                </div>
              </div>
              <Money amount={v.amount} tone={v.kind === "transfer" ? "transfer" : "auto"} className="text-2xl font-semibold" />
              {tx.void && <p className="text-sm text-critical">{t("tx.void")}</p>}
            </SheetHeader>
            <div className="flex flex-col gap-4 px-4 pb-4">
              <section aria-label={t("tx.lines")}>
                <h3 className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">{t("tx.lines")}</h3>
                <ul className="divide-y rounded-lg border">
                  {tx.lines.map((l, i) => (
                    <li key={i} className="flex items-start justify-between gap-3 p-2.5 text-sm">
                      <span className="flex min-w-0 flex-col">
                        {l.account && <span className="truncate">{names.account(l.account)}</span>}
                        {l.category && <span className="truncate text-xs text-muted-foreground">{names.categoryPath(l.category)}</span>}
                        {l.asset && <span className="text-xs text-muted-foreground">{l.asset}{l.qty !== undefined ? ` × ${l.qty}` : ""}</span>}
                        {l.note && <span className="text-xs text-muted-foreground">{l.note}</span>}
                      </span>
                      <Money amount={l.amount} tone="auto" plus className="shrink-0" />
                    </li>
                  ))}
                </ul>
              </section>
              <dl className="divide-y">
                {tx.who && <Row label={t("tx.who")}>{tx.who}</Row>}
                {tx.event && <Row label={t("tx.event")}>{tx.event}</Row>}
                {tx.tags && tx.tags.length > 0 && <Row label={t("tx.tags")}>{tx.tags.map((g) => `#${g}`).join(" ")}</Row>}
                {tx.plan && <Row label={t("tx.plan")}>{tx.plan}</Row>}
                <Row label={t("tx.id")}><code className="text-xs">{tx.id}</code></Row>
              </dl>
              <AskAI size="default" label={t("tx.askEdit")} prompt={t("ask.editTx", { id: tx.id, date: tx.date, summary: `${tx.note || title}, ${v.amount}` })} />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
