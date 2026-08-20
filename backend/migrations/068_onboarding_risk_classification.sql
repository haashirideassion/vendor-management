-- Onboarding & Organisation Authority spec: risk classification.
--
-- CONFIRMED design: purely country + vendor type, no scoring/weighting, not
-- tenant-configurable. LOW risk = registered country matches the platform's
-- home market (India, the only market this schema has ever assumed) AND
-- entity_type = 'individual' (sole proprietor / small self-employed
-- vendor). Anything else -- a foreign vendor, OR a registered company of
-- any size -- requires a genuinely separate review_decide action,
-- regardless of who initiated/submitted. This is what gates whether the
-- Super-Admin-only Submit+Approve collapse (see the new superadmin
-- onboarding route) is even reachable at all.
--
-- Computed on demand from the vendor's DEFAULT legal entity rather than
-- stored -- there's nothing to cache here that changes often enough to
-- matter, and computing it avoids a second place this fact could drift out
-- of sync with the legal_entities row it's derived from.
CREATE OR REPLACE FUNCTION compute_vendor_risk_classification(p_vendor_id uuid)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN le.registered_country = 'India' AND le.entity_type = 'individual' THEN 'low'
    ELSE 'requires_review'
  END
  FROM legal_entities le
  WHERE le.vendor_id = p_vendor_id AND le.is_default = true
  LIMIT 1;
$$;
