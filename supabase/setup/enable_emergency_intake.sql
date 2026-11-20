-- OWNER-EXECUTED SETUP, not an automatic migration and not run in this task.
-- Only run after real authentication, admin role, consent/privacy text and
-- cross-account authorization have been verified in the chosen project.
create extension if not exists pg_cron;
select cron.schedule(
  'ggo-emergency-retention',
  '15 * * * *',
  $$select public.purge_expired_emergency_requests();$$
);
insert into public.emergency_settings(singleton,enabled) values(true,true)
  on conflict(singleton) do update set enabled=excluded.enabled;
