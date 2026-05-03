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

type CreateCanvasDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateCanvas: (title: string) => Promise<void>;
};

export function CreateCanvasDialog({
  open,
  onOpenChange,
  onCreateCanvas,
}: CreateCanvasDialogProps) {
  const [title, setTitle] = useState("");

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Create canvas</AlertDialogTitle>
          <AlertDialogDescription>
            Choose a title for your new blank canvas.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Input
          placeholder="Canvas title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              void onCreateCanvas(title || "Untitled Canvas");
              setTitle("");
            }}
          >
            Create
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
