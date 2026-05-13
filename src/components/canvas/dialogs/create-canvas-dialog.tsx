import { useState } from "react";
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
import { Input } from "@/components/ui/input";

type CanvasType = "standard" | "uk_map";

type CreateCanvasDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateCanvas: (title: string, canvasType?: string) => Promise<void>;
};

export function CreateCanvasDialog({
  open,
  onOpenChange,
  onCreateCanvas,
}: CreateCanvasDialogProps) {
  const [title, setTitle] = useState("");
  const [canvasType, setCanvasType] = useState<CanvasType>("standard");

  function handleCreate() {
    void onCreateCanvas(title || "Untitled Canvas", canvasType);
    setTitle("");
    setCanvasType("standard");
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Create canvas</AlertDialogTitle>
          <AlertDialogDescription>
            Choose a title and type for your new canvas.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Input
          placeholder="Canvas title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") handleCreate();
          }}
        />
        {/* Canvas type selector */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            onClick={() => setCanvasType("standard")}
            className={`rounded-md border px-3 py-2.5 text-left text-sm transition-colors ${
              canvasType === "standard"
                ? "border-zinc-800 bg-zinc-900 text-white dark:border-zinc-300 dark:bg-zinc-100 dark:text-zinc-900"
                : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            }`}
          >
            <span className="block font-medium">Standard</span>
            <span className="block text-[11px] opacity-60">Free-form photo board</span>
          </button>
          <button
            type="button"
            onClick={() => setCanvasType("uk_map")}
            className={`rounded-md border px-3 py-2.5 text-left text-sm transition-colors ${
              canvasType === "uk_map"
                ? "border-zinc-800 bg-zinc-900 text-white dark:border-zinc-300 dark:bg-zinc-100 dark:text-zinc-900"
                : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            }`}
          >
            <span className="block font-medium">UK Map</span>
            <span className="block text-[11px] opacity-60">Pin photos to locations</span>
          </button>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleCreate}>
            Create
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
