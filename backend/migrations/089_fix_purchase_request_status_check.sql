-- quotations.ts's notifyOrgOfSubmittedQuotation() has always tried to move a
-- purchase_request to 'in_review' or 'quotations_received' once vendors
-- start/finish quoting, but the status CHECK constraint (still named
-- engagements_status_check from before the 079 rename, since a plain column
-- CHECK isn't touched by ALTER TABLE ... RENAME) never allowed those two
-- values. Every such UPDATE has been throwing a constraint violation, caught
-- and only console.log'd -- so a purchase request has been permanently stuck
-- at 'approved' throughout the entire vendor-quoting window, confirmed live.
-- Also renames the constraint to match the table's current name, since nothing
-- else in this migration set has fixed that up yet either.
ALTER TABLE purchase_requests DROP CONSTRAINT IF EXISTS engagements_status_check;
ALTER TABLE purchase_requests DROP CONSTRAINT IF EXISTS purchase_requests_status_check;

ALTER TABLE purchase_requests ADD CONSTRAINT purchase_requests_status_check
  CHECK (status IN (
    'draft', 'pending_approval', 'in_review', 'quotations_received',
    'approved', 'rejected', 'cancelled', 'completed'
  ));
