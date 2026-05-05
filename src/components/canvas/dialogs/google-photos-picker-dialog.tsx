import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

/* ------------------------------------------------------------------ */
/* Types                                                               */
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
          revoke(token: string, callback?: () => void): void;
        };
      };
    };
  }
}

interface PickerSession {
  id: string;
  pickerUri: string;
  mediaItemsSet: boolean;
  expireTime: string;
}

interface PickerMediaItem {
  id: string;
  type: string;
  mediaFile: {
    baseUrl: string;
    mimeType: string;
    filename: string;
    mediaFileMetadata?: { width?: number; height?: number };
  };
}

type Status = "idle" | "creating" | "waiting" | "ready";

type GooglePhotosPickerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddPhotos: (files: File[]) => Promise<void>;
};

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
// photospicker scope is "sensitive" (not "restricted") — works without Google app verification
const PICKER_SCOPE = "https://www.googleapis.com/auth/photospicker.mediaitems.readonly";
const PICKER_API = "https://photospicker.googleapis.com/v1";
const POLL_INTERVAL_MS = 2500;

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
  const [status, setStatus] = useState<Status>("idle");
  const [pickerItems, setPickerItems] = useState<PickerMediaItem[]>([]);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tokenClientRef = useRef<TokenClient | null>(null);
  const lastTokenRef = useRef<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pickerWindowRef = useRef<Window | null>(null);

  // Always-current refs so stale useCallback closures always call the latest handlers
  const onAddPhotosRef = useRef(onAddPhotos);
  const onOpenChangeRef = useRef(onOpenChange);
  useEffect(() => { onAddPhotosRef.current = onAddPhotos; });
  useEffect(() => { onOpenChangeRef.current = onOpenChange; });

  // Stop polling and clean up the picker window on unmount
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      try { pickerWindowRef.current?.close(); } catch { /* ignore COOP error */ }
    };
  }, []);

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
      stopPolling();
      try { pickerWindowRef.current?.close(); } catch { /* ignore COOP error */ }
      pickerWindowRef.current = null;
      setAccessToken(null);
      setStatus("idle");
      setPickerItems([]);
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
      scope: PICKER_SCOPE,
      callback: (response) => {
        if (response.error) {
          setError("Google authentication failed: " + response.error);
          return;
        }
        if (response.access_token) {
          lastTokenRef.current = response.access_token;
          setAccessToken(response.access_token);
        }
      },
    });
  }, [scriptLoaded]);

  function stopPolling() {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }

  /* Create a picker session and navigate the provided window to it, then poll */
  const startPicker = useCallback(async (token: string, pickerWin: Window | null) => {
    setStatus("creating");
    setError(null);
    pickerWindowRef.current = pickerWin;
    try {
      const res = await fetch(`${PICKER_API}/sessions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        try { pickerWin?.close(); } catch { /* ignore */ }
        const text = await res.text();
        throw new Error(`Failed to create picker session (${res.status}): ${text}`);
      }

      const session = (await res.json()) as PickerSession;
      setStatus("waiting");

      // Navigate the already-open window to the picker URL (mobile),
      // or open a new tab now that we have a token (desktop).
      if (pickerWin && !pickerWin.closed) {
        try { pickerWin.location.href = session.pickerUri; } catch { /* ignore COOP */ }
      } else {
        pickerWindowRef.current = window.open(session.pickerUri, "_blank");
      }

      pollTimerRef.current = setInterval(async () => {
        try {
          const pollRes = await fetch(`${PICKER_API}/sessions/${session.id}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          console.log("[GooglePicker] poll status:", pollRes.status);
          if (!pollRes.ok) return;

          const pollData = (await pollRes.json()) as PickerSession;
          console.log("[GooglePicker] mediaItemsSet:", pollData.mediaItemsSet);
          if (!pollData.mediaItemsSet) return;

          stopPolling();
          // Wrap close() in try-catch — COOP headers may block cross-origin window access
          try { pickerWindowRef.current?.close(); } catch { /* ignore COOP error */ }
          pickerWindowRef.current = null;

          const itemsRes = await fetch(
            `${PICKER_API}/mediaItems?sessionId=${session.id}&pageSize=100`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          console.log("[GooglePicker] items status:", itemsRes.status);
          if (!itemsRes.ok) {
            throw new Error(`Failed to fetch selected items (${itemsRes.status})`);
          }

          const itemsData = (await itemsRes.json()) as { mediaItems?: PickerMediaItem[] };
          console.log("[GooglePicker] items count:", itemsData.mediaItems?.length);
          console.log("[GooglePicker] first item:", JSON.stringify(itemsData.mediaItems?.[0]));
          const photos = (itemsData.mediaItems ?? []).filter((item) => item.type === "PHOTO");
          setPickerItems(photos);
          setStatus("ready");

          // Auto-upload immediately — don't make the user click another button
          if (photos.length === 0) return;
          setAdding(true);
          const files: File[] = [];
          for (const item of photos) {
            try {
              console.log("[GooglePicker] downloading", item.mediaFile.filename);
              // Request JPEG-transcoded version (=w4096-h4096-rj) to avoid HEIC/HEIF
              // which browsers on Windows/Android cannot decode.
              const dlRes = await fetch(`${item.mediaFile.baseUrl}=w4096-h4096-rj`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              console.log("[GooglePicker] download status", dlRes.status);
              if (!dlRes.ok) throw new Error(`Failed to download ${item.mediaFile.filename} (HTTP ${dlRes.status})`);
              const blob = await dlRes.blob();
              console.log("[GooglePicker] blob size", blob.size);
              if (blob.size === 0) throw new Error(`Downloaded file ${item.mediaFile.filename} is empty`);
              // Force JPEG mime type and normalise extension
              const mimeType = "image/jpeg";
              const rawName = item.mediaFile.filename || `photo-${item.id}`;
              const filename = rawName.replace(/\.(heic|heif|avif)$/i, ".jpg");
              files.push(new File([blob], filename, { type: mimeType }));
            } catch (dlErr) {
              console.error("[GooglePicker] download error", dlErr);
              setError(dlErr instanceof Error ? dlErr.message : "Failed to download photo");
              setAdding(false);
              return;
            }
          }
          try {
            console.log("[GooglePicker] uploading", files.length, "files");
            await onAddPhotosRef.current(files);
            onOpenChangeRef.current(false);
          } catch (upErr) {
            console.error("[GooglePicker] upload error", upErr);
            setError(upErr instanceof Error ? upErr.message : "Failed to add photos");
          } finally {
            setAdding(false);
          }
        } catch (pollErr) {
          console.error("[GooglePicker] poll error:", pollErr);
          stopPolling();
          setError(pollErr instanceof Error ? pollErr.message : "Failed to check picker status");
          setStatus("idle");
        }
      }, POLL_INTERVAL_MS);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open picker");
      setStatus("idle");
    }
  }, []);

  /* When we get a token, the picker window was already opened in handleSignIn */
  useEffect(() => {
    if (accessToken && pickerWindowRef.current !== undefined) {
      void startPicker(accessToken, pickerWindowRef.current);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  /* Sign in — open the picker window HERE (direct user gesture) so it isn't blocked */
  function handleSignIn() {
    if (!GOOGLE_CLIENT_ID) {
      setError("VITE_GOOGLE_CLIENT_ID is not configured.");
      return;
    }
    if (!tokenClientRef.current) {
      setError("Google Identity Services did not load.");
      return;
    }
    // On mobile, GIS uses a redirect-based OAuth flow so pre-opening a blank tab
    // is safe and prevents popup blocking for the picker URL.
    // On desktop, GIS shows a popup for OAuth — pre-opening a window consumes
    // the user gesture, causing the browser to block the GIS auth popup.
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const pickerWin = isMobile ? window.open("", "_blank") : null;
    pickerWindowRef.current = pickerWin;

    const doRequest = () => tokenClientRef.current?.requestAccessToken({ prompt: "consent" });
    if (lastTokenRef.current && window.google?.accounts?.oauth2?.revoke) {
      const tokenToRevoke = lastTokenRef.current;
      lastTokenRef.current = null;
      window.google.accounts.oauth2.revoke(tokenToRevoke, doRequest);
    } else {
      doRequest();
    }
  }

  /* Download selected photos and pass to parent */
  async function handleAddSelected() {
    if (!accessToken || pickerItems.length === 0) return;
    setAdding(true);
    setError(null);

    const files: File[] = [];
    for (const item of pickerItems) {
      try {
        console.log("[GooglePicker] downloading", item.mediaFile.filename, item.mediaFile.baseUrl);
        // Request JPEG-transcoded version to avoid HEIC/HEIF browser decode issues.
        const res = await fetch(`${item.mediaFile.baseUrl}=w4096-h4096-rj`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        console.log("[GooglePicker] download status", res.status, res.headers.get("content-type"));
        if (!res.ok) {
          throw new Error(`Failed to download ${item.mediaFile.filename} (HTTP ${res.status})`);
        }
        const blob = await res.blob();
        console.log("[GooglePicker] blob size", blob.size, "type", blob.type);
        if (blob.size === 0) {
          throw new Error(`Downloaded file ${item.mediaFile.filename} is empty`);
        }
        const mimeType = "image/jpeg";
        const rawName = item.mediaFile.filename || `photo-${item.id}`;
        const filename = rawName.replace(/\.(heic|heif|avif)$/i, ".jpg");
        files.push(new File([blob], filename, { type: mimeType }));
      } catch (err) {
        console.error("[GooglePicker] download error", err);
        setError(err instanceof Error ? err.message : "Failed to download photo");
        setAdding(false);
        return;
      }
    }

    console.log("[GooglePicker] uploading", files.length, "files");
    try {
      await onAddPhotos(files);
      onOpenChange(false);
    } catch (err) {
      console.error("[GooglePicker] upload error", err);
      setError(err instanceof Error ? err.message : "Failed to add photos");
    } finally {
      setAdding(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    >
      <div className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-700">
          <div className="flex items-center gap-2">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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

          {/* Error */}
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
              {error}
            </div>
          )}

          {/* Idle — show sign-in button */}
          {GOOGLE_CLIENT_ID && status === "idle" && (
            <div className="flex flex-col items-center gap-4 py-8">
              <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
                Opens the Google Photos picker so you can select photos to add to your canvas.
              </p>
              <Button onClick={handleSignIn} disabled={!scriptLoaded}>
                {scriptLoaded ? "Open Google Photos Picker" : "Loading…"}
              </Button>
            </div>
          )}

          {/* Creating session */}
          {status === "creating" && (
            <div className="flex items-center justify-center py-16">
              <span className="text-sm text-zinc-400">Opening Google Photos picker…</span>
            </div>
          )}

          {/* Waiting for user to pick */}
          {status === "waiting" && (
            <div className="flex flex-col items-center gap-4 py-10 text-center">
              <svg className="h-8 w-8 animate-spin text-blue-500" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Google Photos picker opened in a new tab
              </p>
              <p className="max-w-xs text-xs text-zinc-400">
                Select your photos there and click <strong>Done</strong>. This dialog will update automatically when you finish.
              </p>
              <button
                type="button"
                onClick={() => pickerWindowRef.current?.focus()}
                className="mt-1 text-xs text-blue-500 underline hover:text-blue-600"
              >
                Switch to picker tab
              </button>
            </div>
          )}

          {/* Ready — show selected photos */}
          {status === "ready" && pickerItems.length > 0 && (
            <div>
              <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-300">
                {pickerItems.length} photo{pickerItems.length !== 1 ? "s" : ""} ready to add
              </p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {pickerItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex aspect-square flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-700 dark:bg-zinc-800"
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-400" aria-hidden="true">
                      <rect x="3" y="3" width="18" height="18" rx="2"/>
                      <circle cx="8.5" cy="8.5" r="1.5"/>
                      <polyline points="21 15 16 10 5 21"/>
                    </svg>
                    <span className="w-full truncate text-center text-xs text-zinc-500 dark:text-zinc-400">
                      {item.mediaFile.filename}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {status === "ready" && pickerItems.length === 0 && (
            <div className="py-10 text-center text-sm text-zinc-400">
              No photos were selected.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-zinc-200 px-5 py-3 dark:border-zinc-700">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={adding}>
            Cancel
          </Button>
          {status === "ready" && pickerItems.length > 0 && (
            <Button onClick={() => void handleAddSelected()} disabled={adding}>
              {adding
                ? "Adding…"
                : `Add ${pickerItems.length} photo${pickerItems.length !== 1 ? "s" : ""}`}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
