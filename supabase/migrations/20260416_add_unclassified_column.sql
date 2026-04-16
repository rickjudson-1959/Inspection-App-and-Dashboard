-- Store unclassified KML features for admin review
ALTER TABLE pipeline_routes ADD COLUMN IF NOT EXISTS unclassified_features JSONB DEFAULT '[]'::JSONB;
