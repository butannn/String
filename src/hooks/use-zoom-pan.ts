import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { CanvasElementRecord } from "@/types/canvas";
import type { PanState } from "@/types/canvas";

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 2.5;

type GestureLikeEvent = Event & {
  scale: number;
  clientX: number;
  clientY: number;
};

export function useZoomPan(
  viewportRef: RefObject<HTMLDivElement | null>,
  worldRef: RefObject<HTMLDivElement | null>,
  attachmentSvgRef: RefObject<SVGSVGElement | null>,
) {
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [panState, setPanState] = useState<PanState | null>(null);
  const [isSpacePanning, setIsSpacePanning] = useState(false);

  const zoomRef = useRef(1);
  const panXRef = useRef(0);
  const panYRef = useRef(0);
  const panTargetXRef = useRef(0);
  const panTargetYRef = useRef(0);
  const zoomRafRef = useRef<number | null>(null);
  const zoomTargetRef = useRef<number>(1);
  const gestureActiveRef = useRef(false);
  const suppressWheelUntilRef = useRef(0);
  const pointerPinchActiveRef = useRef(false);
  const panActiveRef = useRef(false);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  // Spacebar pan mode
  useEffect(() => {
    function isTypingTarget(target: EventTarget | null) {
      if (!(target instanceof HTMLElement)) return false;
      return (
        target.isContentEditable ||
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT"
      );
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.code !== "Space" || isTypingTarget(event.target)) return;
      event.preventDefault();
      setIsSpacePanning(true);
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (event.code !== "Space") return;
      setIsSpacePanning(false);
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  // Safari gesture events (pinch zoom)
  useEffect(() => {
    const supportsGestureEvents = "ongesturestart" in window;
    if (!supportsGestureEvents) return;

    const viewport = viewportRef.current;
    if (!viewport) return;

    let gestureState: {
      startZoom: number;
      anchorWorldX: number;
      anchorWorldY: number;
      anchorViewportX: number;
      anchorViewportY: number;
    } | null = null;

    const onGestureStart = (event: Event) => {
      if (pointerPinchActiveRef.current) return;

      const gestureEvent = event as GestureLikeEvent;
      event.preventDefault();
      gestureActiveRef.current = true;
      suppressWheelUntilRef.current = performance.now() + 200;
      setPanState(null);

      const rect = viewport.getBoundingClientRect();
      const anchorViewportX = gestureEvent.clientX - rect.left;
      const anchorViewportY = gestureEvent.clientY - rect.top;

      gestureState = {
        startZoom: zoomRef.current,
        anchorWorldX: (anchorViewportX - panXRef.current) / zoomRef.current,
        anchorWorldY: (anchorViewportY - panYRef.current) / zoomRef.current,
        anchorViewportX,
        anchorViewportY,
      };
    };

    const onGestureChange = (event: Event) => {
      if (!gestureState || pointerPinchActiveRef.current) return;

      const gestureEvent = event as GestureLikeEvent;
      event.preventDefault();
      suppressWheelUntilRef.current = performance.now() + 120;
      setZoomFromAnchorImmediate(
        gestureState.startZoom * gestureEvent.scale,
        gestureState.anchorWorldX,
        gestureState.anchorWorldY,
        gestureState.anchorViewportX,
        gestureState.anchorViewportY,
      );
    };

    const onGestureEnd = (event: Event) => {
      event.preventDefault();
      gestureActiveRef.current = false;
      suppressWheelUntilRef.current = performance.now() + 120;
      gestureState = null;
      // Sync React state once after gesture ends
      setZoom(zoomRef.current);
      setPanX(panXRef.current);
      setPanY(panYRef.current);
    };

    viewport.addEventListener("gesturestart", onGestureStart, { passive: false });
    viewport.addEventListener("gesturechange", onGestureChange, { passive: false });
    viewport.addEventListener("gestureend", onGestureEnd, { passive: false });

    return () => {
      gestureActiveRef.current = false;
      viewport.removeEventListener("gesturestart", onGestureStart);
      viewport.removeEventListener("gesturechange", onGestureChange);
      viewport.removeEventListener("gestureend", onGestureEnd);
    };
  }, []);

  // Pointer pinch zoom (non-Safari)
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const pointers = new Map<number, { x: number; y: number }>();
    let previousDistance: number | null = null;
    let pinchAnchorWorldX = 0;
    let pinchAnchorWorldY = 0;
    let pinchAnchorViewportX = 0;
    let pinchAnchorViewportY = 0;

    const getTwoPointers = () => {
      const values = Array.from(pointers.values());
      if (values.length < 2) return null;
      return [values[0], values[1]] as const;
    };

    const updatePointer = (event: PointerEvent) => {
      if (event.pointerType !== "touch") return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    };

    const removePointer = (event: PointerEvent) => {
      if (event.pointerType !== "touch") return;
      pointers.delete(event.pointerId);
      if (pointers.size < 2) {
        previousDistance = null;
        if (pointerPinchActiveRef.current) {
          pointerPinchActiveRef.current = false;
          // Sync React state once after pinch ends
          setZoom(zoomRef.current);
          setPanX(panXRef.current);
          setPanY(panYRef.current);
        }
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      updatePointer(event);
      if (pointers.size >= 2) {
        pointerPinchActiveRef.current = true;
        setPanState(null);
        const pair = getTwoPointers();
        if (pair) {
          const [first, second] = pair;
          const rect = viewport.getBoundingClientRect();
          pinchAnchorViewportX = (first.x + second.x) / 2 - rect.left;
          pinchAnchorViewportY = (first.y + second.y) / 2 - rect.top;
          pinchAnchorWorldX = (pinchAnchorViewportX - panXRef.current) / zoomRef.current;
          pinchAnchorWorldY = (pinchAnchorViewportY - panYRef.current) / zoomRef.current;
        }
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      updatePointer(event);
      const pair = getTwoPointers();
      if (!pair) return;

      const [first, second] = pair;
      const distance = Math.hypot(second.x - first.x, second.y - first.y);
      if (distance < 1) return;

      if (previousDistance === null) {
        previousDistance = distance;
        return;
      }

      event.preventDefault();
      setZoomFromAnchorImmediate(
        zoomRef.current * (distance / previousDistance),
        pinchAnchorWorldX,
        pinchAnchorWorldY,
        pinchAnchorViewportX,
        pinchAnchorViewportY,
      );
      previousDistance = distance;
    };

    const onPointerUpLike = (event: PointerEvent) => {
      removePointer(event);
    };

    viewport.addEventListener("pointerdown", onPointerDown, { passive: true });
    viewport.addEventListener("pointermove", onPointerMove, { passive: false });
    viewport.addEventListener("pointerup", onPointerUpLike, { passive: true });
    viewport.addEventListener("pointercancel", onPointerUpLike, { passive: true });
    viewport.addEventListener("pointerleave", onPointerUpLike, { passive: true });

    return () => {
      pointerPinchActiveRef.current = false;
      viewport.removeEventListener("pointerdown", onPointerDown);
      viewport.removeEventListener("pointermove", onPointerMove);
      viewport.removeEventListener("pointerup", onPointerUpLike);
      viewport.removeEventListener("pointercancel", onPointerUpLike);
      viewport.removeEventListener("pointerleave", onPointerUpLike);
    };
  }, []);

  function clampZoom(value: number) {
    return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));
  }

  function setZoomFromAnchorImmediate(
    nextZoomInput: number,
    anchorWorldX: number,
    anchorWorldY: number,
    anchorViewportX: number,
    anchorViewportY: number,
  ) {
    const nextZoom = clampZoom(nextZoomInput);

    if (zoomRafRef.current !== null) {
      cancelAnimationFrame(zoomRafRef.current);
      zoomRafRef.current = null;
    }
    zoomTargetRef.current = nextZoom;

    const nextPanX = anchorViewportX - anchorWorldX * nextZoom;
    const nextPanY = anchorViewportY - anchorWorldY * nextZoom;

    zoomRef.current = nextZoom;
    panXRef.current = nextPanX;
    panYRef.current = nextPanY;

    // During an active pinch/gesture, apply the transform directly to the
    // DOM elements to avoid re-rendering every canvas element on each frame.
    if (
      (pointerPinchActiveRef.current || gestureActiveRef.current) &&
      worldRef.current
    ) {
      const transformValue = `translate(${nextPanX}px, ${nextPanY}px) scale(${nextZoom})`;
      worldRef.current.style.transform = transformValue;
      if (attachmentSvgRef.current) {
        attachmentSvgRef.current.style.transform = transformValue;
      }
      return;
    }

    setZoom(nextZoom);
    setPanX(nextPanX);
    setPanY(nextPanY);
  }

  function animateZoomAndPanTo(
    targetZoomInput: number,
    targetPanX: number,
    targetPanY: number,
  ) {
    const targetZoom = clampZoom(targetZoomInput);
    zoomTargetRef.current = targetZoom;
    panTargetXRef.current = targetPanX;
    panTargetYRef.current = targetPanY;

    if (zoomRafRef.current !== null) {
      cancelAnimationFrame(zoomRafRef.current);
    }

    const step = () => {
      const dz = zoomTargetRef.current - zoomRef.current;
      const dx = panTargetXRef.current - panXRef.current;
      const dy = panTargetYRef.current - panYRef.current;

      const done =
        Math.abs(dz) < 0.001 && Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5;

      const nextZoom = done ? zoomTargetRef.current : zoomRef.current + dz * 0.14;
      const nextPanX = done ? panTargetXRef.current : panXRef.current + dx * 0.14;
      const nextPanY = done ? panTargetYRef.current : panYRef.current + dy * 0.14;

      zoomRef.current = nextZoom;
      panXRef.current = nextPanX;
      panYRef.current = nextPanY;

      // Bypass React state — write directly to DOM every frame.
      if (worldRef.current) {
        const t = `translate(${nextPanX}px, ${nextPanY}px) scale(${nextZoom})`;
        worldRef.current.style.transform = t;
        if (attachmentSvgRef.current) {
          attachmentSvgRef.current.style.transform = t;
        }
      }

      if (!done) {
        // Stop if user takes control via pan or pinch.
        if (panActiveRef.current || pointerPinchActiveRef.current || gestureActiveRef.current) {
          zoomRafRef.current = null;
          setZoom(nextZoom);
          setPanX(nextPanX);
          setPanY(nextPanY);
          return;
        }
        zoomRafRef.current = requestAnimationFrame(step);
      } else {
        zoomRafRef.current = null;
        // Commit React state once at the end of animation.
        setZoom(nextZoom);
        setPanX(nextPanX);
        setPanY(nextPanY);
      }
    };

    zoomRafRef.current = requestAnimationFrame(step);
  }

  function focusRows(rows: CanvasElementRecord[], immediate = false) {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;

    // Guard: if the viewport hasn't been laid out yet, retry on the next frame.
    if (vw === 0 || vh === 0) {
      requestAnimationFrame(() => focusRows(rows, immediate));
      return;
    }

    const applyView = (targetZoom: number, targetPanX: number, targetPanY: number) => {
      if (immediate) {
        // Snap directly — no animation. Used on initial canvas load so the
        // user never sees the top-left corner flash before the view animates.
        if (zoomRafRef.current !== null) {
          cancelAnimationFrame(zoomRafRef.current);
          zoomRafRef.current = null;
        }
        zoomRef.current = targetZoom;
        panXRef.current = targetPanX;
        panYRef.current = targetPanY;
        setZoom(targetZoom);
        setPanX(targetPanX);
        setPanY(targetPanY);
      } else {
        animateZoomAndPanTo(targetZoom, targetPanX, targetPanY);
      }
    };

    if (rows.length === 0) {
      applyView(1, vw / 2, vh / 2);
      return;
    }

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const element of rows) {
      minX = Math.min(minX, element.x);
      minY = Math.min(minY, element.y);
      maxX = Math.max(maxX, element.x + element.width);
      maxY = Math.max(maxY, element.y + element.height);
    }

    const margin = 120;
    const contentWidth = Math.max(1, maxX - minX + margin * 2);
    const contentHeight = Math.max(1, maxY - minY + margin * 2);

    const zoomX = vw / contentWidth;
    const zoomY = vh / contentHeight;
    const targetZoom = clampZoom(Math.min(zoomX, zoomY));

    const worldCenterX = (minX + maxX) / 2;
    const worldCenterY = (minY + maxY) / 2;

    applyView(
      targetZoom,
      vw / 2 - worldCenterX * targetZoom,
      vh / 2 - worldCenterY * targetZoom,
    );
  }

  function applyPan(nextPanX: number, nextPanY: number) {
    panXRef.current = nextPanX;
    panYRef.current = nextPanY;

    // During an active pan, apply the transform directly to the DOM elements
    // to avoid re-rendering every canvas element on each pointermove frame.
    if (panActiveRef.current && worldRef.current) {
      const transformValue = `translate(${nextPanX}px, ${nextPanY}px) scale(${zoomRef.current})`;
      worldRef.current.style.transform = transformValue;
      if (attachmentSvgRef.current) {
        attachmentSvgRef.current.style.transform = transformValue;
      }
      return;
    }

    setPanX(nextPanX);
    setPanY(nextPanY);
  }

  function commitPanState() {
    setPanX(panXRef.current);
    setPanY(panYRef.current);
  }

  // Cleanup RAF on unmount
  useEffect(() => {
    return () => {
      if (zoomRafRef.current !== null) {
        cancelAnimationFrame(zoomRafRef.current);
      }
    };
  }, []);

  return {
    zoom,
    panX,
    panY,
    panState,
    setPanState,
    isSpacePanning,
    zoomRef,
    panXRef,
    panYRef,
    gestureActiveRef,
    pointerPinchActiveRef,
    suppressWheelUntilRef,
    clampZoom,
    setZoomFromAnchorImmediate,
    animateZoomAndPanTo,
    focusRows,
    applyPan,
    panActiveRef,
    commitPanState,
  };
}
