import { Menu } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useState } from "react";
import { LangSwitch } from "@/components/LangSwitch";
import { SignOut } from "@/components/SignOut";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import { isActive, mainNav, settingsNav, visible, type Features, type NavItem } from "@/nav";

const tabClass = "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-xs text-muted-foreground [&_svg]:size-5";

export function MobileTabBar({ login, features }: { login: string; features: Features }) {
  const { t } = useI18n();
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const items = visible(mainNav, features);
  const tabs = items.filter((i) => i.tab);
  const more: NavItem[] = [...items.filter((i) => !i.tab), settingsNav];
  const moreActive = more.some((i) => isActive(i, location));
  return (
    <nav aria-label={t("nav.main")} className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden">
      {tabs.map((item) => (
        <Link key={item.id} href={item.path} className={cn(tabClass, isActive(item, location) && "font-medium text-foreground")} aria-current={isActive(item, location) ? "page" : undefined}>
          <item.icon />
          <span>{t(item.labelKey)}</span>
        </Link>
      ))}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <button type="button" className={cn(tabClass, moreActive && "font-medium text-foreground")}>
            <Menu />
            <span>{t("nav.more")}</span>
          </button>
        </SheetTrigger>
        <SheetContent side="bottom" className="pb-[env(safe-area-inset-bottom)]">
          <SheetHeader>
            <SheetTitle>{t("nav.more")}</SheetTitle>
            <SheetDescription>{t("auth.signedInAs", { login })}</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-1 px-4 pb-4">
            {more.map((item) => (
              <Link key={item.id} href={item.path} onClick={() => setOpen(false)} className="flex min-h-11 items-center gap-3 rounded-md px-2 text-sm hover:bg-accent [&_svg]:size-4">
                <item.icon />
                {t(item.labelKey)}
              </Link>
            ))}
            <div className="flex items-center justify-between gap-3 pt-2">
              <LangSwitch />
              <SignOut />
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </nav>
  );
}
