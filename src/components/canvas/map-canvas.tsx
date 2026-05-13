import { useCallback, useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { supabase } from "@/lib/supabase";
import { insertRow, deleteRows, updateSingleRow, selectRows } from "@/lib/data-api";
import {
  STORAGE_BUCKET,
  createSignedMediaUrl,
  createImagePreviewAsset,
  createCompressedImageAsset,
} from "@/lib/media-utils";
import { CanvasHeader } from "@/components/canvas/canvas-header";
import { CreateCanvasDialog } from "@/components/canvas/dialogs/create-canvas-dialog";
import { LogoutDialog } from "@/components/canvas/dialogs/logout-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEFAULT_DESCRIPTION_STYLE } from "@/types/canvas";
import type { CanvasRecord, CanvasElementRecord } from "@/types/canvas";
import { useDarkMode } from "@/hooks/use-dark-mode";
import { MapPin, Moon, Sun, Search } from "lucide-react";

// ─── Leaflet icon fix for bundlers ───────────────────────────────────────────
// Leaflet's default icon images break with Vite; since we use custom divIcons
// for all pins we just need to suppress the broken default icon attempt.
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl: "", shadowUrl: "", iconRetinaUrl: "" });

// ─── Constants ────────────────────────────────────────────────────────────────
const UK_CENTER: [number, number] = [54.5, -3.5];
const UK_ZOOM = 6;

// ─── Types ────────────────────────────────────────────────────────────────────
type NominatimResult = {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
};

type MapCanvasEditorProps = {
  userId: string;
  canvases: CanvasRecord[];
  activeCanvasId: string | null;
  onSelectCanvas: (id: string) => void;
  onCreateCanvas: (title: string, canvasType?: string) => Promise<void>;
  onLogout: () => Promise<void>;
};

// ─── Icon factories ───────────────────────────────────────────────────────────
function createPhotoIcon(previewSrc: string, isSelected: boolean): L.DivIcon {
  const size = isSelected ? 72 : 60;
  const border = isSelected ? "3px solid #ffd87a" : "2px solid #ffffff";
  const shadow = isSelected
    ? "0 0 0 2px rgba(255,216,122,0.4), 0 6px 16px rgba(0,0,0,0.6)"
    : "0 4px 12px rgba(0,0,0,0.5)";
  return L.divIcon({
    className: "",
    html: `<div style="position:relative;width:${size}px;height:${size + 10}px;">
      <div style="width:${size}px;height:${size}px;border-radius:8px;border:${border};overflow:hidden;box-shadow:${shadow};background:#444;">
        <img src="${previewSrc}" style="width:100%;height:100%;object-fit:cover;" draggable="false" />
      </div>
      <div style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-top:10px solid ${isSelected ? "#ffd87a" : "#ffffff"};"></div>
    </div>`,
    iconSize: [size, size + 10],
    iconAnchor: [size / 2, size + 10],
  });
}

function createEmptyPinIcon(isSelected: boolean): L.DivIcon {
  const color = isSelected ? "#ffd87a" : "#6b7280";
  return L.divIcon({
    className: "",
    html: `<div style="width:24px;height:34px;display:flex;flex-direction:column;align-items:center;">
      <div style="width:24px;height:24px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};box-shadow:0 2px 8px rgba(0,0,0,0.4);border:2px solid white;"></div>
    </div>`,
    iconSize: [24, 34],
    iconAnchor: [12, 34],
  });
}

// ─── Map sub-components ───────────────────────────────────────────────────────
function MapController({
  isPlacingPin,
  onMapClick,
  flyTarget,
  onFlyComplete,
}: {
  isPlacingPin: boolean;
  onMapClick: (lat: number, lng: number) => void;
  flyTarget: { lat: number; lng: number; zoom?: number } | null;
  onFlyComplete: () => void;
}) {
  const map = useMap();

  useEffect(() => {
    map.getContainer().style.cursor = isPlacingPin ? "crosshair" : "";
  }, [map, isPlacingPin]);

  useMapEvents({
    click(e) {
      if (isPlacingPin) {
        onMapClick(e.latlng.lat, e.latlng.lng);
      }
    },
  });

  useEffect(() => {
    if (!flyTarget) return;
    map.flyTo([flyTarget.lat, flyTarget.lng], flyTarget.zoom ?? 14, { duration: 1.2 });
    onFlyComplete();
  }, [flyTarget, map, onFlyComplete]);

  return null;
}

// ─── Hydration ────────────────────────────────────────────────────────────────
async function hydratePin(row: CanvasElementRecord): Promise<CanvasElementRecord> {
  const previewStoragePath =
    typeof row.data?.previewStoragePath === "string" ? row.data.previewStoragePath : "";
  const storagePath =
    typeof row.data?.storagePath === "string" ? row.data.storagePath : "";

  let previewSrc: string | null = null;

  if (previewStoragePath) {
    try {
      previewSrc = await createSignedMediaUrl(previewStoragePath, { cacheNonce: row.updated_at });
    } catch {
      previewSrc = null;
    }
  }
  if (!previewSrc && storagePath) {
    try {
      previewSrc = await createSignedMediaUrl(storagePath, { cacheNonce: row.updated_at });
    } catch {
      previewSrc = null;
    }
  }

  return { ...row, data: { ...row.data, previewSrc } };
}

// ─── Main component ───────────────────────────────────────────────────────────
export function MapCanvasEditor({
  userId,
  canvases,
  activeCanvasId,
  onSelectCanvas,
  onCreateCanvas,
  onLogout,
}: MapCanvasEditorProps) {
  const { isDark, toggleDark } = useDarkMode();

  const [pins, setPins] = useState<CanvasElementRecord[]>([]);
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [isPlacingPin, setIsPlacingPin] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<NominatimResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lng: number; zoom?: number } | null>(null);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [isSavingDescription, setIsSavingDescription] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingLatLngRef = useRef<[number, number] | null>(null);
  const searchDebounceRef = useRef<number | null>(null);

  // Mobile detection
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobileViewport(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Clear error after 4 s
  useEffect(() => {
    if (!error) return;
    const t = window.setTimeout(() => setError(null), 4000);
    return () => clearTimeout(t);
  }, [error]);

  // Load pins when canvas changes
  useEffect(() => {
    if (!activeCanvasId) {
      setPins([]);
      setSelectedPinId(null);
      return;
    }
    let cancelled = false;

    async function loadPins() {
      try {
        const rows = await selectRows<CanvasElementRecord>("canvas_elements", {
          filters: [
            { column: "canvas_id", op: "eq", value: activeCanvasId! },
            { column: "deleted_at", op: "is", value: null },
          ],
          order: "created_at.asc",
        });
        // Only elements that have lat/lng are map pins
        const mapPins = rows.filter(
          (r) => typeof r.data?.lat === "number" && typeof r.data?.lng === "number",
        );
        const hydrated = await Promise.all(mapPins.map(hydratePin));
        if (!cancelled) setPins(hydrated);
      } catch {
        // silently ignore load errors
      }
    }

    void loadPins();
    return () => { cancelled = true; };
  }, [activeCanvasId]);

  const selectedPin = pins.find((p) => p.id === selectedPinId) ?? null;

  // Sync description input when selection changes
  useEffect(() => {
    const desc = typeof selectedPin?.data?.description === "string"
      ? selectedPin.data.description
      : "";
    setDescriptionDraft(desc);
  }, [selectedPinId, selectedPin?.data?.description]);

  // ── Search ────────────────────────────────────────────────────────────────
  const runSearch = useCallback(async (query: string) => {
    if (!query.trim()) { setSearchResults([]); return; }
    setIsSearching(true);
    try {
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&countrycodes=gb&limit=6&addressdetails=1`,
        { headers: { "User-Agent": "StringCanvas/1.0" } },
      );
      const data = await resp.json() as NominatimResult[];
      setSearchResults(data);
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  function handleSearchInput(value: string) {
    setSearchQuery(value);
    if (searchDebounceRef.current !== null) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = window.setTimeout(() => void runSearch(value), 500);
  }

  function handleSelectResult(result: NominatimResult) {
    setFlyTarget({ lat: parseFloat(result.lat), lng: parseFloat(result.lon), zoom: 14 });
    setSearchResults([]);
    setSearchQuery(result.display_name.split(",")[0] ?? "");
  }

  // ── Pin placement ─────────────────────────────────────────────────────────
  function handleMapClick(lat: number, lng: number) {
    if (!isPlacingPin) return;
    pendingLatLngRef.current = [lat, lng];
    setIsPlacingPin(false);
    fileInputRef.current?.click();
  }

  async function handleFileSelected(file: File | null) {
    if (!file || !activeCanvasId || !pendingLatLngRef.current) return;
    const [lat, lng] = pendingLatLngRef.current;
    pendingLatLngRef.current = null;

    setIsUploading(true);
    setError(null);

    try {
      const [previewAsset, fullAsset] = await Promise.all([
        createImagePreviewAsset(file),
        createCompressedImageAsset(file),
      ]);

      const ts = Date.now();
      const base = file.name.replace(/\.[^/.]+$/, "");
      const previewPath = `canvases/${activeCanvasId}/previews/${ts}-preview.${previewAsset.extension}`;
      const fullPath = `canvases/${activeCanvasId}/media/${ts}-full.${fullAsset.extension}`;

      const [pu, fu] = await Promise.all([
        supabase.storage.from(STORAGE_BUCKET).upload(previewPath, previewAsset.blob, {
          contentType: previewAsset.contentType,
          upsert: false,
        }),
        supabase.storage.from(STORAGE_BUCKET).upload(fullPath, fullAsset.blob, {
          contentType: fullAsset.contentType,
          upsert: false,
        }),
      ]);
      if (pu.error) throw pu.error;
      if (fu.error) throw fu.error;

      const previewSrc = await createSignedMediaUrl(previewPath);

      const newElement = await insertRow<CanvasElementRecord>("canvas_elements", {
        canvas_id: activeCanvasId,
        user_id: userId,
        element_type: "image",
        x: 0,
        y: 0,
        width: previewAsset.sourceWidth,
        height: previewAsset.sourceHeight,
        rotation: 0,
        z_index: 0,
        data: {
          lat,
          lng,
          storagePath: fullPath,
          previewStoragePath: previewPath,
          previewSrc,
          fileName: base,
          description: "",
          descriptionStyle: DEFAULT_DESCRIPTION_STYLE,
        },
      });

      setPins((prev) => [...prev, { ...newElement, data: { ...newElement.data, previewSrc } }]);
      setSelectedPinId(newElement.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to upload photo");
    } finally {
      setIsUploading(false);
    }
  }

  // ── Description ───────────────────────────────────────────────────────────
  async function saveDescription() {
    if (!selectedPinId || !selectedPin) return;
    setIsSavingDescription(true);
    try {
      const newData = { ...selectedPin.data, description: descriptionDraft };
      await updateSingleRow<CanvasElementRecord>(
        "canvas_elements",
        { data: newData },
        [{ column: "id", op: "eq", value: selectedPinId }],
      );
      setPins((prev) =>
        prev.map((p) => (p.id === selectedPinId ? { ...p, data: newData } : p)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save description");
    } finally {
      setIsSavingDescription(false);
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  async function deleteSelectedPin() {
    if (!selectedPinId) return;
    const pin = pins.find((p) => p.id === selectedPinId);
    if (!pin) return;

    try {
      await deleteRows("canvas_elements", {
        filters: [{ column: "id", op: "eq", value: selectedPinId }],
      });
      const paths: string[] = [];
      if (typeof pin.data?.storagePath === "string") paths.push(pin.data.storagePath);
      if (typeof pin.data?.previewStoragePath === "string") paths.push(pin.data.previewStoragePath);
      if (paths.length > 0) {
        await supabase.storage.from(STORAGE_BUCKET).remove(paths);
      }
      setPins((prev) => prev.filter((p) => p.id !== selectedPinId));
      setSelectedPinId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete pin");
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <main className="fixed inset-0 flex flex-col bg-zinc-100 dark:bg-zinc-950">
      <CanvasHeader
        canvases={canvases}
        activeCanvasId={activeCanvasId}
        onSelectCanvas={onSelectCanvas}
        isMobileViewport={isMobileViewport}
        onOpenMobileMenu={() => {}}
      />

      <div className="flex min-h-0 flex-1">
        {/* ── Map area ──────────────────────────────────────────────────── */}
        <div className="relative min-h-0 flex-1">

          {/* Search bar */}
          <div className="absolute left-3 top-3 z-[1000] w-80 max-w-[calc(100vw-1.5rem)]">
            <div className="relative">
              <Search
                size={15}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") { setSearchResults([]); }
                  if (e.key === "Enter" && searchResults[0]) {
                    handleSelectResult(searchResults[0]);
                  }
                }}
                placeholder="Search UK locations or postcodes…"
                className="h-9 w-full rounded-md border border-zinc-300 bg-white pl-8 pr-3 text-sm shadow-md focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500"
              />
              {isSearching && (
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-zinc-400">
                  …
                </span>
              )}
            </div>
            {searchResults.length > 0 && (
              <ul className="mt-1 overflow-hidden rounded-md border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
                {searchResults.map((r) => (
                  <li key={r.place_id}>
                    <button
                      type="button"
                      onClick={() => handleSelectResult(r)}
                      className="w-full px-3 py-2 text-left text-xs text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-700"
                    >
                      {r.display_name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Add Photo Pin button */}
          <div className="absolute bottom-6 left-3 z-[1000]">
            <button
              type="button"
              onClick={() => {
                setSearchResults([]);
                if (isPlacingPin) {
                  setIsPlacingPin(false);
                } else {
                  setSelectedPinId(null);
                  setIsPlacingPin(true);
                }
              }}
              className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium shadow-md transition-colors ${
                isPlacingPin
                  ? "border-amber-400 bg-amber-500 text-white hover:bg-amber-600"
                  : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
              }`}
            >
              <MapPin size={15} />
              {isPlacingPin ? "Click map to place…" : "Add Photo Pin"}
            </button>
          </div>

          {/* Uploading overlay */}
          {isUploading && (
            <div className="absolute inset-0 z-[1001] flex items-center justify-center bg-black/30">
              <div className="rounded-md bg-white px-4 py-3 text-sm font-medium shadow-lg dark:bg-zinc-800 dark:text-zinc-100">
                Uploading photo…
              </div>
            </div>
          )}

          {/* Leaflet Map */}
          <MapContainer
            center={UK_CENTER}
            zoom={UK_ZOOM}
            style={{ height: "100%", width: "100%" }}
            zoomControl
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              maxZoom={19}
            />

            <MapController
              isPlacingPin={isPlacingPin}
              onMapClick={handleMapClick}
              flyTarget={flyTarget}
              onFlyComplete={() => setFlyTarget(null)}
            />

            {pins.map((pin) => {
              const previewSrc =
                typeof pin.data?.previewSrc === "string" ? pin.data.previewSrc : "";
              const lat = typeof pin.data?.lat === "number" ? pin.data.lat : 0;
              const lng = typeof pin.data?.lng === "number" ? pin.data.lng : 0;
              const isSelected = pin.id === selectedPinId;
              const icon = previewSrc
                ? createPhotoIcon(previewSrc, isSelected)
                : createEmptyPinIcon(isSelected);

              return (
                <Marker
                  key={pin.id}
                  position={[lat, lng]}
                  icon={icon}
                  zIndexOffset={isSelected ? 1000 : 0}
                  eventHandlers={{
                    click: () => {
                      setIsPlacingPin(false);
                      setSelectedPinId(isSelected ? null : pin.id);
                    },
                  }}
                />
              );
            })}
          </MapContainer>
        </div>

        {/* ── Sidebar (desktop) ────────────────────────────────────────── */}
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

            {/* Pin detail panel */}
            {selectedPin ? (
              <div className="space-y-3 border-t border-zinc-100 pt-3 dark:border-zinc-800">
                {/* Photo thumbnail */}
                {typeof selectedPin.data?.previewSrc === "string" &&
                  selectedPin.data.previewSrc ? (
                  <div className="overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-700">
                    <img
                      src={selectedPin.data.previewSrc as string}
                      alt={String(selectedPin.data?.fileName ?? "Photo")}
                      className="block w-full object-cover"
                      style={{ maxHeight: 160 }}
                    />
                  </div>
                ) : null}

                {/* Filename */}
                {typeof selectedPin.data?.fileName === "string" && (
                  <p className="truncate text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                    {selectedPin.data.fileName as string}
                  </p>
                )}

                {/* Coordinates */}
                <p className="text-[10px] text-zinc-400">
                  {(selectedPin.data?.lat as number).toFixed(5)},{" "}
                  {(selectedPin.data?.lng as number).toFixed(5)}
                </p>

                {/* Description input */}
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                    Details
                  </p>
                  <Input
                    className="h-10"
                    value={descriptionDraft}
                    onChange={(e) => setDescriptionDraft(e.target.value)}
                    onBlur={() => void saveDescription()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void saveDescription();
                      }
                    }}
                    placeholder="Add description…"
                    disabled={isSavingDescription}
                  />
                </div>

                {/* Actions */}
                <Button
                  variant="outline"
                  className="h-9 w-full text-xs"
                  onClick={() => setSelectedPinId(null)}
                >
                  Deselect
                </Button>
                <Button
                  variant="destructive"
                  className="h-9 w-full text-xs"
                  onClick={() => void deleteSelectedPin()}
                >
                  Delete Pin
                </Button>
              </div>
            ) : (
              <div className="border-t border-zinc-100 pt-3 dark:border-zinc-800">
                <p className="text-xs leading-relaxed text-zinc-400">
                  {isPlacingPin
                    ? "Click anywhere on the map to place your photo pin there."
                    : 'Click a pin on the map to see its details, or use "Add Photo Pin" below to pin a photo to a location.'}
                </p>
              </div>
            )}

            {/* Bottom actions */}
            <div className="mt-auto flex flex-col gap-1 border-t border-zinc-100 pt-3 dark:border-zinc-800">
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

      {/* Error toast */}
      {error ? (
        <div className="pointer-events-none fixed right-4 top-20 z-40 rounded-md bg-red-600/90 px-3 py-2 text-sm text-white shadow">
          {error}
        </div>
      ) : null}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          void handleFileSelected(file);
          e.currentTarget.value = "";
        }}
      />

      <CreateCanvasDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onCreateCanvas={onCreateCanvas}
      />
      <LogoutDialog
        open={isLogoutDialogOpen}
        onOpenChange={setIsLogoutDialogOpen}
        onConfirm={() => void onLogout()}
      />
    </main>
  );
}
