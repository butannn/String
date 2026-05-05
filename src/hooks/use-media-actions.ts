import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { insertRow, updateSingleRow } from "@/lib/data-api";
import { supabase } from "@/lib/supabase";
import {
  STORAGE_BUCKET,
  createCompressedImageAsset,
  createImagePreviewAsset,
  createSignedMediaUrl,
  createVideoPreviewAsset,
  fitMediaDimensions,
  getImageDimensions,
  getVideoDimensions,
} from "@/lib/media-utils";
import type {
  CanvasElementRecord,
  ElementAttachmentRecord,
  ElementType,
  MediaViewerState,
  OpenableCanvasElementRecord,
} from "@/types/canvas";

type UseMediaActionsOptions = {
  activeCanvasId: string | null;
  userId: string;
  isMobileViewport: boolean;
  viewportRef: RefObject<HTMLDivElement | null>;
  zoomRef: RefObject<number>;
  panXRef: RefObject<number>;
  panYRef: RefObject<number>;
  setElements: React.Dispatch<React.SetStateAction<CanvasElementRecord[]>>;
  setSelectedId: React.Dispatch<React.SetStateAction<string | null>>;
  flushPendingAttachments: (
    tempId: string,
    realId: string,
    canvasId: string,
  ) => Promise<void>;
  setAttachments: React.Dispatch<React.SetStateAction<ElementAttachmentRecord[]>>;
  setError: (message: string) => void;
  setIsCreateDialogOpen: (open: boolean) => void;
};

export function useMediaActions({
  activeCanvasId,
  userId,
  isMobileViewport,
  viewportRef,
  zoomRef,
  panXRef,
  panYRef,
  setElements,
  setSelectedId,
  flushPendingAttachments,
  setError,
  setIsCreateDialogOpen,
}: UseMediaActionsOptions) {
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const temporaryMediaUrlsRef = useRef(new Set<string>());

  const [isOpeningMedia, setIsOpeningMedia] = useState(false);
  const [mediaViewer, setMediaViewer] = useState<MediaViewerState | null>(null);

  // Cleanup blob URLs on unmount
  useEffect(() => {
    const temporaryMediaUrls = temporaryMediaUrlsRef.current;
    return () => {
      for (const url of temporaryMediaUrls) {
        URL.revokeObjectURL(url);
      }
      temporaryMediaUrls.clear();
    };
  }, []);

  // Escape key to close media viewer
  useEffect(() => {
    if (!mediaViewer) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMediaViewer(null);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mediaViewer]);

  function trackTemporaryUrl(url: string) {
    temporaryMediaUrlsRef.current.add(url);
    return url;
  }

  async function persistMediaElement(
    file: File,
    elementType: Extract<ElementType, "image" | "audio" | "video">,
    preferredPosition?: { x: number; y: number },
  ) {
    if (!activeCanvasId) return;

    const canvasId = activeCanvasId;
    const localObjectUrl = trackTemporaryUrl(URL.createObjectURL(file));

    let previewAsset = null;
    let compressedImageAsset = null;
    if (elementType === "image") {
      try { previewAsset = await createImagePreviewAsset(file); } catch { /* non-fatal */ }
      try { compressedImageAsset = await createCompressedImageAsset(file); } catch { /* non-fatal */ }
    }
    if (elementType === "video") {
      try { previewAsset = await createVideoPreviewAsset(file); } catch { /* non-fatal */ }
    }

    let mediaWidth = 360;
    let mediaHeight = 220;

    if (elementType === "audio") {
      mediaWidth = isMobileViewport ? 340 : 420;
      mediaHeight = 92;
    }

    if (elementType === "image") {
      try {
        const dimensions = previewAsset
          ? { width: previewAsset.sourceWidth, height: previewAsset.sourceHeight }
          : await getImageDimensions(file);
        const maxWidth = isMobileViewport ? 320 : 520;
        const maxHeight = isMobileViewport ? 360 : 520;
        const fitted = fitMediaDimensions(dimensions.width, dimensions.height, maxWidth, maxHeight);
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
          ? { width: previewAsset.sourceWidth, height: previewAsset.sourceHeight }
          : await getVideoDimensions(file);
        const maxWidth = isMobileViewport ? 320 : 560;
        const maxHeight = isMobileViewport ? 360 : 520;
        const fitted = fitMediaDimensions(dimensions.width, dimensions.height, maxWidth, maxHeight);
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
    const x =
      preferredPosition?.x ??
      (viewport ? (viewport.clientWidth / 2 - panXRef.current) / zoomRef.current - width / 2 : -width / 2);
    const y =
      preferredPosition?.y ??
      (viewport ? (viewport.clientHeight / 2 - panYRef.current) / zoomRef.current - height / 2 : -height / 2);

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

    try {
      const ext = file.name.split(".").pop() ?? "bin";
      const isCompressedUpload = elementType === "image" && compressedImageAsset !== null;
      const uploadBlob: File | Blob = isCompressedUpload ? compressedImageAsset!.blob : file;
      const uploadExt = isCompressedUpload ? compressedImageAsset!.extension : ext;
      const uploadContentType = isCompressedUpload ? compressedImageAsset!.contentType : file.type;
      const uploadMimeType = isCompressedUpload ? compressedImageAsset!.contentType : file.type;
      const uploadFileSize = isCompressedUpload ? compressedImageAsset!.blob.size : file.size;

      const path = `canvases/${canvasId}/media/${crypto.randomUUID()}.${uploadExt}`;
      let previewStoragePath: string | null = previewAsset
        ? `canvases/${canvasId}/previews/${crypto.randomUUID()}.${previewAsset.extension}`
        : null;

      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, uploadBlob, { contentType: uploadContentType });

      if (uploadError) throw new Error(uploadError.message);

      if (previewAsset && previewStoragePath) {
        const { error: previewUploadError } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(previewStoragePath, previewAsset.blob, {
            contentType: previewAsset.contentType,
          });
        if (previewUploadError) previewStoragePath = null;
      }

      let mediaAssetId: string | null = null;
      try {
        const mediaAsset = await insertRow<{ id: string }>("media_assets", {
          canvas_id: canvasId,
          storage_path: path,
          media_type: elementType,
          file_name: file.name,
          file_size: uploadFileSize,
          mime_type: uploadMimeType,
        });
        mediaAssetId = mediaAsset.id;
      } catch { /* non-fatal */ }

      const elementRow = await insertRow<CanvasElementRecord>(
        "canvas_elements",
        {
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
            mimeType: uploadMimeType,
            fileName: file.name,
            mediaHeight,
          },
        },
      );

      if (mediaAssetId) {
        try {
          await updateSingleRow("media_assets", { element_id: elementRow.id }, [
            { column: "id", op: "eq", value: mediaAssetId },
          ]);
        } catch { /* non-fatal */ }
      }

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

      await flushPendingAttachments(tempId, finalElement.id, canvasId);
    } catch (uploadError) {
      setElements((previous) => previous.filter((el) => el.id !== tempId));
      setSelectedId((previous) => (previous === tempId ? null : previous));
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Could not upload media",
      );
      throw uploadError;
    }
  }

  function createElement(
    elementType: Extract<ElementType, "image" | "audio" | "video">,
  ) {
    if (!activeCanvasId) {
      setError("Create a canvas first.");
      setIsCreateDialogOpen(true);
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

  async function handleMediaFile(
    file: File | null,
    elementType: Extract<ElementType, "image" | "audio" | "video">,
    closeMobileSheet?: () => void,
  ) {
    closeMobileSheet?.();
    if (!file) return;
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

    // If we already have the src cached, open immediately with animation
    if (cachedFullSrc) {
      setMediaViewer({
        elementId: element.id,
        elementType: element.element_type,
        fileName,
        mimeType,
        src: cachedFullSrc,
      });
      return;
    }

    // No cached src — fetch silently first, then open viewer so animation plays cleanly
    const storagePath =
      typeof data.storagePath === "string" ? data.storagePath : "";

    if (!storagePath) {
      setError("This media is missing a storage path.");
      return;
    }

    setIsOpeningMedia(true);
    try {
      const fullSrc = await createSignedMediaUrl(storagePath, {
        cacheNonce: element.updated_at,
      });

      // For images, wait until the browser has fully decoded it so the
      // open animation plays against an already-rendered frame (no jank).
      if (element.element_type === "image") {
        await new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => resolve();
          img.onerror = () => resolve(); // open anyway on error
          img.src = fullSrc;
        });
      }

      setElements((previous) =>
        previous.map((el) => {
          if (el.id !== element.id) return el;
          return { ...el, data: { ...el.data, fullSrc } };
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
      setError(
        openError instanceof Error ? openError.message : "Could not open media",
      );
    } finally {
      setIsOpeningMedia(false);
    }
  }

  async function openSelectedMedia(selectedMediaElement: OpenableCanvasElementRecord | null) {
    if (!selectedMediaElement) return;
    await openElementMedia(selectedMediaElement);
  }

  return {
    imageInputRef,
    audioInputRef,
    videoInputRef,
    isOpeningMedia,
    mediaViewer,
    setMediaViewer,
    createElement,
    handleMediaFile,
    openElementMedia,
    openSelectedMedia,
    persistMediaElement,
  };
}
