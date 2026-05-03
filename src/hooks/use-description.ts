import { useEffect, useState } from "react";
import { updateSingleRow } from "@/lib/data-api";
import {
  DEFAULT_DESCRIPTION_STYLE,
  type CanvasElementRecord,
  type DescriptionStyle,
} from "@/types/canvas";

export function getElementDescription(element: CanvasElementRecord) {
  const rawDescription = element.data?.description;
  return typeof rawDescription === "string" ? rawDescription : "";
}

export function getElementDescriptionStyle(
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
    textColor:
      typeof rawStyle.textColor === "string" &&
      /^#[0-9a-fA-F]{6}$/.test(rawStyle.textColor)
        ? rawStyle.textColor
        : DEFAULT_DESCRIPTION_STYLE.textColor,
    boxColor:
      typeof rawStyle.boxColor === "string" &&
      /^#[0-9a-fA-F]{6}$/.test(rawStyle.boxColor)
        ? rawStyle.boxColor
        : DEFAULT_DESCRIPTION_STYLE.boxColor,
  };
}

export function useDescription(
  selectedId: string | null,
  elements: CanvasElementRecord[],
  setElements: React.Dispatch<React.SetStateAction<CanvasElementRecord[]>>,
  setError: (message: string) => void,
) {
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [descriptionStyleDraft, setDescriptionStyleDraft] =
    useState<DescriptionStyle>(DEFAULT_DESCRIPTION_STYLE);
  const [isSavingDescription, setIsSavingDescription] = useState(false);

  // Sync draft when selection changes
  useEffect(() => {
    if (!selectedId) {
      setDescriptionDraft("");
      setDescriptionStyleDraft(DEFAULT_DESCRIPTION_STYLE);
      return;
    }

    const selectedElement = elements.find((el) => el.id === selectedId);
    if (!selectedElement) {
      setDescriptionDraft("");
      setDescriptionStyleDraft(DEFAULT_DESCRIPTION_STYLE);
      return;
    }

    setDescriptionDraft(getElementDescription(selectedElement));
    setDescriptionStyleDraft(getElementDescriptionStyle(selectedElement));
  }, [selectedId, elements]);

  async function saveSelectedDescription(
    nextStyleOverride?: Partial<DescriptionStyle>,
  ) {
    if (!selectedId || selectedId.startsWith("temp-")) return;

    const selectedElement = elements.find((el) => el.id === selectedId);
    if (!selectedElement) return;

    const currentDescription = getElementDescription(selectedElement);
    const currentStyle = getElementDescriptionStyle(selectedElement);
    const normalizedDraft = descriptionDraft.trim();
    const nextStyle = { ...descriptionStyleDraft, ...(nextStyleOverride ?? {}) };

    const styleUnchanged =
      currentStyle.fontWeight === nextStyle.fontWeight &&
      currentStyle.fontStyle === nextStyle.fontStyle &&
      currentStyle.textDecoration === nextStyle.textDecoration &&
      currentStyle.textColor === nextStyle.textColor &&
      currentStyle.boxColor === nextStyle.boxColor;

    if (normalizedDraft === currentDescription.trim() && styleUnchanged) {
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
        previous.map((el) => {
          if (el.id !== selectedElement.id) return el;
          return { ...el, data: updatedData };
        }),
      );
      setDescriptionDraft(normalizedDraft);
      setDescriptionStyleDraft(nextStyle);
    } catch (descriptionError) {
      setError(
        descriptionError instanceof Error
          ? descriptionError.message
          : "Could not save description",
      );
    } finally {
      setIsSavingDescription(false);
    }
  }

  return {
    descriptionDraft,
    setDescriptionDraft,
    descriptionStyleDraft,
    setDescriptionStyleDraft,
    isSavingDescription,
    saveSelectedDescription,
  };
}
