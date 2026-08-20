-- Procurement Lifecycle Enhancement: configurable 3-way match tolerance +
-- a formal Exception entity.
--
-- Today's perform_three_way_match (072_service_confirmations.sql) is
-- zero-tolerance: ANY nonzero variance flips the invoice to under_review
-- with nothing beyond a numeric match_variance column -- no record of why,
-- no queue to work through, no resolution trail. This adds:
--   1. match_tolerance_settings -- an org-configurable tolerance (amount or
--      percentage), following the SAME pattern as approval_policies
--      (069_approval_thresholds.sql): a dedicated per-org settings table,
--      Admin-settable via a live screen, absence of a row preserving
--      TODAY'S EXACT zero-tolerance behavior (no new friction for any org
--      that never touches the new settings screen).
--   2. invoice_exceptions -- a real queue: one OPEN row per invoice while a
--      variance exceeds tolerance, auto-created/updated by the match
--      function, auto-resolved if a re-run clears the variance (e.g. more
--      GRN/Service Confirmation lines got verified since), and manually
--      resolvable/waivable by an org reviewer with a note. This does NOT
--      add a new hard gate on invoice approval -- /review already lets a
--      Manager/Admin approve or reject an under_review invoice today
--      (i.e. override a variance); the exception record is the missing
--      audit trail for that decision, not a new blocker in front of it.

-- ─── match_tolerance_settings ───────────────────────────────────────────────
CREATE TABLE match_tolerance_settings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE UNIQUE,
  tolerance_type  text NOT NULL DEFAULT 'amount' CHECK (tolerance_type IN ('amount', 'percentage')),
  tolerance_value numeric NOT NULL DEFAULT 0 CHECK (tolerance_value >= 0),
  set_by          uuid REFERENCES profiles(id),
  set_at          timestamptz DEFAULT now()
);

ALTER TABLE match_tolerance_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "match_tolerance_settings: platform admins manage" ON match_tolerance_settings
  FOR ALL USING (is_platform_admin()) WITH CHECK (is_platform_admin());

CREATE POLICY "match_tolerance_settings: org member reads own org's setting" ON match_tolerance_settings
  FOR SELECT USING (
    is_platform_admin() OR EXISTS (
      SELECT 1 FROM organization_members om WHERE om.org_id = match_tolerance_settings.org_id AND om.profile_id = auth.uid()
    )
  );

-- ─── invoice_exceptions ─────────────────────────────────────────────────────
CREATE TABLE invoice_exceptions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id       uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  org_id           uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  po_id            uuid REFERENCES purchase_orders(id),
  expected_amount  numeric NOT NULL,  -- verified GRN + Service Confirmation total at match time
  invoiced_amount  numeric NOT NULL,  -- invoices.total_amount at match time
  variance         numeric NOT NULL,
  variance_pct     numeric,           -- ABS(variance) / invoiced_amount * 100
  tolerance_type   text,              -- snapshot of the setting applied at match time
  tolerance_value  numeric,
  status           text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'waived')),
  resolution_notes text,
  resolved_by      uuid REFERENCES profiles(id),
  resolved_at      timestamptz,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

CREATE INDEX idx_invoice_exceptions_invoice ON invoice_exceptions(invoice_id);
CREATE INDEX idx_invoice_exceptions_org     ON invoice_exceptions(org_id);
CREATE INDEX idx_invoice_exceptions_status  ON invoice_exceptions(status);

-- Only one OPEN exception per invoice at a time -- a re-run while still out
-- of tolerance updates this same row rather than piling up duplicates;
-- resolved/waived rows are historical and exempt from this constraint.
CREATE UNIQUE INDEX uq_invoice_exceptions_open ON invoice_exceptions(invoice_id) WHERE status = 'open';

CREATE TRIGGER invoice_exceptions_set_updated_at
  BEFORE UPDATE ON invoice_exceptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE invoice_exceptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoice_exceptions: platform admins manage" ON invoice_exceptions
  FOR ALL USING (is_platform_admin()) WITH CHECK (is_platform_admin());

CREATE POLICY "invoice_exceptions: org member reads own org's exceptions" ON invoice_exceptions
  FOR SELECT USING (
    is_platform_admin() OR EXISTS (
      SELECT 1 FROM organization_members om WHERE om.org_id = invoice_exceptions.org_id AND om.profile_id = auth.uid()
    )
  );

-- ─── perform_three_way_match: tolerance-aware, exception-tracking ──────────
CREATE OR REPLACE FUNCTION perform_three_way_match(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  inv              invoices%ROWTYPE;
  delivered_total  numeric;
  variance         numeric;
  variance_pct     numeric;
  new_match_status text;
  new_status       text;
  v_tolerance_type  text;
  v_tolerance_value numeric;
  within_tolerance  boolean;
BEGIN
  SELECT * INTO inv FROM invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT
    COALESCE((SELECT SUM(gli.quantity_received * gli.unit_price)
              FROM grn_line_items gli JOIN grns g ON gli.grn_id = g.id
              WHERE g.po_id = inv.po_id AND g.status = 'verified'), 0)
    +
    COALESCE((SELECT SUM(scli.quantity_confirmed * scli.unit_price)
              FROM service_confirmation_line_items scli JOIN service_confirmations sc ON scli.service_confirmation_id = sc.id
              WHERE sc.po_id = inv.po_id AND sc.status = 'verified'), 0)
  INTO delivered_total;

  variance := inv.total_amount - delivered_total;
  variance_pct := ABS(variance) / inv.total_amount * 100; -- total_amount is always > 0 (CHECK constraint)

  -- Absence of a configured setting preserves today's exact zero-tolerance
  -- behavior -- no new friction for any org that never visits the settings
  -- screen.
  SELECT tolerance_type, tolerance_value INTO v_tolerance_type, v_tolerance_value
  FROM match_tolerance_settings WHERE org_id = inv.org_id;
  IF NOT FOUND THEN
    v_tolerance_type := 'amount';
    v_tolerance_value := 0;
  END IF;

  within_tolerance := CASE v_tolerance_type
    WHEN 'percentage' THEN variance_pct <= v_tolerance_value
    ELSE ABS(variance) <= v_tolerance_value
  END;

  IF within_tolerance THEN
    new_match_status := 'matched';
    new_status       := 'matched';

    -- Re-running match (e.g. after more deliveries got verified) can bring
    -- a previously-out-of-tolerance invoice back within tolerance -- close
    -- the open exception rather than leaving a stale one in the queue.
    UPDATE invoice_exceptions
    SET status = 'resolved',
        resolution_notes = COALESCE(resolution_notes || ' ', '') || '(Auto-resolved: within tolerance on re-match.)',
        resolved_at = now()
    WHERE invoice_id = p_invoice_id AND status = 'open';
  ELSE
    new_match_status := 'variance';
    new_status       := 'under_review';

    INSERT INTO invoice_exceptions (
      invoice_id, org_id, po_id, expected_amount, invoiced_amount, variance, variance_pct,
      tolerance_type, tolerance_value, status
    ) VALUES (
      p_invoice_id, inv.org_id, inv.po_id, delivered_total, inv.total_amount, variance, variance_pct,
      v_tolerance_type, v_tolerance_value, 'open'
    )
    ON CONFLICT (invoice_id) WHERE status = 'open' DO UPDATE SET
      expected_amount = EXCLUDED.expected_amount,
      invoiced_amount = EXCLUDED.invoiced_amount,
      variance        = EXCLUDED.variance,
      variance_pct    = EXCLUDED.variance_pct,
      tolerance_type  = EXCLUDED.tolerance_type,
      tolerance_value = EXCLUDED.tolerance_value,
      updated_at      = now();
  END IF;

  UPDATE invoices
  SET match_status  = new_match_status,
      match_variance = variance,
      status        = new_status
  WHERE id = p_invoice_id;
END;
$$;
