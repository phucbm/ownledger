import { Check, Copy, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { copyText } from "@/lib/clipboard";
import { cn } from "@/lib/utils";

/** Copies a ready prompt (already in the UI language) to the clipboard. Clipboard only: nothing is sent anywhere. */
export function AskAI({ prompt, label, className, size = "sm" }: { prompt: string; label?: string; className?: string; size?: "sm" | "default" }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const Icon = copied ? Check : label ? Copy : Sparkles;
  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      className={cn("min-h-11 md:min-h-8", className)}
      onClick={async () => {
        if (await copyText(prompt)) {
          setCopied(true);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => setCopied(false), 2000);
        }
      }}
    >
      <Icon />
      <span aria-live="polite">{copied ? t("ask.copied") : (label ?? t("ask.button"))}</span>
    </Button>
  );
}
