BEGIN;

CREATE FUNCTION "football_position_code"(value TEXT)
RETURNS TEXT LANGUAGE SQL IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE upper(btrim(value))
    WHEN 'CF' THEN 'ST' WHEN 'SS' THEN 'ST'
    WHEN 'RWB' THEN 'RB' WHEN 'LWB' THEN 'LB'
    WHEN 'RCM' THEN 'CM' WHEN 'LCM' THEN 'CM'
    WHEN 'LM' THEN 'LW' WHEN 'RM' THEN 'RW'
    ELSE upper(btrim(value)) END;
$$;

-- Handles older snapshots when the migration is replayed in another installation.
-- In the current local DB the explicit normalization script already records UPDATE audit logs.
WITH normalized_players AS (
  SELECT p."id", "football_position_code"(p."position") AS position,
    ARRAY(
      SELECT code FROM (
        SELECT "football_position_code"(entry.position) AS code, min(entry.ord) AS first_seen
        FROM unnest(p."secondary_positions") WITH ORDINALITY AS entry(position, ord)
        GROUP BY "football_position_code"(entry.position)
      ) normalized
      WHERE code <> "football_position_code"(p."position")
      ORDER BY first_seen
    ) AS secondary_positions
  FROM "players" p
)
UPDATE "players" p
SET "position" = n.position, "secondary_positions" = n.secondary_positions
FROM normalized_players n
WHERE p."id" = n."id" AND (p."position" IS DISTINCT FROM n.position OR p."secondary_positions"::TEXT[] IS DISTINCT FROM n.secondary_positions);
UPDATE "club_requirements" SET "position" = "football_position_code"("position")
WHERE "position" IS DISTINCT FROM "football_position_code"("position");

ALTER TABLE "players" ADD CONSTRAINT "player_primary_position_valid"
  CHECK ("position" IN ('ST','LW','RW','CDM','CAM','CM','CB','RB','LB','GK'));
ALTER TABLE "club_requirements" ADD CONSTRAINT "requirement_position_valid"
  CHECK ("position" IN ('ST','LW','RW','CDM','CAM','CM','CB','RB','LB','GK'));

CREATE OR REPLACE FUNCTION "matching_secondary_positions_valid"(primary_position TEXT, positions TEXT[])
RETURNS BOOLEAN LANGUAGE SQL IMMUTABLE PARALLEL SAFE AS $$
  SELECT positions IS NOT NULL
    AND COALESCE(array_ndims(positions), 1) = 1
    AND NOT EXISTS (
      SELECT 1 FROM unnest(positions) AS entry(position)
      WHERE position IS NULL
        OR position NOT IN ('ST','LW','RW','CDM','CAM','CM','CB','RB','LB','GK')
        OR position = primary_position
    )
    AND cardinality(positions) = (SELECT count(DISTINCT position) FROM unnest(positions) AS entry(position));
$$;
ALTER TABLE "players" DROP CONSTRAINT "player_secondary_positions_valid";
ALTER TABLE "players" ADD CONSTRAINT "player_secondary_positions_valid"
  CHECK ("matching_secondary_positions_valid"("position", "secondary_positions"));

COMMIT;
