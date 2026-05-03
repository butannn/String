import { Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { CanvasEditor } from "@/components/canvas/canvas-editor";
import { useAuth } from "@/context/auth-context";
import { insertRow, selectRows, updateSingleRow } from "@/lib/data-api";
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
    selectRows<CanvasRecord>("canvases", {
      filters: [
        { column: "user_id", op: "eq", value: auth.user.id },
        { column: "deleted_at", op: "is", value: null },
      ],
      order: "updated_at.desc",
    })
      .then((rows) => {
        const savedCanvasId = storageKey
          ? localStorage.getItem(storageKey)
          : null;
        const sortedRows = movePreferredCanvasFirst(rows, savedCanvasId);

        setCanvases(sortedRows);
        setActiveCanvasId(sortedRows[0]?.id ?? null);
        setLoading(false);
        restoringSelectionRef.current = false;
      })
      .catch(() => {
        setCanvases([]);
        setActiveCanvasId(null);
        setLoading(false);
        restoringSelectionRef.current = false;
      });
  }, [auth.user, storageKey]);

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
