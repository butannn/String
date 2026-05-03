export type ElementType = "text" | "image" | "audio" | "video";

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
