import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import type { ElementAttachmentRecord, CanvasElementRecord } from "@/types/canvas";
import { getElementCenter, getAttachmentPath } from "@/lib/attachment-utils";

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
}: AttachmentLayerProps) {
  // All coordinates are in world space — the CSS transform on the SVG
  // element handles pan/zoom, so we never need to convert to viewport here.

  // Refs to individual SVG path elements for imperative updates during drag.
  // Per attachment: [hit, outline, texture, glow]
  const pathRefsMap = useRef(new Map<string, Array<SVGPathElement | null>>());

  // Always-fresh data for the imperative handle (no closure staleness)
  const latestRef = useRef({ attachments, elementMap });
  useEffect(() => { latestRef.current = { attachments, elementMap }; });

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
    </svg>
  );
}
