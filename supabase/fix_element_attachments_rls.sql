-- Fix RLS for public.element_attachments
-- Run this in Supabase SQL Editor on the affected project.
--
-- Why: If an old UPDATE policy requires deleted_at IS NULL in WITH CHECK,
-- soft-deleting an attachment (setting deleted_at) fails with:
-- code 42501 "new row violates row-level security policy".

BEGIN;

ALTER TABLE public.element_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS attachments_select_own_canvas ON public.element_attachments;
DROP POLICY IF EXISTS attachments_insert_own_canvas ON public.element_attachments;
DROP POLICY IF EXISTS attachments_update_own_canvas ON public.element_attachments;
DROP POLICY IF EXISTS attachments_delete_own_canvas ON public.element_attachments;

CREATE POLICY attachments_select_own_canvas
ON public.element_attachments FOR SELECT
USING (
  deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.canvases c
    WHERE c.id = canvas_id
      AND c.user_id = auth.uid()
      AND c.deleted_at IS NULL
  )
);

CREATE POLICY attachments_insert_own_canvas
ON public.element_attachments FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.canvases c
    WHERE c.id = canvas_id
      AND c.user_id = auth.uid()
      AND c.deleted_at IS NULL
  )
);

CREATE POLICY attachments_update_own_canvas
ON public.element_attachments FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.canvases c
    WHERE c.id = canvas_id
      AND c.user_id = auth.uid()
      AND c.deleted_at IS NULL
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.canvases c
    WHERE c.id = canvas_id
      AND c.user_id = auth.uid()
      AND c.deleted_at IS NULL
  )
);

CREATE POLICY attachments_delete_own_canvas
ON public.element_attachments FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.canvases c
    WHERE c.id = canvas_id
      AND c.user_id = auth.uid()
      AND c.deleted_at IS NULL
  )
);

COMMIT;
