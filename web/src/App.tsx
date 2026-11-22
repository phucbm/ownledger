import { lazy, Suspense } from "react";
import { Route, Router, Switch } from "wouter";
import { Shell } from "@/components/Shell";
import { SignIn } from "@/components/SignIn";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n";
import { ApiError } from "@/lib/api";
import { useHashLocation, useHashSearch } from "@/lib/hash";
import { useMe } from "@/lib/queries";
import Home from "@/pages/Home";

// Every page except Home loads on demand.
const Transactions = lazy(() => import("@/pages/Transactions"));
const Accounts = lazy(() => import("@/pages/Accounts"));
const Cards = lazy(() => import("@/pages/Cards"));
const CardDetail = lazy(() => import("@/pages/CardDetail"));
const Plans = lazy(() => import("@/pages/Plans"));
const Reports = lazy(() => import("@/pages/Reports"));
const Import = lazy(() => import("@/pages/Import"));
const Settings = lazy(() => import("@/pages/Settings"));

export function App() {
  const { t } = useI18n();
  const { data: me, error, refetch } = useMe();

  if (error instanceof ApiError && error.status === 401) return <SignIn />;
  if (!me) {
    return error ? (
      <div className="flex min-h-svh flex-col items-center justify-center gap-3 p-4 text-sm">
        <p>{t("common.error", { message: error.message })}</p>
        <button type="button" className="min-h-11 underline" onClick={() => void refetch()}>
          {t("common.retry")}
        </button>
      </div>
    ) : (
      <div className="p-6">
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }

  return (
    <Router hook={useHashLocation} searchHook={useHashSearch}>
      <Shell me={me}>
        <Suspense fallback={<Skeleton className="h-8 w-48" />}>
          <Switch>
            <Route path="/" component={Home} />
            <Route path="/transactions" component={Transactions} />
            <Route path="/accounts" component={Accounts} />
            <Route path="/cards" component={Cards} />
            <Route path="/cards/:account" component={CardDetail} />
            <Route path="/plans" component={Plans} />
            <Route path="/reports" component={Reports} />
            <Route path="/import" component={Import} />
            <Route path="/settings" component={Settings} />
            <Route component={Home} />
          </Switch>
        </Suspense>
      </Shell>
    </Router>
  );
}
