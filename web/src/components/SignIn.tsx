import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LangSwitch } from "@/components/LangSwitch";
import { useI18n } from "@/i18n";

export function SignIn() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">{t("app.name")}</CardTitle>
          <CardDescription>{t("auth.signInHint")}</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-3">
          <Button asChild size="lg" className="min-h-11">
            <a href="/auth/login">
              <LogIn />
              {t("auth.signIn")}
            </a>
          </Button>
          <LangSwitch />
        </CardContent>
      </Card>
    </div>
  );
}
