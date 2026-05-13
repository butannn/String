-- Add canvas_type column to support UK map canvases
-- Run this in your Supabase SQL editor

ALTER TABLE canvases
  ADD COLUMN IF NOT EXISTS canvas_type TEXT NOT NULL DEFAULT 'standard';
