import type { ReactNode } from "react";
import { drillHref, type DrillFilter } from "@/lib/drill";
import { cn } from "@/lib/utils";

/** A link to the transactions behind a number. Give a `filter`, or an `href` the server already built. */
export function DrillLink({ filter, href, className, children, ...rest }: { filter?: DrillFilter; href?: string; className?: string; children: ReactNode } & Omit<React.ComponentProps<"a">, "href" | "children">) {
  return (
    <a href={href ?? drillHref(filter)} className={cn("rounded-md outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50", className)} {...rest}>
      {children}
    </a>
  );
}
