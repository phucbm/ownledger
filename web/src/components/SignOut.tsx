import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";

/** Plain POST form: the Worker clears the session and redirects. */
export function SignOut({ className }: { className?: string }) {
  const { t } = useI18n();
  return (
    <form method="post" action="/auth/logout" className={className}>
      <Button type="submit" variant="ghost" size="sm" className="min-h-11 w-full justify-start md:min-h-8">
        <LogOut />
        {t("auth.signOut")}
      </Button>
    </form>
  );
}
