-- Migration: Add missing columns to trackable_items table
-- These columns correspond to form fields in TrackableItemsTracker.jsx
-- that were previously silently discarded on save (29 fields total)

-- Shared across multiple item types
ALTER TABLE public.trackable_items ADD COLUMN IF NOT EXISTS length numeric;
ALTER TABLE public.trackable_items ADD COLUMN IF NOT EXISTS reason text;
ALTER TABLE public.trackable_items ADD COLUMN IF NOT EXISTS equipment text;

-- Rock Trench fields
ALTER TABLE public.trackable_items ADD COLUMN IF NOT EXISTS rock_type text;
ALTER TABLE public.trackable_items ADD COLUMN IF NOT EXISTS depth_achieved numeric;
ALTER TABLE public.trackable_items ADD COLUMN IF NOT EXISTS spec_depth numeric;

-- Extra Depth Ditch fields
ALTER TABLE public.trackable_items ADD COLUMN IF NOT EXISTS extra_depth_amount numeric;
ALTER TABLE public.trackable_items ADD COLUMN IF NOT EXISTS total_depth numeric;
ALTER TABLE public.trackable_items ADD COLUMN IF NOT EXISTS in_drawings text;
ALTER TABLE public.trackable_items ADD COLUMN IF NOT EXISTS approved_by text;

-- Bedding & Padding fields
ALTER TABLE public.trackable_items ADD COLUMN IF NOT EXISTS protection_type text;
ALTER TABLE public.trackable_items ADD COLUMN IF NOT EXISTS material text;

-- Ramps fields
ALTER TABLE public.trackable_items ADD COLUMN IF NOT EXISTS ramp_material text;
ALTER TABLE public.trackable_items ADD COLUMN IF NOT EXISTS mats_used text;
ALTER TABLE public.trackable_items ADD COLUMN IF NOT EXISTS mat_count numeric;

-- Goal Posts (Power Lines) safety fields
ALTER TABLE public.trackable_items ADD COLUMN IF NOT EXISTS utility_owner text;
ALTER TABLE public.trackable_items ADD COLUMN IF NOT EXISTS post_material text;
ALTER TABLE public.trackable_items ADD COLUMN IF NOT EXISTS material_compliant text;
ALTER TABLE public.trackable_items ADD COLUMN IF NOT EXISTS authorized_clearance numeric;
ALTER TABLE public.trackable_items ADD COLUMN IF NOT EXISTS posted_height numeric;
ALTER TABLE public.trackable_items ADD COLUMN IF NOT EXISTS danger_sign text;
ALTER TABLE public.trackable_items ADD COLUMN IF NOT EXISTS reflective_signage text;
ALTER TABLE public.trackable_items ADD COLUMN IF NOT EXISTS grounding_required text;
ALTER TABLE public.trackable_items ADD COLUMN IF NOT EXISTS grounding_installed text;
ALTER TABLE public.trackable_items ADD COLUMN IF NOT EXISTS offset_distance numeric;
ALTER TABLE public.trackable_items ADD COLUMN IF NOT EXISTS offset_compliant text;

-- Weld UPI fields
ALTER TABLE public.trackable_items ADD COLUMN IF NOT EXISTS upi_type text;
ALTER TABLE public.trackable_items ADD COLUMN IF NOT EXISTS weld_number text;
ALTER TABLE public.trackable_items ADD COLUMN IF NOT EXISTS status text;
