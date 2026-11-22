import { Link, useLocation } from "wouter";
import { Separator } from "@/components/ui/separator";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { LangSwitch } from "@/components/LangSwitch";
import { SignOut } from "@/components/SignOut";
import { useI18n } from "@/i18n";
import { isActive, mainNav, settingsNav, visible, type Features } from "@/nav";

export function DesktopSidebar({ login, features }: { login: string; features: Features }) {
  const { t } = useI18n();
  const [location] = useLocation();
  const settingsActive = isActive(settingsNav, location);
  return (
    <Sidebar collapsible="none" className="h-svh border-r">
      <SidebarHeader className="px-4 py-4">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          {t("app.name")}
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu aria-label={t("nav.main")}>
            {visible(mainNav, features).map((item) => (
              <SidebarMenuItem key={item.id}>
                <SidebarMenuButton asChild isActive={isActive(item, location)}>
                  <Link href={item.path}>
                    <item.icon />
                    <span>{t(item.labelKey)}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="gap-2">
        <Separator />
        <LangSwitch className="self-start" />
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={settingsActive}>
              <Link href={settingsNav.path}>
                <settingsNav.icon />
                <span>{t(settingsNav.labelKey)}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <p className="truncate px-2 text-sm text-muted-foreground" title={t("auth.signedInAs", { login })}>
          {login}
        </p>
        <SignOut />
      </SidebarFooter>
    </Sidebar>
  );
}
