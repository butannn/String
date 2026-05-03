import { supabase } from "@/lib/supabase";

export const STORAGE_BUCKET =
  import.meta.env.VITE_SUPABASE_STORAGE_BUCKET || "canvas-media";

const SIGNED_URL_TTL_SECONDS = 60 * 60;
export const PREVIEW_IMAGE_MAX_EDGE = 960;
export const PREVIEW_IMAGE_QUALITY = 0.72;

export type PreviewTransform = {
  width?: number;
  height?: number;
  resize?: "cover" | "contain" | "fill";
  quality?: number;
  format?: "origin";
};

export type GeneratedPreviewAsset = {
  blob: Blob;
  contentType: string;
  extension: string;
  sourceWidth: number;
  sourceHeight: number;
};

export function fitMediaDimensions(
  sourceWidth: number,
  sourceHeight: number,
  maxWidth: number,
  maxHeight: number,
) {
  const safeWidth = Math.max(1, sourceWidth);
  const safeHeight = Math.max(1, sourceHeight);
  const widthScale = maxWidth / safeWidth;
  const heightScale = maxHeight / safeHeight;
  const scale = Math.min(1, widthScale, heightScale);

  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
  };
}

export function getImagePreviewTransform(
  width: number,
  height: number,
): PreviewTransform {
  const pixelRatio =
    typeof window === "undefined"
      ? 1
      : Math.min(window.devicePixelRatio || 1, 2);
  const scaledWidth = Math.max(
    160,
    Math.min(1400, Math.round(width * pixelRatio * 1.25)),
  );
  const scaledHeight = Math.max(
    160,
    Math.min(1400, Math.round(height * pixelRatio * 1.25)),
  );

  return {
    width: scaledWidth,
    height: scaledHeight,
    resize: "contain",
    quality: 60,
  };
}

export async function createSignedMediaUrl(
  path: string,
  options?: {
    transform?: PreviewTransform;
    cacheNonce?: string;
  },
) {
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS, options);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Could not create media URL");
  }

  return data.signedUrl;
}

function canvasToPreviewAsset(
  canvas: HTMLCanvasElement,
  sourceWidth: number,
  sourceHeight: number,
) {
  return new Promise<GeneratedPreviewAsset>((resolve, reject) => {
    const resolveAsset = (
      blob: Blob | null,
      extension: string,
      contentType: string,
    ) => {
      if (!blob) {
        reject(new Error("Could not create media preview"));
        return;
      }

      resolve({ blob, contentType, extension, sourceWidth, sourceHeight });
    };

    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolveAsset(blob, "webp", "image/webp");
          return;
        }

        canvas.toBlob(
          (fallbackBlob) => {
            resolveAsset(fallbackBlob, "jpg", "image/jpeg");
          },
          "image/jpeg",
          PREVIEW_IMAGE_QUALITY,
        );
      },
      "image/webp",
      PREVIEW_IMAGE_QUALITY,
    );
  });
}

export function createImagePreviewAsset(file: File) {
  return new Promise<GeneratedPreviewAsset>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = async () => {
      try {
        const fitted = fitMediaDimensions(
          image.naturalWidth,
          image.naturalHeight,
          PREVIEW_IMAGE_MAX_EDGE,
          PREVIEW_IMAGE_MAX_EDGE,
        );
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");

        if (!context) {
          throw new Error("Could not create preview canvas");
        }

        canvas.width = fitted.width;
        canvas.height = fitted.height;
        context.drawImage(image, 0, 0, canvas.width, canvas.height);

        resolve(
          await canvasToPreviewAsset(
            canvas,
            image.naturalWidth,
            image.naturalHeight,
          ),
        );
      } catch (previewError) {
        reject(
          previewError instanceof Error
            ? previewError
            : new Error("Could not create image preview"),
        );
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not create image preview"));
    };

    image.src = objectUrl;
  });
}

export function createVideoPreviewAsset(file: File) {
  return new Promise<GeneratedPreviewAsset>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement("video");

    const cleanup = () => URL.revokeObjectURL(objectUrl);

    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    video.onloadeddata = async () => {
      try {
        const fitted = fitMediaDimensions(
          video.videoWidth,
          video.videoHeight,
          PREVIEW_IMAGE_MAX_EDGE,
          PREVIEW_IMAGE_MAX_EDGE,
        );
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");

        if (!context) {
          throw new Error("Could not create preview canvas");
        }

        canvas.width = fitted.width;
        canvas.height = fitted.height;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        resolve(
          await canvasToPreviewAsset(
            canvas,
            video.videoWidth,
            video.videoHeight,
          ),
        );
      } catch (previewError) {
        reject(
          previewError instanceof Error
            ? previewError
            : new Error("Could not create video preview"),
        );
      } finally {
        cleanup();
      }
    };

    video.onerror = () => {
      cleanup();
      reject(new Error("Could not create video preview"));
    };

    video.src = objectUrl;
    video.load();
  });
}

export function getImageDimensions(file: File) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
      URL.revokeObjectURL(objectUrl);
    };

    image.onerror = () => {
      reject(new Error("Could not read image dimensions"));
      URL.revokeObjectURL(objectUrl);
    };

    image.src = objectUrl;
  });
}

export function getVideoDimensions(file: File) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";

    video.onloadedmetadata = () => {
      resolve({ width: video.videoWidth, height: video.videoHeight });
      URL.revokeObjectURL(objectUrl);
    };

    video.onerror = () => {
      reject(new Error("Could not read video dimensions"));
      URL.revokeObjectURL(objectUrl);
    };

    video.src = objectUrl;
  });
}

export function hexToRgba(hex: string, alpha: number) {
  const normalized = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "#e5e7eb";
  const red = Number.parseInt(normalized.slice(1, 3), 16);
  const green = Number.parseInt(normalized.slice(3, 5), 16);
  const blue = Number.parseInt(normalized.slice(5, 7), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
