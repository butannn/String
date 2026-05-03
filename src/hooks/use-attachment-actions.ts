import { useRef } from "react";
import { deleteRows, insertRow } from "@/lib/data-api";
import type {
  ElementAttachmentRecord,
  Mode,
} from "@/types/canvas";

type PendingAttachment = {
  fromId: string;
  toId: string;
  canvasId: string;
};

export function useAttachmentActions(
  activeCanvasId: string | null,
  selectedId: string | null,
  attachments: ElementAttachmentRecord[],
  setAttachments: React.Dispatch<React.SetStateAction<ElementAttachmentRecord[]>>,
  setMode: (mode: Mode) => void,
  setSelectedAttachmentId: React.Dispatch<React.SetStateAction<string | null>>,
  setError: (message: string) => void,
) {
  const pendingAttachmentsRef = useRef<PendingAttachment[]>([]);

  async function createAttachment(targetElementId: string) {
    if (!activeCanvasId || !selectedId || selectedId === targetElementId) return;

    if (selectedId.startsWith("temp-") || targetElementId.startsWith("temp-")) {
      pendingAttachmentsRef.current.push({
        fromId: selectedId,
        toId: targetElementId,
        canvasId: activeCanvasId,
      });
      setMode("move");
      return;
    }

    const duplicate = attachments.some(
      (a) =>
        (a.from_element_id === selectedId && a.to_element_id === targetElementId) ||
        (a.from_element_id === targetElementId && a.to_element_id === selectedId),
    );

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
          style: { strokeColor: "#000000", strokeWidth: 2 },
        },
      );
      setAttachments((previous) => [...previous, data]);
      setMode("move");
    } catch (insertError) {
      setError(
        insertError instanceof Error
          ? insertError.message
          : "Could not create attachment",
      );
    }
  }

  async function deleteAttachment(attachmentId: string) {
    try {
      await deleteRows("element_attachments", {
        filters: [{ column: "id", op: "eq", value: attachmentId }],
      });
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Could not delete attachment",
      );
      return;
    }

    setAttachments((previous) =>
      previous.filter((a) => a.id !== attachmentId),
    );
    setSelectedAttachmentId((previous) =>
      previous === attachmentId ? null : previous,
    );
  }

  async function flushPendingAttachments(
    tempId: string,
    realId: string,
    canvasId: string,
  ) {
    const pending = pendingAttachmentsRef.current.filter(
      (p) => p.fromId === tempId || p.toId === tempId,
    );
    pendingAttachmentsRef.current = pendingAttachmentsRef.current.filter(
      (p) => p.fromId !== tempId && p.toId !== tempId,
    );

    for (const p of pending) {
      const fromId = p.fromId === tempId ? realId : p.fromId;
      const toId = p.toId === tempId ? realId : p.toId;
      if (fromId.startsWith("temp-") || toId.startsWith("temp-")) continue;

      try {
        const attachmentData = await insertRow<ElementAttachmentRecord>(
          "element_attachments",
          {
            canvas_id: canvasId,
            from_element_id: fromId,
            to_element_id: toId,
            style: { strokeColor: "#000000", strokeWidth: 2 },
          },
        );
        setAttachments((previous) => [...previous, attachmentData]);
      } catch {
        // non-critical — silently skip
      }
    }
  }

  // Delete all attachments for an element
  async function deleteElementAttachments(elementId: string) {
    await deleteRows("element_attachments", {
      orExpression: `(from_element_id.eq.${elementId},to_element_id.eq.${elementId})`,
    });
  }

  return {
    pendingAttachmentsRef,
    createAttachment,
    deleteAttachment,
    flushPendingAttachments,
    deleteElementAttachments,
  };
}
