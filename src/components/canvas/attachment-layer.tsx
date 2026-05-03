import type { ElementAttachmentRecord, CanvasElementRecord } from "@/types/canvas";
import { getElementCenter, getAttachmentPath } from "@/lib/attachment-utils";

type AttachmentLayerProps = {
  attachments: ElementAttachmentRecord[];
  elementMap: Map<string, CanvasElementRecord>;
  selectedAttachmentId: string | null;
  onSelectAttachment: (id: string) => void;
};

export function AttachmentLayer({
  attachments,
  elementMap,
  selectedAttachmentId,
  onSelectAttachment,
}: AttachmentLayerProps) {
  return (
    <svg className="absolute inset-0 h-full w-full">
      <defs>
        <filter id="stringShadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow
            dx="0"
            dy="4"
            stdDeviation="5"
            floodColor="#000000"
            floodOpacity="0.85"
          />
        </filter>
        <filter
          id="ropeFiber"
          x="-5%"
          y="-5%"
          width="110%"
          height="110%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.05 1.2"
            numOctaves="4"
            seed="9"
            result="noise"
          />
          <feColorMatrix
            in="noise"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  4 0 0 0 -1.5"
            result="fibers"
          />
          <feComposite in="fibers" in2="SourceGraphic" operator="in" />
        </filter>
        <pattern
          id="ropeTexture"
          x="0"
          y="0"
          width="18"
          height="18"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(52)"
        >
          {/* groove background */}
          <rect width="18" height="18" fill="#000000" />
          {/* Strand A body */}
          <rect x="0" y="0" width="8" height="18" fill="#222222" />
          {/* Strand A left edge shadow */}
          <rect x="0" y="0" width="0.8" height="18" fill="#000000" />
          {/* Strand A highlight — cylindrical shading */}
          <rect x="1.2" y="0" width="2.5" height="18" fill="rgba(255,255,255,0.20)" />
          {/* Strand A right fade into groove */}
          <rect x="5.5" y="0" width="2.5" height="18" fill="#0c0c0c" />
          {/* Groove */}
          <rect x="8" y="0" width="1.8" height="18" fill="#000000" />
          {/* Strand B body */}
          <rect x="9.8" y="0" width="8" height="18" fill="#222222" />
          {/* Strand B left edge shadow */}
          <rect x="9.8" y="0" width="0.8" height="18" fill="#000000" />
          {/* Strand B highlight */}
          <rect x="11" y="0" width="2.5" height="18" fill="rgba(255,255,255,0.20)" />
          {/* Strand B right fade */}
          <rect x="15.3" y="0" width="2.5" height="18" fill="#0c0c0c" />
          {/* Edge groove (wraps to left) */}
          <rect x="17.8" y="0" width="0.2" height="18" fill="#000000" />
        </pattern>
      </defs>

      {attachments.map((attachment) => {
        const from = elementMap.get(attachment.from_element_id);
        const to = elementMap.get(attachment.to_element_id);
        if (!from || !to) return null;

        const fromPoint = getElementCenter(from);
        const toPoint = getElementCenter(to);
        const path = getAttachmentPath(fromPoint, toPoint, attachment.id);
        const isSelected = selectedAttachmentId === attachment.id;

        return (
          <g key={attachment.id}>
            {/* Drop shadow */}
            <path
              d={path}
              fill="none"
              stroke="#000000"
              strokeWidth={22}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.55}
              filter="url(#stringShadow)"
              vectorEffect="non-scaling-stroke"
              className="pointer-events-none"
            />
            {/* Hit target */}
            <path
              d={path}
              fill="none"
              stroke="transparent"
              strokeWidth={24}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              className="cursor-pointer"
              onClick={(event) => {
                event.stopPropagation();
                onSelectAttachment(attachment.id);
              }}
            />
            {/* Outer dark rim — clean rope edge */}
            <path
              d={path}
              fill="none"
              stroke="#000000"
              strokeWidth={17}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              className="pointer-events-none"
            />
            {/* Twisted strand pattern */}
            <path
              d={path}
              fill="none"
              stroke="url(#ropeTexture)"
              strokeWidth={15}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              className="pointer-events-none"
            />
            {/* Fiber texture overlay */}
            <path
              d={path}
              fill="none"
              stroke="rgba(0,0,0,0.8)"
              strokeWidth={15}
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#ropeFiber)"
              opacity={0.55}
              vectorEffect="non-scaling-stroke"
              className="pointer-events-none"
            />
            {/* Cylindrical gloss */}
            <path
              d={path}
              fill="none"
              stroke="rgba(255,255,255,0.10)"
              strokeWidth={6}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              className="pointer-events-none"
            />
            {/* Selection glow */}
            {isSelected && (
              <path
                d={path}
                fill="none"
                stroke="#ffe08a"
                strokeWidth={19}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.25}
                vectorEffect="non-scaling-stroke"
                className="pointer-events-none"
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}
