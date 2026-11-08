# Bezpečnostný regresný test databázy

```bash
bash supabase/tests/run-local.sh
```

Skript spustí jednorazovú lokálnu Postgres (port 55499, potrebuje `initdb`/`pg_ctl` — na Windowse
`E:\PostgreSQL\bin` v `PATH`), načíta všetky migrácie v poradí, spustí `security_regression.sql`
(útoky musia zlyhať, legitímne toky prejsť) a napokon 30 súbežných volaní `reserve_ai_slot`
(musí prejsť presne toľko, koľko je limit). Na konci všetko zmaže. Produkčná DB sa nedotýka.

Po každej novej migrácii test spusti; ak pridáš nové tabuľky s citlivými dátami, pridaj do
`security_regression.sql` kontrolu, že cudzí používateľ ani anon k nim nemá prístup.
