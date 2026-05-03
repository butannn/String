import { memo, useCallback } from "react";
import { hexToRgba } from "@/lib/media-utils";
import { getElementDescription, getElementDescriptionStyle } from "@/hooks/use-description";
import type { CanvasElementRecord } from "@/types/canvas";

type CanvasElementProps = {
  element: CanvasElementRecord;
  isSelected: boolean;
  isAttachTarget: boolean;
  isDark: boolean;
  onMount: (id: string, node: HTMLDivElement | null) => void;
  onSelect: (id: string, event: React.MouseEvent<HTMLElement>) => void;
  onPointerDown: (id: string, originX: number, originY: number, event: React.PointerEvent<HTMLElement>) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  onPointerLeave: () => void;
};

export const CanvasElement = memo(function CanvasElement({
  element,
  isSelected,
  isAttachTarget,
  isDark,
  onMount,
  onSelect,
  onPointerDown,
  onPointerUp,
  onPointerCancel,
  onPointerLeave,
}: CanvasElementProps) {
  const description = getElementDescription(element);
  const descriptionStyle = getElementDescriptionStyle(element);
  const data = element.data ?? {};
  const fileName = String(data.fileName ?? element.element_type);
  const mediaSrc = typeof data.src === "string" ? data.src : "";
  const previewSrc = typeof data.previewSrc === "string" ? data.previewSrc : "";
  const fullSrc = typeof data.fullSrc === "string" ? data.fullSrc : "";

  const nodeRef = useCallback(
    (node: HTMLDivElement | null) => { onMount(element.id, node); },
    [element.id, onMount],
  );

  return (
    <div
      ref={nodeRef}
      className="absolute"
      data-canvas-element="true"
      style={{
        left: `${element.x}px`,
        top: `${element.y}px`,
        width: `${element.width}px`,
      }}
    >
      <article
        className={`overflow-hidden rounded-lg bg-stone-200 dark:bg-zinc-900 ${
          isAttachTarget ? "cursor-cell ring-2 ring-emerald-500" : "cursor-pointer"
        }`}
        style={{
          height: `${element.height}px`,
          transition: "box-shadow 0.15s ease",
          boxShadow: isSelected
            ? isDark
              ? "0 0 0 2px rgba(255,235,185,0.25), 0 28px 64px rgba(255,220,140,0.45), 0 10px 28px rgba(255,200,100,0.35)"
              : "0 0 0 2px rgba(80,35,0,0.18), 0 28px 64px rgba(30,10,0,0.75), 0 10px 28px rgba(30,10,0,0.55)"
            : isDark
              ? "0 14px 32px rgba(0,0,0,0.75), 0 4px 10px rgba(0,0,0,0.55)"
              : "0 14px 32px rgba(30,10,0,0.52), 0 4px 10px rgba(30,10,0,0.34)",
        }}
        onClick={(e) => onSelect(element.id, e)}
        onPointerDown={(e) => onPointerDown(element.id, element.x, element.y, e)}
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
              className="block h-full w-full bg-stone-200 object-contain"
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
          className="mt-2 rounded-lg border px-3 py-2 text-xs leading-relaxed shadow-sm"
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
});
