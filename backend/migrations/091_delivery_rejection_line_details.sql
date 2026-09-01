-- Rejecting a GRN or Service Confirmation previously only captured one
-- free-text reason for the whole record -- no way to say which line items
-- were actually short/damaged/wrong, or by how much. Adds per-line
-- rejection detail so a Manager/Admin rejecting a delivery records exactly
-- what was rejected and why, line by line (see GRNDetail.tsx /
-- ServiceConfirmationDetail.tsx's Reject dialog).
--
-- Nullable on both -- most lines on a rejected record were fine; only the
-- ones actually in dispute carry a rejected_quantity/rejection_reason.
ALTER TABLE grn_line_items
  ADD COLUMN IF NOT EXISTS rejected_quantity numeric CHECK (rejected_quantity >= 0),
  ADD COLUMN IF NOT EXISTS rejection_reason  text;

ALTER TABLE service_confirmation_line_items
  ADD COLUMN IF NOT EXISTS rejected_quantity numeric CHECK (rejected_quantity >= 0),
  ADD COLUMN IF NOT EXISTS rejection_reason  text;
