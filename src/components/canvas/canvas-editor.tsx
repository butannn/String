import { useCallback, useEffect, useRef, useState } from "react";
import { deleteRows } from "@/lib/data-api";
import { useZoomPan } from "@/hooks/use-zoom-pan";
import { useCanvasData } from "@/hooks/use-canvas-data";
import { useElementDrag } from "@/hooks/use-element-drag";
import { useAttachmentActions } from "@/hooks/use-attachment-actions";
import { useMediaActions } from "@/hooks/use-media-actions";
import { useDescription } from "@/hooks/use-description";
import { CanvasHeader } from "@/components/canvas/canvas-header";
import { CanvasViewport } from "@/components/canvas/canvas-viewport";
import { CanvasWorld } from "@/components/canvas/canvas-world";
import { AttachmentLayer } from "@/components/canvas/attachment-layer";
import type { AttachmentLayerHandle } from "@/components/canvas/attachment-layer";
import { CanvasElement } from "@/components/canvas/canvas-element";
import { MediaViewer } from "@/components/canvas/media-viewer";
import { ElementPanel } from "@/components/canvas/element-panel";
import { MobileToolbar } from "@/components/canvas/mobile-toolbar";
import { DeleteElementDialog } from "@/components/canvas/dialogs/delete-element-dialog";
import { LogoutDialog } from "@/components/canvas/dialogs/logout-dialog";
import { CreateCanvasDialog } from "@/components/canvas/dialogs/create-canvas-dialog";
import { Button } from "@/components/ui/button";
import { useDarkMode } from "@/hooks/use-dark-mode";
import { Moon, Sun, X } from "lucide-react";
import type { CanvasRecord, ElementType, Mode, OpenableCanvasElementRecord, PanState } from "@/types/canvas";
import { isOpenableMediaType } from "@/types/canvas";

type CanvasEditorProps = {
  userId: string;
  canvases: CanvasRecord[];
  activeCanvasId: string | null;
  onSelectCanvas: (canvasId: string) => void;
  onCreateCanvas: (title: string) => Promise<void>;
  onRenameCanvas: (canvasId: string, title: string) => Promise<void>;
  onDeleteCanvas: (canvasId: string) => Promise<void>;
  onLogout: () => Promise<void>;
};

export function CanvasEditor({
  userId,
  canvases,
  activeCanvasId,
  onSelectCanvas,
  onCreateCanvas,
  onLogout,
}: CanvasEditorProps) {
  const { isDark, toggleDark } = useDarkMode();

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const worldRef = useRef<HTMLDivElement | null>(null);
  const attachmentSvgRef = useRef<SVGSVGElement | null>(null);
  const attachmentHandleRef = useRef<AttachmentLayerHandle | null>(null);
  const elementNodeMapRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const panMovedRef = useRef(false);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);
  const elementDraggedRef = useRef(false);
  const pendingElementDragRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const [mode, setMode] = useState<Mode>("move");
  const [animatingPair, setAnimatingPair] = useState<{ fromId: string; toId: string } | null>(null);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [mobileSheetType, setMobileSheetType] = useState<"add" | "menu">("add");
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mobile viewport detection
  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobileViewport(mediaQuery.matches);
    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  // Cleanup long-press timer on unmount
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current !== null) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  const {
    zoom,
    panX,
    panY,
    panState,
    setPanState,
    isSpacePanning,
    zoomRef,
    panXRef,
    panYRef,
    gestureActiveRef,
    pointerPinchActiveRef,
    suppressWheelUntilRef,
    setZoomFromAnchorImmediate,
    focusRows,
    applyPan,
    panActiveRef,
    commitPanState,
  } = useZoomPan(viewportRef, worldRef, attachmentSvgRef);

  const {
    elements,
    setElements,
    attachments,
    setAttachments,
    selectedId,
    setSelectedId,
    selectedAttachmentId,
    setSelectedAttachmentId,
    elementMap,
    selectedMediaElement,
    canOpenSelectedMedia,
  } = useCanvasData(activeCanvasId, focusRows);

  const { setDragState } = useElementDrag(
    elements,
    setElements,
    mode,
    zoomRef,
    gestureActiveRef,
    pointerPinchActiveRef,
    elementNodeMapRef,
    attachmentHandleRef,
  );

  const handleElementMount = useCallback(
    (id: string, node: HTMLDivElement | null) => {
      if (node) {
        elementNodeMapRef.current.set(id, node);
      } else {
        elementNodeMapRef.current.delete(id);
      }
    },
    [],
  );

  const {
    createAttachment,
    deleteAttachment,
    flushPendingAttachments,
    deleteElementAttachments,
  } = useAttachmentActions(
    activeCanvasId,
    selectedId,
    attachments,
    setAttachments,
    setMode,
    setSelectedAttachmentId,
    setError,
  );

  const {
    imageInputRef,
    audioInputRef,
    videoInputRef,
    isOpeningMedia,
    mediaViewer,
    setMediaViewer,
    createElement,
    handleMediaFile,
    openElementMedia,
    openSelectedMedia,
  } = useMediaActions({
    activeCanvasId,
    userId,
    isMobileViewport,
    viewportRef,
    zoomRef,
    panXRef,
    panYRef,
    setElements,
    setSelectedId,
    flushPendingAttachments,
    setAttachments,
    setError,
    setIsCreateDialogOpen,
  });

  const {
    descriptionDraft,
    setDescriptionDraft,
    descriptionStyleDraft,
    setDescriptionStyleDraft,
    isSavingDescription,
    saveSelectedDescription,
  } = useDescription(selectedId, elements, setElements, setError);

  // Pan state — pointermove / pointerup
  useEffect(() => {
    function handleViewportPanMove(event: PointerEvent) {
      if (gestureActiveRef.current || pointerPinchActiveRef.current) return;
      if (!panState) return;

      const deltaX = event.clientX - panState.pointerStartX;
      const deltaY = event.clientY - panState.pointerStartY;

      if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
        panMovedRef.current = true;
      }

      panActiveRef.current = true;
      applyPan(panState.startPanX + deltaX, panState.startPanY + deltaY);
    }

    function handleViewportPanEnd() {
      if (!panState) return;
      if (panActiveRef.current) {
        panActiveRef.current = false;
        commitPanState();
      }
      setPanState(null);
      requestAnimationFrame(() => {
        panMovedRef.current = false;
      });
    }

    window.addEventListener("pointermove", handleViewportPanMove);
    window.addEventListener("pointerup", handleViewportPanEnd);
    window.addEventListener("pointercancel", handleViewportPanEnd);
    return () => {
      window.removeEventListener("pointermove", handleViewportPanMove);
      window.removeEventListener("pointerup", handleViewportPanEnd);
      window.removeEventListener("pointercancel", handleViewportPanEnd);
    };
  }, [panState, gestureActiveRef, pointerPinchActiveRef, applyPan, setPanState, panActiveRef, commitPanState]);

  // Pending element drag — activate once pointer moves beyond threshold
  useEffect(() => {
    function handlePendingDragMove(event: PointerEvent) {
      const pending = pendingElementDragRef.current;
      if (!pending) return;
      const dx = event.clientX - pending.startX;
      const dy = event.clientY - pending.startY;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        if (longPressTimerRef.current !== null) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        elementDraggedRef.current = true;
        pendingElementDragRef.current = null;
        setDragState({
          id: pending.id,
          pointerStartX: pending.startX,
          pointerStartY: pending.startY,
          originX: pending.originX,
          originY: pending.originY,
        });
      }
    }

    function handlePendingDragEnd() {
      pendingElementDragRef.current = null;
    }

    window.addEventListener("pointermove", handlePendingDragMove);
    window.addEventListener("pointerup", handlePendingDragEnd);
    window.addEventListener("pointercancel", handlePendingDragEnd);
    return () => {
      window.removeEventListener("pointermove", handlePendingDragMove);
      window.removeEventListener("pointerup", handlePendingDragEnd);
      window.removeEventListener("pointercancel", handlePendingDragEnd);
    };
  }, [setDragState]);

  async function deleteSelectedElement() {
    if (!selectedId || selectedId.startsWith("temp-")) return;
    const elementId = selectedId;

    try {
      await Promise.all([
        deleteRows("canvas_elements", {
          filters: [{ column: "id", op: "eq", value: elementId }],
        }),
        deleteElementAttachments(elementId),
      ]);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : "Could not delete",
      );
      return;
    }

    setElements((previous) => previous.filter((el) => el.id !== elementId));
    setAttachments((previous) =>
      previous.filter(
        (a) =>
          a.from_element_id !== elementId && a.to_element_id !== elementId,
      ),
    );
    setSelectedId(null);
    setSelectedAttachmentId(null);
    setMode("move");
    setMediaViewer((previous) =>
      previous?.elementId === elementId ? null : previous,
    );
  }

  function focusAllElements() {
    focusRows(elements);
  }

  function handleAddMedia(type: Extract<ElementType, "image" | "audio" | "video">) {
    setMobileSheetOpen(false);
    void createElement(type);
  }

  // Always-fresh ref so stable callbacks below always read the latest mutable values.
  const latestRef = useRef({ mode, selectedId, isMobileViewport, elementMap, createAttachment, openElementMedia });
  latestRef.current = { mode, selectedId, isMobileViewport, elementMap, createAttachment, openElementMedia };

  const cancelLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const startElementLongPress = useCallback((elementId: string) => {
    longPressTriggeredRef.current = false;
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      pendingElementDragRef.current = null;
      setSelectedId(elementId);
    }, 600);
  }, [setSelectedId]);

  const handleElementSelect = useCallback((id: string, event: React.MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    if (longPressTriggeredRef.current) { longPressTriggeredRef.current = false; return; }
    if (elementDraggedRef.current) { elementDraggedRef.current = false; return; }

    const { mode, selectedId, isMobileViewport, elementMap, createAttachment, openElementMedia } = latestRef.current;

    if (mode === "attach" && selectedId) {
      setAnimatingPair({ fromId: selectedId, toId: id });
      void createAttachment(id);
      return;
    }

    // When a picture is already selected, tapping another picture connects them
    // with a rope instead of opening the media viewer.
    if (selectedId && selectedId !== id) {
      const selectedEl = elementMap.get(selectedId);
      const clickedEl = elementMap.get(id);
      if (selectedEl?.element_type === "image" && clickedEl?.element_type === "image") {
        setAnimatingPair({ fromId: selectedId, toId: id });
        void createAttachment(id);
        return;
      }
    }

    if (isMobileViewport) {
      const el = elementMap.get(id);
      if (el && isOpenableMediaType(el.element_type)) {
        void openElementMedia(el as OpenableCanvasElementRecord);
      }
      return;
    }
    setSelectedAttachmentId(null);
    setSelectedId(id);
    const el = elementMap.get(id);
    if (el && isOpenableMediaType(el.element_type)) {
      void openElementMedia(el as OpenableCanvasElementRecord);
    }
  }, [setSelectedAttachmentId, setSelectedId]);

  const handleElementPointerDown = useCallback((id: string, originX: number, originY: number, event: React.PointerEvent<HTMLElement>) => {
    if (latestRef.current.mode !== "move") return;

    // Reset any stale drag flag at the start of every new gesture. Ghost pointer
    // events fired by the OS when returning from the file picker can set
    // elementDraggedRef=true (because the newly-added photo is selected and any
    // movement >5 px triggers the drag path). Without this reset, the very next
    // legitimate tap on another photo is swallowed by the elementDraggedRef
    // guard in handleElementSelect, requiring a second tap to actually connect.
    elementDraggedRef.current = false;

    const isSelected = latestRef.current.selectedId === id;
    if (isSelected) {
      event.preventDefault();
      pendingElementDragRef.current = { id, startX: event.clientX, startY: event.clientY, originX, originY };
    }

    event.stopPropagation();
    startElementLongPress(id);
  }, [startElementLongPress]);

  return (
    <main className="fixed inset-0 flex flex-col bg-zinc-100 dark:bg-zinc-950">
      <CanvasHeader
        canvases={canvases}
        activeCanvasId={activeCanvasId}
        onSelectCanvas={onSelectCanvas}
        isMobileViewport={isMobileViewport}
        onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
      />

      <div className="flex min-h-0 flex-1">
        <CanvasViewport
          viewportRef={viewportRef}
          panState={panState}
          setPanState={setPanState as React.Dispatch<React.SetStateAction<PanState | null>>}
          isSpacePanning={isSpacePanning}
          mode={mode}
          selectedId={selectedId}
          panXRef={panXRef}
          panYRef={panYRef}
          zoomRef={zoomRef}
          gestureActiveRef={gestureActiveRef}
          suppressWheelUntilRef={suppressWheelUntilRef}
          setZoomFromAnchorImmediate={setZoomFromAnchorImmediate}
          onCanvasClick={() => {
            setSelectedId(null);
            setSelectedAttachmentId(null);
          }}
          isMobileViewport={isMobileViewport}
          panMovedRef={panMovedRef}
        >
          {/* Rope/string layer rendered BEFORE elements so it sits behind them */}
          <AttachmentLayer
            attachments={attachments}
            elementMap={elementMap}
            selectedAttachmentId={selectedAttachmentId}
            onSelectAttachment={(id) => {
              setSelectedId(null);
              setSelectedAttachmentId(id);
            }}
            panX={panX}
            panY={panY}
            zoom={zoom}
            svgRef={attachmentSvgRef}
            imperativeRef={attachmentHandleRef}
            animatingPair={animatingPair}
            onAnimationComplete={() => setAnimatingPair(null)}
          />

          <CanvasWorld panX={panX} panY={panY} zoom={zoom} worldRef={worldRef}>
            {elements.map((element) => {
              const isSelected = selectedId === element.id;
              const isAttachTarget =
                mode === "attach" && !!selectedId && selectedId !== element.id;

              return (
                <CanvasElement
                  key={element.id}
                  element={element}
                  isSelected={isSelected}
                  isAttachTarget={isAttachTarget}
                  isDark={isDark}
                  onMount={handleElementMount}
                  onSelect={handleElementSelect}
                  onPointerDown={handleElementPointerDown}
                  onPointerUp={cancelLongPressTimer}
                  onPointerCancel={cancelLongPressTimer}
                  onPointerLeave={cancelLongPressTimer}
                />
              );
            })}
          </CanvasWorld>

        </CanvasViewport>

        {!isMobileViewport && (
          <aside className="flex w-60 flex-col gap-3 overflow-y-auto border-l border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
            {/* Dark mode toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isDark ? (
                  <Moon size={14} className="text-zinc-400" />
                ) : (
                  <Sun size={14} className="text-zinc-500" />
                )}
                <span className="text-xs text-zinc-600 dark:text-zinc-400">Dark mode</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={isDark}
                onClick={toggleDark}
                className={`relative inline-flex h-[26px] w-[46px] flex-shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  isDark ? "bg-zinc-600" : "bg-zinc-200"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    isDark ? "translate-x-[22px]" : "translate-x-[2px]"
                  }`}
                />
              </button>
            </div>

            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                Add
              </p>
              <div className="grid grid-cols-3 gap-1">
                <Button
                  variant="outline"
                  className="h-9 text-xs"
                  onClick={() => void createElement("image")}
                >
                  Image
                </Button>
                <Button
                  variant="outline"
                  className="h-9 text-xs"
                  onClick={() => void createElement("audio")}
                >
                  Audio
                </Button>
                <Button
                  variant="outline"
                  className="h-9 text-xs"
                  onClick={() => void createElement("video")}
                >
                  Video
                </Button>
              </div>
            </div>

            <div className="border-t border-zinc-100 pt-3 dark:border-zinc-800">
              <ElementPanel
                selectedId={selectedId}
                selectedAttachmentId={selectedAttachmentId}
                mode={mode}
                descriptionDraft={descriptionDraft}
                setDescriptionDraft={setDescriptionDraft}
                descriptionStyleDraft={descriptionStyleDraft}
                setDescriptionStyleDraft={setDescriptionStyleDraft}
                isSavingDescription={isSavingDescription}
                onSaveDescription={saveSelectedDescription}
                onDeleteElement={() => setIsDeleteDialogOpen(true)}
                onDeleteAttachment={() => {
                  if (selectedAttachmentId)
                    void deleteAttachment(selectedAttachmentId);
                }}
                onOpenMedia={() => void openSelectedMedia(selectedMediaElement)}
                canOpenMedia={canOpenSelectedMedia}
                isOpeningMedia={isOpeningMedia}
                onSetMoveMode={() => setMode("move")}
                onSetAttachMode={() => setMode("attach")}
              />
            </div>

            <div className="mt-auto flex flex-col gap-1 border-t border-zinc-100 pt-3 dark:border-zinc-800">
              <Button
                variant="outline"
                className="h-9 w-full text-xs"
                onClick={focusAllElements}
              >
                Focus All
              </Button>
              <Button
                variant="outline"
                className="h-9 w-full text-xs"
                onClick={() => setIsCreateDialogOpen(true)}
              >
                New Canvas
              </Button>
              <Button
                variant="outline"
                className="h-9 w-full text-xs"
                onClick={() => setIsLogoutDialogOpen(true)}
              >
                Logout
              </Button>
            </div>
          </aside>
        )}
      </div>

      {error ? (
        <div className="pointer-events-none fixed right-4 top-20 z-40 rounded-md bg-red-600/90 px-3 py-2 text-sm text-white shadow">
          {error}
        </div>
      ) : null}

      <MediaViewer
        viewer={mediaViewer}
        onClose={() => setMediaViewer(null)}
        descriptionDraft={descriptionDraft}
        setDescriptionDraft={setDescriptionDraft}
        isSavingDescription={isSavingDescription}
        onSaveDescription={saveSelectedDescription}
        getElementRect={() => {
          if (!mediaViewer?.elementId) return null;
          const node = elementNodeMapRef.current.get(mediaViewer.elementId);
          return node ? node.getBoundingClientRect() : null;
        }}
      />

      {/* Hidden file inputs */}
      <input
        ref={imageInputRef}
        type="file"
        className="hidden"
        accept="image/*"
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          // Clear any stale drag state that may have been set by ghost pointer
          // events while the file picker was open (common on mobile).
          pendingElementDragRef.current = null;
          elementDraggedRef.current = false;
          void handleMediaFile(file, "image");
          event.currentTarget.value = "";
        }}
      />
      <input
        ref={audioInputRef}
        type="file"
        className="hidden"
        accept="audio/*"
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          pendingElementDragRef.current = null;
          elementDraggedRef.current = false;
          void handleMediaFile(file, "audio");
          event.currentTarget.value = "";
        }}
      />
      <input
        ref={videoInputRef}
        type="file"
        className="hidden"
        accept="video/*"
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          pendingElementDragRef.current = null;
          elementDraggedRef.current = false;
          void handleMediaFile(file, "video");
          event.currentTarget.value = "";
        }}
      />

      <DeleteElementDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        onConfirm={() => void deleteSelectedElement()}
      />

      <LogoutDialog
        open={isLogoutDialogOpen}
        onOpenChange={setIsLogoutDialogOpen}
        onConfirm={() => void onLogout()}
      />

      <CreateCanvasDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onCreateCanvas={onCreateCanvas}
      />

      {isMobileViewport ? (
        <MobileToolbar
          selectedId={selectedId}
          selectedAttachmentId={selectedAttachmentId}
          mode={mode}
          mobileSheetOpen={mobileSheetOpen}
          mobileSheetType={mobileSheetType}
          descriptionDraft={descriptionDraft}
          setDescriptionDraft={setDescriptionDraft}
          descriptionStyleDraft={descriptionStyleDraft}
          setDescriptionStyleDraft={setDescriptionStyleDraft}
          isSavingDescription={isSavingDescription}
          onSaveDescription={saveSelectedDescription}
          onOpenSheet={(type) => {
            setMobileSheetType(type);
            setMobileSheetOpen(true);
          }}
          onCloseSheet={() => setMobileSheetOpen(false)}
          onClearSelection={() => {
            setSelectedId(null);
            setSelectedAttachmentId(null);
            setMode("move");
          }}
          onFocusAll={focusAllElements}
          onSetMoveMode={() => setMode("move")}
          onSetAttachMode={() => setMode("attach")}
          onDeleteElement={() => setIsDeleteDialogOpen(true)}
          onDeleteAttachment={() => {
            if (selectedAttachmentId) void deleteAttachment(selectedAttachmentId);
          }}
          onOpenMedia={() => void openSelectedMedia(selectedMediaElement)}
          canOpenMedia={canOpenSelectedMedia}
          isOpeningMedia={isOpeningMedia}
          onAddMedia={handleAddMedia}
          onCreateCanvas={() => {
            setIsCreateDialogOpen(true);
            setMobileSheetOpen(false);
          }}
          onLogout={() => {
            setIsLogoutDialogOpen(true);
            setMobileSheetOpen(false);
          }}
        />
      ) : null}

      {/* Mobile right-side drawer */}
      {isMobileViewport ? (
        <>
          <div
            className={`fixed inset-0 z-40 bg-black/30 transition-opacity duration-200 ${isMobileMenuOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <div
            className={`fixed right-0 top-0 z-50 flex h-full w-64 flex-col gap-5 bg-zinc-50 px-5 py-6 shadow-2xl transition-transform duration-200 dark:bg-zinc-900 ${isMobileMenuOpen ? "translate-x-0" : "translate-x-full"}`}
          >
            <div className="flex items-center justify-between">
              <span className="font-serif text-xs tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
                MENU
              </span>
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(false)}
                className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 active:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-800"
                aria-label="Close menu"
              >
                <X size={18} />
              </button>
            </div>

            {/* Dark mode toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isDark ? (
                  <Moon size={14} className="text-zinc-400" />
                ) : (
                  <Sun size={14} className="text-zinc-500" />
                )}
                <span className="text-sm text-zinc-600 dark:text-zinc-400">Dark mode</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={isDark}
                onClick={toggleDark}
                className={`relative inline-flex h-[26px] w-[46px] flex-shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  isDark ? "bg-zinc-600" : "bg-zinc-200"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    isDark ? "translate-x-[22px]" : "translate-x-[2px]"
                  }`}
                />
              </button>
            </div>

            {canvases.length > 0 ? (
              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  Canvases
                </span>
                <div className="flex flex-col gap-1">
                  {canvases.map((canvas) => (
                    <button
                      key={canvas.id}
                      type="button"
                      onClick={() => { onSelectCanvas(canvas.id); setIsMobileMenuOpen(false); }}
                      className={`h-10 w-full rounded-md px-3 text-left text-sm transition-colors ${
                        canvas.id === activeCanvasId
                          ? "bg-zinc-200 font-medium text-zinc-900 dark:bg-zinc-700 dark:text-zinc-100"
                          : "text-zinc-600 hover:bg-zinc-100 active:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      }`}
                    >
                      {canvas.title}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-auto flex flex-col gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
              <Button
                variant="outline"
                className="h-11 w-full"
                onClick={() => { focusAllElements(); setIsMobileMenuOpen(false); }}
              >
                Focus All
              </Button>
              <Button
                variant="outline"
                className="h-11 w-full"
                onClick={() => { setIsCreateDialogOpen(true); setIsMobileMenuOpen(false); }}
              >
                New Canvas
              </Button>
              <Button
                variant="ghost"
                className="h-11 w-full"
                onClick={() => { setIsLogoutDialogOpen(true); setIsMobileMenuOpen(false); }}
              >
                Logout
              </Button>
            </div>
          </div>
        </>
      ) : null}

      {null /* longPressPreview removed — long press selects element in place */}
    </main>
  );
}
