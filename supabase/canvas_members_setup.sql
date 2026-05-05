-- ============================================================================
-- Canvas Members — sharing / collaboration setup  (v2 — fixes RLS cycle)
-- Run this in the Supabase SQL Editor AFTER the main setup.sql has been run.
--
-- If you previously ran an earlier version of this file, run it again — it is
-- fully idempotent (all DROP IF EXISTS guards are in place).
--
-- Root cause of the cycle that was fixed here:
--   The canvases SELECT policy checked canvas_members, and the canvas_members
--   SELECT policy checked canvases — Postgres detected infinite recursion and
--   failed every query that touched either table (canvases appeared deleted,
--   canvas creation silently did nothing).
--
-- Fix: two SECURITY DEFINER helper functions that bypass RLS when called from
--   within other RLS policies, breaking the cycle entirely.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. SECURITY DEFINER helpers — break the RLS circular dependency
--
-- When canvases SELECT policy needs to check canvas_members, and canvas_members
-- SELECT policy needs to check canvases, Postgres enters infinite recursion.
-- SECURITY DEFINER functions bypass RLS on the table they query, cutting the
-- cycle at both ends.
-- ============================================================================

DROP FUNCTION IF EXISTS public.user_owns_canvas(uuid);
DROP FUNCTION IF EXISTS public.user_is_canvas_member(uuid);

-- Returns true when auth.uid() owns the canvas (reads canvases without RLS).
CREATE FUNCTION public.user_owns_canvas(p_canvas_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.canvases
    WHERE id = p_canvas_id
      AND user_id = auth.uid()
      AND deleted_at IS NULL
  );
$$;

-- Returns true when auth.uid() is a member (reads canvas_members without RLS).
CREATE FUNCTION public.user_is_canvas_member(p_canvas_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.canvas_members
    WHERE canvas_id = p_canvas_id
      AND user_id = auth.uid()
  );
$$;


-- ============================================================================
-- 2. canvas_members table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.canvas_members (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id   UUID        NOT NULL REFERENCES public.canvases(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT        NOT NULL DEFAULT 'editor' CHECK (role IN ('editor')),
  invited_by  UUID        NOT NULL REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT canvas_members_unique UNIQUE (canvas_id, user_id)
);

CREATE INDEX IF NOT EXISTS canvas_members_canvas_id_idx ON public.canvas_members(canvas_id);
CREATE INDEX IF NOT EXISTS canvas_members_user_id_idx   ON public.canvas_members(user_id);

ALTER TABLE public.canvas_members ENABLE ROW LEVEL SECURITY;

-- Drop old policies so this script is idempotent.
DROP POLICY IF EXISTS members_select_owner ON public.canvas_members;
DROP POLICY IF EXISTS members_select_self  ON public.canvas_members;
DROP POLICY IF EXISTS members_insert_owner ON public.canvas_members;
DROP POLICY IF EXISTS members_delete_owner ON public.canvas_members;

-- Owner sees all members (SECURITY DEFINER — no cycle with canvases).
CREATE POLICY members_select_owner ON public.canvas_members FOR SELECT
  USING (public.user_owns_canvas(canvas_id));

-- Members can see their own row.
CREATE POLICY members_select_self ON public.canvas_members FOR SELECT
  USING (user_id = auth.uid());

-- Only the canvas owner can add members.
CREATE POLICY members_insert_owner ON public.canvas_members FOR INSERT
  WITH CHECK (public.user_owns_canvas(canvas_id));

-- Only the canvas owner can remove members.
CREATE POLICY members_delete_owner ON public.canvas_members FOR DELETE
  USING (public.user_owns_canvas(canvas_id));


-- ============================================================================
-- 3. profiles — any authenticated user can look up by username
-- ============================================================================

DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
DROP POLICY IF EXISTS profiles_select_any ON public.profiles;

CREATE POLICY profiles_select_any ON public.profiles FOR SELECT
  TO authenticated
  USING (true);


-- ============================================================================
-- 4. canvases SELECT — owner OR member
--    Uses user_is_canvas_member() (SECURITY DEFINER) — no cycle.
-- ============================================================================

DROP POLICY IF EXISTS canvases_select_own ON public.canvases;

CREATE POLICY canvases_select_own ON public.canvases FOR SELECT
  USING (
    deleted_at IS NULL
    AND (
      user_id = auth.uid()
      OR public.user_is_canvas_member(id)
    )
  );


-- ============================================================================
-- 5. canvas_elements — owner or member
--    Uses SECURITY DEFINER helpers — no cycle.
-- ============================================================================

DROP POLICY IF EXISTS elements_select_own_canvas ON public.canvas_elements;
DROP POLICY IF EXISTS elements_insert_own_canvas ON public.canvas_elements;
DROP POLICY IF EXISTS elements_update_own_canvas ON public.canvas_elements;
DROP POLICY IF EXISTS elements_delete_own_canvas ON public.canvas_elements;

CREATE POLICY elements_select_own_canvas ON public.canvas_elements FOR SELECT
  USING (
    deleted_at IS NULL
    AND (
      public.user_owns_canvas(canvas_id)
      OR public.user_is_canvas_member(canvas_id)
    )
  );

CREATE POLICY elements_insert_own_canvas ON public.canvas_elements FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND (
      public.user_owns_canvas(canvas_id)
      OR public.user_is_canvas_member(canvas_id)
    )
  );

CREATE POLICY elements_update_own_canvas ON public.canvas_elements FOR UPDATE
  USING (
    public.user_owns_canvas(canvas_id)
    OR public.user_is_canvas_member(canvas_id)
  )
  WITH CHECK (
    public.user_owns_canvas(canvas_id)
    OR public.user_is_canvas_member(canvas_id)
  );

CREATE POLICY elements_delete_own_canvas ON public.canvas_elements FOR DELETE
  USING (
    public.user_owns_canvas(canvas_id)
    OR public.user_is_canvas_member(canvas_id)
  );


-- ============================================================================
-- 6. element_attachments — owner or member
-- ============================================================================

DROP POLICY IF EXISTS attachments_select_own_canvas ON public.element_attachments;
DROP POLICY IF EXISTS attachments_insert_own_canvas ON public.element_attachments;
DROP POLICY IF EXISTS attachments_update_own_canvas ON public.element_attachments;
DROP POLICY IF EXISTS attachments_delete_own_canvas ON public.element_attachments;

CREATE POLICY attachments_select_own_canvas ON public.element_attachments FOR SELECT
  USING (
    deleted_at IS NULL
    AND (
      public.user_owns_canvas(canvas_id)
      OR public.user_is_canvas_member(canvas_id)
    )
  );

CREATE POLICY attachments_insert_own_canvas ON public.element_attachments FOR INSERT
  WITH CHECK (
    public.user_owns_canvas(canvas_id)
    OR public.user_is_canvas_member(canvas_id)
  );

CREATE POLICY attachments_update_own_canvas ON public.element_attachments FOR UPDATE
  USING (
    public.user_owns_canvas(canvas_id)
    OR public.user_is_canvas_member(canvas_id)
  );

CREATE POLICY attachments_delete_own_canvas ON public.element_attachments FOR DELETE
  USING (
    public.user_owns_canvas(canvas_id)
    OR public.user_is_canvas_member(canvas_id)
  );


-- ============================================================================
-- 7. media_assets — owner or member
-- ============================================================================

DROP POLICY IF EXISTS media_assets_select_own ON public.media_assets;
DROP POLICY IF EXISTS media_assets_insert_own ON public.media_assets;

CREATE POLICY media_assets_select_own ON public.media_assets FOR SELECT
  USING (
    public.user_owns_canvas(canvas_id)
    OR public.user_is_canvas_member(canvas_id)
  );

CREATE POLICY media_assets_insert_own ON public.media_assets FOR INSERT
  WITH CHECK (
    public.user_owns_canvas(canvas_id)
    OR public.user_is_canvas_member(canvas_id)
  );


-- ============================================================================
-- 8. Storage — owner or member can read and upload
-- ============================================================================

-- SELECT: owner OR member can read
DROP POLICY IF EXISTS "storage_select_canvas_media" ON storage.objects;
CREATE POLICY "storage_select_canvas_media"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'canvas-media'
  AND split_part(name, '/', 1) = 'canvases'
  AND (
    public.user_owns_canvas(split_part(name, '/', 2)::uuid)
    OR public.user_is_canvas_member(split_part(name, '/', 2)::uuid)
  )
);

-- INSERT: owner OR member can upload
DROP POLICY IF EXISTS "storage_insert_canvas_media" ON storage.objects;
CREATE POLICY "storage_insert_canvas_media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'canvas-media'
  AND split_part(name, '/', 1) = 'canvases'
  AND split_part(name, '/', 3) IN ('media', 'previews')
  AND (
    public.user_owns_canvas(split_part(name, '/', 2)::uuid)
    OR public.user_is_canvas_member(split_part(name, '/', 2)::uuid)
  )
);

-- UPDATE: owner OR member can overwrite
DROP POLICY IF EXISTS "storage_update_canvas_media" ON storage.objects;
CREATE POLICY "storage_update_canvas_media"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'canvas-media'
  AND split_part(name, '/', 1) = 'canvases'
  AND (
    public.user_owns_canvas(split_part(name, '/', 2)::uuid)
    OR public.user_is_canvas_member(split_part(name, '/', 2)::uuid)
  )
)
WITH CHECK (
  bucket_id = 'canvas-media'
  AND split_part(name, '/', 1) = 'canvases'
  AND (
    public.user_owns_canvas(split_part(name, '/', 2)::uuid)
    OR public.user_is_canvas_member(split_part(name, '/', 2)::uuid)
  )
);

-- DELETE: owner only
DROP POLICY IF EXISTS "storage_delete_canvas_media" ON storage.objects;
CREATE POLICY "storage_delete_canvas_media"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'canvas-media'
  AND split_part(name, '/', 1) = 'canvases'
  AND public.user_owns_canvas(split_part(name, '/', 2)::uuid)
);

COMMIT;
