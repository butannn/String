export type ElementType = "text" | "image" | "audio" | "video";

export type OpenableMediaType = Extract<ElementType, "image" | "video">;

export type OpenableCanvasElementRecord = CanvasElementRecord & {
  element_type: OpenableMediaType;
};

export function isOpenableMediaType(
  elementType: ElementType,
): elementType is OpenableMediaType {
  return elementType === "image" || elementType === "video";
}

export type Mode = "move" | "attach";

export type DragState = {
  id: string;
  pointerStartX: number;
  pointerStartY: number;
  originX: number;
  originY: number;
};

export type PanState = {
  pointerStartX: number;
  pointerStartY: number;
  startPanX: number;
  startPanY: number;
};

export type DescriptionStyle = {
  fontWeight: "normal" | "bold";
  fontStyle: "normal" | "italic";
  textDecoration: "none" | "underline";
  textColor: string;
  boxColor: string;
};

export const DEFAULT_DESCRIPTION_STYLE: DescriptionStyle = {
  fontWeight: "normal",
  fontStyle: "normal",
  textDecoration: "none",
  textColor: "#1f2937",
  boxColor: "#e5e7eb",
};

export type MediaViewerState = {
  elementId: string;
  elementType: OpenableMediaType;
  fileName: string;
  mimeType: string;
  src: string | null;
};

export type CanvasRecord = {
  id: string;
  user_id: string;
  title: string;
  pan_x: number;
  pan_y: number;
  zoom_level: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type CanvasElementRecord = {
  id: string;
  canvas_id: string;
  user_id: string;
  element_type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  z_index: number;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ElementAttachmentRecord = {
  id: string;
  canvas_id: string;
  from_element_id: string;
  to_element_id: string;
  style: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};
