import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useI18n, type Lang } from "@/i18n";

export function LangSwitch({ className }: { className?: string }) {
  const { lang, setLang, t } = useI18n();
  return (
    <ToggleGroup type="single" variant="outline" size="sm" value={lang} onValueChange={(v) => v && setLang(v as Lang)} aria-label={t("lang.label")} className={className}>
      <ToggleGroupItem value="vi" className="min-h-11 min-w-11 md:min-h-8 md:min-w-8">
        {t("lang.vi")}
      </ToggleGroupItem>
      <ToggleGroupItem value="en" className="min-h-11 min-w-11 md:min-h-8 md:min-w-8">
        {t("lang.en")}
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
