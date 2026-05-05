import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogCancel,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserPlus, X, Users } from "lucide-react";
import type { CanvasMemberRecord, ProfileRecord } from "@/types/canvas";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canvasId: string | null;
  canvasTitle: string;
  currentUserId: string;
};

export function ShareCanvasDialog({
  open,
  onOpenChange,
  canvasId,
  canvasTitle,
  currentUserId,
}: Props) {
  const [members, setMembers] = useState<CanvasMemberRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResult, setSearchResult] = useState<ProfileRecord | null | "not-found">(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load current members whenever the dialog opens
  useEffect(() => {
    if (!open || !canvasId) {
      setMembers([]);
      setSearchQuery("");
      setSearchResult(null);
      setError(null);
      return;
    }

    void loadMembers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, canvasId]);

  async function loadMembers() {
    if (!canvasId) return;
    try {
      const { data, error: err } = await supabase
        .from("canvas_members")
        .select("*, profiles(id, username, created_at, updated_at)")
        .eq("canvas_id", canvasId)
        .order("created_at", { ascending: true });

      if (err) throw err;
      setMembers((data as CanvasMemberRecord[]) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load members");
    }
  }

  // Debounced username search
  useEffect(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      setSearchResult(null);
      return;
    }

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const { data, error: err } = await supabase
          .from("profiles")
          .select("id, username, created_at, updated_at")
          .eq("username", q)
          .maybeSingle();

        if (err) throw err;
        setSearchResult(data ? (data as ProfileRecord) : "not-found");
      } catch (e) {
        setSearchResult("not-found");
      } finally {
        setIsSearching(false);
      }
    }, 400);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchQuery]);

  async function handleAdd() {
    if (!canvasId || !searchResult || searchResult === "not-found") return;
    if (searchResult.id === currentUserId) {
      setError("You are already the owner of this canvas.");
      return;
    }
    if (members.some((m) => m.user_id === searchResult.id)) {
      setError("This user is already a member.");
      return;
    }

    setIsAdding(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from("canvas_members")
        .insert({
          canvas_id: canvasId,
          user_id: searchResult.id,
          role: "editor",
          invited_by: currentUserId,
        })
        .select("*, profiles(id, username, created_at, updated_at)")
        .single();

      if (err) throw err;
      setMembers((prev) => [...prev, data as CanvasMemberRecord]);
      setSearchQuery("");
      setSearchResult(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add member");
    } finally {
      setIsAdding(false);
    }
  }

  async function handleRemove(memberId: string) {
    setRemovingId(memberId);
    setError(null);
    try {
      const { error: err } = await supabase
        .from("canvas_members")
        .delete()
        .eq("id", memberId);

      if (err) throw err;
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove member");
    } finally {
      setRemovingId(null);
    }
  }

  const canAdd =
    searchResult !== null &&
    searchResult !== "not-found" &&
    !isAdding &&
    searchResult.id !== currentUserId &&
    !members.some((m) => m.user_id === (searchResult as ProfileRecord).id);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Users size={16} />
            Share "{canvasTitle}"
          </AlertDialogTitle>
        </AlertDialogHeader>

        <div className="space-y-4">
          {/* Add member */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Add by username
            </p>
            <div className="flex gap-2">
              <Input
                placeholder="username"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canAdd) void handleAdd();
                }}
                className="h-9 text-sm"
              />
              <Button
                variant="outline"
                className="h-9 shrink-0 px-3"
                disabled={!canAdd}
                onClick={() => void handleAdd()}
              >
                {isAdding ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
                ) : (
                  <UserPlus size={15} />
                )}
              </Button>
            </div>

            {/* Search feedback */}
            {isSearching && (
              <p className="text-xs text-zinc-400">Searching…</p>
            )}
            {!isSearching && searchQuery.trim() && searchResult === "not-found" && (
              <p className="text-xs text-red-500">No user found with that username.</p>
            )}
            {!isSearching && searchResult && searchResult !== "not-found" && (
              <p className="text-xs text-zinc-500">
                Found:{" "}
                <span className="font-medium text-zinc-700 dark:text-zinc-300">
                  {searchResult.username}
                </span>
                {members.some((m) => m.user_id === searchResult.id) && (
                  <span className="ml-1 text-zinc-400">(already added)</span>
                )}
                {searchResult.id === currentUserId && (
                  <span className="ml-1 text-zinc-400">(that's you)</span>
                )}
              </p>
            )}
          </div>

          {/* Member list */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Members with access
            </p>
            {members.length === 0 ? (
              <p className="text-xs text-zinc-400">
                No one else has access yet.
              </p>
            ) : (
              <ul className="space-y-1">
                {members.map((member) => (
                  <li
                    key={member.id}
                    className="flex items-center justify-between rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700"
                  >
                    <span className="font-medium text-zinc-700 dark:text-zinc-300">
                      {member.profiles?.username ?? member.user_id.slice(0, 8)}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-400">Editor</span>
                      <button
                        type="button"
                        aria-label="Remove member"
                        disabled={removingId === member.id}
                        onClick={() => void handleRemove(member.id)}
                        className="rounded p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-red-500 disabled:opacity-50 dark:hover:bg-zinc-800"
                      >
                        {removingId === member.id ? (
                          <span className="block h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
                        ) : (
                          <X size={14} />
                        )}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950/40 dark:text-red-400">
              {error}
            </p>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Done</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
