-- ============================================================
-- RPC: insert_pipeline_route
-- Accepts full parsed KMZ payload as JSONB, inserts all tables
-- in a single Postgres transaction. Either everything commits
-- or everything rolls back — no partial route data possible.
-- ============================================================

CREATE OR REPLACE FUNCTION insert_pipeline_route(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_route_id UUID;
  v_org_id UUID;
  v_counts JSONB := '{}'::JSONB;
  v_item JSONB;
  v_cnt INTEGER;
BEGIN
  -- Extract organization_id (required)
  v_org_id := (payload->>'organization_id')::UUID;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'organization_id is required';
  END IF;

  -- 1. Insert pipeline_routes parent row
  INSERT INTO pipeline_routes (
    organization_id, project_id, kmz_upload_id, name, description,
    total_length_m, kp_start, kp_end,
    default_center_lat, default_center_lng, default_zoom, is_active
  ) VALUES (
    v_org_id,
    (payload->>'project_id')::UUID,
    (payload->>'kmz_upload_id')::UUID,
    payload->>'name',
    payload->>'description',
    (payload->>'total_length_m')::NUMERIC,
    (payload->>'kp_start')::NUMERIC,
    (payload->>'kp_end')::NUMERIC,
    (payload->>'default_center_lat')::NUMERIC,
    (payload->>'default_center_lng')::NUMERIC,
    COALESCE((payload->>'default_zoom')::INTEGER, 12),
    true
  )
  RETURNING id INTO v_route_id;

  -- 2. Centerline
  v_cnt := 0;
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'centerline', '[]'::JSONB))
  LOOP
    INSERT INTO route_centerline (organization_id, route_id, seq, lat, lng, elevation)
    VALUES (
      v_org_id, v_route_id,
      (v_item->>'seq')::INTEGER,
      (v_item->>'lat')::NUMERIC,
      (v_item->>'lng')::NUMERIC,
      (v_item->>'elevation')::NUMERIC
    );
    v_cnt := v_cnt + 1;
  END LOOP;
  v_counts := v_counts || jsonb_build_object('centerline', v_cnt);

  -- 3. KP Markers
  v_cnt := 0;
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'kp_markers', '[]'::JSONB))
  LOOP
    INSERT INTO route_kp_markers (organization_id, route_id, kp, lat, lng, label)
    VALUES (
      v_org_id, v_route_id,
      (v_item->>'kp')::NUMERIC,
      (v_item->>'lat')::NUMERIC,
      (v_item->>'lng')::NUMERIC,
      v_item->>'label'
    );
    v_cnt := v_cnt + 1;
  END LOOP;
  v_counts := v_counts || jsonb_build_object('kp_markers', v_cnt);

  -- 4. Welds
  v_cnt := 0;
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'welds', '[]'::JSONB))
  LOOP
    INSERT INTO route_welds (organization_id, route_id, weld_id, kp, lat, lng, weld_type, properties)
    VALUES (
      v_org_id, v_route_id,
      v_item->>'weld_id',
      (v_item->>'kp')::NUMERIC,
      (v_item->>'lat')::NUMERIC,
      (v_item->>'lng')::NUMERIC,
      v_item->>'weld_type',
      v_item->'properties'
    );
    v_cnt := v_cnt + 1;
  END LOOP;
  v_counts := v_counts || jsonb_build_object('welds', v_cnt);

  -- 5. Bends
  v_cnt := 0;
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'bends', '[]'::JSONB))
  LOOP
    INSERT INTO route_bends (organization_id, route_id, bend_id, kp, lat, lng, bend_type, properties)
    VALUES (
      v_org_id, v_route_id,
      v_item->>'bend_id',
      (v_item->>'kp')::NUMERIC,
      (v_item->>'lat')::NUMERIC,
      (v_item->>'lng')::NUMERIC,
      v_item->>'bend_type',
      v_item->'properties'
    );
    v_cnt := v_cnt + 1;
  END LOOP;
  v_counts := v_counts || jsonb_build_object('bends', v_cnt);

  -- 6. Footprint
  v_cnt := 0;
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'footprint', '[]'::JSONB))
  LOOP
    INSERT INTO route_footprint (organization_id, route_id, name, polygon, properties)
    VALUES (
      v_org_id, v_route_id,
      v_item->>'name',
      v_item->'polygon',
      v_item->'properties'
    );
    v_cnt := v_cnt + 1;
  END LOOP;
  v_counts := v_counts || jsonb_build_object('footprint', v_cnt);

  -- 7. Open Ends
  v_cnt := 0;
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'open_ends', '[]'::JSONB))
  LOOP
    INSERT INTO route_open_ends (organization_id, route_id, name, kp, lat, lng, end_type, properties)
    VALUES (
      v_org_id, v_route_id,
      v_item->>'name',
      (v_item->>'kp')::NUMERIC,
      (v_item->>'lat')::NUMERIC,
      (v_item->>'lng')::NUMERIC,
      v_item->>'end_type',
      v_item->'properties'
    );
    v_cnt := v_cnt + 1;
  END LOOP;
  v_counts := v_counts || jsonb_build_object('open_ends', v_cnt);

  -- 8. Bore Faces
  v_cnt := 0;
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'bore_faces', '[]'::JSONB))
  LOOP
    INSERT INTO route_bore_faces (organization_id, route_id, name, kp, lat, lng, face_type, properties)
    VALUES (
      v_org_id, v_route_id,
      v_item->>'name',
      (v_item->>'kp')::NUMERIC,
      (v_item->>'lat')::NUMERIC,
      (v_item->>'lng')::NUMERIC,
      v_item->>'face_type',
      v_item->'properties'
    );
    v_cnt := v_cnt + 1;
  END LOOP;
  v_counts := v_counts || jsonb_build_object('bore_faces', v_cnt);

  -- 9. Sag Bends
  v_cnt := 0;
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'sag_bends', '[]'::JSONB))
  LOOP
    INSERT INTO route_sag_bends (organization_id, route_id, name, kp, lat, lng, properties)
    VALUES (
      v_org_id, v_route_id,
      v_item->>'name',
      (v_item->>'kp')::NUMERIC,
      (v_item->>'lat')::NUMERIC,
      (v_item->>'lng')::NUMERIC,
      v_item->'properties'
    );
    v_cnt := v_cnt + 1;
  END LOOP;
  v_counts := v_counts || jsonb_build_object('sag_bends', v_cnt);

  -- 10. Unclassified features (stored as JSONB on pipeline_routes for admin review)
  v_cnt := jsonb_array_length(COALESCE(payload->'unclassified', '[]'::JSONB));
  IF v_cnt > 0 THEN
    UPDATE pipeline_routes
    SET unclassified_features = payload->'unclassified'
    WHERE id = v_route_id;
  END IF;
  v_counts := v_counts || jsonb_build_object('unclassified', v_cnt);

  -- Return result
  RETURN jsonb_build_object(
    'route_id', v_route_id,
    'organization_id', v_org_id,
    'counts', v_counts
  );

EXCEPTION WHEN OTHERS THEN
  -- Postgres automatically rolls back the entire transaction on exception
  RAISE;
END;
$$;
