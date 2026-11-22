import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { Money } from "@/components/Money";
import { Panel } from "@/components/Panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/i18n";
import { api } from "@/lib/api";
import { formatDate, formatNumber } from "@/lib/format";
import { useImportMappings, useMe } from "@/lib/queries";
import type { ImportPreview, ImportReport, Tx } from "@/lib/types";
import { cn } from "@/lib/utils";

/** The file, as base64, in chunks (a spread of a whole file overflows the call stack). */
async function toBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function Fold({ summary, children, open }: { summary: ReactNode; children: ReactNode; open?: boolean }) {
  return (
    <details open={open} className="rounded-lg border px-3">
      <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">{summary}</summary>
      <div className="flex flex-col gap-2 pb-3">{children}</div>
    </details>
  );
}

const lineText = (l: Tx["lines"][number]) => [l.account, l.category].filter(Boolean).join(" › ");

function Report({ r }: { r: ImportReport }) {
  const { t, lang } = useI18n();
  const bad = r.reconcile.filter((x) => !x.ok);
  const note = (tx: { date: string; amount: number; note: string; sheet: string; row: number }) => (
    <li key={`${tx.sheet}-${tx.row}`} className="flex items-baseline justify-between gap-3 text-xs">
      <span className="min-w-0 truncate">{tx.date} · {tx.sheet} #{tx.row} · {tx.note}</span>
      <Money amount={tx.amount} mode="short" className="shrink-0" />
    </li>
  );
  return (
    <div className="flex flex-col gap-3">
      <p className={cn("flex items-center gap-2 text-base font-semibold", r.ok ? "text-foreground" : "text-critical")}>
        {r.ok ? <Check className="size-5" aria-hidden /> : <AlertTriangle className="size-5" aria-hidden />}
        {r.ok ? t("import.reconciles") : t("import.refused")}
      </p>
      <p className="text-sm">
        {t("import.summary", { rows: formatNumber(r.rows, lang), skipped: formatNumber(r.skipped, lang) })} <b>{t("import.newCount", { n: formatNumber(r.new, lang) })}</b>
        {r.accounts.length > 0 && <> · {t("import.newAccounts", { n: r.accounts.length })}</>}
      </p>
      {r.accounts.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {r.accounts.map((a) => <li key={a} className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">{a}</li>)}
        </ul>
      )}
      <p className="text-sm text-muted-foreground">{t("import.matches", { ok: r.reconcile.length - bad.length, total: r.reconcile.length })}</p>
      {bad.length > 0 && (
        <Fold open summary={t("import.problems", { n: bad.length })}>
          <table className="w-full text-xs">
            <thead><tr className="text-left text-muted-foreground"><th scope="col" className="py-1 font-medium">{t("import.account")}</th><th scope="col" className="py-1 font-medium">{t("import.problem")}</th></tr></thead>
            <tbody>{bad.map((b) => <tr key={b.sheet} className="border-t align-top"><td className="py-1 pr-3">{b.sheet}</td><td className="py-1">{b.problems.join("; ")}</td></tr>)}</tbody>
          </table>
        </Fold>
      )}
      {r.unresolvedCategories.length > 0 && (
        <Fold open summary={<span className="text-critical">{t("import.unresolvedCategories", { n: r.unresolvedCategories.length })}</span>}>
          <ul className="flex flex-col gap-1 text-xs">
            {r.unresolvedCategories.map((u) => <li key={u.key}><span className="font-medium">{u.key}</span> ({t("import.rowsCount", { n: u.rows })}) <span className="text-muted-foreground">{u.example}</span></li>)}
          </ul>
        </Fold>
      )}
      {r.unresolvedRows.length > 0 && (
        <Fold summary={t("import.unresolvedRows", { n: r.unresolvedRows.length })}>
          <ul className="flex flex-col gap-1">{r.unresolvedRows.map(note)}</ul>
        </Fold>
      )}
      {r.unpaired.length > 0 && (
        <Fold summary={t("import.unpaired", { n: r.unpaired.length })}>
          <ul className="flex flex-col gap-1">{r.unpaired.slice(0, 50).map(note)}</ul>
        </Fold>
      )}
      {(r.changed.length > 0 || r.gone.length > 0) && (
        <p className="flex items-start gap-2 text-sm font-medium text-critical"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />{t("import.changedGone", { changed: r.changed.length, gone: r.gone.length })}</p>
      )}
      {r.rounding.length > 0 && <p className="text-xs text-muted-foreground">{t("import.rounding", { n: r.rounding.length })}</p>}
      {r.zeroed.length > 0 && <p className="text-xs text-muted-foreground">{t("import.zeroed", { n: r.zeroed.length })}</p>}
      {r.cardTerms.length > 0 && (
        <Fold summary={t("import.cardTerms", { n: r.cardTerms.length })}>
          <ul className="flex flex-wrap gap-1.5">{r.cardTerms.map((a) => <li key={a} className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">{a}</li>)}</ul>
        </Fold>
      )}
      {r.nameWarnings.length > 0 && (
        <Fold open summary={<span className="text-warning">{t("import.nameWarnings", { n: r.nameWarnings.length })}</span>}>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-xs">{r.nameWarnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </Fold>
      )}
      {r.errors.length > 0 && (
        <Fold open summary={<span className="text-critical">{t("import.errors", { n: r.errors.length })}</span>}>
          <pre className="overflow-x-auto text-xs whitespace-pre-wrap">{r.errors.join("\n")}</pre>
        </Fold>
      )}
      {r.sample.length > 0 && (
        <Fold open summary={t("import.sample", { n: r.sample.length })}>
          <ul className="flex flex-col divide-y">
            {r.sample.map((tx) => (
              <li key={tx.id} className="flex flex-col gap-0.5 py-1.5 text-xs">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate font-medium">{tx.note || "–"}</span>
                  <span className="shrink-0 text-muted-foreground">{formatDate(tx.date, lang)}</span>
                </span>
                <span className="flex flex-col text-muted-foreground">
                  {tx.lines.map((l, i) => (
                    <span key={i} className="flex justify-between gap-3"><span className="min-w-0 truncate">{lineText(l)}</span><Money amount={l.amount} mode="short" className="shrink-0" /></span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </Fold>
      )}
    </div>
  );
}

export default function Import() {
  const { t } = useI18n();
  const me = useMe().data;
  const qc = useQueryClient();
  const mappings = useImportMappings();
  const [mapping, setMapping] = useState<string | undefined>(undefined);
  const [file, setFile] = useState<File | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const chosen = mapping ?? mappings.data?.[0];

  const preview = useMutation({
    mutationFn: async () => {
      const body = JSON.stringify({ file_name: file!.name, base64: await toBase64(file!), mapping: chosen });
      return api<ImportPreview>("import/preview", { method: "POST", body });
    },
  });
  const apply = useMutation({
    mutationFn: (id: string) => {
      return api<{ sha: string; message: string }>("import/apply", { method: "POST", body: JSON.stringify({ preview_id: id }) });
    },
    onSuccess: () => void qc.invalidateQueries(),
  });
  const reset = () => {
    preview.reset();
    apply.reset();
  };

  const title = <h1 className="text-2xl font-semibold tracking-tight">{t("import.title")}</h1>;
  if (me && !me.features?.imports) {
    return (
      <div className="flex flex-col gap-2">
        {title}
        <p className="text-sm text-muted-foreground">{t("import.cli")}</p>
      </div>
    );
  }

  const p = preview.data;
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        {title}
        <p className="max-w-2xl text-sm text-muted-foreground">{t("import.intro")}</p>
      </header>

      {mappings.data && mappings.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("import.cli")}</p>
      ) : (
        <Panel title={t("import.choose")}>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (file) {
                apply.reset();
                preview.mutate();
              }
            }}
          >
            {mappings.data && mappings.data.length > 1 && (
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted-foreground">{t("import.mapping")}</span>
                <Select value={chosen} onValueChange={(v) => { setMapping(v); reset(); }}>
                  <SelectTrigger className="min-h-11 w-full sm:w-96 md:min-h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>{mappings.data.map((m) => <SelectItem key={m} value={m} className="min-h-11 md:min-h-8">{m.replace(/^imports\//, "").replace(/\.mapping\.yaml$/, "")}</SelectItem>)}</SelectContent>
                </Select>
              </label>
            )}
            {mappings.data?.length === 1 && <p className="text-sm text-muted-foreground">{t("import.mappingOne", { name: mappings.data[0]!.replace(/^imports\//, "") })}</p>}
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">{t("import.file")}</span>
              <Input ref={input} type="file" accept=".xlsx,.csv,.json" onChange={(e) => { setFile(e.target.files?.[0] ?? null); reset(); }} className="h-11 py-2 md:h-9" />
            </label>
            <Button type="submit" className="min-h-11 self-start md:min-h-8" disabled={!file || !chosen || preview.isPending}>
              {preview.isPending ? t("import.reading") : t("import.preview")}
            </Button>
          </form>
        </Panel>
      )}

      {preview.error && <p role="alert" className="text-sm font-medium text-critical">{t("common.error", { message: preview.error.message })}</p>}

      {p && (
        <Panel title={t("import.result")}>
          <Report r={p.report} />
          {p.preview_id ? (
            <div className="flex flex-col gap-2 border-t pt-3">
              {apply.isSuccess ? (
                <p role="status" className="flex items-center gap-2 text-sm font-medium"><Check className="size-4" aria-hidden />{t("import.committed", { sha: apply.data.sha.slice(0, 10) })} <span className="font-normal text-muted-foreground">{apply.data.message}</span></p>
              ) : (
                <>
                  <Button type="button" className="min-h-11 self-start md:min-h-8" disabled={apply.isPending} onClick={() => apply.mutate(p.preview_id!)}>
                    {apply.isPending ? t("import.committing") : t("import.commit", { n: p.report.new })}
                  </Button>
                  {p.message && <p className="text-xs text-muted-foreground">{p.message}</p>}
                </>
              )}
              {apply.error && <p role="alert" className="text-sm font-medium text-critical">{t("common.error", { message: apply.error.message })}</p>}
            </div>
          ) : (
            p.report.ok && <p className="border-t pt-3 text-sm text-muted-foreground">{t("import.nothingNew")}</p>
          )}
        </Panel>
      )}
    </div>
  );
}
