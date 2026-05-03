import { useEffect, useState } from "react";
import { getElementDescription } from "@/hooks/use-description";
import type { CanvasElementRecord, MediaViewerState } from "@/types/canvas";

type MediaViewerProps = {
  viewer: MediaViewerState | null;
  onClose: () => void;
  elements: CanvasElementRecord[];
};

export function MediaViewer({ viewer, onClose, elements }: MediaViewerProps) {
  const [alive, setAlive] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (viewer) {
      setAlive(true);
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

  const viewerElement = elements.find((el) => el.id === viewer.elementId);
  const viewerDescription = viewerElement ? getElementDescription(viewerElement) : "";

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col items-center justify-center overflow-hidden"
      style={{
        backdropFilter: "blur(28px) saturate(180%)",
        WebkitBackdropFilter: "blur(28px) saturate(180%)",
        backgroundColor: visible ? "rgba(0,0,0,0.48)" : "rgba(0,0,0,0)",
        opacity: visible ? 1 : 0,
        transition: "opacity 0.3s ease, background-color 0.3s ease",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex max-w-[min(94vw,960px)] flex-col items-center gap-5 px-4 pb-14 pt-10"
        style={{
          transform: visible
            ? "scale(1) translateY(0px)"
            : "scale(0.82) translateY(36px)",
          opacity: visible ? 1 : 0,
          transition:
            "transform 0.38s cubic-bezier(0.34,1.56,0.64,1), opacity 0.3s ease",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Media + description in a shared width container */}
        <div className="flex w-fit max-w-full flex-col gap-3">
          {viewer.src ? (
            viewer.elementType === "image" ? (
              <img
                src={viewer.src}
                alt={viewer.fileName}
                className="block max-h-[72vh] max-w-full rounded-[22px]"
                style={{
                  objectFit: "contain",
                  boxShadow:
                    "0 24px 64px rgba(0,0,0,0.65), 0 4px 18px rgba(0,0,0,0.4)",
                }}
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

          {viewerDescription ? (
            <div
              className="w-full text-center text-sm leading-relaxed text-white/92"
              style={{
                backdropFilter: "blur(24px) saturate(180%)",
                WebkitBackdropFilter: "blur(24px) saturate(180%)",
                background: "rgba(255,255,255,0.12)",
                border: "0.5px solid rgba(255,255,255,0.26)",
                borderRadius: "14px",
                padding: "11px 16px",
                boxShadow:
                  "0 8px 32px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.18)",
              }}
            >
              {viewerDescription}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
