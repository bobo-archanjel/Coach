-- FitPilot — jednorazová oprava výziev nesprávne splnených hneď po vytvorení.
-- NIE JE migrácia: spúšťa ju owner VEDOME v Supabase SQL Editore (po nasadení kódu a migrácie 0085).
--
-- Chyba: výzva sa počítala aj z tréningov/jedla/rekordov spred jej vytvorenia, takže niektorí klienti
-- ju mali splnenú hneď po vytvorení. Tento skript znovu OTVORÍ dokončenia, ktoré vznikli do 10 minút
-- od challenges.created_at (typický dôsledok chyby): vráti participants.completed_at na NULL
-- a zmaže príslušný odznak client_achievements (kind = 'challenge', meta->>'challenge_id').
-- Ďalšie vyhodnotenie prebehne normálne podľa nových pravidiel (počíta sa len aktivita po vytvorení).
--
-- Idempotentné (druhé spustenie nič nenájde). Najprv spusti KROK 1 (náhľad), až potom KROK 2.
-- Dokončenia staršie než 10 minút po vytvorení sa nemenia. Odznak už mohol klient zdieľať/vidieť —
-- po zmazaní zmizne aj z jeho prehľadu.

-- KROK 1: náhľad — čo sa zmení
select c.name, p.client_id, c.created_at, p.completed_at
from public.challenge_participants p
join public.challenges c on c.id = p.challenge_id
where p.completed_at is not null
  and p.completed_at <= c.created_at + interval '10 minutes'
order by c.created_at desc;

-- KROK 2: oprava (spusti až po kontrole náhľadu)
begin;

with bad as (
  select p.challenge_id, p.client_id
  from public.challenge_participants p
  join public.challenges c on c.id = p.challenge_id
  where p.completed_at is not null
    and p.completed_at <= c.created_at + interval '10 minutes'
),
del as (
  delete from public.client_achievements a
  using bad
  where a.kind = 'challenge'
    and a.client_id = bad.client_id
    and a.meta ->> 'challenge_id' = bad.challenge_id::text
  returning a.id
)
update public.challenge_participants p
set completed_at = null
from bad
where p.challenge_id = bad.challenge_id
  and p.client_id = bad.client_id;

commit;
