ALTER TABLE pipeline_routes ADD COLUMN IF NOT EXISTS superseded_route_id UUID REFERENCES pipeline_routes(id);
