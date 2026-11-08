-- FitPilot — demo správy pre chat tréner ↔ klient (DEV).
-- Spustiť PO migrácii 0008_messages.sql a seede 0001_portal_demo.sql (demo klient "Ján Novák").
-- Idempotentné: ak vlákno už má správy, nič nepridá.

do $$
declare
  v_client_id  uuid;
  v_trainer_id uuid;
begin
  select id, trainer_id into v_client_id, v_trainer_id
  from public.clients
  where full_name = 'Ján Novák'
  order by created_at limit 1;

  if v_client_id is null then
    raise notice 'Preskočené: demo klient "Ján Novák" neexistuje — spusti najprv 0001_portal_demo.sql.';
    return;
  end if;

  if exists (select 1 from public.messages where client_id = v_client_id) then
    raise notice 'Vlákno už má správy — seed preskočený.';
    return;
  end if;

  insert into public.messages (client_id, sender, sender_id, body, created_at, read_at) values
    (v_client_id, 'trainer', v_trainer_id,
      'Ahoj Ján! Pozrel som si tvoj posledný tréning — drep ide pekne. Ako sa cítiš na kolene po RDL?',
      now() - interval '26 hours', now() - interval '25 hours'),
    (v_client_id, 'client', null,
      'Ahoj, koleno v pohode. Skôr ma trocha ťahá spodný chrbát na konci série.',
      now() - interval '25 hours', now() - interval '24 hours'),
    (v_client_id, 'trainer', v_trainer_id,
      'Ok. Skús na budúce znížiť váhu o 10 kg a sústreď sa na neutrálnu chrbticu. Nabudúce to spolu pozrieme na videu.',
      now() - interval '24 hours 58 minutes', now() - interval '24 hours'),
    (v_client_id, 'client', null,
      'Jasné, dík!',
      now() - interval '3 hours', null);

  raise notice 'Demo chat pre klienta % vytvorený.', v_client_id;
end $$;
