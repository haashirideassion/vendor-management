-- Lowers the 3-way match auto-accept tolerance from 5% to 0% (exact match
-- only) -- any nonzero variance between invoice total and verified-GRN
-- total now forces match_status='variance' / status='under_review' for
-- manual review, per user decision (was flagging a $50/~2% gap as
-- "Matched" under the old 5% tolerance).

CREATE OR REPLACE FUNCTION perform_three_way_match(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  inv            invoices%ROWTYPE;
  grn_total      numeric;
  variance       numeric;
  new_match_status text;
  new_status     text;
BEGIN
  SELECT * INTO inv FROM invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Sum verified GRN lines for this PO
  SELECT COALESCE(SUM(gli.quantity_received * gli.unit_price), 0)
  INTO grn_total
  FROM grn_line_items gli
  JOIN grns g ON gli.grn_id = g.id
  WHERE g.po_id = inv.po_id
    AND g.status = 'verified';

  variance := inv.total_amount - grn_total;

  -- Zero tolerance -- only an exact match auto-accepts.
  IF variance = 0 THEN
    new_match_status := 'matched';
    new_status       := 'matched';
  ELSE
    new_match_status := 'variance';
    new_status       := 'under_review';
  END IF;

  UPDATE invoices
  SET match_status  = new_match_status,
      match_variance = variance,
      status        = new_status
  WHERE id = p_invoice_id;
END;
$$;
