import type { ReactNode } from "react";
import { DesktopSidebar } from "@/components/DesktopSidebar";
import { MobileTabBar } from "@/components/MobileTabBar";
import { PinProvider } from "@/components/PinProvider";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Me } from "@/lib/api";

export function Shell({ me, children }: { me: Me; children: ReactNode }) {
  return (
    <TooltipProvider>
      <SidebarProvider className="min-h-svh">
        <div className="sticky top-0 hidden h-svh md:block">
          <DesktopSidebar login={me.login} features={me.features} />
        </div>
        <main className="min-w-0 flex-1 pb-20 md:pb-0">
          <div className="mx-auto w-full max-w-[1680px] p-4 md:p-6">
            <PinProvider>{children}</PinProvider>
          </div>
        </main>
        <MobileTabBar login={me.login} features={me.features} />
      </SidebarProvider>
    </TooltipProvider>
  );
}
