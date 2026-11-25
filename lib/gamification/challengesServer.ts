import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { addDaysIso } from "@/lib/reports/period";
import { trainerHasFeatureForClients } from "./access";
import {
  canComplete,
  challengeProgress,
  challengeStatus,
  dataSince,
  effectiveStartMs,
  isChallengeMetric,
  newlyCompleted,
  type ChallengeMetric,
  type ChallengeProgress,
  type FoodDay,
  type ProgressData,
} from "./challenges";

// FitPilot — výzvy trénera, serverová časť (gamifikácia, fáza B).
//
// Zápis: výlučne service role po overení session a vlastníctva v akcii/volajúcom (tabuľky nemajú
// write práva, 0079). Progres sa NIKDY nepýta od klienta — dopočíta sa z workout_logs, food_logs
// a client_achievements. Čítanie bežným klientom (RLS): klient vidí len svoje výzvy, tréner svoje.
// Odolnosť: keď migrácia 0079 ešte nebeží, všetko ticho skončí bez efektu (gamifikácia je
// dekorácia, nikdy nesmie zhodiť zápis tréningu ani stránku).

type Sb = SupabaseClient;

const RECENT_DONE_DAYS = 14;
const FOOD_MAX_SPAN = 125;
const LOG_LIMIT = 6000;

interface ChallengeRow {
  id: string;
  trainer_id: string;
  name: string;
  description: string;
  metric: string;
  target: number;
  starts_on: string;
  ends_on: string;
  all_clients: boolean;
  status: "active" | "ended";
  created_at: string | null;
}

const CH_COLS = "id, trainer_id, name, description, metric, target, starts_on, ends_on, all_clients, status, created_at";

const winOf = (r: ChallengeRow) => ({ startsOn: r.starts_on, endsOn: r.ends_on, createdAt: r.created_at });

// ---------- načítanie dát pre progres ----------

/** Dáta na výpočet progresu pre viac klientov naraz (3 dopyty, ohraničené obdobie). */
export async function loadProgressData(
  supabase: Sb,
  clientIds: string[],
  since: string,
  to: string,
  opts: { entries: boolean },
): Promise<Map<string, ProgressData> | null> {
  const out = new Map<string, ProgressData>();
  for (const id of clientIds) out.set(id, { logs: [], foodDates: [], prDates: [] });
  if (clientIds.length === 0) return out;

  const foodSince = since < addDaysIso(to, -FOOD_MAX_SPAN) ? addDaysIso(to, -FOOD_MAX_SPAN) : since;
  const [logs, food, prs] = await Promise.all([
    supabase
      .from("workout_logs")
      .select(opts.entries ? "client_id, performed_on, completed_at, entries" : "client_id, performed_on, completed_at")
      .in("client_id", clientIds)
      .eq("status", "completed")
      .gte("performed_on", since)
      .lte("performed_on", to)
      .limit(LOG_LIMIT),
    supabase.rpc("challenge_food_days_at", { p_client_ids: clientIds, p_from: foodSince, p_to: to }),
    supabase.from("client_achievements").select("client_id, achieved_on, achieved_at").in("client_id", clientIds).eq("kind", "pr").gte("achieved_on", since).lte("achieved_on", to).limit(LOG_LIMIT),
  ]);
  // fallback, kým nebeží migrácia 0088: bez času zápisu — deň sa počíta len od začiatku dňa (konzervatívne)
  let foodRows = (food.data ?? []) as { client_id: string; eaten_on: string; last_logged_at?: string | null }[];
  if (food.error) {
    const old = await supabase.rpc("challenge_food_days", { p_client_ids: clientIds, p_from: foodSince, p_to: to });
    if (old.error) return null;
    foodRows = (old.data ?? []) as { client_id: string; eaten_on: string }[];
  }
  if (logs.error || prs.error) return null;

  for (const r of (logs.data ?? []) as unknown as { client_id: string; performed_on: string; completed_at: string | null; entries?: unknown }[]) {
    out.get(r.client_id)?.logs.push({ performedOn: r.performed_on, completedAt: r.completed_at, entries: r.entries });
  }
  for (const r of foodRows) {
    (out.get(r.client_id)?.foodDates as FoodDay[] | undefined)?.push({ day: r.eaten_on, at: r.last_logged_at ?? null });
  }
  for (const r of (prs.data ?? []) as { client_id: string; achieved_on: string; achieved_at: string | null }[]) {
    (out.get(r.client_id)?.prDates as string[] | undefined)?.push(r.achieved_at ?? r.achieved_on);
  }
  return out;
}

const needsEntries = (rows: ChallengeRow[]) => rows.some((r) => r.metric === "volume_kg");

function minSince(rows: ChallengeRow[]): string {
  return rows.reduce((m, r) => {
    const s = dataSince(winOf(r));
    return s < m ? s : m;
  }, "9999-12-31");
}

// ---------- pripojenie klienta k výzvam „pre všetkých“ ----------

/** Klient (aj nový) sa pridá do aktívnych výziev trénera označených „všetci klienti“. Idempotentné. */
export async function ensureAllClientsParticipation(clientId: string, trainerId: string, today: string): Promise<void> {
  const admin = tryCreateAdminClient();
  if (!admin) return;
  const { data, error } = await admin
    .from("challenges")
    .select("id")
    .eq("trainer_id", trainerId)
    .eq("all_clients", true)
    .eq("status", "active")
    .gte("ends_on", today)
    .limit(30);
  if (error || !data?.length) return;
  await admin
    .from("challenge_participants")
    .upsert(data.map((c) => ({ challenge_id: c.id as string, client_id: clientId })), { onConflict: "challenge_id,client_id", ignoreDuplicates: true });
}

// ---------- klient ----------

export type ClientChallengeState = "active" | "upcoming" | "done" | "over";

export interface ClientChallenge {
  id: string;
  name: string;
  description: string;
  metric: ChallengeMetric;
  target: number;
  startsOn: string;
  endsOn: string;
  /** okamih, od ktorého sa počíta aktivita (ISO) */
  countsFrom: string;
  state: ClientChallengeState;
  progress: ChallengeProgress;
  completedAt: string | null;
  /** id odznaku za dokončenie (na zdieľanie), ak existuje */
  achievementId: string | null;
}

interface ParticipantRow {
  completed_at: string | null;
  challenges: ChallengeRow | ChallengeRow[] | null;
}

/**
 * Výzvy klienta s progresom (aktívne, nadchádzajúce a nedávno dokončené). Prázdne, keď tréner
 * nemá Pro/Business (výzvy sa klientom ticho skryjú, dáta ostávajú) alebo keď migrácia nebeží.
 */
export async function loadClientChallenges(supabase: Sb, clientId: string, trainerId: string | null, today: string): Promise<ClientChallenge[]> {
  try {
    if (!trainerId || !(await trainerHasFeatureForClients(trainerId, "challenges"))) return [];
    await ensureAllClientsParticipation(clientId, trainerId, today);
    const { data, error } = await supabase
      .from("challenge_participants")
      .select(`completed_at, challenges!inner(${CH_COLS})`)
      .eq("client_id", clientId)
      .limit(60);
    if (error) return [];
    const recentFrom = addDaysIso(today, -RECENT_DONE_DAYS);
    const rows = ((data ?? []) as unknown as ParticipantRow[])
      .map((p) => ({ completedAt: p.completed_at, c: Array.isArray(p.challenges) ? p.challenges[0] : p.challenges }))
      .filter((p): p is { completedAt: string | null; c: ChallengeRow } => Boolean(p.c) && isChallengeMetric(p.c!.metric) && p.c!.trainer_id === trainerId)
      .filter((p) => {
        if (p.completedAt) return p.completedAt.slice(0, 10) >= recentFrom;
        return p.c.status === "active" && p.c.ends_on >= today;
      });
    if (rows.length === 0) return [];

    const chRows = rows.map((r) => r.c);
    const progress = await loadProgressData(supabase, [clientId], minSince(chRows), today, { entries: needsEntries(chRows) });
    if (!progress) return [];
    const mine = progress.get(clientId)!;

    const { data: ach } = await supabase
      .from("client_achievements")
      .select("id, meta")
      .eq("client_id", clientId)
      .eq("kind", "challenge")
      .limit(200);
    const achievementOf = new Map<string, string>();
    for (const a of (ach ?? []) as { id: string; meta: { challenge_id?: string } | null }[]) {
      if (a.meta?.challenge_id) achievementOf.set(a.meta.challenge_id, a.id);
    }

    return rows
      .map(({ completedAt, c }): ClientChallenge => {
        const metric = c.metric as ChallengeMetric;
        const p = challengeProgress({ ...winOf(c), metric, target: c.target }, mine, today);
        const st = challengeStatus({ ...winOf(c), status: c.status }, today);
        const state: ClientChallengeState = completedAt ? "done" : st === "upcoming" ? "upcoming" : st === "active" ? "active" : "over";
        return {
          id: c.id,
          name: c.name,
          description: c.description,
          metric,
          target: c.target,
          startsOn: c.starts_on,
          endsOn: c.ends_on,
          countsFrom: new Date(effectiveStartMs(winOf(c))).toISOString(),
          state,
          progress: completedAt ? { ...p, done: true, fraction: 1, value: Math.max(p.value, c.target) } : p,
          completedAt,
          achievementId: achievementOf.get(c.id) ?? null,
        };
      })
      .sort((a, b) => Number(a.state === "done") - Number(b.state === "done") || a.endsOn.localeCompare(b.endsOn));
  } catch {
    return [];
  }
}

/**
 * Vyhodnotí a pripíše DOKONČENÉ výzvy klienta (volá sa po zápise tréningu/jedla). Idempotentné:
 * prechod `completed_at is null → now()` sa podarí len raz a odznak chráni UNIQUE index (0079),
 * takže opakované volanie ani súbeh dvoch zariadení nič nezdvojí. Vráti počet NOVÝCH dokončení
 * (každé = oslava + upozornenie trénerovi cez client_achievements).
 */
export async function syncChallenges(supabase: Sb, clientId: string, today: string): Promise<number> {
  try {
    const admin = tryCreateAdminClient();
    if (!admin) return 0;
    const { data, error } = await supabase
      .from("challenge_participants")
      .select(`completed_at, challenges!inner(${CH_COLS})`)
      .eq("client_id", clientId)
      .is("completed_at", null)
      .limit(40);
    if (error || !data?.length) return 0;

    const rows = ((data ?? []) as unknown as ParticipantRow[])
      .map((p) => (Array.isArray(p.challenges) ? p.challenges[0] : p.challenges))
      .filter((c): c is ChallengeRow => Boolean(c) && isChallengeMetric(c!.metric) && canComplete({ ...winOf(c!), status: c!.status }, today));
    if (rows.length === 0) return 0;

    // tarifa trénera (po jej strate sa výzvy nevyhodnocujú)
    const allowed = new Set<string>();
    for (const t of new Set(rows.map((r) => r.trainer_id))) {
      if (await trainerHasFeatureForClients(t, "challenges")) allowed.add(t);
    }
    const live = rows.filter((r) => allowed.has(r.trainer_id));
    if (live.length === 0) return 0;

    const progress = await loadProgressData(supabase, [clientId], minSince(live), today, { entries: needsEntries(live) });
    const mine = progress?.get(clientId);
    if (!mine) return 0;

    const doneIds = newlyCompleted(
      live.map((c) => ({ id: c.id, ...winOf(c), metric: c.metric as ChallengeMetric, target: c.target, status: c.status })),
      live.map((c) => ({ challengeId: c.id, completedAt: null })),
      () => mine,
      today,
    );

    let fresh = 0;
    for (const id of doneIds) {
      const c = live.find((r) => r.id === id)!;
      const nowIso = new Date().toISOString();
      // prechod sa podarí len raz (podmienka completed_at is null)
      const { data: flipped, error: upErr } = await admin
        .from("challenge_participants")
        .update({ completed_at: nowIso })
        .eq("challenge_id", id)
        .eq("client_id", clientId)
        .is("completed_at", null)
        .select("challenge_id");
      if (upErr || !flipped?.length) continue;
      const { error: insErr } = await admin.from("client_achievements").insert({
        client_id: clientId,
        kind: "challenge",
        achieved_on: today,
        meta: { challenge_id: id, challenge_name: c.name, metric: c.metric, target: c.target },
      });
      // 23505 = odznak už existuje (súbeh) — stále je to jedno dokončenie
      if (insErr && insErr.code !== "23505") continue;
      fresh++;
    }
    return fresh;
  } catch (err) {
    console.error("syncChallenges:", err instanceof Error ? err.message : err);
    return 0;
  }
}

// ---------- tréner ----------

export interface TrainerChallengeClient {
  clientId: string;
  name: string;
  value: number;
  fraction: number;
  done: boolean;
  completedAt: string | null;
}

export interface TrainerChallenge {
  id: string;
  name: string;
  description: string;
  metric: ChallengeMetric;
  target: number;
  startsOn: string;
  endsOn: string;
  /** okamih, od ktorého sa počíta aktivita (ISO) */
  countsFrom: string;
  allClients: boolean;
  status: "active" | "ended";
  /** upcoming / active / over (podľa dátumov) alebo ended (ručne ukončená) */
  phase: "upcoming" | "active" | "over" | "ended";
  participants: TrainerChallengeClient[];
  doneCount: number;
}

interface TrainerRow extends ChallengeRow {
  challenge_participants:
    | { client_id: string; completed_at: string | null; clients: { full_name: string; ended_at: string | null; deletion_requested_at: string | null } | { full_name: string; ended_at: string | null; deletion_requested_at: string | null }[] | null }[]
    | null;
}

/** Výzvy trénera s progresom každého účastníka. `null` = nedostupné (migrácia nebeží). */
export async function loadTrainerChallenges(supabase: Sb, trainerId: string, today: string): Promise<TrainerChallenge[] | null> {
  try {
    const admin = tryCreateAdminClient();
    // doplní nových klientov do výziev „pre všetkých“ (vždy len klientov tohto trénera)
    if (admin) {
      const [{ data: actives }, { data: clients }] = await Promise.all([
        supabase.from("challenges").select("id").eq("trainer_id", trainerId).eq("all_clients", true).eq("status", "active").gte("ends_on", today).limit(30),
        supabase.from("clients").select("id").eq("trainer_id", trainerId).is("ended_at", null).is("deletion_requested_at", null).limit(500),
      ]);
      const pairs = (actives ?? []).flatMap((c) => (clients ?? []).map((k) => ({ challenge_id: c.id as string, client_id: k.id as string })));
      for (let i = 0; i < pairs.length; i += 400) {
        await admin.from("challenge_participants").upsert(pairs.slice(i, i + 400), { onConflict: "challenge_id,client_id", ignoreDuplicates: true });
      }
    }

    const { data, error } = await supabase
      .from("challenges")
      .select(`${CH_COLS}, challenge_participants(client_id, completed_at, clients(full_name, ended_at, deletion_requested_at))`)
      .eq("trainer_id", trainerId)
      .order("created_at", { ascending: false })
      .limit(60);
    if (error) return null;
    const rows = ((data ?? []) as unknown as TrainerRow[]).filter((r) => isChallengeMetric(r.metric));

    const live = rows.filter((r) => r.status === "active");
    const clientIds = [...new Set(live.flatMap((r) => (r.challenge_participants ?? []).map((p) => p.client_id)))];
    const progress =
      live.length > 0
        ? await loadProgressData(supabase, clientIds, minSince(live), today, { entries: needsEntries(live) })
        : new Map<string, ProgressData>();
    if (!progress) return null;

    return rows.map((r): TrainerChallenge => {
      const metric = r.metric as ChallengeMetric;
      const participants = (r.challenge_participants ?? [])
        .map((p) => ({ p, c: Array.isArray(p.clients) ? p.clients[0] : p.clients }))
        .filter((x) => x.c && !x.c.ended_at && !x.c.deletion_requested_at)
        .map(({ p, c }): TrainerChallengeClient => {
          const pr = challengeProgress(
            { ...winOf(r), metric, target: r.target },
            progress.get(p.client_id) ?? { logs: [], foodDates: [], prDates: [] },
            today,
          );
          const done = Boolean(p.completed_at) || pr.done;
          return {
            clientId: p.client_id,
            name: c!.full_name,
            value: p.completed_at ? Math.max(pr.value, r.target) : pr.value,
            fraction: done ? 1 : pr.fraction,
            done,
            completedAt: p.completed_at,
          };
        })
        .sort((a, b) => b.fraction - a.fraction || a.name.localeCompare(b.name, "sk"));
      return {
        id: r.id,
        name: r.name,
        description: r.description,
        metric,
        target: r.target,
        startsOn: r.starts_on,
        endsOn: r.ends_on,
        countsFrom: new Date(effectiveStartMs(winOf(r))).toISOString(),
        allClients: r.all_clients,
        status: r.status,
        phase: challengeStatus({ ...winOf(r), status: r.status }, today),
        participants,
        doneCount: participants.filter((p) => p.done).length,
      };
    });
  } catch {
    return null;
  }
}
