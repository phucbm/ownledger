import { ArrowDown, ArrowUp, GripVertical, Settings2, X } from "lucide-react";
import { DRAG_HANDLE } from "@/components/HomeGrid";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";

/**
 * The buttons edit mode puts in a widget's header: a drag handle (not on phones), move up and down (the keyboard way
 * to reorder, on every screen size), settings (only for widgets with options, not on phones) and remove.
 */
export function EditMenu({ id, name, first, last, canDrag, canSettings, onMove, onSettings, onRemove }: {
  id: string;
  name: string;
  first: boolean;
  last: boolean;
  canDrag: boolean;
  canSettings: boolean;
  onMove: (dir: -1 | 1) => void;
  onSettings: () => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  const btn = "size-11 md:size-8";
  return (
    <div className="flex items-center gap-0.5">
      {canDrag && (
        <span className={`${DRAG_HANDLE} flex size-8 cursor-grab items-center justify-center rounded-lg text-muted-foreground hover:bg-muted active:cursor-grabbing`} title={t("edit.drag", { name })}>
          <GripVertical className="size-4" aria-hidden />
          <span className="sr-only">{t("edit.drag", { name })}</span>
        </span>
      )}
      <Button type="button" variant="ghost" size="icon" className={btn} data-move={`up:${id}`} disabled={first} aria-label={t("edit.moveUp", { name })} title={t("edit.moveUp", { name })} onClick={() => onMove(-1)}>
        <ArrowUp />
      </Button>
      <Button type="button" variant="ghost" size="icon" className={btn} data-move={`down:${id}`} disabled={last} aria-label={t("edit.moveDown", { name })} title={t("edit.moveDown", { name })} onClick={() => onMove(1)}>
        <ArrowDown />
      </Button>
      {canSettings && (
        <Button type="button" variant="ghost" size="icon" className={btn} aria-label={t("edit.settings", { name })} title={t("edit.settings", { name })} onClick={onSettings}>
          <Settings2 />
        </Button>
      )}
      <Button type="button" variant="ghost" size="icon" className={`${btn} hover:text-destructive`} aria-label={t("edit.remove", { name })} title={t("edit.remove", { name })} onClick={onRemove}>
        <X />
      </Button>
    </div>
  );
}
