-- Enable pg_cron extension (requires Supabase Pro or above, or enable via dashboard)
-- Run this in the Supabase SQL editor after enabling the pg_cron extension

-- Schedule renewal-cron edge function to run daily at 08:00 UTC
SELECT cron.schedule(
  'renewal-cron-daily',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/renewal-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
