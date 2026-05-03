import type { ReactNode } from "react";

type CanvasWorldProps = {
  worldSize: number;
  panX: number;
  panY: number;
  zoom: number;
  children: ReactNode;
};

export function CanvasWorld({
  worldSize,
  panX,
  panY,
  zoom,
  children,
}: CanvasWorldProps) {
  return (
    <div
      className="canvas-world relative"
      style={{
        width: `${worldSize}px`,
        height: `${worldSize}px`,
        transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
        transformOrigin: "top left",
        backgroundImage:
          "radial-gradient(circle at 1px 1px, rgba(0,0,0,0.12) 1px, transparent 0)",
        backgroundSize: "28px 28px",
      }}
    >
      {children}
    </div>
  );
}
