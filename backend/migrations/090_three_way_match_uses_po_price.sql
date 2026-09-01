-- The 3-way match has never actually read the Purchase Order: it only
-- compared the invoice's total against a delivered_total built from the
-- GRN/Service Confirmation's own line items -- including their own
-- independently re-typed unit_price, which is never validated against the
-- PO's agreed price anywhere in the app (grns.ts/serviceConfirmations.ts
-- accept whatever unit_price the receiving clerk enters). Confirmed live: a
-- delivery recorded at Rs.60,000/unit against a PO whose line was actually
-- Rs.54,000/unit (the vendor's own accepted quotation price) reported a
-- perfect "matched, variance: 0" result once invoiced at the inflated
-- figure -- the exact overbilling scenario a 3-way match exists to catch.
--
-- Fix: delivered_total is now computed from each GRN/SC line's VERIFIED
-- quantity multiplied by its corresponding po_line_items.unit_price (the
-- price actually agreed to when the PO was issued), not the GRN/SC's own
-- re-typed price. This makes the match a real PO vs. Delivery vs. Invoice
-- comparison instead of only Delivery vs. Invoice. A GRN/SC line with no
-- po_line_item_id link (should not normally happen, but defensively handled)
-- falls back to its own unit_price rather than silently excluding the line.
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

  SELECT ROUND(
    COALESCE((
      SELECT SUM(
        gli.quantity_received
        * COALESCE(pli.unit_price, gli.unit_price)
        * (1 + COALESCE(pli.tax_rate, gli.tax_rate) / 100)
      )
      FROM grn_line_items gli
      JOIN grns g ON gli.grn_id = g.id
      LEFT JOIN po_line_items pli ON pli.id = gli.po_line_item_id
      WHERE g.po_id = inv.po_id AND g.status = 'verified'
    ), 0)
    +
    COALESCE((
      SELECT SUM(
        scli.quantity_confirmed
        * COALESCE(pli.unit_price, scli.unit_price)
        * (1 + COALESCE(pli.tax_rate, scli.tax_rate) / 100)
      )
      FROM service_confirmation_line_items scli
      JOIN service_confirmations sc ON scli.service_confirmation_id = sc.id
      LEFT JOIN po_line_items pli ON pli.id = scli.po_line_item_id
      WHERE sc.po_id = inv.po_id AND sc.status = 'verified'
    ), 0)
  , 2)
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
