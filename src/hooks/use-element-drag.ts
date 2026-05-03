import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { updateSingleRow } from "@/lib/data-api";
import type { CanvasElementRecord, DragState, Mode } from "@/types/canvas";
import type { AttachmentLayerHandle } from "@/components/canvas/attachment-layer";

export function useElementDrag(
  elements: CanvasElementRecord[],
  setElements: React.Dispatch<React.SetStateAction<CanvasElementRecord[]>>,
  mode: Mode,
  zoomRef: RefObject<number>,
  gestureActiveRef: RefObject<boolean>,
  pointerPinchActiveRef: RefObject<boolean>,
  elementNodeMapRef: RefObject<Map<string, HTMLDivElement>>,
  attachmentHandleRef: RefObject<AttachmentLayerHandle | null>,
) {
  const [dragState, setDragState] = useState<DragState | null>(null);
  // Track the latest dragged position without triggering re-renders
  const dragLivePositionRef = useRef<{ id: string; x: number; y: number } | null>(null);
  // Keep a stable ref to elements to read in pointerup without stale closure
  const elementsRef = useRef(elements);
  useEffect(() => { elementsRef.current = elements; });

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      if (gestureActiveRef.current || pointerPinchActiveRef.current) return;
      if (!dragState || mode !== "move") return;

      const deltaX = (event.clientX - dragState.pointerStartX) / zoomRef.current;
      const deltaY = (event.clientY - dragState.pointerStartY) / zoomRef.current;
      const newX = dragState.originX + deltaX;
      const newY = dragState.originY + deltaY;

      // Update DOM directly — no React re-renders during drag
      const node = elementNodeMapRef.current.get(dragState.id);
      if (node) {
        node.style.left = `${newX}px`;
        node.style.top = `${newY}px`;
      }

      // Update rope paths imperatively
      attachmentHandleRef.current?.updateElementPosition(dragState.id, newX, newY);

      dragLivePositionRef.current = { id: dragState.id, x: newX, y: newY };
    }

    async function handlePointerUp() {
      if (!dragState) return;
      setDragState(null);

      const live = dragLivePositionRef.current;
      dragLivePositionRef.current = null;
      if (!live) return;

      const { id, x, y } = live;
      if (id.startsWith("temp-")) return;

      // Commit final position to React state (single re-render on drop)
      setElements((previous) =>
        previous.map((el) => (el.id === id ? { ...el, x, y } : el)),
      );

      await updateSingleRow<CanvasElementRecord>(
        "canvas_elements",
        { x, y },
        [{ column: "id", op: "eq", value: id }],
      );
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [dragState, mode, zoomRef, gestureActiveRef, pointerPinchActiveRef, setElements, elementNodeMapRef, attachmentHandleRef]);

  return { dragState, setDragState };
}
