-- Fix: perform_three_way_match compared a PRE-TAX delivered_total (verified
-- GRN + Service Confirmation quantity*unit_price, ignoring each line's
-- tax_rate column) against invoices.total_amount, which is the vendor's
-- single TAX-INCLUSIVE figure (there is no invoice_line_items table to
-- break it down). Any taxed line therefore always showed a "variance" equal
-- to its tax amount, even when quantity and rate matched exactly -- e.g. a
-- Qty 60 x Rate 10 x 10% tax line (total 660) reported Expected 600 /
-- Invoiced 660 / Variance 60 (9.1%) for a delivery that was actually exact.
--
-- Same calculation model as everywhere else tax is computed in this app
-- (GRNDetail.tsx, CreatePODialog.tsx, PurchaseOrderDetail.tsx, and the
-- DB-generated quotation_line_items.total column):
--   Line Total = Quantity x Unit Price x (1 + Tax % / 100)
-- delivered_total now sums that instead of the pre-tax quantity*unit_price,
-- so it's tax-inclusive on both sides of the comparison, matching
-- invoices.total_amount's basis. Rounded to 2dp to avoid spurious
-- fractional-paisa "variances" from floating point summation. Everything
-- else (tolerance lookup, invoice_exceptions upsert/auto-resolve, status
-- transitions) is unchanged from 073_match_tolerance_and_exceptions.sql.

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
    COALESCE((SELECT SUM(gli.quantity_received * gli.unit_price * (1 + gli.tax_rate / 100))
              FROM grn_line_items gli JOIN grns g ON gli.grn_id = g.id
              WHERE g.po_id = inv.po_id AND g.status = 'verified'), 0)
    +
    COALESCE((SELECT SUM(scli.quantity_confirmed * scli.unit_price * (1 + scli.tax_rate / 100))
              FROM service_confirmation_line_items scli JOIN service_confirmations sc ON scli.service_confirmation_id = sc.id
              WHERE sc.po_id = inv.po_id AND sc.status = 'verified'), 0)
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
