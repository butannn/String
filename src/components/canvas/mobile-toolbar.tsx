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
  return (
    <>
      {/* Sheet backdrop */}
      <div
        className="fixed inset-0 z-20 bg-black/25"
        hidden={!mobileSheetOpen}
        onClick={onCloseSheet}
      />

      {/* Selected element action bar */}
      {(selectedId || selectedAttachmentId) && !mobileSheetOpen ? (
        <div
          className="fixed inset-x-3 z-50 rounded-xl border border-zinc-200 bg-zinc-50/95 p-2 shadow-xl backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/95 md:hidden"
          style={{ bottom: "calc(env(safe-area-inset-bottom) + 82px)" }}
        >
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
      ) : null}

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

      {/* Fixed bottom bar */}
      {!mobileSheetOpen ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-zinc-50/95 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-2 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95 md:hidden">
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
      ) : null}
    </>
  );
}
