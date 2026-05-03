import { useEffect, useState } from "react";
import type { RefObject } from "react";
import { updateSingleRow } from "@/lib/data-api";
import type { CanvasElementRecord, DragState, Mode } from "@/types/canvas";

export function useElementDrag(
  elements: CanvasElementRecord[],
  setElements: React.Dispatch<React.SetStateAction<CanvasElementRecord[]>>,
  mode: Mode,
  zoomRef: RefObject<number>,
  gestureActiveRef: RefObject<boolean>,
  pointerPinchActiveRef: RefObject<boolean>,
) {
  const [dragState, setDragState] = useState<DragState | null>(null);

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      if (gestureActiveRef.current || pointerPinchActiveRef.current) return;
      if (!dragState || mode !== "move") return;

      const deltaX = (event.clientX - dragState.pointerStartX) / zoomRef.current;
      const deltaY = (event.clientY - dragState.pointerStartY) / zoomRef.current;

      setElements((previous) =>
        previous.map((element) => {
          if (element.id !== dragState.id) return element;
          return {
            ...element,
            x: Math.max(0, dragState.originX + deltaX),
            y: Math.max(0, dragState.originY + deltaY),
          };
        }),
      );
    }

    async function handlePointerUp() {
      if (!dragState) return;

      const movedElement = elements.find((el) => el.id === dragState.id);
      setDragState(null);

      if (!movedElement || movedElement.id.startsWith("temp-")) return;

      await updateSingleRow<CanvasElementRecord>(
        "canvas_elements",
        { x: movedElement.x, y: movedElement.y },
        [{ column: "id", op: "eq", value: movedElement.id }],
      );
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [dragState, elements, mode, zoomRef, gestureActiveRef, pointerPinchActiveRef, setElements]);

  return { dragState, setDragState };
}
