import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Copy } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AskAI } from "@/components/AskAI";
import { KV } from "@/components/KV";
import { LangSwitch } from "@/components/LangSwitch";
import { Panel } from "@/components/Panel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/i18n";
import { api, type Me } from "@/lib/api";
import { copyText } from "@/lib/clipboard";
import { formatDate } from "@/lib/format";
import { fold } from "@/lib/fold";
import { useGrants, useMe, useMeta } from "@/lib/queries";
import { cn } from "@/lib/utils";

const NONE = "__none";

interface PoolPrefs {
  on?: boolean;
  name?: string;
  exclude?: string[];
  default_account?: string;
}

/** Settings → "Tiền của tôi": on or off, which everyday accounts are in it, its name and the default account. One commit on Save. */
function PoolSettings({ me }: { me: Me }) {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const meta = useMeta().data;
  const saved = ((me.dashboard?.prefs?.pool as PoolPrefs | undefined) ?? {}) as PoolPrefs;
  const everyday = useMemo(() => (meta?.accounts ?? []).filter((a) => !a.closed && meta?.types[a.type]?.liquid), [meta]);
  const shown = useMemo(() => new Set(everyday.map((a) => a.id)), [everyday]);

  const [on, setOn] = useState(saved.on ?? true);
  const [name, setName] = useState(saved.name ?? "");
  const [exclude, setExclude] = useState<Set<string>>(new Set(saved.exclude ?? []));
  const [def, setDef] = useState(saved.default_account ?? "");
  const [query, setQuery] = useState("");

  // what would be saved
  const next: PoolPrefs = useMemo(() => {
    const p: PoolPrefs = { on };
    if (exclude.size) p.exclude = [...exclude].sort();
    if (name.trim()) p.name = name.trim();
    if (def) p.default_account = def;
    return p;
  }, [on, exclude, name, def]);
  const base: PoolPrefs = useMemo(() => {
    const p: PoolPrefs = { on: saved.on ?? true };
    if (saved.exclude?.length) p.exclude = [...saved.exclude].sort();
    if (saved.name?.trim()) p.name = saved.name.trim();
    if (saved.default_account) p.default_account = saved.default_account;
    return p;
  }, [saved.on, saved.exclude, saved.name, saved.default_account]);
  const dirty = JSON.stringify(next) !== JSON.stringify(base);

  const save = useMutation({
    mutationFn: () => {
      return api<{ saved: boolean; commit: string }>("dashboard", { method: "PUT", body: JSON.stringify({ prefs: { ...(me.dashboard?.prefs ?? {}), pool: next } }) });
    },
    onSuccess: () => void qc.invalidateQueries(),
  });
  useEffect(() => {
    if (dirty && (save.isSuccess || save.isError)) save.reset();
  }, [dirty]);

  const toggle = (id: string, inPool: boolean) =>
    setExclude((s) => {
      const n = new Set(s);
      if (inPool) n.delete(id);
      else n.add(id);
      return n;
    });
  const setAll = (inPool: boolean) =>
    setExclude((s) => {
      const n = new Set([...s].filter((id) => !shown.has(id)));
      if (!inPool) for (const id of shown) n.add(id);
      return n;
    });
  const list = everyday.filter((a) => !query || fold(`${a.name} ${a.id}`).includes(fold(query)));
  const inCount = everyday.filter((a) => !exclude.has(a.id)).length;
  const typeLabel = (ty: string) => meta?.types[ty]?.[lang] ?? ty;

  return (
    <Panel title={t("pool.name")}>
      <p className="text-sm text-muted-foreground">{t("pool.hint")}</p>
      <label className="flex min-h-11 items-center justify-between gap-3 text-sm font-medium">
        {t("pool.on")}
        <Switch checked={on} onCheckedChange={setOn} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">{t("pool.nameLabel")}</span>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("pool.name")} maxLength={40} className="h-11 md:h-9" />
      </label>
      <div className={cn("flex flex-col gap-1 text-sm", !on && "opacity-60")}>
        <span className="text-muted-foreground">{t("pool.default")}</span>
        <Select value={def || NONE} onValueChange={(v) => setDef(v === NONE ? "" : v)} disabled={!on}>
          <SelectTrigger aria-label={t("pool.default")} className="min-h-11 w-full sm:w-96 md:min-h-8"><SelectValue /></SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value={NONE} className="min-h-11 md:min-h-8">{t("pool.noDefault")}</SelectItem>
            {everyday.map((a) => <SelectItem key={a.id} value={a.id} className="min-h-11 md:min-h-8">{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{t("pool.defaultHint")}</span>
      </div>
      <fieldset disabled={!on} className={cn("flex min-w-0 flex-col gap-2", !on && "opacity-60")}>
        <legend className="mb-1 text-sm text-muted-foreground">{t("pool.accounts", { n: inCount, total: everyday.length })}</legend>
        <div className="flex flex-wrap gap-2">
          <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("filter.search")} aria-label={t("filter.search")} className="h-11 min-w-40 flex-1 md:h-9" />
          <Button type="button" variant="outline" className="min-h-11 md:min-h-8" onClick={() => setAll(true)}>{t("pool.all")}</Button>
          <Button type="button" variant="outline" className="min-h-11 md:min-h-8" onClick={() => setAll(false)}>{t("pool.none")}</Button>
        </div>
        {!meta ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <ul className="max-h-80 overflow-y-auto rounded-lg border">
            {list.map((a) => (
              <li key={a.id} className="border-b last:border-0">
                <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 text-sm">
                  <Checkbox checked={!exclude.has(a.id)} onCheckedChange={(v) => toggle(a.id, v === true)} />
                  <span className="min-w-0 flex-1 truncate">{a.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{typeLabel(a.type)}</span>
                </label>
              </li>
            ))}
            {list.length === 0 && <li className="p-3 text-sm text-muted-foreground">{t("filter.noMatch")}</li>}
          </ul>
        )}
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" className="min-h-11 md:min-h-8" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? t("settings.saving") : t("settings.save")}
        </Button>
        <span aria-live="polite" className="text-sm">
          {save.isSuccess && !dirty && <span className="flex items-center gap-1 text-muted-foreground"><Check className="size-4" aria-hidden />{t("settings.saved")}</span>}
          {save.isError && <span role="alert" className="font-medium text-critical">{t("common.error", { message: save.error.message })}</span>}
        </span>
      </div>
    </Panel>
  );
}

function Connector() {
  const { t } = useI18n();
  const url = `${location.origin}/mcp`;
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <Panel title={t("settings.connector")}>
      <p className="text-sm text-muted-foreground">{t("settings.connectorHint")}</p>
      <div className="flex gap-2">
        <Input readOnly value={url} aria-label={t("settings.connector")} onFocus={(e) => e.currentTarget.select()} className="h-11 font-mono md:h-9" />
        <Button
          type="button"
          variant="outline"
          className="min-h-11 shrink-0 md:min-h-8"
          onClick={async () => {
            if (await copyText(url)) {
              setCopied(true);
              clearTimeout(timer.current);
              timer.current = setTimeout(() => setCopied(false), 2000);
            }
          }}
        >
          {copied ? <Check /> : <Copy />}
          <span aria-live="polite">{copied ? t("ask.copied") : t("common.copy")}</span>
        </Button>
      </div>
    </Panel>
  );
}

/** A destructive action with its confirm step inside the page (no browser confirm()). */
function ConfirmButton({ label, confirmLabel, onConfirm, pending }: { label: string; confirmLabel: string; onConfirm: () => void; pending?: boolean }) {
  const { t } = useI18n();
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return <Button type="button" variant="outline" className="min-h-11 md:min-h-8" onClick={() => setAsking(true)}>{label}</Button>;
  }
  return (
    <span className="flex flex-wrap items-center gap-2" role="group" aria-label={confirmLabel}>
      <Button type="button" variant="destructive" className="min-h-11 md:min-h-8" disabled={pending} onClick={() => { onConfirm(); setAsking(false); }}>{confirmLabel}</Button>
      <Button type="button" variant="outline" className="min-h-11 md:min-h-8" onClick={() => setAsking(false)}>{t("common.cancel")}</Button>
    </span>
  );
}

function ResetDashboard() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const reset = useMutation({ mutationFn: () => api("dashboard", { method: "DELETE" }), onSuccess: () => void qc.invalidateQueries() });
  return (
    <Panel title={t("settings.reset")}>
      <p className="text-sm text-muted-foreground">{t("settings.resetHint")}</p>
      <div className="flex flex-wrap items-center gap-3">
        <ConfirmButton label={t("settings.reset")} confirmLabel={t("settings.resetConfirm")} pending={reset.isPending} onConfirm={() => reset.mutate()} />
        <span aria-live="polite" className="text-sm">
          {reset.isSuccess && <span className="flex items-center gap-1 text-muted-foreground"><Check className="size-4" aria-hidden />{t("settings.resetDone")}</span>}
          {reset.isError && <span role="alert" className="font-medium text-critical">{t("common.error", { message: reset.error.message })}</span>}
        </span>
      </div>
    </Panel>
  );
}

function Apps() {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const { data, error, isLoading } = useGrants();
  const revoke = useMutation({ mutationFn: (id: string) => api(`grants?id=${encodeURIComponent(id)}`, { method: "DELETE" }), onSuccess: () => void qc.invalidateQueries({ queryKey: ["grants"] }) });
  const when = (v: number | string) => {
    const ms = typeof v === "number" ? (v < 1e12 ? v * 1000 : v) : Date.parse(v);
    return Number.isFinite(ms) ? formatDate(new Date(ms).toISOString(), lang) : "";
  };
  return (
    <Panel title={t("settings.apps")}>
      {error ? (
        <p className="text-sm text-muted-foreground">{t("common.error", { message: error.message })}</p>
      ) : isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : !data?.length ? (
        <p className="text-sm text-muted-foreground">{t("settings.appsEmpty")}</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {data.map((g) => (
            <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">{g.client}</span>
                <span className="text-xs text-muted-foreground">{t("settings.connectedOn", { date: when(g.created) })}</span>
              </span>
              <ConfirmButton label={t("settings.revoke")} confirmLabel={t("settings.revokeConfirm")} pending={revoke.isPending} onConfirm={() => revoke.mutate(g.id)} />
            </li>
          ))}
        </ul>
      )}
      {revoke.isError && <p role="alert" className="text-sm font-medium text-critical">{t("common.error", { message: revoke.error.message })}</p>}
    </Panel>
  );
}

export default function Settings() {
  const { t } = useI18n();
  const me = useMe().data;
  if (!me) return <Skeleton className="h-8 w-48" />;
  const bad = me.check.errors > 0;
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">{t("settings.title")}</h1>

      <Panel title={t("lang.label")}>
        <LangSwitch className="self-start" />
      </Panel>

      <PoolSettings me={me} />

      <Connector />

      {!me.features?.imports && (
        <Panel title={t("import.title")}>
          <p className="text-sm text-muted-foreground">{t("import.cli")}</p>
        </Panel>
      )}

      <Panel title={t("settings.data")}>
        <dl className="divide-y">
          <KV label={t("settings.repo")}>{me.data}</KV>
          <KV label={t("settings.commit")}><span className="font-mono">{me.commit.slice(0, 10)}</span></KV>
          <KV label={t("settings.checkLabel")}>
            <span className={cn(bad && "font-medium text-critical")}>{t("settings.check", { errors: me.check.errors, warnings: me.check.warnings })}</span>
          </KV>
          <KV label={t("settings.versionLabel")}>{me.version}</KV>
        </dl>
        {(me.check.errors > 0 || me.check.warnings > 0) && <AskAI className="self-start" prompt={t("ask.check")} />}
      </Panel>

      <Apps />

      <ResetDashboard />
    </div>
  );
}
