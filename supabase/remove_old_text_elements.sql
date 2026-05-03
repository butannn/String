-- Remove old text elements from String app data
-- Run in Supabase SQL Editor
--
-- This script includes two options:
-- 1) Soft delete (recommended): preserve history, mark rows deleted
-- 2) Hard delete: permanently remove rows
--
-- Adjust retention window by changing INTERVAL '30 days'.

-- =============================================
-- Option 1: SOFT DELETE (recommended)
-- =============================================
BEGIN;

WITH old_text AS (
  SELECT id
  FROM public.canvas_elements
  WHERE element_type = 'text'
    AND deleted_at IS NULL
    AND created_at < NOW() - INTERVAL '30 days'
),
attachments_updated AS (
  UPDATE public.element_attachments ea
  SET deleted_at = NOW(),
      updated_at = NOW()
  WHERE ea.deleted_at IS NULL
    AND (
      ea.from_element_id IN (SELECT id FROM old_text)
      OR ea.to_element_id IN (SELECT id FROM old_text)
    )
  RETURNING ea.id
),
elements_updated AS (
  UPDATE public.canvas_elements ce
  SET deleted_at = NOW(),
      updated_at = NOW()
  WHERE ce.id IN (SELECT id FROM old_text)
  RETURNING ce.id
)
SELECT
  (SELECT COUNT(*) FROM elements_updated) AS text_elements_soft_deleted,
  (SELECT COUNT(*) FROM attachments_updated) AS attachments_soft_deleted;

COMMIT;

-- =============================================
-- Option 2: HARD DELETE (permanent)
-- =============================================
-- BEGIN;
--
-- WITH old_text AS (
--   SELECT id
--   FROM public.canvas_elements
--   WHERE element_type = 'text'
--     AND created_at < NOW() - INTERVAL '30 days'
-- ),
-- attachments_deleted AS (
--   DELETE FROM public.element_attachments ea
--   WHERE ea.from_element_id IN (SELECT id FROM old_text)
--      OR ea.to_element_id IN (SELECT id FROM old_text)
--   RETURNING ea.id
-- ),
-- elements_deleted AS (
--   DELETE FROM public.canvas_elements ce
--   WHERE ce.id IN (SELECT id FROM old_text)
--   RETURNING ce.id
-- )
-- SELECT
--   (SELECT COUNT(*) FROM elements_deleted) AS text_elements_hard_deleted,
--   (SELECT COUNT(*) FROM attachments_deleted) AS attachments_hard_deleted;
--
-- COMMIT;
