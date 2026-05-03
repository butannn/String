import { hexToRgba } from "@/lib/media-utils";
import type { CanvasElementRecord, DescriptionStyle } from "@/types/canvas";

type CanvasElementProps = {
  element: CanvasElementRecord;
  isSelected: boolean;
  isAttachTarget: boolean;
  description: string;
  descriptionStyle: DescriptionStyle;
  onSelect: (event: React.MouseEvent<HTMLElement>) => void;
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  onPointerLeave: () => void;
};

export function CanvasElement({
  element,
  isSelected,
  isAttachTarget,
  description,
  descriptionStyle,
  onSelect,
  onPointerDown,
  onPointerUp,
  onPointerCancel,
  onPointerLeave,
}: CanvasElementProps) {
  const data = element.data ?? {};
  const fileName = String(data.fileName ?? element.element_type);
  const mediaSrc = typeof data.src === "string" ? data.src : "";
  const previewSrc = typeof data.previewSrc === "string" ? data.previewSrc : "";
  const fullSrc = typeof data.fullSrc === "string" ? data.fullSrc : "";

  return (
    <div
      className="absolute"
      data-canvas-element="true"
      style={{
        left: `${element.x}px`,
        top: `${element.y}px`,
        width: `${element.width}px`,
      }}
    >
      <article
        className={`overflow-hidden rounded-lg border bg-white dark:bg-zinc-900 ${
          isSelected
            ? "border-zinc-900 ring-2 ring-zinc-900/20 dark:border-zinc-300 dark:ring-zinc-300/20"
            : "border-zinc-200 dark:border-zinc-700"
        } ${isAttachTarget ? "cursor-cell border-emerald-500" : "cursor-pointer"}`}
        style={{
          height: `${element.height}px`,
          boxShadow: isSelected
            ? "0 10px 24px rgba(0,0,0,0.22), 0 2px 6px rgba(0,0,0,0.18)"
            : "0 8px 18px rgba(0,0,0,0.16), 0 1px 4px rgba(0,0,0,0.1)",
        }}
        onClick={onSelect}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onPointerLeave={onPointerLeave}
      >
        {element.element_type === "image" ? (
          previewSrc ? (
            <img
              src={previewSrc}
              alt={fileName}
              loading="lazy"
              decoding="async"
              className="block h-full w-full bg-zinc-100 object-contain"
            />
          ) : (
            <div className="grid h-full w-full place-items-center bg-zinc-100 px-4 text-center text-xs text-zinc-500">
              Preview unavailable
            </div>
          )
        ) : null}

        {element.element_type === "audio" ? (
          <div
            className="grid w-full place-items-center p-3"
            style={{ minHeight: `${Number(data.mediaHeight ?? 92)}px` }}
          >
            <audio controls src={mediaSrc} className="h-16 w-full" />
          </div>
        ) : null}

        {element.element_type === "video" ? (
          previewSrc ? (
            <div className="relative h-full w-full bg-zinc-950">
              <img
                src={previewSrc}
                alt={fileName}
                loading="lazy"
                decoding="async"
                className="block h-full w-full object-contain"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-black/10" />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="rounded-full bg-white/92 px-3 py-2 text-xs font-semibold text-zinc-900 shadow">
                  Open
                </div>
              </div>
            </div>
          ) : fullSrc ? (
            <video
              preload="metadata"
              muted
              playsInline
              src={fullSrc}
              className="block h-full w-full bg-zinc-950 object-contain"
            />
          ) : (
            <div className="grid h-full w-full place-items-center gap-2 bg-zinc-950 px-4 text-center text-xs text-white/85">
              <span className="rounded-full border border-white/20 px-2 py-1 text-[10px] uppercase tracking-[0.18em]">
                Video
              </span>
              <span className="max-w-[20ch] truncate">{fileName}</span>
            </div>
          )
        ) : null}
      </article>

      {description &&
      element.element_type !== "image" &&
      element.element_type !== "video" ? (
        <div
          className="mt-2 rounded-lg border px-3 py-2 text-xs leading-relaxed shadow-sm backdrop-blur-sm"
          style={{
            color: descriptionStyle.textColor,
            fontWeight: descriptionStyle.fontWeight,
            fontStyle: descriptionStyle.fontStyle,
            textDecorationLine: descriptionStyle.textDecoration,
            backgroundColor: hexToRgba(descriptionStyle.boxColor, 0.65),
            borderColor: hexToRgba(descriptionStyle.boxColor, 0.9),
          }}
        >
          {description}
        </div>
      ) : null}
    </div>
  );
}
