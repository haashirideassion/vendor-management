-- Fix: 087_purchase_request_team_tagging.sql added a new trailing p_team_id
-- parameter to create_purchase_request_full via CREATE OR REPLACE FUNCTION --
-- but Postgres only replaces a function in place when its argument
-- signature is IDENTICAL; adding a parameter instead creates a second,
-- separate overload and leaves the old 14-argument one behind. Calling the
-- RPC by name with named arguments (purchaseRequests.ts) now fails with
-- "could not choose the best candidate function" because Postgres can no
-- longer tell the two overloads apart.
--
-- Drop the old 14-argument signature explicitly, leaving only the current
-- 15-argument (with p_team_id) version defined in 087.
DROP FUNCTION IF EXISTS create_purchase_request_full(
  text, text, uuid, numeric, text, date, date, text, uuid, jsonb, jsonb, uuid, timestamptz, numeric
);
