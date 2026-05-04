import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { ElementAttachmentRecord, CanvasElementRecord } from "@/types/canvas";
import { getElementCenter, getAttachmentPath } from "@/lib/attachment-utils";

type AnimatingPair = { fromId: string; toId: string };

export type AttachmentLayerHandle = {
  updateElementPosition: (elementId: string, newX: number, newY: number) => void;
};

type AttachmentLayerProps = {
  attachments: ElementAttachmentRecord[];
  elementMap: Map<string, CanvasElementRecord>;
  selectedAttachmentId: string | null;
  onSelectAttachment: (id: string) => void;
  panX: number;
  panY: number;
  zoom: number;
  svgRef: RefObject<SVGSVGElement | null>;
  imperativeRef: RefObject<AttachmentLayerHandle | null>;
  animatingPair?: AnimatingPair | null;
  onAnimationComplete?: () => void;
};

export function AttachmentLayer({
  attachments,
  elementMap,
  selectedAttachmentId,
  onSelectAttachment,
  panX,
  panY,
  zoom,
  svgRef,
  imperativeRef,
  animatingPair,
  onAnimationComplete,
}: AttachmentLayerProps) {
  // All coordinates are in world space — the CSS transform on the SVG
  // element handles pan/zoom, so we never need to convert to viewport here.

  // Refs to individual SVG path elements for imperative updates during drag.
  // Per attachment: [hit, outline, texture, glow]
  const pathRefsMap = useRef(new Map<string, Array<SVGPathElement | null>>());
  // Refs to <pattern> elements so patternTransform can be updated during drag.
  const patternRefsMap = useRef(new Map<string, SVGPatternElement | null>());

  // Always-fresh data for the imperative handle (no closure staleness)
  const latestRef = useRef({ attachments, elementMap });
  useEffect(() => { latestRef.current = { attachments, elementMap }; });

  // --- Rope connection animation state ---
  const [animPhase, setAnimPhase] = useState<'idle' | 'drawing' | 'bursting'>('idle');
  const onAnimationCompleteRef = useRef(onAnimationComplete);
  useEffect(() => { onAnimationCompleteRef.current = onAnimationComplete; });

  useEffect(() => {
    setAnimPhase('idle');
    if (!animatingPair) return;

    setAnimPhase('drawing');

    const t1 = window.setTimeout(() => setAnimPhase('bursting'), 680);
    const t2 = window.setTimeout(() => {
      setAnimPhase('idle');
      onAnimationCompleteRef.current?.();
    }, 1280);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animatingPair]);
  // --- end animation state ---

  // Expose imperative handle — re-assigned once (reads fresh data via latestRef)
  useEffect(() => {
    imperativeRef.current = {
      updateElementPosition(elementId, newX, newY) {
        const { attachments: currentAttachments, elementMap: currentElementMap } =
          latestRef.current;

        for (const attachment of currentAttachments) {
          const isFrom = attachment.from_element_id === elementId;
          const isTo = attachment.to_element_id === elementId;
          if (!isFrom && !isTo) continue;

          const fromEl = currentElementMap.get(attachment.from_element_id);
          const toEl = currentElementMap.get(attachment.to_element_id);
          if (!fromEl || !toEl) continue;

          const fromCenter = isFrom
            ? { x: newX + fromEl.width / 2, y: newY + fromEl.height / 2 }
            : getElementCenter(fromEl);
          const toCenter = isTo
            ? { x: newX + toEl.width / 2, y: newY + toEl.height / 2 }
            : getElementCenter(toEl);

          const pathD = getAttachmentPath(fromCenter, toCenter, attachment.id, 1, 0, 1);
          const paths = pathRefsMap.current.get(attachment.id);
          if (paths) {
            for (const pathEl of paths) {
              pathEl?.setAttribute("d", pathD);
            }
          }

          // Keep the rope texture strands at the same angle relative to the rope.
          const newRopeAngle =
            Math.atan2(toCenter.y - fromCenter.y, toCenter.x - fromCenter.x) *
            (180 / Math.PI);
          const patternEl = patternRefsMap.current.get(attachment.id);
          if (patternEl) {
            patternEl.setAttribute(
              "patternTransform",
              `rotate(${newRopeAngle + 45}, ${fromCenter.x}, ${fromCenter.y})`,
            );
            patternEl.setAttribute("x", String(fromCenter.x));
            patternEl.setAttribute("y", String(fromCenter.y));
          }
        }
      },
    };
    return () => { imperativeRef.current = null; };
  }, [imperativeRef]);

  // Collect all pattern defs up-front so they live in the top-level <defs>
  // (putting <defs> inside a <g> is non-standard and breaks url() lookup in
  // some browsers — patterns must be direct children of the root <defs>).
  const patternDefs = attachments.map((attachment) => {
    const from = elementMap.get(attachment.from_element_id);
    const to = elementMap.get(attachment.to_element_id);
    if (!from || !to) return null;

    const fromWorld = getElementCenter(from);
    const toWorld = getElementCenter(to);

    const ropeAngle =
      Math.atan2(toWorld.y - fromWorld.y, toWorld.x - fromWorld.x) * (180 / Math.PI);
    const patternId = `ropeTexture-${attachment.id}`;

    return (
      <pattern
        key={patternId}
        ref={(el) => { patternRefsMap.current.set(attachment.id, el); }}
        id={patternId}
        x={fromWorld.x}
        y={fromWorld.y}
        width={14}
        height={14}
        patternUnits="userSpaceOnUse"
        patternTransform={`rotate(${ropeAngle + 45}, ${fromWorld.x}, ${fromWorld.y})`}
      >
        {/* groove */}
        <rect width="14" height="14" fill="#2a1406" />
        {/* strand A */}
        <rect x="1" y="0" width="5" height="14" fill="#c8a97a" />
        {/* strand A left shadow */}
        <rect x="1" y="0" width="0.8" height="14" fill="rgba(15,5,0,0.60)" />
        {/* strand A highlight */}
        <rect x="2.2" y="0" width="1.8" height="14" fill="rgba(255,240,200,0.35)" />
        {/* strand A right shadow */}
        <rect x="5.2" y="0" width="0.8" height="14" fill="rgba(15,5,0,0.50)" />
        {/* strand B */}
        <rect x="8" y="0" width="5" height="14" fill="#b8935f" />
        {/* strand B left shadow */}
        <rect x="8" y="0" width="0.8" height="14" fill="rgba(15,5,0,0.60)" />
        {/* strand B highlight */}
        <rect x="9.2" y="0" width="1.8" height="14" fill="rgba(255,240,200,0.25)" />
        {/* strand B right shadow */}
        <rect x="12.2" y="0" width="0.8" height="14" fill="rgba(15,5,0,0.45)" />
      </pattern>
    );
  });

  return (
    <svg
      ref={svgRef}
      className="absolute inset-0 h-full w-full"
      style={{
        overflow: "visible",
        pointerEvents: "none",
        transformOrigin: "top left",
        transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
      }}
    >
      <defs>{patternDefs}</defs>

      {attachments.map((attachment) => {
        const from = elementMap.get(attachment.from_element_id);
        const to = elementMap.get(attachment.to_element_id);
        if (!from || !to) return null;

        // Hide the static rope while its connection animation is playing
        const isAnimating =
          animPhase !== 'idle' &&
          animatingPair &&
          ((attachment.from_element_id === animatingPair.fromId &&
            attachment.to_element_id === animatingPair.toId) ||
            (attachment.from_element_id === animatingPair.toId &&
              attachment.to_element_id === animatingPair.fromId));
        if (isAnimating) return null;

        const fromWorld = getElementCenter(from);
        const toWorld = getElementCenter(to);

        // Paths are in world coordinates — the SVG's CSS transform handles pan/zoom.
        const path = getAttachmentPath(fromWorld, toWorld, attachment.id, 1, 0, 1);
        const isSelected = selectedAttachmentId === attachment.id;
        const patternId = `ropeTexture-${attachment.id}`;

        // Stroke widths in world units; CSS zoom transform scales them visually.
        const outline = 12;
        const texture = 10;
        const glow = 14;
        const hit = 18;

        // Ensure a path-ref slot exists for this attachment ([hit, outline, texture, glow])
        if (!pathRefsMap.current.has(attachment.id)) {
          pathRefsMap.current.set(attachment.id, [null, null, null, null]);
        }
        const getRef = (idx: number) => (el: SVGPathElement | null) => {
          const arr = pathRefsMap.current.get(attachment.id);
          if (arr) arr[idx] = el;
        };

        return (
          <g key={attachment.id}>
            {/* Hit target */}
            <path
              ref={getRef(0)}
              d={path}
              fill="none"
              stroke="transparent"
              strokeWidth={hit}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ pointerEvents: "all", cursor: "pointer" }}
              onClick={(event) => {
                event.stopPropagation();
                onSelectAttachment(attachment.id);
              }}
            />
            {/* Rope outline */}
            <path
              ref={getRef(1)}
              d={path}
              fill="none"
              stroke="#6b4423"
              strokeWidth={outline}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ pointerEvents: "none" }}
            />
            {/* Diagonal strand pattern */}
            <path
              ref={getRef(2)}
              d={path}
              fill="none"
              stroke={`url(#${patternId})`}
              strokeWidth={texture}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ pointerEvents: "none" }}
            />
            {/* Selection glow */}
            {isSelected && (
              <path
                ref={getRef(3)}
                d={path}
                fill="none"
                stroke="#ffe08a"
                strokeWidth={glow}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.35}
                style={{ pointerEvents: "none" }}
              />
            )}
          </g>
        );
      })}

      {/* ── Rope connection animation ── */}
      {animPhase !== 'idle' && animatingPair && (() => {
        const fromEl = elementMap.get(animatingPair.fromId);
        const toEl = elementMap.get(animatingPair.toId);
        if (!fromEl || !toEl) return null;

        const fromWorld = getElementCenter(fromEl);
        const toWorld = getElementCenter(toEl);
        const animPath = getAttachmentPath(
          fromWorld,
          toWorld,
          `anim-${animatingPair.fromId}-${animatingPair.toId}`,
          1,
          0,
          1,
        );
        const animKey = `${animatingPair.fromId}-${animatingPair.toId}`;

        return (
          <g key={animKey}>
            {animPhase === 'drawing' && (
              <>
                {/* Rope outline growing from source → destination */}
                <path
                  pathLength="1"
                  d={animPath}
                  fill="none"
                  stroke="#6b4423"
                  strokeWidth={12}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray="1"
                  style={{
                    animation: 'rope-draw 0.65s ease-out both',
                    pointerEvents: 'none',
                  }}
                />
                {/* Wide golden glow overlay — same draw timing, fades at destination */}
                <path
                  pathLength="1"
                  d={animPath}
                  fill="none"
                  stroke="#ffc040"
                  strokeWidth={22}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray="1"
                  style={{
                    animation: 'rope-draw 0.65s ease-out both',
                    pointerEvents: 'none',
                    filter: 'blur(6px)',
                    opacity: 0.7,
                  }}
                />
                {/* Traveling spark at the leading edge */}
                <path
                  pathLength="1"
                  d={animPath}
                  fill="none"
                  stroke="white"
                  strokeWidth={11}
                  strokeLinecap="round"
                  strokeDasharray="0.08 10"
                  style={{
                    animation: 'rope-spark-travel 0.65s ease-out both',
                    pointerEvents: 'none',
                    opacity: 0.95,
                    filter: 'blur(1px)',
                  }}
                />
              </>
            )}

            {animPhase === 'bursting' && (
              <>
                {/* Fully drawn rope outline stays visible */}
                <path
                  d={animPath}
                  fill="none"
                  stroke="#6b4423"
                  strokeWidth={12}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ pointerEvents: 'none' }}
                />
                {/* Glow overlay fades out */}
                <path
                  d={animPath}
                  fill="none"
                  stroke="#ffc040"
                  strokeWidth={22}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    animation: 'rope-glow-fade 0.55s ease-out both',
                    pointerEvents: 'none',
                    filter: 'blur(6px)',
                  }}
                />
                {/* Expanding burst rings at destination */}
                {([0, 140, 280] as const).map((delay) => (
                  <circle
                    key={delay}
                    cx={toWorld.x}
                    cy={toWorld.y}
                    r={14}
                    fill="none"
                    stroke="#ffc040"
                    strokeWidth={3}
                    style={{
                      transformBox: 'fill-box',
                      transformOrigin: 'center',
                      animation: `rope-burst-ring 0.52s ease-out ${delay}ms both`,
                      pointerEvents: 'none',
                    }}
                  />
                ))}
                {/* Centre flash dot at connection point */}
                <circle
                  cx={toWorld.x}
                  cy={toWorld.y}
                  r={14}
                  fill="#fff8dc"
                  style={{
                    transformBox: 'fill-box',
                    transformOrigin: 'center',
                    animation: 'rope-burst-dot 0.48s ease-out both',
                    pointerEvents: 'none',
                  }}
                />
                {/* Small echo at source */}
                <circle
                  cx={fromWorld.x}
                  cy={fromWorld.y}
                  r={9}
                  fill="#ffc040"
                  style={{
                    transformBox: 'fill-box',
                    transformOrigin: 'center',
                    animation: 'rope-burst-dot 0.38s ease-out both',
                    opacity: 0.65,
                    pointerEvents: 'none',
                  }}
                />
              </>
            )}
          </g>
        );
      })()}
    </svg>
  );
}
