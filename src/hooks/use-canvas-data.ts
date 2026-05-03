import { useEffect, useMemo, useRef, useState } from "react";
import { selectRows } from "@/lib/data-api";
import {
  createSignedMediaUrl,
  getImagePreviewTransform,
} from "@/lib/media-utils";
import type {
  CanvasElementRecord,
  ElementAttachmentRecord,
  OpenableCanvasElementRecord,
} from "@/types/canvas";
import { isOpenableMediaType } from "@/types/canvas";

async function hydrateElementRow(
  row: CanvasElementRecord,
): Promise<CanvasElementRecord> {
  const mediaHeight = Number(row.data?.mediaHeight ?? 0);
  const normalizedHeight =
    row.element_type !== "text" &&
    Number.isFinite(mediaHeight) &&
    mediaHeight > 0
      ? mediaHeight
      : row.height;

  if (row.element_type === "text") {
    return { ...row, height: normalizedHeight };
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
    data: { ...row.data, src, previewSrc },
  };
}

export function useCanvasData(
  activeCanvasId: string | null,
  focusRows: (rows: CanvasElementRecord[]) => void,
) {
  const [elements, setElements] = useState<CanvasElementRecord[]>([]);
  const [attachments, setAttachments] = useState<ElementAttachmentRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedAttachmentId, setSelectedAttachmentId] = useState<
    string | null
  >(null);

  // Keep a ref so the load effect only re-runs on activeCanvasId changes,
  // not on every render when focusRows gets a new reference.
  const focusRowsRef = useRef(focusRows);
  useEffect(() => {
    focusRowsRef.current = focusRows;
  });

  const elementMap = useMemo(
    () => new Map(elements.map((el) => [el.id, el])),
    [elements],
  );

  const selectedElement = useMemo(
    () => elements.find((el) => el.id === selectedId) ?? null,
    [elements, selectedId],
  );

  const selectedMediaElement = useMemo<OpenableCanvasElementRecord | null>(() => {
    if (!selectedElement || !isOpenableMediaType(selectedElement.element_type)) {
      return null;
    }
    return selectedElement as OpenableCanvasElementRecord;
  }, [selectedElement]);

  const canOpenSelectedMedia = selectedMediaElement !== null;

  useEffect(() => {
    if (!activeCanvasId) {
      setElements([]);
      setAttachments([]);
      setSelectedId(null);
      setSelectedAttachmentId(null);
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

      requestAnimationFrame(() => {
        focusRowsRef.current(hydratedRows);
      });

      return hydratedRows;
    }

    loadCanvas().catch(() => {
      // Errors will bubble up through the calling component
    });
  }, [activeCanvasId]);

  return {
    elements,
    setElements,
    attachments,
    setAttachments,
    selectedId,
    setSelectedId,
    selectedAttachmentId,
    setSelectedAttachmentId,
    elementMap,
    selectedElement,
    selectedMediaElement,
    canOpenSelectedMedia,
  };
}
