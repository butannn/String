import { hexToRgba } from "@/lib/media-utils";
import {
  getElementDescription,
  getElementDescriptionStyle,
} from "@/hooks/use-description";
import type {
  CanvasElementRecord,
  MediaViewerState,
} from "@/types/canvas";
import { DEFAULT_DESCRIPTION_STYLE } from "@/types/canvas";

type MediaViewerProps = {
  viewer: MediaViewerState | null;
  onClose: () => void;
  elements: CanvasElementRecord[];
};

export function MediaViewer({ viewer, onClose, elements }: MediaViewerProps) {
  if (!viewer) return null;

  const viewerElement = elements.find((el) => el.id === viewer.elementId);
  const viewerDescription = viewerElement
    ? getElementDescription(viewerElement)
    : "";
  const viewerDescriptionStyle = viewerElement
    ? getElementDescriptionStyle(viewerElement)
    : DEFAULT_DESCRIPTION_STYLE;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <button
        type="button"
        className="absolute right-4 top-4 rounded-full border border-white/20 bg-white/10 px-3 py-2 text-sm text-white backdrop-blur"
        onClick={onClose}
      >
        Close
      </button>

      <div
        className="flex max-h-full max-w-[min(94vw,1280px)] flex-col items-center gap-3"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="text-sm text-white/75">{viewer.fileName}</div>

        {viewer.src ? (
          viewer.elementType === "image" ? (
            <img
              src={viewer.src}
              alt={viewer.fileName}
              className="max-h-[85vh] max-w-full rounded-2xl bg-white shadow-2xl"
            />
          ) : (
            <video
              src={viewer.src}
              controls
              autoPlay
              playsInline
              className="max-h-[85vh] max-w-full rounded-2xl bg-black shadow-2xl"
            />
          )
        ) : (
          <div className="rounded-xl border border-white/15 bg-white/10 px-5 py-4 text-sm text-white">
            Loading full media...
          </div>
        )}

        {viewerDescription ? (
          <div
            className="w-full max-w-[min(94vw,1280px)] rounded-xl border px-4 py-3 text-sm leading-relaxed shadow"
            style={{
              color: viewerDescriptionStyle.textColor,
              fontWeight: viewerDescriptionStyle.fontWeight,
              fontStyle: viewerDescriptionStyle.fontStyle,
              textDecorationLine: viewerDescriptionStyle.textDecoration,
              backgroundColor: hexToRgba(viewerDescriptionStyle.boxColor, 0.85),
              borderColor: hexToRgba(viewerDescriptionStyle.boxColor, 0.9),
            }}
          >
            {viewerDescription}
          </div>
        ) : null}
      </div>
    </div>
  );
}
