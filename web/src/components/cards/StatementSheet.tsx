import { Money } from "@/components/Money";
import { TxRow } from "@/components/TxRow";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useI18n } from "@/i18n";
import { formatDate } from "@/lib/format";
import { useMeta, useStatementDetail } from "@/lib/queries";
import { namesFrom } from "@/lib/tx";
import { KV } from "@/components/KV";

/** One statement period: its totals and every transaction on the card in it (a bottom sheet on a phone). */
export function StatementSheet({ account, close, onClose }: { account: string; close: string | null; onClose: () => void }) {
  const { t, lang } = useI18n();
  const phone = useMediaQuery("(max-width: 767px)");
  const { data, error, isLoading } = useStatementDetail(account, close);
  const names = namesFrom(useMeta().data);
  const s = data?.statement;
  return (
    <Sheet open={close !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side={phone ? "bottom" : "right"} className={phone ? "max-h-[85svh] overflow-auto rounded-t-xl" : "overflow-auto sm:max-w-md"}>
        <SheetHeader>
          <SheetTitle>{s?.open ? t("cards.currentPeriod") : t("cards.statementOf", { date: close ? formatDate(close, lang) : "" })}</SheetTitle>
          <SheetDescription>{s ? `${formatDate(s.from, lang)} – ${formatDate(s.close, lang)}` : t("common.loading")}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-3 px-4 pb-4">
          {error ? (
            <p className="text-sm text-muted-foreground">{t("common.error", { message: error.message })}</p>
          ) : isLoading || !data || !s ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <>
              <dl className="divide-y rounded-lg border px-3">
                <KV label={t("cards.opening")}><Money amount={s.opening} /></KV>
                <KV label={t("cards.k.purchase")}><Money amount={s.purchases} /></KV>
                {s.fees > 0 && <KV label={t("cards.k.fee")}><Money amount={s.fees} /></KV>}
                {s.refunds > 0 && <KV label={t("cards.k.refund")}><Money amount={-s.refunds} /></KV>}
                {s.cashback > 0 && <KV label={t("cards.k.cashback")}><Money amount={-s.cashback} /></KV>}
                {s.payments > 0 && <KV label={t("cards.k.payment")}><Money amount={-s.payments} /></KV>}
                <KV label={t("cards.closing")} className="font-medium"><Money amount={s.closing} /></KV>
              </dl>
              <ul>
                {data.transactions.map((tx) => (
                  <li key={tx.id} className="flex flex-col">
                    {tx.kind && <span className="px-2 pt-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{t(`cards.k.${tx.kind}`)}</span>}
                    <TxRow tx={tx} names={names} account={account} />
                  </li>
                ))}
              </ul>
              {data.transactions.length === 0 && <p className="text-sm text-muted-foreground">{t("tx.emptyFiltered")}</p>}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
