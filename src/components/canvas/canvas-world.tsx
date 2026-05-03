import type { ReactNode, RefObject } from "react";

type CanvasWorldProps = {
  panX: number;
  panY: number;
  zoom: number;
  worldRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
};

export function CanvasWorld({
  panX,
  panY,
  zoom,
  worldRef,
  children,
}: CanvasWorldProps) {
  return (
    <div
      ref={worldRef}
      className="canvas-world"
      style={{
        position: "absolute",
        transformOrigin: "top left",
        transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
      }}
    >
      {children}
    </div>
  );
}
