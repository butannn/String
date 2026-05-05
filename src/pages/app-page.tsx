import { Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { CanvasEditor } from "@/components/canvas/canvas-editor";
import { useAuth } from "@/context/auth-context";
import { insertRow, selectRows, updateSingleRow } from "@/lib/data-api";
import { supabase } from "@/lib/supabase";
import type { CanvasRecord } from "@/types/canvas";

function movePreferredCanvasFirst(
  rows: CanvasRecord[],
  preferredId: string | null,
) {
  if (!preferredId) {
    return rows;
  }

  const preferredCanvas = rows.find((canvas) => canvas.id === preferredId);
  if (!preferredCanvas) {
    return rows;
  }

  return [
    preferredCanvas,
    ...rows.filter((canvas) => canvas.id !== preferredId),
  ];
}

export function AppPage() {
  const auth = useAuth();
  const [canvases, setCanvases] = useState<CanvasRecord[]>([]);
  const [activeCanvasId, setActiveCanvasId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const restoringSelectionRef = useRef(false);

  const storageKey = useMemo(() => {
    return auth.user ? `string:lastCanvas:${auth.user.id}` : null;
  }, [auth.user]);

  useEffect(() => {
    if (!auth.user) {
      restoringSelectionRef.current = false;
      setCanvases([]);
      setActiveCanvasId(null);
      setLoading(false);
      return;
    }

    restoringSelectionRef.current = true;
    setLoading(true);

    async function loadAllCanvases() {
      const userId = auth.user!.id;

      // Fetch owned canvases and shared canvas IDs in parallel
      const [ownedRows, memberResult] = await Promise.all([
        selectRows<CanvasRecord>("canvases", {
          filters: [
            { column: "user_id", op: "eq", value: userId },
            { column: "deleted_at", op: "is", value: null },
          ],
          order: "updated_at.desc",
        }),
        supabase
          .from("canvas_members")
          .select("canvas_id")
          .eq("user_id", userId),
      ]);

      const memberCanvasIds = (memberResult.data ?? []).map(
        (r) => r.canvas_id as string,
      );

      // Fetch shared canvases that aren't already owned
      let sharedRows: CanvasRecord[] = [];
      if (memberCanvasIds.length > 0) {
        const ownedIds = new Set(ownedRows.map((c) => c.id));
        const idsToFetch = memberCanvasIds.filter((id) => !ownedIds.has(id));
        if (idsToFetch.length > 0) {
          const { data } = await supabase
            .from("canvases")
            .select("*")
            .in("id", idsToFetch)
            .is("deleted_at", null)
            .order("updated_at", { ascending: false });
          sharedRows = (data ?? []) as CanvasRecord[];
        }
      }

      const allRows = [...ownedRows, ...sharedRows];
      const savedCanvasId = storageKey ? localStorage.getItem(storageKey) : null;
      const sortedRows = movePreferredCanvasFirst(allRows, savedCanvasId);

      setCanvases(sortedRows);
      setActiveCanvasId(sortedRows[0]?.id ?? null);
      setLoading(false);
      restoringSelectionRef.current = false;
    }

    loadAllCanvases().catch(() => {
      setCanvases([]);
      setActiveCanvasId(null);
      setLoading(false);
      restoringSelectionRef.current = false;
    });
  }, [auth.user?.id, storageKey]);

  useEffect(() => {
    if (loading) {
      return;
    }

    if (!storageKey) {
      return;
    }

    if (!auth.user) {
      return;
    }

    if (restoringSelectionRef.current) {
      return;
    }

    if (!activeCanvasId) {
      localStorage.removeItem(storageKey);
      return;
    }

    localStorage.setItem(storageKey, activeCanvasId);
  }, [activeCanvasId, auth.user, loading, storageKey]);

  const userId = useMemo(() => auth.user?.id ?? null, [auth.user]);

  if (auth.isLoading || loading) {
    return (
      <div className="grid min-h-screen place-items-center">Loading...</div>
    );
  }

  if (!auth.user || !userId) {
    return <Navigate to="/login" />;
  }

  return (
    <CanvasEditor
      userId={userId}
      canvases={canvases}
      activeCanvasId={activeCanvasId}
      onSelectCanvas={(canvasId) => {
        setActiveCanvasId(canvasId);
        setCanvases((previous) => movePreferredCanvasFirst(previous, canvasId));
      }}
      onCreateCanvas={async (title) => {
        const data = await insertRow<CanvasRecord>("canvases", {
          user_id: userId,
          title: title.trim() || "Untitled Canvas",
        });

        setCanvases((previous) => [data, ...previous]);
        setActiveCanvasId(data.id);
      }}
      onRenameCanvas={async (canvasId, title) => {
        await updateSingleRow<CanvasRecord>(
          "canvases",
          { title: title.trim() || "Untitled Canvas" },
          [{ column: "id", op: "eq", value: canvasId }],
        );
        setCanvases((previous) =>
          previous.map((c) =>
            c.id === canvasId
              ? { ...c, title: title.trim() || "Untitled Canvas" }
              : c,
          ),
        );
      }}
      onDeleteCanvas={async (canvasId) => {
        const now = new Date().toISOString();
        await updateSingleRow<CanvasRecord>("canvases", { deleted_at: now }, [
          { column: "id", op: "eq", value: canvasId },
        ]);
        setCanvases((previous) => previous.filter((c) => c.id !== canvasId));
        setActiveCanvasId((previous) => {
          if (previous !== canvasId) return previous;
          const remaining = canvases.filter((c) => c.id !== canvasId);
          return remaining[0]?.id ?? null;
        });
      }}
      onLogout={async () => {
        await auth.signOut();
      }}
    />
  );
}
