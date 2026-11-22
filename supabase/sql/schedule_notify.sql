-- Run once in the Supabase SQL editor AFTER deploying the `notify` Edge Function.
-- Requires the pg_cron, pg_net and supabase_vault extensions (Database > Extensions).
-- Replace the two placeholders below with your project's values; they are stored encrypted in Vault.
--   select vault.create_secret('https://YOUR-PROJECT-REF.supabase.co', 'project_url');
--   select vault.create_secret('YOUR-SERVICE-ROLE-KEY', 'service_role_key');

select cron.schedule(
  'camride-notify',
  '10 seconds',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')),
    body := '{}'::jsonb,
    timeout_milliseconds := 8000)
  where exists (select 1 from public.notifications where status = 'pending');
  $$
);

-- Check: select * from cron.job; select * from cron.job_run_details order by start_time desc limit 20;
-- Stop:  select cron.unschedule('camride-notify');
