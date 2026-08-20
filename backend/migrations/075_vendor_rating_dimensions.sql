-- Vendor Rating redesign: multi-dimension scoring.
--
-- vendor_ratings (001_initial_schema.sql) has always been a single blended
-- 1-5 "score" -- this replaces it with 5 separate dimensions (quality,
-- timeliness, communication, cost competitiveness, compliance), each scored
-- 1-5, with "overall" now a generated average of the five rather than a
-- separately-entered number.
--
-- Still global per rater per vendor (UNIQUE (vendor_id, rated_by) is
-- unchanged) -- per-engagement/per-category granularity was explicitly
-- scoped OUT of this pass; only the scoring dimensions changed.

ALTER TABLE vendor_ratings
  ADD COLUMN quality              integer CHECK (quality BETWEEN 1 AND 5),
  ADD COLUMN timeliness           integer CHECK (timeliness BETWEEN 1 AND 5),
  ADD COLUMN communication        integer CHECK (communication BETWEEN 1 AND 5),
  ADD COLUMN cost_competitiveness integer CHECK (cost_competitiveness BETWEEN 1 AND 5),
  ADD COLUMN compliance           integer CHECK (compliance BETWEEN 1 AND 5),
  ADD COLUMN updated_at           timestamptz DEFAULT now();

-- No historical per-dimension data exists -- seed all 5 dimensions from each
-- row's single historical overall score as the best available placeholder,
-- rather than leaving existing ratings NULL/broken.
UPDATE vendor_ratings SET
  quality = score, timeliness = score, communication = score,
  cost_competitiveness = score, compliance = score
WHERE quality IS NULL;

ALTER TABLE vendor_ratings
  ALTER COLUMN quality              SET NOT NULL,
  ALTER COLUMN timeliness           SET NOT NULL,
  ALTER COLUMN communication        SET NOT NULL,
  ALTER COLUMN cost_competitiveness SET NOT NULL,
  ALTER COLUMN compliance           SET NOT NULL;

ALTER TABLE vendor_ratings ADD COLUMN overall numeric GENERATED ALWAYS AS (
  (quality + timeliness + communication + cost_competitiveness + compliance) / 5.0
) STORED;

ALTER TABLE vendor_ratings DROP COLUMN score;

CREATE TRIGGER vendor_ratings_set_updated_at
  BEFORE UPDATE ON vendor_ratings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
