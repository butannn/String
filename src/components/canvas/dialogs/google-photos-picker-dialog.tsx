import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

/* ------------------------------------------------------------------ */
/* Minimal GIS / Google Photos types                                   */
/* ------------------------------------------------------------------ */

interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string }): void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; error?: string }) => void;
          }): TokenClient;
        };
      };
    };
  }
}

type GoogleMediaItem = {
  id: string;
  baseUrl: string;
  filename: string;
  mimeType: string;
  mediaMetadata: {
    width?: string;
    height?: string;
    photo?: object;
    video?: object;
  };
};

type GooglePhotosPickerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddPhotos: (files: File[]) => Promise<void>;
};

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const PHOTOS_SCOPE = "https://www.googleapis.com/auth/photoslibrary.readonly";
const PHOTOS_API = "https://photoslibrary.googleapis.com/v1/mediaItems";
const THUMBNAIL_SIZE = "=w240-h240-c";

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function GooglePhotosPickerDialog({
  open,
  onOpenChange,
  onAddPhotos,
}: GooglePhotosPickerDialogProps) {
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [photos, setPhotos] = useState<GoogleMediaItem[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tokenClientRef = useRef<TokenClient | null>(null);

  /* Load the GIS script once */
  useEffect(() => {
    if (typeof window.google?.accounts?.oauth2?.initTokenClient === "function") {
      setScriptLoaded(true);
      return;
    }
    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener("load", () => setScriptLoaded(true));
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => setScriptLoaded(true);
    document.head.appendChild(script);
  }, []);

  /* Reset state when dialog closes */
  useEffect(() => {
    if (!open) {
      setPhotos([]);
      setSelectedIds(new Set());
      setNextPageToken(null);
      setError(null);
      setAdding(false);
    }
  }, [open]);

  /* Initialise token client once script is loaded */
  useEffect(() => {
    if (!scriptLoaded || !GOOGLE_CLIENT_ID) return;
    if (typeof window.google?.accounts?.oauth2?.initTokenClient !== "function") return;

    tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: PHOTOS_SCOPE,
      callback: (response) => {
        if (response.error) {
          setError("Google authentication failed: " + response.error);
          return;
        }
        if (response.access_token) {
          setAccessToken(response.access_token);
        }
      },
    });
  }, [scriptLoaded]);

  /* Fetch photos when we have a token */
  const fetchPhotos = useCallback(async (token: string, pageToken?: string) => {
    const isFirstPage = !pageToken;
    if (isFirstPage) setLoadingPhotos(true);
    else setLoadingMore(true);
    setError(null);

    try {
      const url = new URL(PHOTOS_API);
      url.searchParams.set("pageSize", "50");
      url.searchParams.set("filters.mediaTypeFilter.mediaTypes", "PHOTO");
      if (pageToken) url.searchParams.set("pageToken", pageToken);

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        if (res.status === 401) {
          setAccessToken(null);
          setError("Session expired. Please sign in again.");
          return;
        }
        throw new Error(`Google Photos API error: ${res.status}`);
      }

      const data = (await res.json()) as {
        mediaItems?: GoogleMediaItem[];
        nextPageToken?: string;
      };

      const items = (data.mediaItems ?? []).filter(
        (item) => item.mimeType.startsWith("image/"),
      );

      setPhotos((prev) => (isFirstPage ? items : [...prev, ...items]));
      setNextPageToken(data.nextPageToken ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load photos");
    } finally {
      if (isFirstPage) setLoadingPhotos(false);
      else setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    if (accessToken) {
      void fetchPhotos(accessToken);
    }
  }, [accessToken, fetchPhotos]);

  /* Auth */
  function handleSignIn() {
    if (!GOOGLE_CLIENT_ID) {
      setError("VITE_GOOGLE_CLIENT_ID is not configured.");
      return;
    }
    if (!tokenClientRef.current) {
      setError("Google Identity Services did not load.");
      return;
    }
    tokenClientRef.current.requestAccessToken({ prompt: "consent" });
  }

  /* Selection toggle */
  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /* Download selected photos and pass to parent */
  async function handleAddSelected() {
    if (!accessToken || selectedIds.size === 0) return;
    setAdding(true);
    setError(null);

    const selected = photos.filter((p) => selectedIds.has(p.id));
    const files: File[] = [];

    for (const item of selected) {
      try {
        /* =d suffix requests the original-resolution download */
        const res = await fetch(`${item.baseUrl}=d`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) throw new Error(`Failed to download ${item.filename}`);
        const blob = await res.blob();
        files.push(
          new File([blob], item.filename, {
            type: item.mimeType || "image/jpeg",
          }),
        );
      } catch (err) {
        setError(
          err instanceof Error ? err.message : `Failed to download ${item.filename}`,
        );
        setAdding(false);
        return;
      }
    }

    try {
      await onAddPhotos(files);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add photos");
    } finally {
      setAdding(false);
    }
  }

  if (!open) return null;

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onOpenChange(false);
      }}
    >
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-700">
          <div className="flex items-center gap-2">
            {/* Google Photos colour icon */}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 2C9.8 2 8 3.8 8 6v6H6C3.8 12 2 13.8 2 16s1.8 4 4 4h6v2h4v-2h2c2.2 0 4-1.8 4-4s-1.8-4-4-4h-2V6c0-2.2-1.8-4-4-4z" fill="none"/>
              <circle cx="12" cy="6" r="4" fill="#EA4335"/>
              <circle cx="18" cy="12" r="4" fill="#FBBC05"/>
              <circle cx="12" cy="18" r="4" fill="#34A853"/>
              <circle cx="6" cy="12" r="4" fill="#4285F4"/>
            </svg>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Add from Google Photos
            </h2>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {/* Not configured */}
          {!GOOGLE_CLIENT_ID && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
              <p className="font-semibold">Google Client ID not configured</p>
              <p className="mt-1">
                Add <code className="rounded bg-amber-100 px-1 dark:bg-amber-900">VITE_GOOGLE_CLIENT_ID=your-client-id</code> to your{" "}
                <code className="rounded bg-amber-100 px-1 dark:bg-amber-900">.env</code> file and restart the dev server.
              </p>
            </div>
          )}

          {/* Sign in prompt */}
          {GOOGLE_CLIENT_ID && !accessToken && (
            <div className="flex flex-col items-center gap-4 py-8">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Sign in to access your Google Photos library.
              </p>
              <Button onClick={handleSignIn} disabled={!scriptLoaded}>
                {scriptLoaded ? "Sign in with Google" : "Loading…"}
              </Button>
            </div>
          )}

          {/* Loading first page */}
          {accessToken && loadingPhotos && (
            <div className="flex items-center justify-center py-16">
              <span className="text-sm text-zinc-400">Loading photos…</span>
            </div>
          )}

          {/* Photo grid */}
          {accessToken && !loadingPhotos && photos.length > 0 && (
            <>
              <p className="mb-3 text-xs text-zinc-400">
                {selectedIds.size > 0
                  ? `${selectedIds.size} photo${selectedIds.size > 1 ? "s" : ""} selected`
                  : "Tap photos to select"}
              </p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                {photos.map((photo) => {
                  const isSelected = selectedIds.has(photo.id);
                  return (
                    <button
                      key={photo.id}
                      type="button"
                      onClick={() => toggleSelect(photo.id)}
                      className={`relative aspect-square overflow-hidden rounded-lg border-2 transition-all ${
                        isSelected
                          ? "border-blue-500 ring-2 ring-blue-300"
                          : "border-transparent hover:border-zinc-300"
                      }`}
                    >
                      <img
                        src={`${photo.baseUrl}${THUMBNAIL_SIZE}`}
                        alt={photo.filename}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                      {isSelected && (
                        <div className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-blue-500">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Load more */}
              {nextPageToken && (
                <div className="mt-4 flex justify-center">
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (accessToken && nextPageToken) {
                        void fetchPhotos(accessToken, nextPageToken);
                      }
                    }}
                    disabled={loadingMore}
                  >
                    {loadingMore ? "Loading…" : "Load more"}
                  </Button>
                </div>
              )}
            </>
          )}

          {/* Empty state */}
          {accessToken && !loadingPhotos && photos.length === 0 && (
            <div className="py-12 text-center text-sm text-zinc-400">
              No photos found in your Google Photos library.
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-zinc-200 px-5 py-4 dark:border-zinc-700">
          <span className="text-xs text-zinc-400">
            {accessToken ? `${photos.length} photo${photos.length !== 1 ? "s" : ""} loaded` : ""}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void handleAddSelected()}
              disabled={selectedIds.size === 0 || adding || !accessToken}
            >
              {adding
                ? `Adding ${selectedIds.size}…`
                : `Add ${selectedIds.size > 0 ? selectedIds.size : ""} photo${selectedIds.size !== 1 ? "s" : ""}`.trim()}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
