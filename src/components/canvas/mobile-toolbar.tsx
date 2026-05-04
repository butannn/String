import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ElementPanel } from "@/components/canvas/element-panel";
import type { DescriptionStyle, ElementType, Mode } from "@/types/canvas";

type MobileToolbarProps = {
  selectedId: string | null;
  selectedAttachmentId: string | null;
  mode: Mode;
  mobileSheetOpen: boolean;
  mobileSheetType: "add" | "menu";
  descriptionDraft: string;
  setDescriptionDraft: (value: string) => void;
  descriptionStyleDraft: DescriptionStyle;
  setDescriptionStyleDraft: React.Dispatch<React.SetStateAction<DescriptionStyle>>;
  isSavingDescription: boolean;
  onSaveDescription: (override?: Partial<DescriptionStyle>) => Promise<void>;
  onOpenSheet: (type: "add" | "menu") => void;
  onCloseSheet: () => void;
  onClearSelection: () => void;
  onFocusAll: () => void;
  onSetMoveMode: () => void;
  onSetAttachMode: () => void;
  onDeleteElement: () => void;
  onDeleteAttachment: () => void;
  onOpenMedia: () => void;
  canOpenMedia: boolean;
  isOpeningMedia: boolean;
  onAddMedia: (type: Extract<ElementType, "image" | "audio" | "video">) => void;
  onCreateCanvas: () => void;
  onLogout: () => void;
};

export function MobileToolbar({
  selectedId,
  selectedAttachmentId,
  mode,
  mobileSheetOpen,
  mobileSheetType,
  descriptionDraft,
  setDescriptionDraft,
  descriptionStyleDraft,
  setDescriptionStyleDraft,
  isSavingDescription,
  onSaveDescription,
  onOpenSheet,
  onCloseSheet,
  onClearSelection,
  onFocusAll,
  onSetMoveMode,
  onSetAttachMode,
  onDeleteElement,
  onDeleteAttachment,
  onOpenMedia,
  canOpenMedia,
  isOpeningMedia,
  onAddMedia,
  onCreateCanvas,
  onLogout,
}: MobileToolbarProps) {
  const dragStartYRef = useRef<number | null>(null);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const isDraggingRef = useRef(false);

  function handleHandlePointerDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStartYRef.current = e.clientY;
    isDraggingRef.current = false;
    setDragOffsetY(0);
  }

  function handleHandlePointerMove(e: React.PointerEvent) {
    if (dragStartYRef.current === null) return;
    const dy = e.clientY - dragStartYRef.current;
    if (dy > 0) {
      isDraggingRef.current = true;
      setDragOffsetY(dy);
    }
  }

  function handleHandlePointerUp() {
    if (isDraggingRef.current && dragOffsetY > 60) {
      onClearSelection();
    }
    dragStartYRef.current = null;
    isDraggingRef.current = false;
    setDragOffsetY(0);
  }

  const panelOpen = !!(selectedId || selectedAttachmentId) && !mobileSheetOpen && mode !== "attach";
  const panelTranslate = panelOpen ? dragOffsetY : 9999;

  return (
    <>
      {/* Sheet backdrop — only for add/menu sheets */}
      <div
        className="fixed inset-0 z-20 bg-black/25"
        hidden={!mobileSheetOpen}
        onClick={onCloseSheet}
      />

      {/* Selected element action bar — slides up from bottom like a sheet */}
      <div
        className="fixed inset-x-0 bottom-0 z-40 rounded-t-2xl border-t border-zinc-200 bg-zinc-50 px-4 pb-6 pt-12 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900 md:hidden"
        style={{
          transform: `translateY(${panelTranslate}px)`,
          transition: dragOffsetY > 0 ? "none" : "transform 0.2s",
        }}
      >
        <div
          className="absolute inset-x-0 top-0 flex h-10 cursor-grab touch-none items-center justify-center rounded-t-2xl active:cursor-grabbing"
          onPointerDown={handleHandlePointerDown}
          onPointerMove={handleHandlePointerMove}
          onPointerUp={handleHandlePointerUp}
          onPointerCancel={handleHandlePointerUp}
        >
          <div className="h-1.5 w-12 rounded-full bg-zinc-300 dark:bg-zinc-600" />
        </div>
        <ElementPanel
          selectedId={selectedId}
          selectedAttachmentId={selectedAttachmentId}
          mode={mode}
          descriptionDraft={descriptionDraft}
          setDescriptionDraft={setDescriptionDraft}
          descriptionStyleDraft={descriptionStyleDraft}
          setDescriptionStyleDraft={setDescriptionStyleDraft}
          isSavingDescription={isSavingDescription}
          onSaveDescription={onSaveDescription}
          onDeleteElement={onDeleteElement}
          onDeleteAttachment={onDeleteAttachment}
          onOpenMedia={onOpenMedia}
          canOpenMedia={canOpenMedia}
          isOpeningMedia={isOpeningMedia}
          onSetMoveMode={onSetMoveMode}
          onSetAttachMode={onSetAttachMode}
        />
      </div>

      {/* Slide-up sheet */}
      <div
        className={`fixed inset-x-0 bottom-0 z-30 rounded-t-2xl border-t border-zinc-200 bg-zinc-50 px-4 pb-6 pt-4 shadow-2xl transition-transform duration-200 dark:border-zinc-700 dark:bg-zinc-900 ${
          mobileSheetOpen ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-zinc-300 dark:bg-zinc-600" />

        {mobileSheetType === "add" ? (
          <div className="grid grid-cols-3 gap-2">
            <Button className="h-12" variant="outline" onClick={() => onAddMedia("image")}>
              Add photo
            </Button>
            <Button className="h-12" variant="outline" onClick={() => onAddMedia("audio")}>
              Add voice
            </Button>
            <Button className="h-12" variant="outline" onClick={() => onAddMedia("video")}>
              Add video
            </Button>
          </div>
        ) : null}

        {mobileSheetType === "menu" ? (
          <div className="grid grid-cols-1 gap-2">
            <Button className="h-12" variant="outline" onClick={onFocusAll}>
              Focus all elements
            </Button>
            <Button className="h-12" variant="outline" onClick={onCreateCanvas}>
              Create new canvas
            </Button>
            <Button className="h-12" variant="ghost" onClick={onLogout}>
              Logout
            </Button>
          </div>
        ) : null}
      </div>

      {/* Fixed bottom bar — hides when element panel or sheet is open */}
      <div
        className={`fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200 bg-zinc-50 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-2 transition-transform duration-200 dark:border-zinc-800 dark:bg-zinc-900 md:hidden ${
          !mobileSheetOpen && !selectedId && !selectedAttachmentId
            ? "translate-y-0"
            : "translate-y-full"
        }`}
      >
        <div className="grid grid-cols-3 gap-2">
            <Button
              className="h-11"
              variant="outline"
              onClick={() => onOpenSheet("add")}
            >
              Add
            </Button>
            <Button
              className="h-11"
              variant={selectedId ? "default" : "outline"}
              onClick={onClearSelection}
            >
              Clear
            </Button>
            <Button className="h-11" variant="outline" onClick={onFocusAll}>
              Focus
            </Button>
          </div>
      </div>
    </>
  );
}
