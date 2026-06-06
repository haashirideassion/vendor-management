-- Fix notifications.user_id FK: was referencing auth.users(id) (Supabase built-in auth)
-- but this project uses a custom users/profiles table, so profile IDs don't exist
-- in auth.users — causing FK violations on every vendor/invoice/quotation insert trigger.

-- Drop old constraint
ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_user_id_fkey;

-- Drop RLS policies that depend on auth.uid() (not usable with custom JWT auth)
DROP POLICY IF EXISTS "Users see own notifications" ON notifications;
DROP POLICY IF EXISTS "Users mark own notifications read" ON notifications;

-- Re-add FK pointing to profiles(id)
ALTER TABLE notifications
  ADD CONSTRAINT notifications_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
