-- ============================================================================
-- Supabase Storage setup for String app
-- Run this in Supabase SQL Editor (project DB)
-- ============================================================================

BEGIN;

-- Create bucket if missing.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'canvas-media',
  'canvas-media',
  false,
  104857600,
  ARRAY['image/*', 'audio/*', 'video/*']
)
ON CONFLICT (id) DO NOTHING;

-- Private read for authenticated users who own the canvas in path:
-- canvases/{canvas_id}/media/{filename}
DROP POLICY IF EXISTS "storage_select_canvas_media" ON storage.objects;
CREATE POLICY "storage_select_canvas_media"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'canvas-media'
  AND split_part(name, '/', 1) = 'canvases'
  AND EXISTS (
    SELECT 1
    FROM public.canvases c
    WHERE c.id::text = split_part(name, '/', 2)
      AND c.user_id = auth.uid()
      AND c.deleted_at IS NULL
  )
);

DROP POLICY IF EXISTS "storage_insert_canvas_media" ON storage.objects;
CREATE POLICY "storage_insert_canvas_media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'canvas-media'
  AND split_part(name, '/', 1) = 'canvases'
  AND split_part(name, '/', 3) = 'media'
  AND EXISTS (
    SELECT 1
    FROM public.canvases c
    WHERE c.id::text = split_part(name, '/', 2)
      AND c.user_id = auth.uid()
      AND c.deleted_at IS NULL
  )
);

DROP POLICY IF EXISTS "storage_update_canvas_media" ON storage.objects;
CREATE POLICY "storage_update_canvas_media"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'canvas-media'
  AND split_part(name, '/', 1) = 'canvases'
  AND EXISTS (
    SELECT 1
    FROM public.canvases c
    WHERE c.id::text = split_part(name, '/', 2)
      AND c.user_id = auth.uid()
      AND c.deleted_at IS NULL
  )
)
WITH CHECK (
  bucket_id = 'canvas-media'
  AND split_part(name, '/', 1) = 'canvases'
  AND EXISTS (
    SELECT 1
    FROM public.canvases c
    WHERE c.id::text = split_part(name, '/', 2)
      AND c.user_id = auth.uid()
      AND c.deleted_at IS NULL
  )
);

DROP POLICY IF EXISTS "storage_delete_canvas_media" ON storage.objects;
CREATE POLICY "storage_delete_canvas_media"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'canvas-media'
  AND split_part(name, '/', 1) = 'canvases'
  AND EXISTS (
    SELECT 1
    FROM public.canvases c
    WHERE c.id::text = split_part(name, '/', 2)
      AND c.user_id = auth.uid()
      AND c.deleted_at IS NULL
  )
);

COMMIT;
