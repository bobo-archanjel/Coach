-- FitPilot — feature/security: zakladať klientov smie len účet s rolou tréner.
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Predpokladá 0001–0041. Idempotentné (dá sa spustiť opakovane).
--
-- Doteraz stačilo `auth.uid() = trainer_id`: aj účet s rolou KLIENT vedel cez API
-- vložiť riadok do `clients` so sebou ako trénerom a na ňom potom používať
-- trénerské funkcie (plány, jedálničky, termíny — všetky RLS ďalej vychádzajú z
-- `clients.trainer_id`). K cudzím dátam sa tým nedostal, ale obchádzal rolu.
-- Klientov vlastný riadok (trainer_id = null) vytvára SECURITY DEFINER trigger
-- `handle_new_user` / RPC `ensure_self_client`, ktoré RLS obchádzajú — tie sa
-- touto zmenou nedotknú.

drop policy if exists "clients_insert_own_trainer" on public.clients;
create policy "clients_insert_own_trainer"
  on public.clients for insert
  with check (
    auth.uid() = trainer_id
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'trainer')
  );
