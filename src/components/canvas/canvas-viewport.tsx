import type { ReactNode, RefObject } from "react";
import type { PanState } from "@/types/canvas";
import type { Mode } from "@/types/canvas";

type CanvasViewportProps = {
  viewportRef: RefObject<HTMLDivElement | null>;
  panState: PanState | null;
  setPanState: React.Dispatch<React.SetStateAction<PanState | null>>;
  isSpacePanning: boolean;
  mode: Mode;
  selectedId: string | null;
  panXRef: RefObject<number>;
  panYRef: RefObject<number>;
  zoomRef: RefObject<number>;
  gestureActiveRef: RefObject<boolean>;
  suppressWheelUntilRef: RefObject<number>;
  setZoomFromAnchorImmediate: (
    nextZoom: number,
    anchorWorldX: number,
    anchorWorldY: number,
    anchorViewportX: number,
    anchorViewportY: number,
  ) => void;
  onCanvasClick: () => void;
  isMobileViewport: boolean;
  panMovedRef: RefObject<boolean>;
  children: ReactNode;
};

export function CanvasViewport({
  viewportRef,
  panState,
  setPanState,
  isSpacePanning,
  mode,
  selectedId,
  panXRef,
  panYRef,
  zoomRef,
  gestureActiveRef,
  suppressWheelUntilRef,
  setZoomFromAnchorImmediate,
  onCanvasClick,
  isMobileViewport,
  panMovedRef,
  children,
}: CanvasViewportProps) {
  const isPanCursorActive =
    (selectedId === null && mode === "move") || isSpacePanning;

  return (
    <section
      ref={viewportRef}
      className={`canvas-viewport relative min-h-0 flex-1 overflow-hidden bg-zinc-50 dark:bg-zinc-900 ${
        isPanCursorActive ? (panState ? "cursor-grabbing" : "cursor-grab") : ""
      }`}
      style={{ touchAction: "none" }}
      onPointerDown={(event) => {
        const isPanShortcut =
          event.button === 1 || (event.button === 0 && isSpacePanning);

        if (!isPanShortcut && event.button !== 0) return;

        const target = event.target as HTMLElement;
        if (!isPanShortcut && target.closest("[data-canvas-element='true']")) {
          return;
        }

        const viewport = viewportRef.current;
        if (!viewport) return;

        event.preventDefault();
        panMovedRef.current = false;
        setPanState({
          pointerStartX: event.clientX,
          pointerStartY: event.clientY,
          startPanX: panXRef.current,
          startPanY: panYRef.current,
        });
      }}
      onWheel={(event) => {
        if (
          gestureActiveRef.current ||
          performance.now() < suppressWheelUntilRef.current
        ) {
          return;
        }

        event.preventDefault();
        const viewport = viewportRef.current;
        if (!viewport) return;

        const rect = viewport.getBoundingClientRect();
        const anchorViewportX = event.clientX - rect.left;
        const anchorViewportY = event.clientY - rect.top;
        const anchorWorldX = (anchorViewportX - panXRef.current) / zoomRef.current;
        const anchorWorldY = (anchorViewportY - panYRef.current) / zoomRef.current;

        const modeMultiplier =
          event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 240 : 1;
        const normalizedDelta = event.deltaY * modeMultiplier;
        if (Math.abs(normalizedDelta) < 0.2) return;

        const clampedDelta = Math.max(-240, Math.min(240, normalizedDelta));
        const zoomFactor = Math.exp(-clampedDelta * 0.0018);

        setZoomFromAnchorImmediate(
          zoomRef.current * zoomFactor,
          anchorWorldX,
          anchorWorldY,
          anchorViewportX,
          anchorViewportY,
        );
      }}
      onClick={() => {
        if (panMovedRef.current) return;
        if (mode !== "attach") onCanvasClick();
      }}
    >
      {isMobileViewport ? (
        <div className="pointer-events-none absolute left-3 top-3 z-[5] rounded-full border border-zinc-300 bg-white/95 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800/95 dark:text-zinc-300">
          {mode === "move" ? "Move" : "Attach"}
        </div>
      ) : null}

      {mode === "attach" ? (
        <div className="pointer-events-none absolute right-3 top-3 z-[5] rounded-md border border-zinc-300 bg-white/95 px-3 py-1 text-[11px] font-medium text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800/95 dark:text-zinc-300">
          Tap a string to delete it
        </div>
      ) : null}

      {/* Vignette – subtle on light, stronger on dark */}
      <div
        className="pointer-events-none absolute inset-0 z-[4] vignette-overlay"
      />

      {children}
    </section>
  );
}
