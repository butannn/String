import { useEffect, useMemo, useRef, useState } from "react";
import {
  deleteRows,
  insertRow,
  selectRows,
  updateSingleRow,
} from "@/lib/data-api";
import { supabase } from "@/lib/supabase";
const STORAGE_BUCKET =
  import.meta.env.VITE_SUPABASE_STORAGE_BUCKET || "canvas-media";
import type {
  CanvasElementRecord,
  CanvasRecord,
  ElementAttachmentRecord,
  ElementType,
} from "@/types/canvas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function fitMediaDimensions(
  sourceWidth: number,
  sourceHeight: number,
  maxWidth: number,
  maxHeight: number,
) {
  const safeWidth = Math.max(1, sourceWidth);
  const safeHeight = Math.max(1, sourceHeight);
  const widthScale = maxWidth / safeWidth;
  const heightScale = maxHeight / safeHeight;
  const scale = Math.min(1, widthScale, heightScale);

  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
  };
}

const SIGNED_URL_TTL_SECONDS = 60 * 60;
const PREVIEW_IMAGE_MAX_EDGE = 960;
const PREVIEW_IMAGE_QUALITY = 0.72;

type OpenableMediaType = Extract<ElementType, "image" | "video">;

type PreviewTransform = {
  width?: number;
  height?: number;
  resize?: "cover" | "contain" | "fill";
  quality?: number;
  format?: "origin";
};

type GeneratedPreviewAsset = {
  blob: Blob;
  contentType: string;
  extension: string;
  sourceWidth: number;
  sourceHeight: number;
};

type OpenableCanvasElementRecord = CanvasElementRecord & {
  element_type: OpenableMediaType;
};

type MediaViewerState = {
  elementId: string;
  elementType: OpenableMediaType;
  fileName: string;
  mimeType: string;
  src: string | null;
};

function isOpenableMediaType(
  elementType: ElementType,
): elementType is OpenableMediaType {
  return elementType === "image" || elementType === "video";
}

function getImagePreviewTransform(
  width: number,
  height: number,
): PreviewTransform {
  const pixelRatio =
    typeof window === "undefined"
      ? 1
      : Math.min(window.devicePixelRatio || 1, 2);
  const scaledWidth = Math.max(
    160,
    Math.min(1400, Math.round(width * pixelRatio * 1.25)),
  );
  const scaledHeight = Math.max(
    160,
    Math.min(1400, Math.round(height * pixelRatio * 1.25)),
  );

  return {
    width: scaledWidth,
    height: scaledHeight,
    resize: "contain",
    quality: 60,
  };
}

async function createSignedMediaUrl(
  path: string,
  options?: {
    transform?: PreviewTransform;
    cacheNonce?: string;
  },
) {
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS, options);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Could not create media URL");
  }

  return data.signedUrl;
}

function canvasToPreviewAsset(
  canvas: HTMLCanvasElement,
  sourceWidth: number,
  sourceHeight: number,
) {
  return new Promise<GeneratedPreviewAsset>((resolve, reject) => {
    const resolveAsset = (
      blob: Blob | null,
      extension: string,
      contentType: string,
    ) => {
      if (!blob) {
        reject(new Error("Could not create media preview"));
        return;
      }

      resolve({
        blob,
        contentType,
        extension,
        sourceWidth,
        sourceHeight,
      });
    };

    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolveAsset(blob, "webp", "image/webp");
          return;
        }

        canvas.toBlob(
          (fallbackBlob) => {
            resolveAsset(fallbackBlob, "jpg", "image/jpeg");
          },
          "image/jpeg",
          PREVIEW_IMAGE_QUALITY,
        );
      },
      "image/webp",
      PREVIEW_IMAGE_QUALITY,
    );
  });
}

function createImagePreviewAsset(file: File) {
  return new Promise<GeneratedPreviewAsset>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = async () => {
      try {
        const fitted = fitMediaDimensions(
          image.naturalWidth,
          image.naturalHeight,
          PREVIEW_IMAGE_MAX_EDGE,
          PREVIEW_IMAGE_MAX_EDGE,
        );
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");

        if (!context) {
          throw new Error("Could not create preview canvas");
        }

        canvas.width = fitted.width;
        canvas.height = fitted.height;
        context.drawImage(image, 0, 0, canvas.width, canvas.height);

        resolve(
          await canvasToPreviewAsset(
            canvas,
            image.naturalWidth,
            image.naturalHeight,
          ),
        );
      } catch (previewError) {
        reject(
          previewError instanceof Error
            ? previewError
            : new Error("Could not create image preview"),
        );
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not create image preview"));
    };

    image.src = objectUrl;
  });
}

function createVideoPreviewAsset(file: File) {
  return new Promise<GeneratedPreviewAsset>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement("video");

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
    };

    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    video.onloadeddata = async () => {
      try {
        const fitted = fitMediaDimensions(
          video.videoWidth,
          video.videoHeight,
          PREVIEW_IMAGE_MAX_EDGE,
          PREVIEW_IMAGE_MAX_EDGE,
        );
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");

        if (!context) {
          throw new Error("Could not create preview canvas");
        }

        canvas.width = fitted.width;
        canvas.height = fitted.height;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        resolve(
          await canvasToPreviewAsset(
            canvas,
            video.videoWidth,
            video.videoHeight,
          ),
        );
      } catch (previewError) {
        reject(
          previewError instanceof Error
            ? previewError
            : new Error("Could not create video preview"),
        );
      } finally {
        cleanup();
      }
    };

    video.onerror = () => {
      cleanup();
      reject(new Error("Could not create video preview"));
    };

    video.src = objectUrl;
    video.load();
  });
}

type CanvasEditorProps = {
  userId: string;
  canvases: CanvasRecord[];
  activeCanvasId: string | null;
  onSelectCanvas: (canvasId: string) => void;
  onCreateCanvas: (title: string) => Promise<void>;
  onRenameCanvas: (canvasId: string, title: string) => Promise<void>;
  onDeleteCanvas: (canvasId: string) => Promise<void>;
  onLogout: () => Promise<void>;
};

type Mode = "move" | "attach";

type DragState = {
  id: string;
  pointerStartX: number;
  pointerStartY: number;
  originX: number;
  originY: number;
};

type PanState = {
  pointerStartX: number;
  pointerStartY: number;
  startPanX: number;
  startPanY: number;
};

type GestureLikeEvent = Event & {
  scale: number;
  clientX: number;
  clientY: number;
};

type DescriptionStyle = {
  fontWeight: "normal" | "bold";
  fontStyle: "normal" | "italic";
  textDecoration: "none" | "underline";
  textColor: string;
  boxColor: string;
};

const DEFAULT_DESCRIPTION_STYLE: DescriptionStyle = {
  fontWeight: "normal",
  fontStyle: "normal",
  textDecoration: "none",
  textColor: "#1f2937",
  boxColor: "#e5e7eb",
};

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 2.5;

export function CanvasEditor({
  userId,
  canvases,
  activeCanvasId,
  onSelectCanvas,
  onCreateCanvas,
  onLogout,
}: CanvasEditorProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);

  const [worldSize, setWorldSize] = useState(6000);
  const [zoom, setZoom] = useState(1);
  const [elements, setElements] = useState<CanvasElementRecord[]>([]);
  const [attachments, setAttachments] = useState<ElementAttachmentRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedAttachmentId, setSelectedAttachmentId] = useState<
    string | null
  >(null);
  const [mode, setMode] = useState<Mode>("move");
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newCanvasTitle, setNewCanvasTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [panState, setPanState] = useState<PanState | null>(null);
  const [isSpacePanning, setIsSpacePanning] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [mobileSheetType, setMobileSheetType] = useState<"add" | "menu">("add");
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [descriptionStyleDraft, setDescriptionStyleDraft] =
    useState<DescriptionStyle>(DEFAULT_DESCRIPTION_STYLE);
  const [isSavingDescription, setIsSavingDescription] = useState(false);
  const [mediaViewer, setMediaViewer] = useState<MediaViewerState | null>(null);
  const [isOpeningMedia, setIsOpeningMedia] = useState(false);
  const panMovedRef = useRef(false);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);
  const temporaryMediaUrlsRef = useRef(new Set<string>());
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
  const pendingAttachmentsRef = useRef<
    Array<{ fromId: string; toId: string; canvasId: string }>
  >([]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    const temporaryMediaUrls = temporaryMediaUrlsRef.current;

    return () => {
      if (zoomRafRef.current !== null) {
        cancelAnimationFrame(zoomRafRef.current);
      }
      if (longPressTimerRef.current !== null) {
        clearTimeout(longPressTimerRef.current);
      }
      for (const url of temporaryMediaUrls) {
        URL.revokeObjectURL(url);
      }
      temporaryMediaUrls.clear();
    };
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const updateViewportFlag = () => setIsMobileViewport(mediaQuery.matches);

    updateViewportFlag();
    mediaQuery.addEventListener("change", updateViewportFlag);
    return () => mediaQuery.removeEventListener("change", updateViewportFlag);
  }, []);

  useEffect(() => {
    function isTypingTarget(target: EventTarget | null) {
      if (!(target instanceof HTMLElement)) {
        return false;
      }

      return (
        target.isContentEditable ||
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT"
      );
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.code !== "Space" || isTypingTarget(event.target)) {
        return;
      }

      event.preventDefault();
      setIsSpacePanning(true);
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (event.code !== "Space") {
        return;
      }

      setIsSpacePanning(false);
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  function clampZoom(value: number) {
    return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));
  }

  function trackTemporaryUrl(url: string) {
    temporaryMediaUrlsRef.current.add(url);
    return url;
  }

  function isTempElement(id: string) {
    return id.startsWith("temp-");
  }

  // Apply zoom immediately, keeping the world point (anchorWorldX, anchorWorldY) fixed
  // at viewport position (anchorViewportX, anchorViewportY).
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

    setZoom(nextZoom);
    setPanX(nextPanX);
    setPanY(nextPanY);
  }

  // Animate zoom+pan toward a target, interpolating each frame.
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
      const dz =
        panTargetXRef.current !== undefined
          ? zoomTargetRef.current - zoomRef.current
          : 0;
      const dx = panTargetXRef.current - panXRef.current;
      const dy = panTargetYRef.current - panYRef.current;

      const done =
        Math.abs(dz) < 0.001 && Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5;

      const nextZoom = done
        ? zoomTargetRef.current
        : zoomRef.current + dz * 0.14;
      const nextPanX = done
        ? panTargetXRef.current
        : panXRef.current + dx * 0.14;
      const nextPanY = done
        ? panTargetYRef.current
        : panYRef.current + dy * 0.14;

      zoomRef.current = nextZoom;
      panXRef.current = nextPanX;
      panYRef.current = nextPanY;

      setZoom(nextZoom);
      setPanX(nextPanX);
      setPanY(nextPanY);

      if (!done) {
        zoomRafRef.current = requestAnimationFrame(step);
      } else {
        zoomRafRef.current = null;
      }
    };

    zoomRafRef.current = requestAnimationFrame(step);
  }

  function focusRows(rows: CanvasElementRecord[]) {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;

    if (rows.length === 0) {
      const targetZoom = 1;
      const worldCenterX = worldSize / 2;
      const worldCenterY = worldSize / 2;
      const targetPanX = vw / 2 - worldCenterX * targetZoom;
      const targetPanY = vh / 2 - worldCenterY * targetZoom;
      animateZoomAndPanTo(targetZoom, targetPanX, targetPanY);
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

    // World center of the content bounding box.
    const worldCenterX = (minX + maxX) / 2;
    const worldCenterY = (minY + maxY) / 2;

    // Pan so that the world center appears at the viewport center.
    const targetPanX = vw / 2 - worldCenterX * targetZoom;
    const targetPanY = vh / 2 - worldCenterY * targetZoom;

    animateZoomAndPanTo(targetZoom, targetPanX, targetPanY);
  }

  function focusAllElements() {
    focusRows(elements);
  }

  const elementMap = useMemo(() => {
    return new Map(elements.map((element) => [element.id, element]));
  }, [elements]);
  const selectedElement = useMemo(() => {
    return elements.find((element) => element.id === selectedId) ?? null;
  }, [elements, selectedId]);
  const selectedMediaElement =
    useMemo<OpenableCanvasElementRecord | null>(() => {
      if (
        !selectedElement ||
        !isOpenableMediaType(selectedElement.element_type)
      ) {
        return null;
      }

      return selectedElement as OpenableCanvasElementRecord;
    }, [selectedElement]);
  const canOpenSelectedMedia = selectedMediaElement !== null;

  function getElementDescription(element: CanvasElementRecord) {
    const rawDescription = element.data?.description;
    return typeof rawDescription === "string" ? rawDescription : "";
  }

  function normalizeHexColor(value: unknown, fallback: string) {
    if (typeof value !== "string") {
      return fallback;
    }

    return /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
  }

  function getElementDescriptionStyle(
    element: CanvasElementRecord,
  ): DescriptionStyle {
    const rawStyle =
      typeof element.data?.descriptionStyle === "object" &&
      element.data?.descriptionStyle !== null
        ? (element.data.descriptionStyle as Record<string, unknown>)
        : {};

    return {
      fontWeight: rawStyle.fontWeight === "bold" ? "bold" : "normal",
      fontStyle: rawStyle.fontStyle === "italic" ? "italic" : "normal",
      textDecoration:
        rawStyle.textDecoration === "underline" ? "underline" : "none",
      textColor: normalizeHexColor(
        rawStyle.textColor,
        DEFAULT_DESCRIPTION_STYLE.textColor,
      ),
      boxColor: normalizeHexColor(
        rawStyle.boxColor,
        DEFAULT_DESCRIPTION_STYLE.boxColor,
      ),
    };
  }

  function hexToRgba(hex: string, alpha: number) {
    const normalized = normalizeHexColor(
      hex,
      DEFAULT_DESCRIPTION_STYLE.boxColor,
    );
    const red = Number.parseInt(normalized.slice(1, 3), 16);
    const green = Number.parseInt(normalized.slice(3, 5), 16);
    const blue = Number.parseInt(normalized.slice(5, 7), 16);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  }

  async function hydrateElementRow(row: CanvasElementRecord) {
    const mediaHeight = Number(row.data?.mediaHeight ?? 0);
    const normalizedHeight =
      row.element_type !== "text" &&
      Number.isFinite(mediaHeight) &&
      mediaHeight > 0
        ? mediaHeight
        : row.height;

    if (row.element_type === "text") {
      return {
        ...row,
        height: normalizedHeight,
      } as CanvasElementRecord;
    }

    const storagePath =
      typeof row.data?.storagePath === "string" ? row.data.storagePath : "";
    const previewStoragePath =
      typeof row.data?.previewStoragePath === "string"
        ? row.data.previewStoragePath
        : "";

    let src: string | null = null;
    let previewSrc: string | null = null;

    if (row.element_type === "audio" && storagePath) {
      try {
        src = await createSignedMediaUrl(storagePath, {
          cacheNonce: row.updated_at,
        });
      } catch {
        src = null;
      }
    }

    if (isOpenableMediaType(row.element_type)) {
      if (previewStoragePath) {
        try {
          previewSrc = await createSignedMediaUrl(previewStoragePath, {
            cacheNonce: row.updated_at,
          });
        } catch {
          previewSrc = null;
        }
      }

      if (!previewSrc && row.element_type === "image" && storagePath) {
        try {
          previewSrc = await createSignedMediaUrl(storagePath, {
            transform: getImagePreviewTransform(row.width, normalizedHeight),
            cacheNonce: row.updated_at,
          });
        } catch {
          previewSrc = null;
        }
      }
    }

    return {
      ...row,
      height: normalizedHeight,
      data: {
        ...row.data,
        src,
        previewSrc,
      },
    } as CanvasElementRecord;
  }

  async function saveSelectedDescription(
    nextStyleOverride?: Partial<DescriptionStyle>,
  ) {
    if (!selectedId || isTempElement(selectedId)) {
      return;
    }

    const selectedElement = elements.find(
      (element) => element.id === selectedId,
    );
    if (!selectedElement) {
      return;
    }

    const currentDescription = getElementDescription(selectedElement);
    const currentStyle = getElementDescriptionStyle(selectedElement);
    const normalizedDraft = descriptionDraft.trim();
    const normalizedCurrent = currentDescription.trim();
    const nextStyle = {
      ...descriptionStyleDraft,
      ...(nextStyleOverride ?? {}),
    };

    const styleUnchanged =
      currentStyle.fontWeight === nextStyle.fontWeight &&
      currentStyle.fontStyle === nextStyle.fontStyle &&
      currentStyle.textDecoration === nextStyle.textDecoration &&
      currentStyle.textColor === nextStyle.textColor &&
      currentStyle.boxColor === nextStyle.boxColor;

    if (normalizedDraft === normalizedCurrent && styleUnchanged) {
      if (descriptionDraft !== currentDescription) {
        setDescriptionDraft(currentDescription);
      }
      return;
    }

    const updatedData = {
      ...selectedElement.data,
      description: normalizedDraft,
      descriptionStyle: nextStyle,
    };

    setIsSavingDescription(true);

    try {
      await updateSingleRow<CanvasElementRecord>(
        "canvas_elements",
        { data: updatedData },
        [{ column: "id", op: "eq", value: selectedElement.id }],
      );

      setElements((previous) =>
        previous.map((element) => {
          if (element.id !== selectedElement.id) {
            return element;
          }

          return {
            ...element,
            data: updatedData,
          };
        }),
      );
      setDescriptionDraft(normalizedDraft);
      setDescriptionStyleDraft(nextStyle);
    } catch (descriptionError) {
      const message =
        descriptionError instanceof Error
          ? descriptionError.message
          : "Could not save description";
      setError(message);
    } finally {
      setIsSavingDescription(false);
    }
  }

  useEffect(() => {
    if (!selectedId) {
      setDescriptionDraft("");
      setDescriptionStyleDraft(DEFAULT_DESCRIPTION_STYLE);
      return;
    }

    const selectedElement = elements.find(
      (element) => element.id === selectedId,
    );
    if (!selectedElement) {
      setDescriptionDraft("");
      setDescriptionStyleDraft(DEFAULT_DESCRIPTION_STYLE);
      return;
    }

    setDescriptionDraft(getElementDescription(selectedElement));
    setDescriptionStyleDraft(getElementDescriptionStyle(selectedElement));
  }, [selectedId, elements]);

  useEffect(() => {
    if (!activeCanvasId) {
      setElements([]);
      setAttachments([]);
      setSelectedId(null);
      setSelectedAttachmentId(null);
      setMediaViewer(null);
      return;
    }

    async function loadCanvas() {
      const [elementRows, attachmentRows] = await Promise.all([
        selectRows<CanvasElementRecord>("canvas_elements", {
          filters: [
            { column: "canvas_id", op: "eq", value: activeCanvasId },
            { column: "deleted_at", op: "is", value: null },
          ],
          order: "z_index.asc",
        }),
        selectRows<ElementAttachmentRecord>("element_attachments", {
          filters: [
            { column: "canvas_id", op: "eq", value: activeCanvasId },
            { column: "deleted_at", op: "is", value: null },
          ],
        }),
      ]);

      const hydratedRows = await Promise.all(
        elementRows.map((row) => hydrateElementRow(row)),
      );

      setElements(hydratedRows);
      setAttachments(attachmentRows);
      setSelectedId(null);
      setSelectedAttachmentId(null);
      setMode("move");
      setMediaViewer(null);

      const maxCoordinate = hydratedRows.reduce(
        (accumulator, current) =>
          Math.max(
            accumulator,
            current.x + current.width,
            current.y + current.height,
          ),
        0,
      );

      setWorldSize((previousWorldSize) =>
        maxCoordinate > previousWorldSize - 800
          ? maxCoordinate + 2000
          : previousWorldSize,
      );

      requestAnimationFrame(() => {
        focusRows(hydratedRows);
      });
    }

    loadCanvas().catch((loadError) => {
      const message =
        loadError instanceof Error
          ? loadError.message
          : "Could not load canvas";
      setError(message);
    });
  }, [activeCanvasId]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    // Center the world on the viewport on initial mount.
    const initialPanX = viewport.clientWidth / 2 - worldSize / 2;
    const initialPanY = viewport.clientHeight / 2 - worldSize / 2;
    panXRef.current = initialPanX;
    panYRef.current = initialPanY;
    setPanX(initialPanX);
    setPanY(initialPanY);
    // Only auto-center once on initial mount.
  }, []);

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      if (gestureActiveRef.current || pointerPinchActiveRef.current) {
        return;
      }

      if (!dragState || mode !== "move") {
        return;
      }

      const deltaX =
        (event.clientX - dragState.pointerStartX) / zoomRef.current;
      const deltaY =
        (event.clientY - dragState.pointerStartY) / zoomRef.current;

      setElements((previous) =>
        previous.map((element) => {
          if (element.id !== dragState.id) {
            return element;
          }

          return {
            ...element,
            x: Math.max(0, dragState.originX + deltaX),
            y: Math.max(0, dragState.originY + deltaY),
          };
        }),
      );
    }

    async function handlePointerUp() {
      if (!dragState) {
        return;
      }

      const movedElement = elements.find(
        (element) => element.id === dragState.id,
      );
      setDragState(null);

      if (!movedElement || isTempElement(movedElement.id)) {
        return;
      }

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
  }, [dragState, elements, mode, zoom]);

  useEffect(() => {
    function handleViewportPanMove(event: PointerEvent) {
      if (gestureActiveRef.current || pointerPinchActiveRef.current) {
        return;
      }

      if (!panState) {
        return;
      }

      const deltaX = event.clientX - panState.pointerStartX;
      const deltaY = event.clientY - panState.pointerStartY;

      if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
        panMovedRef.current = true;
      }

      const nextPanX = panState.startPanX + deltaX;
      const nextPanY = panState.startPanY + deltaY;
      panXRef.current = nextPanX;
      panYRef.current = nextPanY;
      setPanX(nextPanX);
      setPanY(nextPanY);
    }

    function handleViewportPanEnd() {
      if (!panState) {
        return;
      }

      setPanState(null);
      requestAnimationFrame(() => {
        panMovedRef.current = false;
      });
    }

    window.addEventListener("pointermove", handleViewportPanMove);
    window.addEventListener("pointerup", handleViewportPanEnd);
    window.addEventListener("pointercancel", handleViewportPanEnd);
    return () => {
      window.removeEventListener("pointermove", handleViewportPanMove);
      window.removeEventListener("pointerup", handleViewportPanEnd);
      window.removeEventListener("pointercancel", handleViewportPanEnd);
    };
  }, [panState]);

  useEffect(() => {
    // GestureEvent is Safari-only. On other platforms we fall back to pointer
    // distance calculations in the next effect.
    const supportsGestureEvents = "ongesturestart" in window;
    if (!supportsGestureEvents) {
      return;
    }

    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    let gestureState: {
      startZoom: number;
      anchorWorldX: number;
      anchorWorldY: number;
      anchorViewportX: number;
      anchorViewportY: number;
    } | null = null;

    const onGestureStart = (event: Event) => {
      if (pointerPinchActiveRef.current) {
        return;
      }

      const gestureEvent = event as GestureLikeEvent;
      event.preventDefault();
      gestureActiveRef.current = true;
      suppressWheelUntilRef.current = performance.now() + 200;
      setPanState(null);
      setDragState(null);

      // Anchor at the gesture's clientX/Y (midpoint of the two fingers on Safari).
      const rect = viewport.getBoundingClientRect();
      const anchorViewportX = gestureEvent.clientX - rect.left;
      const anchorViewportY = gestureEvent.clientY - rect.top;
      const anchorWorldX =
        (anchorViewportX - panXRef.current) / zoomRef.current;
      const anchorWorldY =
        (anchorViewportY - panYRef.current) / zoomRef.current;

      gestureState = {
        startZoom: zoomRef.current,
        anchorWorldX,
        anchorWorldY,
        anchorViewportX,
        anchorViewportY,
      };
    };

    const onGestureChange = (event: Event) => {
      if (!gestureState) {
        return;
      }

      if (pointerPinchActiveRef.current) {
        return;
      }

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
    };

    viewport.addEventListener("gesturestart", onGestureStart, {
      passive: false,
    });
    viewport.addEventListener("gesturechange", onGestureChange, {
      passive: false,
    });
    viewport.addEventListener("gestureend", onGestureEnd, {
      passive: false,
    });

    return () => {
      gestureActiveRef.current = false;
      viewport.removeEventListener("gesturestart", onGestureStart);
      viewport.removeEventListener("gesturechange", onGestureChange);
      viewport.removeEventListener("gestureend", onGestureEnd);
    };
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    const pointers = new Map<number, { x: number; y: number }>();
    let previousDistance: number | null = null;
    // World point anchored at the pinch midpoint at the start of each pinch gesture.
    let pinchAnchorWorldX = 0;
    let pinchAnchorWorldY = 0;
    let pinchAnchorViewportX = 0;
    let pinchAnchorViewportY = 0;

    const getTwoPointers = () => {
      const values = Array.from(pointers.values());
      if (values.length < 2) {
        return null;
      }

      return [values[0], values[1]] as const;
    };

    const resetPinch = () => {
      previousDistance = null;
    };

    const updatePointer = (event: PointerEvent) => {
      if (event.pointerType !== "touch") {
        return;
      }

      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    };

    const removePointer = (event: PointerEvent) => {
      if (event.pointerType !== "touch") {
        return;
      }

      pointers.delete(event.pointerId);
      if (pointers.size < 2) {
        resetPinch();
        pointerPinchActiveRef.current = false;
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      updatePointer(event);
      if (pointers.size >= 2) {
        pointerPinchActiveRef.current = true;
        setPanState(null);
        setDragState(null);
        // Capture the pinch anchor at the midpoint of the two fingers.
        const pair = getTwoPointers();
        if (pair) {
          const [first, second] = pair;
          const rect = viewport.getBoundingClientRect();
          pinchAnchorViewportX = (first.x + second.x) / 2 - rect.left;
          pinchAnchorViewportY = (first.y + second.y) / 2 - rect.top;
          pinchAnchorWorldX =
            (pinchAnchorViewportX - panXRef.current) / zoomRef.current;
          pinchAnchorWorldY =
            (pinchAnchorViewportY - panYRef.current) / zoomRef.current;
        }
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      updatePointer(event);

      const pair = getTwoPointers();
      if (!pair) {
        return;
      }

      const [first, second] = pair;
      const distance = Math.hypot(second.x - first.x, second.y - first.y);
      if (distance < 1) {
        return;
      }

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
    viewport.addEventListener("pointermove", onPointerMove, {
      passive: false,
    });
    viewport.addEventListener("pointerup", onPointerUpLike, { passive: true });
    viewport.addEventListener("pointercancel", onPointerUpLike, {
      passive: true,
    });
    viewport.addEventListener("pointerleave", onPointerUpLike, {
      passive: true,
    });

    return () => {
      pointerPinchActiveRef.current = false;
      viewport.removeEventListener("pointerdown", onPointerDown);
      viewport.removeEventListener("pointermove", onPointerMove);
      viewport.removeEventListener("pointerup", onPointerUpLike);
      viewport.removeEventListener("pointercancel", onPointerUpLike);
      viewport.removeEventListener("pointerleave", onPointerUpLike);
    };
  }, []);

  useEffect(() => {
    if (!mediaViewer) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMediaViewer(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [mediaViewer]);

  function getElementCenter(element: CanvasElementRecord) {
    return {
      x: element.x + element.width / 2,
      y: element.y + element.height / 2,
    };
  }

  function hashSeed(value: string) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function createSeededRandom(seed: number) {
    let state = seed || 1;
    return () => {
      state = Math.imul(state ^ (state >>> 15), 1 | state);
      state ^= state + Math.imul(state ^ (state >>> 7), 61 | state);
      return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
    };
  }

  function buildSmoothPath(points: Array<{ x: number; y: number }>) {
    if (points.length < 2) {
      return "";
    }

    let d = `M ${points[0].x} ${points[0].y}`;

    for (let i = 1; i < points.length - 1; i += 1) {
      const current = points[i];
      const next = points[i + 1];
      const midX = (current.x + next.x) / 2;
      const midY = (current.y + next.y) / 2;
      d += ` Q ${current.x} ${current.y} ${midX} ${midY}`;
    }

    const prev = points[points.length - 2];
    const last = points[points.length - 1];
    d += ` Q ${prev.x} ${prev.y} ${last.x} ${last.y}`;

    return d;
  }

  function getAttachmentPath(
    from: { x: number; y: number },
    to: { x: number; y: number },
    seed: string,
    intensity = 1,
    phaseShift = 0,
  ) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.hypot(dx, dy);

    if (distance < 1) {
      return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
    }

    const normalX = -dy / distance;
    const normalY = dx / distance;
    const random = createSeededRandom(
      hashSeed(`${seed}:${intensity}:${phaseShift}`),
    );
    const segmentCount = Math.max(7, Math.min(16, Math.round(distance / 65)));
    const baseAmplitude =
      Math.max(12, Math.min(42, distance * 0.075)) * intensity;

    // Catenary sag — rope droops downward under its own weight.
    // Scale with horizontal span so nearly-vertical ropes sag less.
    const horizontalWeight = Math.abs(dx) / Math.max(1, distance);
    const catSag =
      Math.min(70, distance * 0.09 + 14) * horizontalWeight * intensity;

    const points: Array<{ x: number; y: number }> = [];
    for (let i = 0; i <= segmentCount; i += 1) {
      const t = i / segmentCount;
      const jitter = (random() - 0.5) * 2;
      const slowWave = Math.sin((t + phaseShift) * Math.PI * 1.8);
      const midWave = Math.sin((t * 2.8 + phaseShift * 0.7) * Math.PI);
      const profile = Math.sin(Math.PI * t);
      const offset =
        (slowWave * 0.65 + midWave * 0.25 + jitter * 0.1) *
        baseAmplitude *
        profile;

      // Gravity pulls the midpoint downward; ends are pinned.
      const sag = catSag * profile;

      points.push({
        x: from.x + dx * t + normalX * offset,
        y: from.y + dy * t + normalY * offset + sag,
      });
    }

    return buildSmoothPath(points);
  }

  function getImageDimensions(file: File) {
    return new Promise<{ width: number; height: number }>((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const image = new Image();

      image.onload = () => {
        resolve({ width: image.naturalWidth, height: image.naturalHeight });
        URL.revokeObjectURL(objectUrl);
      };

      image.onerror = () => {
        reject(new Error("Could not read image dimensions"));
        URL.revokeObjectURL(objectUrl);
      };

      image.src = objectUrl;
    });
  }

  function getVideoDimensions(file: File) {
    return new Promise<{ width: number; height: number }>((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const video = document.createElement("video");
      video.preload = "metadata";

      video.onloadedmetadata = () => {
        resolve({ width: video.videoWidth, height: video.videoHeight });
        URL.revokeObjectURL(objectUrl);
      };

      video.onerror = () => {
        reject(new Error("Could not read video dimensions"));
        URL.revokeObjectURL(objectUrl);
      };

      video.src = objectUrl;
    });
  }

  async function createElement(
    elementType: Extract<ElementType, "image" | "audio" | "video">,
  ) {
    if (!activeCanvasId) {
      setError("Create a canvas first.");
      setIsCreateDialogOpen(true);
      return;
    }

    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    if (elementType === "image") {
      imageInputRef.current?.click();
      return;
    }

    if (elementType === "audio") {
      audioInputRef.current?.click();
      return;
    }

    videoInputRef.current?.click();
  }

  async function persistMediaElement(
    file: File | null,
    elementType: Extract<ElementType, "image" | "audio" | "video">,
    preferredPosition?: { x: number; y: number },
  ) {
    if (!file || !activeCanvasId) {
      return;
    }

    const canvasId = activeCanvasId;
    const localObjectUrl = trackTemporaryUrl(URL.createObjectURL(file));
    let previewAsset: GeneratedPreviewAsset | null = null;

    if (elementType === "image") {
      try {
        previewAsset = await createImagePreviewAsset(file);
      } catch {
        previewAsset = null;
      }
    }

    if (elementType === "video") {
      try {
        previewAsset = await createVideoPreviewAsset(file);
      } catch {
        previewAsset = null;
      }
    }

    // --- compute display dimensions (all local, no network yet) ---
    let mediaWidth = 360;
    let mediaHeight = 220;

    if (elementType === "audio") {
      mediaWidth = isMobileViewport ? 340 : 420;
      mediaHeight = 92;
    }

    if (elementType === "image") {
      try {
        const dimensions = previewAsset
          ? {
              width: previewAsset.sourceWidth,
              height: previewAsset.sourceHeight,
            }
          : await getImageDimensions(file);
        const maxWidth = isMobileViewport ? 320 : 520;
        const maxHeight = isMobileViewport ? 360 : 520;
        const fitted = fitMediaDimensions(
          dimensions.width,
          dimensions.height,
          maxWidth,
          maxHeight,
        );
        mediaWidth = fitted.width;
        mediaHeight = fitted.height;
      } catch {
        mediaWidth = 360;
        mediaHeight = 220;
      }
    }

    if (elementType === "video") {
      try {
        const dimensions = previewAsset
          ? {
              width: previewAsset.sourceWidth,
              height: previewAsset.sourceHeight,
            }
          : await getVideoDimensions(file);
        const maxWidth = isMobileViewport ? 320 : 560;
        const maxHeight = isMobileViewport ? 360 : 520;
        const fitted = fitMediaDimensions(
          dimensions.width,
          dimensions.height,
          maxWidth,
          maxHeight,
        );
        mediaWidth = fitted.width;
        mediaHeight = fitted.height;
      } catch {
        mediaWidth = 380;
        mediaHeight = 220;
      }
    }

    const width = mediaWidth;
    const height = mediaHeight;

    const viewport = viewportRef.current;
    const x = Math.max(
      0,
      preferredPosition?.x ??
        (viewport ? viewport.clientWidth / 2 - panXRef.current : 0) /
          zoomRef.current -
          width / 2,
    );
    const y = Math.max(
      0,
      preferredPosition?.y ??
        (viewport ? viewport.clientHeight / 2 - panYRef.current : 0) /
          zoomRef.current -
          height / 2,
    );

    // --- optimistically place the element using local blob URLs ---
    const tempId = `temp-${crypto.randomUUID()}`;
    const localPreviewSrc =
      previewAsset && elementType !== "audio"
        ? trackTemporaryUrl(URL.createObjectURL(previewAsset.blob))
        : elementType === "audio"
          ? null
          : localObjectUrl;

    const tempElement: CanvasElementRecord = {
      id: tempId,
      canvas_id: canvasId,
      user_id: userId,
      element_type: elementType,
      x,
      y,
      width,
      height,
      rotation: 0,
      z_index: 0,
      data: {
        mimeType: file.type,
        fileName: file.name,
        mediaHeight,
        src: elementType === "audio" ? localObjectUrl : null,
        previewSrc: localPreviewSrc,
        fullSrc: elementType === "audio" ? null : localObjectUrl,
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
    };

    setElements((previous) => [...previous, tempElement]);
    setSelectedId(tempId);
    setWorldSize((previousWorldSize) =>
      Math.max(previousWorldSize, Math.max(x + width, y + height) + 2000),
    );

    // --- upload and persist in the background ---
    try {
      const ext = file.name.split(".").pop() ?? "bin";
      const path = `canvases/${canvasId}/media/${crypto.randomUUID()}.${ext}`;
      let previewStoragePath: string | null = previewAsset
        ? `canvases/${canvasId}/previews/${crypto.randomUUID()}.${previewAsset.extension}`
        : null;

      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, file, { contentType: file.type });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      if (previewAsset && previewStoragePath) {
        const { error: previewUploadError } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(previewStoragePath, previewAsset.blob, {
            contentType: previewAsset.contentType,
          });

        if (previewUploadError) {
          previewStoragePath = null;
        }
      }

      // media_assets is auxiliary tracking — failures are non-fatal
      let mediaAssetId: string | null = null;
      try {
        const mediaAsset = await insertRow<{ id: string }>("media_assets", {
          canvas_id: canvasId,
          storage_path: path,
          media_type: elementType,
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type,
        });
        mediaAssetId = mediaAsset.id;
      } catch {
        // non-fatal — storagePath in canvas_elements.data is the source of truth
      }

      let elementRow: CanvasElementRecord;
      try {
        elementRow = await insertRow<CanvasElementRecord>("canvas_elements", {
          canvas_id: canvasId,
          user_id: userId,
          element_type: elementType,
          x,
          y,
          width,
          height,
          data: {
            storagePath: path,
            previewStoragePath,
            ...(mediaAssetId ? { mediaAssetId } : {}),
            mimeType: file.type,
            fileName: file.name,
            mediaHeight,
          },
        });
      } catch (elementError) {
        throw new Error(
          elementError instanceof Error
            ? elementError.message
            : "Could not create media element",
        );
      }

      if (mediaAssetId) {
        try {
          await updateSingleRow("media_assets", { element_id: elementRow.id }, [
            { column: "id", op: "eq", value: mediaAssetId },
          ]);
        } catch {
          // non-fatal
        }
      }

      // Replace the temp element with the real DB record, keeping local blob URLs
      const finalElement: CanvasElementRecord = {
        ...elementRow,
        data: {
          ...elementRow.data,
          src: elementType === "audio" ? localObjectUrl : null,
          previewSrc: localPreviewSrc,
          fullSrc: elementType === "audio" ? null : localObjectUrl,
        },
      };

      setElements((previous) =>
        previous.map((el) => (el.id === tempId ? finalElement : el)),
      );
      setSelectedId((previous) =>
        previous === tempId ? finalElement.id : previous,
      );

      // Flush any attachments that were queued while this element was uploading
      const pending = pendingAttachmentsRef.current.filter(
        (p) => p.fromId === tempId || p.toId === tempId,
      );
      pendingAttachmentsRef.current = pendingAttachmentsRef.current.filter(
        (p) => p.fromId !== tempId && p.toId !== tempId,
      );
      for (const p of pending) {
        const fromId = p.fromId === tempId ? finalElement.id : p.fromId;
        const toId = p.toId === tempId ? finalElement.id : p.toId;
        if (isTempElement(fromId) || isTempElement(toId)) continue;
        try {
          const attachmentData = await insertRow<ElementAttachmentRecord>(
            "element_attachments",
            {
              canvas_id: p.canvasId,
              from_element_id: fromId,
              to_element_id: toId,
              style: { strokeColor: "#000000", strokeWidth: 2 },
            },
          );
          setAttachments((previous) => [...previous, attachmentData]);
        } catch {
          // silently skip — non-critical
        }
      }
    } catch (uploadError) {
      // Remove the temp element and surface the error
      setElements((previous) => previous.filter((el) => el.id !== tempId));
      setSelectedId((previous) => (previous === tempId ? null : previous));
      const message =
        uploadError instanceof Error
          ? uploadError.message
          : "Could not upload media";
      setError(message);
    }
  }

  async function handleMediaFile(
    file: File | null,
    elementType: Extract<ElementType, "image" | "audio" | "video">,
  ) {
    setMobileSheetOpen(false);

    if (!file) {
      return;
    }

    setError(null);
    await persistMediaElement(file, elementType);
  }

  async function openElementMedia(element: OpenableCanvasElementRecord) {
    const data = element.data ?? {};
    const fileName = String(data.fileName ?? element.element_type);
    const mimeType = String(data.mimeType ?? "");
    const cachedFullSrc =
      typeof data.fullSrc === "string" && data.fullSrc.length > 0
        ? data.fullSrc
        : null;

    setMediaViewer({
      elementId: element.id,
      elementType: element.element_type,
      fileName,
      mimeType,
      src: cachedFullSrc,
    });

    if (cachedFullSrc) {
      return;
    }

    const storagePath =
      typeof data.storagePath === "string" ? data.storagePath : "";

    if (!storagePath) {
      setMediaViewer(null);
      setError("This media is missing a storage path.");
      return;
    }

    setIsOpeningMedia(true);

    try {
      const fullSrc = await createSignedMediaUrl(storagePath, {
        cacheNonce: element.updated_at,
      });

      setElements((previous) =>
        previous.map((el) => {
          if (el.id !== element.id) {
            return el;
          }

          return {
            ...el,
            data: {
              ...el.data,
              fullSrc,
            },
          };
        }),
      );
      setMediaViewer({
        elementId: element.id,
        elementType: element.element_type,
        fileName,
        mimeType,
        src: fullSrc,
      });
    } catch (openError) {
      const message =
        openError instanceof Error ? openError.message : "Could not open media";
      setMediaViewer(null);
      setError(message);
    } finally {
      setIsOpeningMedia(false);
    }
  }

  async function openSelectedMedia() {
    if (!selectedMediaElement) {
      return;
    }
    await openElementMedia(selectedMediaElement);
  }

  async function createAttachment(targetElementId: string) {
    if (!activeCanvasId || !selectedId || selectedId === targetElementId) {
      return;
    }

    if (isTempElement(selectedId) || isTempElement(targetElementId)) {
      // Queue the attachment — will be created once the upload finishes
      pendingAttachmentsRef.current.push({
        fromId: selectedId,
        toId: targetElementId,
        canvasId: activeCanvasId,
      });
      setMode("move");
      return;
    }

    const duplicate = attachments.some((attachment) => {
      return (
        (attachment.from_element_id === selectedId &&
          attachment.to_element_id === targetElementId) ||
        (attachment.from_element_id === targetElementId &&
          attachment.to_element_id === selectedId)
      );
    });

    if (duplicate) {
      setMode("move");
      return;
    }

    try {
      const data = await insertRow<ElementAttachmentRecord>(
        "element_attachments",
        {
          canvas_id: activeCanvasId,
          from_element_id: selectedId,
          to_element_id: targetElementId,
          style: {
            strokeColor: "#000000",
            strokeWidth: 2,
          },
        },
      );

      setAttachments((previous) => [...previous, data]);
      setMode("move");
    } catch (insertError) {
      const message =
        insertError instanceof Error
          ? insertError.message
          : "Could not create attachment";
      setError(message);
    }
  }

  async function deleteAttachment(attachmentId: string) {
    try {
      await deleteRows("element_attachments", {
        filters: [{ column: "id", op: "eq", value: attachmentId }],
      });
    } catch (deleteError) {
      const message =
        deleteError instanceof Error
          ? deleteError.message
          : "Could not delete attachment";
      setError(message);
      return;
    }

    setAttachments((previous) =>
      previous.filter((attachment) => attachment.id !== attachmentId),
    );
    setSelectedAttachmentId((previous) =>
      previous === attachmentId ? null : previous,
    );
  }

  async function deleteSelectedElement() {
    if (!selectedId || isTempElement(selectedId)) {
      return;
    }
    const elementId = selectedId;

    try {
      await Promise.all([
        deleteRows("canvas_elements", {
          filters: [{ column: "id", op: "eq", value: elementId }],
        }),
        deleteRows("element_attachments", {
          orExpression: `(from_element_id.eq.${elementId},to_element_id.eq.${elementId})`,
        }),
      ]);
    } catch (deleteError) {
      const message =
        deleteError instanceof Error ? deleteError.message : "Could not delete";
      setError(message);
      return;
    }

    setElements((previous) =>
      previous.filter((element) => element.id !== elementId),
    );
    setAttachments((previous) =>
      previous.filter(
        (attachment) =>
          attachment.from_element_id !== elementId &&
          attachment.to_element_id !== elementId,
      ),
    );
    setSelectedId(null);
    setSelectedAttachmentId(null);
    setMode("move");
    setMediaViewer((previous) =>
      previous?.elementId === elementId ? null : previous,
    );
  }

  function setMoveMode() {
    setMode("move");
  }

  function setAttachMode() {
    setMode("attach");
  }

  function handleQuickAdd(action: string) {
    if (!action) {
      return;
    }

    if (action === "focus") {
      focusAllElements();
      return;
    }

    if (action === "create-canvas") {
      setIsCreateDialogOpen(true);
      setMobileSheetOpen(false);
      return;
    }

    if (action === "logout") {
      setIsLogoutDialogOpen(true);
      setMobileSheetOpen(false);
      return;
    }

    if (action === "mode-move") {
      setMoveMode();
      setMobileSheetOpen(false);
      return;
    }

    if (action === "mode-attach") {
      setAttachMode();
      setMobileSheetOpen(false);
      return;
    }

    if (action === "delete-selected") {
      if (selectedId) {
        setIsDeleteDialogOpen(true);
      }
      setMobileSheetOpen(false);
      return;
    }

    if (action === "image" || action === "audio" || action === "video") {
      void createElement(
        action as Extract<ElementType, "image" | "audio" | "video">,
      );
    }
  }

  function openMobileSheet(type: "add" | "menu") {
    setMobileSheetType(type);
    setMobileSheetOpen(true);
  }

  function cancelLongPressTimer() {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  function startElementLongPress(elementId: string) {
    if (!isMobileViewport) {
      return;
    }

    longPressTriggeredRef.current = false;
    cancelLongPressTimer();
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      setSelectedId(elementId);
    }, 420);
  }

  return (
    <main className="flex h-screen flex-col bg-zinc-100">
      <header className="border-b border-zinc-200 bg-white px-3 py-3 md:px-4">
        <div className="flex items-center gap-2">
          <p className="mr-1 font-serif text-xs tracking-[0.2em] text-zinc-500 md:mr-2 md:text-sm">
            STRING
          </p>

          {canvases.length > 1 ? (
            <select
              className="h-9 max-w-[180px] rounded-md border border-zinc-300 bg-white px-2 text-sm md:max-w-none md:px-3"
              value={activeCanvasId ?? ""}
              onChange={(event) => onSelectCanvas(event.target.value)}
            >
              {canvases.map((canvas) => (
                <option key={canvas.id} value={canvas.id}>
                  {canvas.title}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        <section
          ref={viewportRef}
          className={`canvas-viewport relative min-h-0 flex-1 overflow-hidden bg-zinc-50 ${
            (selectedId === null && mode === "move") || isSpacePanning
              ? panState
                ? "cursor-grabbing"
                : "cursor-grab"
              : ""
          }`}
          style={{
            touchAction: "none",
          }}
          onPointerDown={(event) => {
            const isPanShortcut =
              event.button === 1 || (event.button === 0 && isSpacePanning);

            if (!isPanShortcut && event.button !== 0) {
              return;
            }

            const target = event.target as HTMLElement;
            if (
              !isPanShortcut &&
              target.closest("[data-canvas-element='true']")
            ) {
              return;
            }

            const viewport = viewportRef.current;
            if (!viewport) {
              return;
            }

            event.preventDefault();

            panMovedRef.current = false;
            setPanState({
              pointerStartX: event.clientX,
              pointerStartY: event.clientY,
              startPanX: panXRef.current,
              startPanY: panYRef.current,
            });
          }}
          onWheel={(event) => {
            if (!event.ctrlKey && !event.metaKey) {
              return;
            }

            if (
              gestureActiveRef.current ||
              performance.now() < suppressWheelUntilRef.current
            ) {
              return;
            }

            event.preventDefault();
            const viewport = viewportRef.current;
            if (!viewport) {
              return;
            }

            // Anchor zoom at the cursor position so the world point under the
            // cursor stays fixed after the zoom step.
            const rect = viewport.getBoundingClientRect();
            const anchorViewportX = event.clientX - rect.left;
            const anchorViewportY = event.clientY - rect.top;
            const anchorWorldX =
              (anchorViewportX - panXRef.current) / zoomRef.current;
            const anchorWorldY =
              (anchorViewportY - panYRef.current) / zoomRef.current;

            // Normalize wheel units and apply exponential scaling for smoother zoom.
            const modeMultiplier =
              event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 240 : 1;
            const normalizedDelta = event.deltaY * modeMultiplier;
            if (Math.abs(normalizedDelta) < 0.2) {
              return;
            }
            const clampedDelta = Math.max(-240, Math.min(240, normalizedDelta));
            const zoomFactor = Math.exp(-clampedDelta * 0.0018);

            setZoomFromAnchorImmediate(
              zoomRef.current * zoomFactor,
              anchorWorldX,
              anchorWorldY,
              anchorViewportX,
              anchorViewportY,
            );
          }}
          onClick={() => {
            if (panMovedRef.current) {
              return;
            }

            if (mode !== "attach") {
              setSelectedId(null);
              setSelectedAttachmentId(null);
            }
          }}
        >
          {isMobileViewport ? (
            <div className="pointer-events-none absolute left-3 top-3 z-[5] rounded-full border border-zinc-300 bg-white/90 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-zinc-700 backdrop-blur">
              {mode === "move" ? "Move" : "Attach"}
            </div>
          ) : null}

          {mode === "attach" ? (
            <div className="pointer-events-none absolute right-3 top-3 z-[5] rounded-md border border-zinc-300 bg-white/90 px-3 py-1 text-[11px] font-medium text-zinc-700 backdrop-blur">
              Tap a string to delete it
            </div>
          ) : null}

          <div
            className="canvas-world relative"
            style={{
              width: `${worldSize}px`,
              height: `${worldSize}px`,
              transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
              transformOrigin: "top left",
              backgroundImage:
                "radial-gradient(circle at 1px 1px, rgba(0,0,0,0.12) 1px, transparent 0)",
              backgroundSize: "28px 28px",
            }}
          >
            <svg className="absolute inset-0 h-full w-full">
              <defs>
                <filter
                  id="stringShadow"
                  x="-50%"
                  y="-50%"
                  width="200%"
                  height="200%"
                >
                  <feDropShadow
                    dx="0"
                    dy="5"
                    stdDeviation="6"
                    floodColor="#000000"
                    floodOpacity="0.7"
                  />
                </filter>
                <pattern
                  id="ropeTexture"
                  x="0"
                  y="0"
                  width="14"
                  height="14"
                  patternUnits="userSpaceOnUse"
                  patternTransform="rotate(50)"
                >
                  {/* groove */}
                  <rect width="14" height="14" fill="#000000" />
                  {/* strand A */}
                  <rect x="1" y="0" width="5" height="14" fill="#2a2a2a" />
                  {/* strand A inner highlight */}
                  <rect x="1.8" y="0" width="1.5" height="14" fill="rgba(255,255,255,0.12)" />
                  {/* strand B */}
                  <rect x="8" y="0" width="5" height="14" fill="#2a2a2a" />
                  {/* strand B inner highlight */}
                  <rect x="8.8" y="0" width="1.5" height="14" fill="rgba(255,255,255,0.12)" />
                </pattern>
              </defs>
              {attachments.map((attachment) => {
                const from = elementMap.get(attachment.from_element_id);
                const to = elementMap.get(attachment.to_element_id);

                if (!from || !to) {
                  return null;
                }

                const fromPoint = getElementCenter(from);
                const toPoint = getElementCenter(to);
                const path = getAttachmentPath(
                  fromPoint,
                  toPoint,
                  attachment.id,
                );
                const isAttachmentSelected =
                  selectedAttachmentId === attachment.id;

                return (
                  <g key={attachment.id}>
                    {/* Drop shadow */}
                    <path
                      d={path}
                      fill="none"
                      stroke="#000000"
                      strokeWidth={26}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity={0.5}
                      filter="url(#stringShadow)"
                      vectorEffect="non-scaling-stroke"
                      className="pointer-events-none"
                    />
                    {/* Hit target */}
                    <path
                      d={path}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={28}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                      className="cursor-pointer"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedId(null);
                        setSelectedAttachmentId(attachment.id);
                      }}
                    />
                    {/* Cartoon bold black outline */}
                    <path
                      d={path}
                      fill="none"
                      stroke="#000000"
                      strokeWidth={20}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                      className="pointer-events-none"
                    />
                    {/* Diagonal strand pattern */}
                    <path
                      d={path}
                      fill="none"
                      stroke="url(#ropeTexture)"
                      strokeWidth={16}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                      className="pointer-events-none"
                    />
                    {/* Selection glow */}
                    {isAttachmentSelected && (
                      <path
                        d={path}
                        fill="none"
                        stroke="#ffe08a"
                        strokeWidth={22}
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

            {elements.map((element) => {
              const isSelected = selectedId === element.id;
              const isAttachTarget =
                mode === "attach" && selectedId && selectedId !== element.id;
              const data = element.data ?? {};
              const fileName = String(data.fileName ?? element.element_type);
              const mediaSrc = typeof data.src === "string" ? data.src : "";
              const previewSrc =
                typeof data.previewSrc === "string" ? data.previewSrc : "";
              const fullSrc =
                typeof data.fullSrc === "string" ? data.fullSrc : "";
              const description = getElementDescription(element);
              const descriptionStyle = getElementDescriptionStyle(element);

              return (
                <div
                  key={element.id}
                  className="absolute"
                  data-canvas-element="true"
                  style={{
                    left: `${element.x}px`,
                    top: `${element.y}px`,
                    width: `${element.width}px`,
                  }}
                >
                  <article
                    className={`overflow-hidden rounded-lg border bg-white ${
                      isSelected
                        ? "border-zinc-900 ring-2 ring-zinc-900/20"
                        : "border-zinc-200"
                    } ${isAttachTarget ? "cursor-cell border-emerald-500" : "cursor-pointer"}`}
                    style={{
                      height: `${element.height}px`,
                      boxShadow: isSelected
                        ? "0 10px 24px rgba(0,0,0,0.22), 0 2px 6px rgba(0,0,0,0.18)"
                        : "0 8px 18px rgba(0,0,0,0.16), 0 1px 4px rgba(0,0,0,0.1)",
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (longPressTriggeredRef.current) {
                        longPressTriggeredRef.current = false;
                        return;
                      }

                      if (mode === "attach" && selectedId) {
                        void createAttachment(element.id);
                        return;
                      }

                      setSelectedAttachmentId(null);
                      setSelectedId(element.id);
                      focusRows([element]);
                    }}
                    onPointerDown={(event) => {
                      if (mode === "move") {
                        startElementLongPress(element.id);
                      }

                      if (mode !== "move" || selectedId !== element.id) {
                        return;
                      }

                      event.preventDefault();
                      event.stopPropagation();
                      cancelLongPressTimer();
                      setDragState({
                        id: element.id,
                        pointerStartX: event.clientX,
                        pointerStartY: event.clientY,
                        originX: element.x,
                        originY: element.y,
                      });
                    }}
                    onPointerUp={() => {
                      cancelLongPressTimer();
                    }}
                    onPointerCancel={() => {
                      cancelLongPressTimer();
                    }}
                    onPointerLeave={() => {
                      cancelLongPressTimer();
                    }}
                  >
                    {element.element_type === "image" ? (
                      previewSrc ? (
                        <img
                          src={previewSrc}
                          alt={fileName}
                          loading="lazy"
                          decoding="async"
                          className="block h-full w-full bg-zinc-100 object-contain"
                        />
                      ) : (
                        <div className="grid h-full w-full place-items-center bg-zinc-100 px-4 text-center text-xs text-zinc-500">
                          Preview unavailable
                        </div>
                      )
                    ) : null}

                    {element.element_type === "audio" ? (
                      <div
                        className="grid w-full place-items-center p-3"
                        style={{
                          minHeight: `${Number(data.mediaHeight ?? 92)}px`,
                        }}
                      >
                        <audio
                          controls
                          src={mediaSrc}
                          className="h-16 w-full"
                        />
                      </div>
                    ) : null}

                    {element.element_type === "video" ? (
                      previewSrc ? (
                        <div className="relative h-full w-full bg-zinc-950">
                          <img
                            src={previewSrc}
                            alt={fileName}
                            loading="lazy"
                            decoding="async"
                            className="block h-full w-full object-contain"
                          />
                          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-black/10" />
                          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                            <div className="rounded-full bg-white/92 px-3 py-2 text-xs font-semibold text-zinc-900 shadow">
                              Open
                            </div>
                          </div>
                        </div>
                      ) : fullSrc ? (
                        <video
                          preload="metadata"
                          muted
                          playsInline
                          src={fullSrc}
                          className="block h-full w-full bg-zinc-950 object-contain"
                        />
                      ) : (
                        <div className="grid h-full w-full place-items-center gap-2 bg-zinc-950 px-4 text-center text-xs text-white/85">
                          <span className="rounded-full border border-white/20 px-2 py-1 text-[10px] uppercase tracking-[0.18em]">
                            Video
                          </span>
                          <span className="max-w-[20ch] truncate">
                            {fileName}
                          </span>
                        </div>
                      )
                    ) : null}
                  </article>
                  {description &&
                  element.element_type !== "image" &&
                  element.element_type !== "video" ? (
                    <div
                      className="mt-2 rounded-lg border px-3 py-2 text-xs leading-relaxed shadow-sm backdrop-blur-sm"
                      style={{
                        color: descriptionStyle.textColor,
                        fontWeight: descriptionStyle.fontWeight,
                        fontStyle: descriptionStyle.fontStyle,
                        textDecorationLine: descriptionStyle.textDecoration,
                        backgroundColor: hexToRgba(
                          descriptionStyle.boxColor,
                          0.65,
                        ),
                        borderColor: hexToRgba(descriptionStyle.boxColor, 0.9),
                      }}
                    >
                      {description}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {error ? (
        <div className="pointer-events-none fixed right-4 top-20 z-40 rounded-md bg-red-600/90 px-3 py-2 text-sm text-white shadow">
          {error}
        </div>
      ) : null}

      {mediaViewer ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setMediaViewer(null);
            }
          }}
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded-full border border-white/20 bg-white/10 px-3 py-2 text-sm text-white backdrop-blur"
            onClick={() => setMediaViewer(null)}
          >
            Close
          </button>

          <div
            className="flex max-h-full max-w-[min(94vw,1280px)] flex-col items-center gap-3"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="text-sm text-white/75">{mediaViewer.fileName}</div>
            {mediaViewer.src ? (
              mediaViewer.elementType === "image" ? (
                <img
                  src={mediaViewer.src}
                  alt={mediaViewer.fileName}
                  className="max-h-[85vh] max-w-full rounded-2xl bg-white shadow-2xl"
                />
              ) : (
                <video
                  src={mediaViewer.src}
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
            {(() => {
              const viewerElement = elements.find(
                (el) => el.id === mediaViewer.elementId,
              );
              const viewerDescription = viewerElement
                ? getElementDescription(viewerElement)
                : "";
              const viewerDescriptionStyle = viewerElement
                ? getElementDescriptionStyle(viewerElement)
                : DEFAULT_DESCRIPTION_STYLE;

              return viewerDescription ? (
                <div
                  className="w-full max-w-[min(94vw,1280px)] rounded-xl border px-4 py-3 text-sm leading-relaxed shadow"
                  style={{
                    color: viewerDescriptionStyle.textColor,
                    fontWeight: viewerDescriptionStyle.fontWeight,
                    fontStyle: viewerDescriptionStyle.fontStyle,
                    textDecorationLine: viewerDescriptionStyle.textDecoration,
                    backgroundColor: hexToRgba(
                      viewerDescriptionStyle.boxColor,
                      0.85,
                    ),
                    borderColor: hexToRgba(
                      viewerDescriptionStyle.boxColor,
                      0.9,
                    ),
                  }}
                >
                  {viewerDescription}
                </div>
              ) : null;
            })()}
          </div>
        </div>
      ) : null}

      <input
        ref={imageInputRef}
        type="file"
        className="hidden"
        accept="image/*"
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          void handleMediaFile(file, "image");
          event.currentTarget.value = "";
        }}
      />
      <input
        ref={audioInputRef}
        type="file"
        className="hidden"
        accept="audio/*"
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          void handleMediaFile(file, "audio");
          event.currentTarget.value = "";
        }}
      />
      <input
        ref={videoInputRef}
        type="file"
        className="hidden"
        accept="video/*"
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          void handleMediaFile(file, "video");
          event.currentTarget.value = "";
        }}
      />

      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete selected element?</AlertDialogTitle>
            <AlertDialogDescription>
              This element and its attachments will be removed from the canvas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                void deleteSelectedElement();
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={isLogoutDialogOpen}
        onOpenChange={setIsLogoutDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Logout now?</AlertDialogTitle>
            <AlertDialogDescription>
              You will be redirected to login and your current session ends.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                void onLogout();
              }}
            >
              Logout
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create canvas</AlertDialogTitle>
            <AlertDialogDescription>
              Choose a title for your new blank canvas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            placeholder="Canvas title"
            value={newCanvasTitle}
            onChange={(event) => setNewCanvasTitle(event.target.value)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                void onCreateCanvas(newCanvasTitle || "Untitled Canvas");
                setNewCanvasTitle("");
              }}
            >
              Create
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {isMobileViewport ? (
        <>
          <div
            className="fixed inset-0 z-20 bg-black/25"
            hidden={!mobileSheetOpen}
            onClick={() => setMobileSheetOpen(false)}
          />

          <div
            className={`${(selectedId || selectedAttachmentId) && !mobileSheetOpen ? "block" : "hidden"} fixed inset-x-3 z-50 rounded-xl border border-zinc-200 bg-white/95 p-2 shadow-xl backdrop-blur md:hidden`}
            style={{ bottom: "calc(env(safe-area-inset-bottom) + 82px)" }}
          >
            <div className="grid grid-cols-4 gap-2">
              <Button
                className="h-10"
                variant={mode === "move" ? "default" : "outline"}
                onClick={setMoveMode}
                disabled={!selectedId}
              >
                Move
              </Button>
              <Button
                className="h-10"
                variant={mode === "attach" ? "default" : "outline"}
                onClick={setAttachMode}
                disabled={!selectedId}
              >
                Attach
              </Button>
              <Button
                className="h-10"
                variant="outline"
                onClick={() => {
                  void openSelectedMedia();
                }}
                disabled={!canOpenSelectedMedia || isOpeningMedia}
              >
                {isOpeningMedia ? "..." : "Open"}
              </Button>
              <Button
                className="h-10"
                variant="destructive"
                onClick={() => {
                  if (selectedAttachmentId) {
                    void deleteAttachment(selectedAttachmentId);
                    return;
                  }

                  if (selectedId) {
                    setIsDeleteDialogOpen(true);
                  }
                }}
                disabled={!selectedId && !selectedAttachmentId}
              >
                {selectedAttachmentId ? "Del string" : "Delete"}
              </Button>
            </div>
            {selectedId ? (
              <div className="mt-2 space-y-2">
                <div className="flex items-center gap-2">
                  <Input
                    className="h-10"
                    value={descriptionDraft}
                    onChange={(event) =>
                      setDescriptionDraft(event.target.value)
                    }
                    onBlur={() => {
                      void saveSelectedDescription();
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void saveSelectedDescription();
                      }
                    }}
                    placeholder="Add description"
                    disabled={isSavingDescription}
                  />
                  <Button
                    className="h-10 px-3"
                    variant="outline"
                    disabled={isSavingDescription}
                    onClick={() => {
                      void saveSelectedDescription();
                    }}
                  >
                    {isSavingDescription ? "Saving..." : "Save"}
                  </Button>
                </div>
                <div className="grid grid-cols-[auto_auto_auto_auto_1fr] items-center gap-2">
                  <Button
                    className="h-10 px-3 font-bold"
                    variant={
                      descriptionStyleDraft.fontWeight === "bold"
                        ? "default"
                        : "outline"
                    }
                    disabled={isSavingDescription}
                    onClick={() => {
                      const nextWeight =
                        descriptionStyleDraft.fontWeight === "bold"
                          ? "normal"
                          : "bold";
                      setDescriptionStyleDraft((previous) => ({
                        ...previous,
                        fontWeight: nextWeight,
                      }));
                      void saveSelectedDescription({ fontWeight: nextWeight });
                    }}
                  >
                    B
                  </Button>
                  <Button
                    className="h-10 px-3 italic"
                    variant={
                      descriptionStyleDraft.fontStyle === "italic"
                        ? "default"
                        : "outline"
                    }
                    disabled={isSavingDescription}
                    onClick={() => {
                      const nextFontStyle =
                        descriptionStyleDraft.fontStyle === "italic"
                          ? "normal"
                          : "italic";
                      setDescriptionStyleDraft((previous) => ({
                        ...previous,
                        fontStyle: nextFontStyle,
                      }));
                      void saveSelectedDescription({
                        fontStyle: nextFontStyle,
                      });
                    }}
                  >
                    I
                  </Button>
                  <Button
                    className="h-10 px-3 underline"
                    variant={
                      descriptionStyleDraft.textDecoration === "underline"
                        ? "default"
                        : "outline"
                    }
                    disabled={isSavingDescription}
                    onClick={() => {
                      const nextDecoration =
                        descriptionStyleDraft.textDecoration === "underline"
                          ? "none"
                          : "underline";
                      setDescriptionStyleDraft((previous) => ({
                        ...previous,
                        textDecoration: nextDecoration,
                      }));
                      void saveSelectedDescription({
                        textDecoration: nextDecoration,
                      });
                    }}
                  >
                    U
                  </Button>
                  <Button
                    className="h-10 px-3"
                    variant="outline"
                    disabled={isSavingDescription}
                    onClick={() => {
                      setDescriptionStyleDraft((previous) => ({
                        ...previous,
                        fontWeight: "normal",
                        fontStyle: "normal",
                        textDecoration: "none",
                      }));
                      void saveSelectedDescription({
                        fontWeight: "normal",
                        fontStyle: "normal",
                        textDecoration: "none",
                      });
                    }}
                  >
                    N
                  </Button>
                  <div className="flex items-center justify-end gap-2">
                    <label className="flex items-center gap-1 text-[11px] text-zinc-600">
                      Text
                      <input
                        type="color"
                        value={descriptionStyleDraft.textColor}
                        disabled={isSavingDescription}
                        className="h-8 w-8 rounded border border-zinc-300 p-0"
                        onChange={(event) => {
                          const nextColor = event.target.value;
                          setDescriptionStyleDraft((previous) => ({
                            ...previous,
                            textColor: nextColor,
                          }));
                        }}
                        onBlur={(event) => {
                          void saveSelectedDescription({
                            textColor: event.target.value,
                          });
                        }}
                      />
                    </label>
                    <label className="flex items-center gap-1 text-[11px] text-zinc-600">
                      Box
                      <input
                        type="color"
                        value={descriptionStyleDraft.boxColor}
                        disabled={isSavingDescription}
                        className="h-8 w-8 rounded border border-zinc-300 p-0"
                        onChange={(event) => {
                          const nextColor = event.target.value;
                          setDescriptionStyleDraft((previous) => ({
                            ...previous,
                            boxColor: nextColor,
                          }));
                        }}
                        onBlur={(event) => {
                          void saveSelectedDescription({
                            boxColor: event.target.value,
                          });
                        }}
                      />
                    </label>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div
            className={`fixed inset-x-0 bottom-0 z-30 rounded-t-2xl border-t border-zinc-200 bg-white px-4 pb-6 pt-4 shadow-2xl transition-transform duration-200 ${
              mobileSheetOpen ? "translate-y-0" : "translate-y-full"
            }`}
          >
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-zinc-300" />

            {mobileSheetType === "add" ? (
              <div className="grid grid-cols-3 gap-2">
                <Button
                  className="h-12"
                  variant="outline"
                  onClick={() => handleQuickAdd("image")}
                >
                  Add photo
                </Button>
                <Button
                  className="h-12"
                  variant="outline"
                  onClick={() => handleQuickAdd("audio")}
                >
                  Add voice
                </Button>
                <Button
                  className="h-12"
                  variant="outline"
                  onClick={() => handleQuickAdd("video")}
                >
                  Add video
                </Button>
              </div>
            ) : null}

            {mobileSheetType === "menu" ? (
              <div className="grid grid-cols-1 gap-2">
                <Button
                  className="h-12"
                  variant="outline"
                  onClick={() => handleQuickAdd("focus")}
                >
                  Focus all elements
                </Button>
                <Button
                  className="h-12"
                  variant="outline"
                  onClick={() => handleQuickAdd("create-canvas")}
                >
                  Create new canvas
                </Button>
                <Button
                  className="h-12"
                  variant="ghost"
                  onClick={() => handleQuickAdd("logout")}
                >
                  Logout
                </Button>
              </div>
            ) : null}
          </div>

          <div
            className={`${mobileSheetOpen ? "hidden" : "block"} fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/95 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-2 backdrop-blur md:hidden`}
          >
            <div className="grid grid-cols-3 gap-2">
              <Button
                className="h-11"
                variant="outline"
                onClick={() => openMobileSheet("add")}
              >
                Add
              </Button>
              <Button
                className="h-11"
                variant={selectedId ? "default" : "outline"}
                onClick={() => {
                  setSelectedId(null);
                  setSelectedAttachmentId(null);
                  setMode("move");
                }}
              >
                Clear
              </Button>
              <Button
                className="h-11"
                variant="outline"
                onClick={focusAllElements}
              >
                Focus
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </main>
  );
}
