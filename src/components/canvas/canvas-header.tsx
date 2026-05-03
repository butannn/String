import { Menu } from "lucide-react";
import type { CanvasRecord } from "@/types/canvas";

type CanvasHeaderProps = {
  canvases: CanvasRecord[];
  activeCanvasId: string | null;
  onSelectCanvas: (canvasId: string) => void;
  isMobileViewport?: boolean;
  onOpenMobileMenu?: () => void;
};

export function CanvasHeader({
  canvases,
  activeCanvasId,
  onSelectCanvas,
  isMobileViewport,
  onOpenMobileMenu,
}: CanvasHeaderProps) {
  return (
    <header className="border-b border-zinc-200 bg-zinc-50 px-3 py-3 dark:border-zinc-800 dark:bg-zinc-900 md:px-4">
      <div className="flex items-center gap-2">
        <p className="mr-1 font-serif text-xs tracking-[0.2em] text-zinc-500 dark:text-zinc-400 md:mr-2 md:text-sm">
          STRING
        </p>

        {!isMobileViewport && canvases.length > 1 ? (
          <select
            className="h-9 max-w-[180px] rounded-md border border-zinc-300 bg-zinc-50 px-2 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 md:max-w-none md:px-3"
            value={activeCanvasId ?? ""}
            onChange={(event) => onSelectCanvas(event.target.value)}
          >
            {canvases.map((canvas) => (
              <option key={canvas.id} value={canvas.id}>
                {canvas.title}
              </option>
            ))}
          </select>
        ) : null}

        {isMobileViewport && onOpenMobileMenu ? (
          <button
            type="button"
            onClick={onOpenMobileMenu}
            className="ml-auto rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 active:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-800"
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
        ) : null}
      </div>
    </header>
  );
}
