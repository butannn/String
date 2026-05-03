-- ============================================================================
-- String app — full setup / reset script
-- Run this in the Supabase SQL Editor to initialise or fully reset the project.
--
-- This script is idempotent: safe to re-run on an existing database.
--
-- USERNAME AUTH NOTES:
--   Supabase Auth still requires an email address internally.
--   The app stores emails as  <username>@string.internal  so users only ever
--   see/type their username.  The handle_new_user trigger auto-creates the
--   public.profiles row from raw_user_meta_data->>'username'.
--
--   Required Supabase dashboard settings:
--     Authentication → Providers → Email
--       ✓  Enable Email provider
--       ✗  Confirm email          (disable — no inbox needed)
--       ✗  Secure email change    (disable)
--       ✗  Double confirm changes (disable)
--
-- STORAGE PATH CONVENTION:
--   canvases/{canvas_id}/media/{uuid}.{ext}     ← original file
--   canvases/{canvas_id}/previews/{uuid}.{ext}  ← generated preview
-- ============================================================================


-- ============================================================================
-- SECTION 1: Drop existing app objects (tables, types, functions)
-- ============================================================================

BEGIN;

DROP TABLE IF EXISTS public.media_assets         CASCADE;
DROP TABLE IF EXISTS public.element_attachments  CASCADE;
DROP TABLE IF EXISTS public.canvas_elements      CASCADE;
DROP TABLE IF EXISTS public.canvases             CASCADE;
DROP TABLE IF EXISTS public.profiles             CASCADE;

DROP TYPE IF EXISTS public.media_type    CASCADE;
DROP TYPE IF EXISTS public.element_type  CASCADE;

DROP FUNCTION IF EXISTS public.set_updated_at()  CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;


-- ============================================================================
-- SECTION 2: Extensions & enums
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE public.element_type AS ENUM ('text', 'image', 'audio', 'video');
CREATE TYPE public.media_type   AS ENUM ('image', 'audio', 'video');


-- ============================================================================
-- SECTION 3: Tables
-- ============================================================================

CREATE TABLE public.profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username   TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT username_not_empty CHECK (length(trim(username)) > 2)
);

CREATE TABLE public.canvases (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL DEFAULT 'Untitled Canvas',
  pan_x       NUMERIC     NOT NULL DEFAULT 0,
  pan_y       NUMERIC     NOT NULL DEFAULT 0,
  zoom_level  NUMERIC     NOT NULL DEFAULT 1 CHECK (zoom_level > 0 AND zoom_level <= 5),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ,
  CONSTRAINT canvas_title_not_empty CHECK (length(trim(title)) > 0)
);

CREATE TABLE public.canvas_elements (
  id           UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id    UUID                  NOT NULL REFERENCES public.canvases(id) ON DELETE CASCADE,
  user_id      UUID                  NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  element_type public.element_type   NOT NULL,
  x            NUMERIC               NOT NULL,
  y            NUMERIC               NOT NULL,
  width        NUMERIC               NOT NULL CHECK (width > 0),
  height       NUMERIC               NOT NULL CHECK (height > 0),
  rotation     NUMERIC               NOT NULL DEFAULT 0 CHECK (rotation >= 0 AND rotation < 360),
  z_index      INTEGER               NOT NULL DEFAULT 0,
  opacity      NUMERIC               NOT NULL DEFAULT 1 CHECK (opacity >= 0 AND opacity <= 1),
  visible      BOOLEAN               NOT NULL DEFAULT TRUE,
  locked       BOOLEAN               NOT NULL DEFAULT FALSE,
  data         JSONB                 NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ           NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ           NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ
);

CREATE TABLE public.element_attachments (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id       UUID        NOT NULL REFERENCES public.canvases(id)         ON DELETE CASCADE,
  from_element_id UUID        NOT NULL REFERENCES public.canvas_elements(id)  ON DELETE CASCADE,
  to_element_id   UUID        NOT NULL REFERENCES public.canvas_elements(id)  ON DELETE CASCADE,
  pair_min        UUID        GENERATED ALWAYS AS (LEAST(from_element_id, to_element_id))    STORED,
  pair_max        UUID        GENERATED ALWAYS AS (GREATEST(from_element_id, to_element_id)) STORED,
  style           JSONB       NOT NULL DEFAULT '{"strokeColor": "#000000", "strokeWidth": 2}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ,
  CONSTRAINT no_self_attachment CHECK (from_element_id <> to_element_id)
);

CREATE TABLE public.media_assets (
  id           UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id    UUID               NOT NULL REFERENCES public.canvases(id)        ON DELETE CASCADE,
  element_id   UUID               REFERENCES public.canvas_elements(id)          ON DELETE SET NULL,
  storage_path TEXT               NOT NULL,
  media_type   public.media_type  NOT NULL,
  file_name    TEXT               NOT NULL,
  file_size    INTEGER            NOT NULL CHECK (file_size > 0),
  mime_type    TEXT               NOT NULL,
  created_at   TIMESTAMPTZ        NOT NULL DEFAULT now(),
  CONSTRAINT storage_path_not_empty CHECK (length(trim(storage_path)) > 0)
);


-- ============================================================================
-- SECTION 4: Indexes
-- ============================================================================

CREATE UNIQUE INDEX element_attachments_unique_active_pair
  ON public.element_attachments (canvas_id, pair_min, pair_max)
  WHERE deleted_at IS NULL;

CREATE INDEX canvases_user_id_idx          ON public.canvases(user_id)          WHERE deleted_at IS NULL;
CREATE INDEX canvas_elements_canvas_id_idx ON public.canvas_elements(canvas_id) WHERE deleted_at IS NULL;
CREATE INDEX attachments_canvas_id_idx     ON public.element_attachments(canvas_id) WHERE deleted_at IS NULL;
CREATE INDEX media_assets_canvas_id_idx    ON public.media_assets(canvas_id);


-- ============================================================================
-- SECTION 5: Triggers — updated_at
-- ============================================================================

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


-- ============================================================================
-- SECTION 6: Username auth — auto-create profile on signup
-- ============================================================================
-- The trigger reads raw_user_meta_data->>'username' set by the client during
-- supabase.auth.signUp({ options: { data: { username: '...' } } }).
-- Falls back to the email local-part, then a generated ID-based name.

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


-- ============================================================================
-- SECTION 7: Row-level security — enable on all tables
-- ============================================================================

ALTER TABLE public.profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canvases          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canvas_elements   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.element_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_assets      ENABLE ROW LEVEL SECURITY;


-- profiles
CREATE POLICY profiles_select_own ON public.profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY profiles_insert_own ON public.profiles FOR INSERT
  WITH CHECK (id = auth.uid());

CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());


-- canvases
CREATE POLICY canvases_select_own ON public.canvases FOR SELECT
  USING (user_id = auth.uid() AND deleted_at IS NULL);

CREATE POLICY canvases_insert_own ON public.canvases FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY canvases_update_own ON public.canvases FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY canvases_delete_own ON public.canvases FOR DELETE
  USING (user_id = auth.uid());


-- canvas_elements
CREATE POLICY elements_select_own_canvas ON public.canvas_elements FOR SELECT
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.canvases c
      WHERE c.id = canvas_id AND c.user_id = auth.uid() AND c.deleted_at IS NULL
    )
  );

CREATE POLICY elements_insert_own_canvas ON public.canvas_elements FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.canvases c
      WHERE c.id = canvas_id AND c.user_id = auth.uid() AND c.deleted_at IS NULL
    )
  );

CREATE POLICY elements_update_own_canvas ON public.canvas_elements FOR UPDATE
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

CREATE POLICY elements_delete_own_canvas ON public.canvas_elements FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.canvases c
      WHERE c.id = canvas_id AND c.user_id = auth.uid() AND c.deleted_at IS NULL
    )
  );


-- element_attachments
-- Note: WITH CHECK omits deleted_at IS NULL so soft-deletes (setting deleted_at)
-- are not blocked by the update policy.
CREATE POLICY attachments_select_own_canvas ON public.element_attachments FOR SELECT
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.canvases c
      WHERE c.id = canvas_id AND c.user_id = auth.uid() AND c.deleted_at IS NULL
    )
  );

CREATE POLICY attachments_insert_own_canvas ON public.element_attachments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.canvases c
      WHERE c.id = canvas_id AND c.user_id = auth.uid() AND c.deleted_at IS NULL
    )
  );

CREATE POLICY attachments_update_own_canvas ON public.element_attachments FOR UPDATE
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

CREATE POLICY attachments_delete_own_canvas ON public.element_attachments FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.canvases c
      WHERE c.id = canvas_id AND c.user_id = auth.uid() AND c.deleted_at IS NULL
    )
  );


-- media_assets
CREATE POLICY media_select_own_canvas ON public.media_assets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.canvases c
      WHERE c.id = canvas_id AND c.user_id = auth.uid() AND c.deleted_at IS NULL
    )
  );

CREATE POLICY media_insert_own_canvas ON public.media_assets FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.canvases c
      WHERE c.id = canvas_id AND c.user_id = auth.uid() AND c.deleted_at IS NULL
    )
  );

CREATE POLICY media_delete_own_canvas ON public.media_assets FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.canvases c
      WHERE c.id = canvas_id AND c.user_id = auth.uid() AND c.deleted_at IS NULL
    )
  );

COMMIT;


-- ============================================================================
-- SECTION 8: Storage — canvas-media bucket and object policies
-- ============================================================================
-- Run this section in the same SQL Editor session.
-- It is safe to re-run (all policies are dropped before being recreated).

BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'canvas-media',
  'canvas-media',
  false,
  104857600,
  ARRAY['image/*', 'audio/*', 'video/*']
)
ON CONFLICT (id) DO NOTHING;

-- SELECT: owner can read their own canvas objects
DROP POLICY IF EXISTS "storage_select_canvas_media" ON storage.objects;
CREATE POLICY "storage_select_canvas_media"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'canvas-media'
  AND split_part(name, '/', 1) = 'canvases'
  AND EXISTS (
    SELECT 1 FROM public.canvases c
    WHERE c.id::text = split_part(name, '/', 2)
      AND c.user_id = auth.uid()
      AND c.deleted_at IS NULL
  )
);

-- INSERT: owner can upload to canvases/{canvas_id}/media/  OR  /previews/
DROP POLICY IF EXISTS "storage_insert_canvas_media" ON storage.objects;
CREATE POLICY "storage_insert_canvas_media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'canvas-media'
  AND split_part(name, '/', 1) = 'canvases'
  AND split_part(name, '/', 3) IN ('media', 'previews')
  AND EXISTS (
    SELECT 1 FROM public.canvases c
    WHERE c.id::text = split_part(name, '/', 2)
      AND c.user_id = auth.uid()
      AND c.deleted_at IS NULL
  )
);

-- UPDATE: owner can overwrite their own canvas objects
DROP POLICY IF EXISTS "storage_update_canvas_media" ON storage.objects;
CREATE POLICY "storage_update_canvas_media"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'canvas-media'
  AND split_part(name, '/', 1) = 'canvases'
  AND EXISTS (
    SELECT 1 FROM public.canvases c
    WHERE c.id::text = split_part(name, '/', 2)
      AND c.user_id = auth.uid()
      AND c.deleted_at IS NULL
  )
)
WITH CHECK (
  bucket_id = 'canvas-media'
  AND split_part(name, '/', 1) = 'canvases'
  AND EXISTS (
    SELECT 1 FROM public.canvases c
    WHERE c.id::text = split_part(name, '/', 2)
      AND c.user_id = auth.uid()
      AND c.deleted_at IS NULL
  )
);

-- DELETE: owner can remove their own canvas objects
DROP POLICY IF EXISTS "storage_delete_canvas_media" ON storage.objects;
CREATE POLICY "storage_delete_canvas_media"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'canvas-media'
  AND split_part(name, '/', 1) = 'canvases'
  AND EXISTS (
    SELECT 1 FROM public.canvases c
    WHERE c.id::text = split_part(name, '/', 2)
      AND c.user_id = auth.uid()
      AND c.deleted_at IS NULL
  )
);

COMMIT;


-- ============================================================================
-- OPTIONAL: Wipe all auth users (dev resets only — destructive, uncomment if needed)
-- ============================================================================
-- DELETE FROM auth.identities;
-- DELETE FROM auth.users;
-- ============================================================================
-- String app — single setup script
-- Run this once in the Supabase SQL Editor to fully initialise a fresh project.
--
-- What this script does (in order):
--   1. Drops all existing app tables, types, and functions (safe for fresh DB)
--   2. Creates tables, indexes, triggers, and RLS policies
--   3. Installs handle_new_user trigger (auto-creates profile on signup)
--   4. Creates the canvas-media storage bucket and its RLS policies
--
-- NOT included (run separately if needed):
--   - remove_old_text_elements.sql  →  periodic data-maintenance script only
--
-- Optional: uncomment the auth.users DELETE lines at the bottom to also wipe
-- existing auth users when resetting a dev project.
-- ============================================================================


-- ============================================================================
-- SECTION 1: Schema — tables, indexes, triggers, RLS
-- ============================================================================

BEGIN;

-- Drop existing app objects so this script is idempotent on a used project.
DROP TABLE IF EXISTS public.media_assets CASCADE;
DROP TABLE IF EXISTS public.element_attachments CASCADE;
DROP TABLE IF EXISTS public.canvas_elements CASCADE;
DROP TABLE IF EXISTS public.canvases CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

DROP TYPE IF EXISTS public.media_type CASCADE;
DROP TYPE IF EXISTS public.element_type CASCADE;

DROP FUNCTION IF EXISTS public.set_updated_at() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

-- Extensions.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Enums.
CREATE TYPE public.element_type AS ENUM ('text', 'image', 'audio', 'video');
CREATE TYPE public.media_type AS ENUM ('image', 'audio', 'video');

-- Tables.
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

-- Indexes.
CREATE UNIQUE INDEX element_attachments_unique_active_pair
  ON public.element_attachments (canvas_id, pair_min, pair_max)
  WHERE deleted_at IS NULL;

CREATE INDEX canvases_user_id_idx ON public.canvases(user_id) WHERE deleted_at IS NULL;
CREATE INDEX canvas_elements_canvas_id_idx ON public.canvas_elements(canvas_id) WHERE deleted_at IS NULL;
CREATE INDEX attachments_canvas_id_idx ON public.element_attachments(canvas_id) WHERE deleted_at IS NULL;
CREATE INDEX media_assets_canvas_id_idx ON public.media_assets(canvas_id);

-- updated_at trigger function.
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

-- Auto-create profile on signup, using username from auth metadata.
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

-- Row Level Security.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canvases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canvas_elements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.element_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;

-- profiles policies.
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

-- canvases policies.
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

-- canvas_elements policies.
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

-- element_attachments policies.
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

-- media_assets policies.
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

-- Optional: uncomment to also wipe existing auth users (dev resets only).
-- DELETE FROM auth.identities;
-- DELETE FROM auth.users;


-- ============================================================================
-- SECTION 2: Storage — canvas-media bucket and object policies
-- ============================================================================

BEGIN;

-- Create bucket (idempotent).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'canvas-media',
  'canvas-media',
  false,
  104857600,
  ARRAY['image/*', 'audio/*', 'video/*']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies (drop first so the script is re-runnable).
-- Path convention: canvases/{canvas_id}/media/{filename}
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
  AND split_part(name, '/', 3) IN ('media', 'previews')
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
