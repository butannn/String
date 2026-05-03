import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DescriptionStyle, Mode } from "@/types/canvas";

type ElementPanelProps = {
  selectedId: string | null;
  selectedAttachmentId: string | null;
  mode: Mode;
  descriptionDraft: string;
  setDescriptionDraft: (value: string) => void;
  descriptionStyleDraft: DescriptionStyle;
  setDescriptionStyleDraft: React.Dispatch<React.SetStateAction<DescriptionStyle>>;
  isSavingDescription: boolean;
  onSaveDescription: (override?: Partial<DescriptionStyle>) => Promise<void>;
  onDeleteElement: () => void;
  onDeleteAttachment: () => void;
  onOpenMedia: () => void;
  canOpenMedia: boolean;
  isOpeningMedia: boolean;
  onSetMoveMode: () => void;
  onSetAttachMode: () => void;
};

export function ElementPanel({
  selectedId,
  selectedAttachmentId,
  mode,
  descriptionDraft,
  setDescriptionDraft,
  descriptionStyleDraft,
  setDescriptionStyleDraft,
  isSavingDescription,
  onSaveDescription,
  onDeleteElement,
  onDeleteAttachment,
  onOpenMedia,
  canOpenMedia,
  isOpeningMedia,
  onSetMoveMode,
  onSetAttachMode,
}: ElementPanelProps) {
  return (
    <>
      <div className="grid grid-cols-4 gap-2">
        <Button
          className="h-10"
          variant={mode === "move" ? "default" : "outline"}
          onClick={onSetMoveMode}
          disabled={!selectedId}
        >
          Move
        </Button>
        <Button
          className="h-10"
          variant={mode === "attach" ? "default" : "outline"}
          onClick={onSetAttachMode}
          disabled={!selectedId}
        >
          Attach
        </Button>
        <Button
          className="h-10"
          variant="outline"
          onClick={onOpenMedia}
          disabled={!canOpenMedia || isOpeningMedia}
        >
          {isOpeningMedia ? "..." : "Open"}
        </Button>
        <Button
          className="h-10"
          variant="destructive"
          onClick={() => {
            if (selectedAttachmentId) {
              onDeleteAttachment();
              return;
            }
            if (selectedId) onDeleteElement();
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
              onChange={(event) => setDescriptionDraft(event.target.value)}
              onBlur={() => void onSaveDescription()}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void onSaveDescription();
                }
              }}
              placeholder="Add description"
              disabled={isSavingDescription}
            />
            <Button
              className="h-10 px-3"
              variant="outline"
              disabled={isSavingDescription}
              onClick={() => void onSaveDescription()}
            >
              {isSavingDescription ? "Saving..." : "Save"}
            </Button>
          </div>

          <div className="grid grid-cols-[auto_auto_auto_auto_1fr] items-center gap-2">
            <Button
              className="h-10 px-3 font-bold"
              variant={descriptionStyleDraft.fontWeight === "bold" ? "default" : "outline"}
              disabled={isSavingDescription}
              onClick={() => {
                const nextWeight =
                  descriptionStyleDraft.fontWeight === "bold" ? "normal" : "bold";
                setDescriptionStyleDraft((prev) => ({ ...prev, fontWeight: nextWeight }));
                void onSaveDescription({ fontWeight: nextWeight });
              }}
            >
              B
            </Button>
            <Button
              className="h-10 px-3 italic"
              variant={descriptionStyleDraft.fontStyle === "italic" ? "default" : "outline"}
              disabled={isSavingDescription}
              onClick={() => {
                const nextFontStyle =
                  descriptionStyleDraft.fontStyle === "italic" ? "normal" : "italic";
                setDescriptionStyleDraft((prev) => ({ ...prev, fontStyle: nextFontStyle }));
                void onSaveDescription({ fontStyle: nextFontStyle });
              }}
            >
              I
            </Button>
            <Button
              className="h-10 px-3 underline"
              variant={descriptionStyleDraft.textDecoration === "underline" ? "default" : "outline"}
              disabled={isSavingDescription}
              onClick={() => {
                const nextDecoration =
                  descriptionStyleDraft.textDecoration === "underline" ? "none" : "underline";
                setDescriptionStyleDraft((prev) => ({ ...prev, textDecoration: nextDecoration }));
                void onSaveDescription({ textDecoration: nextDecoration });
              }}
            >
              U
            </Button>
            <Button
              className="h-10 px-3"
              variant="outline"
              disabled={isSavingDescription}
              onClick={() => {
                const reset = { fontWeight: "normal" as const, fontStyle: "normal" as const, textDecoration: "none" as const };
                setDescriptionStyleDraft((prev) => ({ ...prev, ...reset }));
                void onSaveDescription(reset);
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
                    setDescriptionStyleDraft((prev) => ({
                      ...prev,
                      textColor: event.target.value,
                    }));
                  }}
                  onBlur={(event) => {
                    void onSaveDescription({ textColor: event.target.value });
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
                    setDescriptionStyleDraft((prev) => ({
                      ...prev,
                      boxColor: event.target.value,
                    }));
                  }}
                  onBlur={(event) => {
                    void onSaveDescription({ boxColor: event.target.value });
                  }}
                />
              </label>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
