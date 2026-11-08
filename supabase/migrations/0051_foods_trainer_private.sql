-- FitPilot — potraviny trénera vidí len tréner (feature/barcode-scanner).
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Predpokladá 0007 (foods_select_client_of_trainer) a 0050 (foods.source/created_by).
-- Idempotentné — dá sa spustiť opakovane.
--
-- 0007 dovolil klientovi čítať potraviny svojho trénera — kvôli vyhľadávaniu v knižnici
-- v denníku. Denník knižnicu už nemá (pridáva sa cez značky online a skener), takže
-- klient trénerove potraviny nepotrebuje: v jedálničku ich vidí aj tak (názov a makrá
-- sú uložené priamo v meal_days), AI kouč a skener klienta pracujú len s globálnou
-- knižnicou a vlastnými potravinami klienta. Rozhodnutie produktu: potraviny, ktoré si
-- tréner založí, sú len jeho.

drop policy if exists "foods_select_client_of_trainer" on public.foods;
