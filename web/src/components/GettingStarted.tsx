import { AskAI } from "@/components/AskAI";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/i18n";

/** Home for an empty ledger: three steps, each with a prompt to copy, and the connector URL. */
export function GettingStarted() {
  const { t } = useI18n();
  const url = `${location.origin}/mcp`;
  const steps = [
    { n: 1, title: t("start.s1.title"), body: t("start.s1.body"), prompt: t("start.s1.prompt", { url }), url },
    { n: 2, title: t("start.s2.title"), body: t("start.s2.body"), prompt: t("start.s2.prompt") },
    { n: 3, title: t("start.s3.title"), body: t("start.s3.body"), prompt: t("start.s3.prompt") },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t("start.title")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("start.intro")}</p>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col gap-5">
          {steps.map((s) => (
            <li key={s.n} className="flex gap-3">
              <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">{s.n}</span>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <p className="font-medium">{s.title}</p>
                <p className="text-sm text-muted-foreground">{s.body}</p>
                {s.url && (
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="min-w-0 break-all rounded-md bg-muted px-2 py-1.5 text-sm">{s.url}</code>
                    <AskAI prompt={s.url} label={t("common.copy")} />
                  </div>
                )}
                <div>
                  <AskAI prompt={s.prompt} />
                </div>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
