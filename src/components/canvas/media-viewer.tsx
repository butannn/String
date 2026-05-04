import { useEffect, useRef, useState } from "react";
import type { MediaViewerState } from "@/types/canvas";

type DragState = {
  startX: number;
  startY: number;
  dx: number;
  dy: number;
};

type FlyBackState = {
  x: number;
  y: number;
  scale: number;
};

type MediaViewerProps = {
  viewer: MediaViewerState | null;
  onClose: () => void;
  descriptionDraft: string;
  setDescriptionDraft: (value: string) => void;
  isSavingDescription: boolean;
  onSaveDescription: () => Promise<void>;
  getElementRect?: () => DOMRect | null;
};

export function MediaViewer({
  viewer,
  onClose,
  descriptionDraft,
  setDescriptionDraft,
  isSavingDescription,
  onSaveDescription,
  getElementRect,
}: MediaViewerProps) {
  const [alive, setAlive] = useState(false);
  // entry/exit visibility (for initial pop-in and final fade-out)
  const [visible, setVisible] = useState(false);
  // while dragging
  const [drag, setDrag] = useState<DragState | null>(null);
  // fly-back in progress (after drag-dismiss or tap-dismiss)
  const [flyBack, setFlyBack] = useState<FlyBackState | null>(null);
  // controls backdrop fade separately from content so it dims while image flies
  const [backdropOut, setBackdropOut] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (viewer) {
      setAlive(true);
      setFlyBack(null);
      setDrag(null);
      setBackdropOut(false);
      const raf = requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
      return () => cancelAnimationFrame(raf);
    } else {
      setVisible(false);
      const t = setTimeout(() => setAlive(false), 340);
      return () => clearTimeout(t);
    }
  }, [viewer]);

  if (!alive || !viewer) return null;

  const DISMISS_THRESHOLD = 80;
  const dragDist = drag ? Math.hypot(drag.dx, drag.dy) : 0;
  // 0 → 1 as drag progresses toward threshold (caps at 1)
  const dragProgress = drag ? Math.min(1, dragDist / 240) : flyBack ? 1 : 0;

  function triggerFlyBack() {
    const targetRect = getElementRect?.();
    let targetX = 0;
    let targetY = 0;
    let targetScale = 0.05;
    if (targetRect && imgRef.current) {
      const imgRect = imgRef.current.getBoundingClientRect();
      targetX =
        targetRect.left + targetRect.width / 2 - (imgRect.left + imgRect.width / 2);
      targetY =
        targetRect.top + targetRect.height / 2 - (imgRect.top + imgRect.height / 2);
      targetScale = Math.min(
        targetRect.width / Math.max(imgRect.width, 1),
        targetRect.height / Math.max(imgRect.height, 1),
      );
    }
    setFlyBack({ x: targetX, y: targetY, scale: targetScale });
    setBackdropOut(true);
    setDrag(null);
    setTimeout(() => onClose(), 320);
  }

  // Backdrop opacity: dim while dragging, fade out when flyBack or not visible
  const backdropAlpha =
    !visible || backdropOut
      ? 0
      : drag
        ? 0.48 * (1 - dragProgress * 0.7)
        : 0.48;

  // Content wrapper: entry/exit only — freeze at opacity 1 during flyBack so
  // the image can do its own animated exit without the wrapper fading too.
  const contentOpacity = flyBack ? 1 : visible ? 1 : 0;
  const contentTransform =
    flyBack
      ? "scale(1) translateY(0px)"
      : visible
        ? "scale(1) translateY(0px)"
        : "scale(0.82) translateY(36px)";
  const contentTransition = flyBack
    ? "none"
    : "transform 0.38s cubic-bezier(0.34,1.56,0.64,1), opacity 0.3s ease";

  // Textarea fades with drag/flyBack progress
  const textareaOpacity = flyBack ? 0 : 1 - dragProgress * 0.85;
  const textareaTransition = flyBack
    ? "opacity 0.24s ease"
    : drag
      ? "none"
      : "opacity 0.2s ease";

  return (
    <div
      className="fixed inset-0 z-[70] overflow-hidden"
      style={{
        backdropFilter: "blur(28px) saturate(180%)",
        WebkitBackdropFilter: "blur(28px) saturate(180%)",
        backgroundColor: `rgba(0,0,0,${backdropAlpha.toFixed(3)})`,
        transition: "background-color 0.3s ease",
        // pointer events: always allow clicks through when fully gone
        pointerEvents: alive ? "auto" : "none",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) triggerFlyBack();
      }}
    >
      {/* Centering + entry/exit wrapper */}
      <div
        className="flex h-full flex-col items-center justify-center"
        style={{
          opacity: contentOpacity,
          transform: contentTransform,
          transition: contentTransition,
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) triggerFlyBack();
        }}
      >
        {/* Media + description in a shared width container */}
        <div
          className="flex max-w-[min(94vw,960px)] flex-col items-center gap-3 px-4 pb-14 pt-10"
          onClick={(e) => {
            // clicks in the padding area (below textarea) also dismiss
            if (e.target === e.currentTarget) triggerFlyBack();
          }}
        >
          <div className="flex w-fit max-w-full flex-col gap-3">
            {viewer.src ? (
              viewer.elementType === "image" ? (
                <img
                  ref={imgRef}
                  src={viewer.src}
                  alt={viewer.fileName}
                  draggable={false}
                  className="block max-h-[72vh] max-w-full rounded-[22px]"
                  style={{
                    objectFit: "contain",
                    boxShadow:
                      "0 24px 64px rgba(0,0,0,0.65), 0 4px 18px rgba(0,0,0,0.4)",
                    touchAction: "none",
                    cursor: drag ? "grabbing" : "grab",
                    userSelect: "none",
                    WebkitUserSelect: "none",
                    transform: flyBack
                      ? `translate(${flyBack.x}px, ${flyBack.y}px) scale(${flyBack.scale})`
                      : drag
                        ? `translate(${drag.dx}px, ${drag.dy}px)`
                        : undefined,
                    transition: flyBack
                      ? "transform 0.32s cubic-bezier(0.4,0,0.2,1), opacity 0.28s ease"
                      : drag
                        ? "none"
                        : undefined,
                    opacity: flyBack ? 0 : drag ? 1 - dragProgress * 0.65 : undefined,
                  }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setDrag({ startX: e.clientX, startY: e.clientY, dx: 0, dy: 0 });
                  }}
                  onPointerMove={(e) => {
                    if (!drag) return;
                    setDrag((d) =>
                      d
                        ? { ...d, dx: e.clientX - d.startX, dy: e.clientY - d.startY }
                        : null,
                    );
                  }}
                  onPointerUp={() => {
                    if (!drag) return;
                    const dist = Math.hypot(drag.dx, drag.dy);
                    if (dist > DISMISS_THRESHOLD) {
                      triggerFlyBack();
                    } else {
                      setDrag(null);
                    }
                  }}
                  onPointerCancel={() => setDrag(null)}
                />
              ) : (
                <video
                  src={viewer.src}
                  controls
                  autoPlay
                  playsInline
                  className="block max-h-[72vh] max-w-full rounded-[22px] bg-black"
                  style={{
                    boxShadow:
                      "0 24px 64px rgba(0,0,0,0.65), 0 4px 18px rgba(0,0,0,0.4)",
                  }}
                />
              )
            ) : (
              <div
                className="rounded-2xl px-6 py-4 text-sm text-white/80"
                style={{
                  backdropFilter: "blur(16px) saturate(180%)",
                  WebkitBackdropFilter: "blur(16px) saturate(180%)",
                  background: "rgba(255,255,255,0.1)",
                  border: "0.5px solid rgba(255,255,255,0.2)",
                }}
              >
                Loading...
              </div>
            )}

            <textarea
              className="w-full resize-none text-center text-sm leading-relaxed text-white/90 placeholder:text-white/40 focus:outline-none"
              value={descriptionDraft}
              onChange={(e) => setDescriptionDraft(e.target.value)}
              onBlur={() => void onSaveDescription()}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void onSaveDescription();
                }
              }}
              placeholder="Add a description..."
              disabled={isSavingDescription}
              rows={2}
              style={{
                backdropFilter: "blur(24px) saturate(180%)",
                WebkitBackdropFilter: "blur(24px) saturate(180%)",
                background: "rgba(255,255,255,0.12)",
                border: "0.5px solid rgba(255,255,255,0.26)",
                borderRadius: "14px",
                padding: "11px 16px",
                boxShadow:
                  "0 8px 32px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.18)",
                opacity: textareaOpacity,
                transition: textareaTransition,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
