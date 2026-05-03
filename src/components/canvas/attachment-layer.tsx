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
            dy="5"
            stdDeviation="6"
            floodColor="#4a2f10"
            floodOpacity="0.5"
          />
        </filter>
      </defs>

      {attachments.map((attachment) => {
        const from = elementMap.get(attachment.from_element_id);
        const to = elementMap.get(attachment.to_element_id);
        if (!from || !to) return null;

        const fromPoint = getElementCenter(from);
        const toPoint = getElementCenter(to);
        const path = getAttachmentPath(fromPoint, toPoint, attachment.id);
        const isSelected = selectedAttachmentId === attachment.id;

        const ropeAngle =
          Math.atan2(toPoint.y - fromPoint.y, toPoint.x - fromPoint.x) *
          (180 / Math.PI);
        const patternId = `ropeTexture-${attachment.id}`;

        return (
          <g key={attachment.id}>
            <defs>
              <pattern
                id={patternId}
                x="0"
                y="0"
                width="14"
                height="14"
                patternUnits="userSpaceOnUse"
                patternTransform={`rotate(${ropeAngle + 45})`}
              >
                {/* groove (very dark for strong contrast) */}
                <rect width="14" height="14" fill="#2a1406" />
                {/* strand A */}
                <rect x="1" y="0" width="5" height="14" fill="#c8a97a" />
                {/* strand A left edge shadow */}
                <rect x="1" y="0" width="0.8" height="14" fill="rgba(15,5,0,0.60)" />
                {/* strand A inner highlight */}
                <rect x="2.2" y="0" width="1.8" height="14" fill="rgba(255,240,200,0.35)" />
                {/* strand A right edge shadow */}
                <rect x="5.2" y="0" width="0.8" height="14" fill="rgba(15,5,0,0.50)" />
                {/* strand B */}
                <rect x="8" y="0" width="5" height="14" fill="#b8935f" />
                {/* strand B left edge shadow */}
                <rect x="8" y="0" width="0.8" height="14" fill="rgba(15,5,0,0.60)" />
                {/* strand B inner highlight */}
                <rect x="9.2" y="0" width="1.8" height="14" fill="rgba(255,240,200,0.25)" />
                {/* strand B right edge shadow */}
                <rect x="12.2" y="0" width="0.8" height="14" fill="rgba(15,5,0,0.45)" />
              </pattern>
            </defs>
            {/* Drop shadow */}
            <path
              d={path}
              fill="none"
              stroke="#4a2f10"
              strokeWidth={16}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.4}
              filter="url(#stringShadow)"
              vectorEffect="non-scaling-stroke"
              className="pointer-events-none"
            />
            {/* Hit target */}
            <path
              d={path}
              fill="none"
              stroke="transparent"
              strokeWidth={18}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              className="cursor-pointer"
              onClick={(event) => {
                event.stopPropagation();
                onSelectAttachment(attachment.id);
              }}
            />
            {/* Rope outline */}
            <path
              d={path}
              fill="none"
              stroke="#6b4423"
              strokeWidth={12}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              className="pointer-events-none"
            />
            {/* Diagonal strand pattern */}
            <path
              d={path}
              fill="none"
              stroke={`url(#${patternId})`}
              strokeWidth={10}
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
                strokeWidth={14}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.35}
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
