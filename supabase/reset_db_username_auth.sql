-- ============================================================================
-- DANGER: FULL RESET SCRIPT (DESTRUCTIVE)
-- This script drops the String app public schema objects and recreates them.
--
-- Notes about "username not email":
-- - Supabase Auth (auth.users) still requires an email internally.
-- - This script enforces username-first app data via public.profiles.
-- - A trigger auto-creates profile.username from auth user metadata.
-- ============================================================================

BEGIN;

-- Drop app objects (data loss).
DROP TABLE IF EXISTS public.media_assets CASCADE;
DROP TABLE IF EXISTS public.element_attachments CASCADE;
DROP TABLE IF EXISTS public.canvas_elements CASCADE;
DROP TABLE IF EXISTS public.canvases CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

DROP TYPE IF EXISTS public.media_type CASCADE;
DROP TYPE IF EXISTS public.element_type CASCADE;

DROP FUNCTION IF EXISTS public.set_updated_at() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

-- Keep extension available.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Domain enums.
CREATE TYPE public.element_type AS ENUM ('text', 'image', 'audio', 'video');
CREATE TYPE public.media_type AS ENUM ('image', 'audio', 'video');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT username_not_empty CHECK (length(trim(username)) > 2)
);

CREATE TABLE public.canvases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Untitled Canvas',
  pan_x NUMERIC NOT NULL DEFAULT 0,
  pan_y NUMERIC NOT NULL DEFAULT 0,
  zoom_level NUMERIC NOT NULL DEFAULT 1 CHECK (zoom_level > 0 AND zoom_level <= 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT canvas_title_not_empty CHECK (length(trim(title)) > 0)
);

CREATE TABLE public.canvas_elements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id UUID NOT NULL REFERENCES public.canvases(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  element_type public.element_type NOT NULL,
  x NUMERIC NOT NULL CHECK (x >= 0),
  y NUMERIC NOT NULL CHECK (y >= 0),
  width NUMERIC NOT NULL CHECK (width > 0),
  height NUMERIC NOT NULL CHECK (height > 0),
  rotation NUMERIC NOT NULL DEFAULT 0 CHECK (rotation >= 0 AND rotation < 360),
  z_index INTEGER NOT NULL DEFAULT 0,
  opacity NUMERIC NOT NULL DEFAULT 1 CHECK (opacity >= 0 AND opacity <= 1),
  visible BOOLEAN NOT NULL DEFAULT TRUE,
  locked BOOLEAN NOT NULL DEFAULT FALSE,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE public.element_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id UUID NOT NULL REFERENCES public.canvases(id) ON DELETE CASCADE,
  from_element_id UUID NOT NULL REFERENCES public.canvas_elements(id) ON DELETE CASCADE,
  to_element_id UUID NOT NULL REFERENCES public.canvas_elements(id) ON DELETE CASCADE,
  pair_min UUID GENERATED ALWAYS AS (LEAST(from_element_id, to_element_id)) STORED,
  pair_max UUID GENERATED ALWAYS AS (GREATEST(from_element_id, to_element_id)) STORED,
  style JSONB NOT NULL DEFAULT '{"strokeColor": "#000000", "strokeWidth": 2}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT no_self_attachment CHECK (from_element_id <> to_element_id)
);

CREATE TABLE public.media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id UUID NOT NULL REFERENCES public.canvases(id) ON DELETE CASCADE,
  element_id UUID REFERENCES public.canvas_elements(id) ON DELETE SET NULL,
  storage_path TEXT NOT NULL,
  media_type public.media_type NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL CHECK (file_size > 0),
  mime_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT storage_path_not_empty CHECK (length(trim(storage_path)) > 0)
);

CREATE UNIQUE INDEX element_attachments_unique_active_pair
  ON public.element_attachments (canvas_id, pair_min, pair_max)
  WHERE deleted_at IS NULL;

CREATE INDEX canvases_user_id_idx ON public.canvases(user_id) WHERE deleted_at IS NULL;
CREATE INDEX canvas_elements_canvas_id_idx ON public.canvas_elements(canvas_id) WHERE deleted_at IS NULL;
CREATE INDEX attachments_canvas_id_idx ON public.element_attachments(canvas_id) WHERE deleted_at IS NULL;
CREATE INDEX media_assets_canvas_id_idx ON public.media_assets(canvas_id);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_canvases_updated_at
BEFORE UPDATE ON public.canvases
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_canvas_elements_updated_at
BEFORE UPDATE ON public.canvas_elements
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_attachments_updated_at
BEFORE UPDATE ON public.element_attachments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Username-first profile creation from auth signup metadata.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  base_username TEXT;
BEGIN
  base_username := lower(trim(COALESCE(NEW.raw_user_meta_data ->> 'username', '')));
  base_username := regexp_replace(base_username, '\s+', '.', 'g');
  base_username := regexp_replace(base_username, '[^a-z0-9._-]', '', 'g');

  IF base_username = '' OR length(base_username) < 3 THEN
    base_username := split_part(COALESCE(NEW.email, ''), '@', 1);
  END IF;

  IF base_username = '' OR length(base_username) < 3 THEN
    base_username := 'user_' || substr(NEW.id::text, 1, 8);
  END IF;

  BEGIN
    INSERT INTO public.profiles (id, username)
    VALUES (NEW.id, base_username);
  EXCEPTION
    WHEN unique_violation THEN
      INSERT INTO public.profiles (id, username)
      VALUES (NEW.id, base_username || '_' || substr(NEW.id::text, 1, 6));
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canvases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canvas_elements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.element_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select_own
ON public.profiles FOR SELECT
USING (id = auth.uid());

CREATE POLICY profiles_insert_own
ON public.profiles FOR INSERT
WITH CHECK (id = auth.uid());

CREATE POLICY profiles_update_own
ON public.profiles FOR UPDATE
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

CREATE POLICY canvases_select_own
ON public.canvases FOR SELECT
USING (user_id = auth.uid() AND deleted_at IS NULL);

CREATE POLICY canvases_insert_own
ON public.canvases FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY canvases_update_own
ON public.canvases FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY canvases_delete_own
ON public.canvases FOR DELETE
USING (user_id = auth.uid());

CREATE POLICY elements_select_own_canvas
ON public.canvas_elements FOR SELECT
USING (
  deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.canvases c
    WHERE c.id = canvas_id AND c.user_id = auth.uid() AND c.deleted_at IS NULL
  )
);

CREATE POLICY elements_insert_own_canvas
ON public.canvas_elements FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.canvases c
    WHERE c.id = canvas_id AND c.user_id = auth.uid() AND c.deleted_at IS NULL
  )
);

CREATE POLICY elements_update_own_canvas
ON public.canvas_elements FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.canvases c
    WHERE c.id = canvas_id AND c.user_id = auth.uid() AND c.deleted_at IS NULL
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.canvases c
    WHERE c.id = canvas_id AND c.user_id = auth.uid() AND c.deleted_at IS NULL
  )
);

CREATE POLICY elements_delete_own_canvas
ON public.canvas_elements FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.canvases c
    WHERE c.id = canvas_id AND c.user_id = auth.uid() AND c.deleted_at IS NULL
  )
);

CREATE POLICY attachments_select_own_canvas
ON public.element_attachments FOR SELECT
USING (
  deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.canvases c
    WHERE c.id = canvas_id AND c.user_id = auth.uid() AND c.deleted_at IS NULL
  )
);

CREATE POLICY attachments_insert_own_canvas
ON public.element_attachments FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.canvases c
    WHERE c.id = canvas_id AND c.user_id = auth.uid() AND c.deleted_at IS NULL
  )
);

CREATE POLICY attachments_update_own_canvas
ON public.element_attachments FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.canvases c
    WHERE c.id = canvas_id AND c.user_id = auth.uid() AND c.deleted_at IS NULL
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.canvases c
    WHERE c.id = canvas_id AND c.user_id = auth.uid() AND c.deleted_at IS NULL
  )
);

CREATE POLICY attachments_delete_own_canvas
ON public.element_attachments FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.canvases c
    WHERE c.id = canvas_id AND c.user_id = auth.uid() AND c.deleted_at IS NULL
  )
);

CREATE POLICY media_select_own_canvas
ON public.media_assets FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.canvases c
    WHERE c.id = canvas_id AND c.user_id = auth.uid() AND c.deleted_at IS NULL
  )
);

CREATE POLICY media_insert_own_canvas
ON public.media_assets FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.canvases c
    WHERE c.id = canvas_id AND c.user_id = auth.uid() AND c.deleted_at IS NULL
  )
);

CREATE POLICY media_delete_own_canvas
ON public.media_assets FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.canvases c
    WHERE c.id = canvas_id AND c.user_id = auth.uid() AND c.deleted_at IS NULL
  )
);

COMMIT;

-- Optional cleanup for auth users too (uncomment if you want to wipe Auth users):
-- DELETE FROM auth.identities;
-- DELETE FROM auth.users;
--
-- Storage bucket setup (run once in Supabase dashboard):
-- 1) Create private bucket named canvas-media
-- 2) Object path format: canvases/{canvas_id}/media/{filename}
-- 3) Add storage RLS policies that check auth.uid() owns the canvas_id path segment
