// FitPilot — AI blok, Krok 4: orchestrácia AI chatu klienta ("AI Kouč").
// Volá sa zo server action (app/portal/.../actions.ts), vždy pod session
// prihláseného klienta — RLS na ai_conversations/ai_messages (0014) a messages
// (0008) platí automaticky.
//
// Poradie krokov pri každej správe (zámerne v tomto poradí, nie inak):
// 1. zdravotný pre-filter (lib/ai/healthFilter.ts) — ak zasiahne, END. Žiadne
//    volanie Claude (nulové náklady), pevná odpoveď, eskalácia do messages.
// 2. denný rate limit (lib/ai/rateLimit.ts) — ak vyčerpaný, END bez volania.
// 3. deterministický kontext (lib/ai/macroContext.ts) — čísla dopočítané v kóde.
// 4. Claude (Haiku) dostane kontext + posledných pár správ a len naformuluje
//    odpoveď zo skutočných dát — nevymýšľa makrá ani čas.

import { getTranslations } from "next-intl/server";
import { getUserLocale } from "@/lib/i18n/server";
import type { Locale } from "@/lib/i18n/locales";
import { outputLanguageRule, speakLanguage } from "./language";
import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { getAnthropicClient, AI_MODEL, isAiConfigured } from "./client";
import { logAiUsage } from "./logUsage";
import { getMacroContext } from "./macroContext";
import { getTrainingContextBlock } from "./trainingContext";
import { getProgressContextBlock } from "./progressContext";
import { stripMarkdown } from "./plainText";
import {
  needsHealthEscalation,
  isCrisisText,
  hasExerciseSwapIntent,
  buildEscalationNoticeForTrainer,
  buildCrisisNoticeForTrainer,
  buildSoftExerciseNoticeForTrainer,
} from "./healthFilter";
import { findExerciseAlternatives, type ExerciseCandidate } from "./exerciseAlternatives";
import { getFoodCandidates, formatFoodCandidates } from "./foodContext";
import { reserveAiSlot, AI_CHAT_DAILY_LIMIT } from "./rateLimit";

const HISTORY_WINDOW = 12; // posledných N správ poslaných modelu — nie celá história (minimalizácia dát + náklady)
const MAX_REPLY_TOKENS = 700; // dosť aj na štruktúrovaný jedálniček na celý deň (4 jedlá + súčty)

/** Cvik, ktorý AI naozaj spomenula v odpovedi (overené oproti zoznamu appky, viď extractReferencedExercises). */
export interface ChatExerciseRef {
  id: string;
  name: string;
}

export type SendChatResult =
  /** `escalated` na "ok" = mäkké FYI trénerovi (bežná výmena cviku kvôli nepohodliu), nie hard block.
   *  `exercises` = cviky z odpovede, ktoré appka vie prepojiť na detail s fotkami (len pri náhrade cviku). */
  | { status: "ok"; reply: string; escalated?: boolean; exercises?: ChatExerciseRef[] }
  /** hard block — akútna zdravotná téma bez žiadosti o náhradu cviku, žiadne volanie modelu. */
  | { status: "escalated"; reply: string }
  | { status: "rate_limited"; reply: string }
  | { status: "not_configured"; reply: string }
  | { status: "error"; reply: string };

// i18n-ignore-start — pokyny pre model (interné); jazyk odpovede určuje outputLanguageRule(locale)
function buildSystemPrompt(exerciseSwapGuard: boolean, locale: Locale): string {
  const lines = [
    `Si AI Kouč vo fitness aplikácii FitPilot. Rozprávaš sa priamo s klientom trénera, ${speakLanguage(locale)}, stručne a vecne.`,
    "Tvoja úloha: pomôcť s výživou (čo a koľko zjesť podľa cieľa) a s tréningom (čo má dnes cvičiť podľa plánu, ako mu idú tréningy, alternatívy cvikov) — VÝHRADNE na základe dát, ktoré ti pošle appka v tejto správe. Tréningový plán aj históriu tréningov klienta máš nižšie, nikdy netvrď, že ich nevidíš. Nikdy si nevymýšľaj čísla makier, potraviny, cviky ani tréningy, ktoré ti neboli poskytnuté.",
    "Na otázky typu 'ako mi to ide', 'som na dobrej ceste', 'aký mám progres' NEODPOVEDAJ len opisom aktuálneho plánu — použi blok 'Objektívny progres klienta' nižšie (adherencia tréningu/stravy, trend váhy vs. cieľ). To je skutočné hodnotenie, plán je len čo má robiť, nie ako sa mu darí.",
    "Keď navrhuješ konkrétne jedlo (aj celý jedálniček na deň), VYBERAJ VÝHRADNE z 'Knižnica potravín' nižšie (ak je priložená) — to JE kompletný zoznam všetkého, čo appka má, nič viac neexistuje. NIKDY sa klienta nepýtaj, aké potraviny má rád/dostupné, ani ho neposielaj za trénerom po túto informáciu — knižnicu už máš, rozdeľ ju sám rozumne medzi jedlá dňa podľa zostávajúcich makier. Ak klientovi niečo z návrhu nechutí, povie ti to sám v ďalšej správe a ty navrhneš inú položku z tej istej knižnice — nepýtaj sa na to vopred.",
    "Nikdy nenavrhuj potravinu ani cvik mimo poskytnutých zoznamov a nikdy nehovor klientovi, že mu nevieš pomôcť s jedlom/cvikom, keď je príslušný zoznam priložený.",
    "Zdravotné témy (bolesť, zranenie, diagnóza, čo s tým robiť) NIKDY neriešiš — appka väčšinu zachytáva skôr, než sa k tebe dostanú, ale ak by sa aj tak objavila zmienka o bolesti/zranení bez žiadosti o náhradu cviku, okamžite odporuč konzultáciu s trénerom a nič k tomu neradíš.",
    "Neradíš nič mimo fitness/výživy tejto appky. Bežnú otázku odbi stručne (2-5 viet). Pri žiadosti o kompletný jedálniček na celý deň odpovedz štruktúrovane po jedlách dňa (raňajky/obed/olovrant/večera) s gramážou a súčtom makier — stále bez zbytočných úvodov.",
    // Chat bublina zobrazuje čistý text (zachová len riadkovanie) — markdown by
    // klient videl ako surové hviezdičky a pomlčky (QA 2026-09-23).
    "Formát: píš čistý text bez markdownu — žiadne **hviezdičky**, # nadpisy ani --- oddeľovače. Štruktúru vytvor novými riadkami; položky zoznamu začni znakom • a názov jedla dňa napíš na samostatný riadok s dvojbodkou (napr. „Raňajky:“).",
    outputLanguageRule(locale),
    "Ak v odpovedi odporúčaš/spomenieš konkrétny cvik zo zoznamu 'Cviky s ID' nižšie (ak je priložený), na úplný koniec CELEJ odpovede pridaj na vlastný riadok marker [CVIKY: id1, id2] s PRESNÝMI ID z toho zoznamu (časť pred '::'), oddelené čiarkou — nikdy nie názvami, nikdy nie ID, ktoré si vymyslíš. Ak si žiadny konkrétny cvik z toho zoznamu nespomenul, marker úplne vynechaj. Klient tento marker nikdy neuvidí (appka ho odstráni), takže nijako nemení, ako mu znie bežný text pred ním.",
  ];
  if (exerciseSwapGuard) {
    lines.push(
      "Klient spomenul nepohodlie/bolesť SPOLU so žiadosťou o náhradu konkrétneho cviku — to SMIEŠ vybaviť: navrhni 2-3 alternatívy VÝHRADNE zo zoznamu skutočných cvikov nižšie, nič iné si nevymýšľaj. Samotnú bolesť/jej príčinu/závažnosť vôbec nekomentuj a nediagnostikuj — len jednou vetou odporuč, nech dá vedieť trénerovi, ak nepohodlie pretrváva.",
    );
  }
  return lines.join("\n");
}
// i18n-ignore-end

interface ChatMessageRow {
  role: "user" | "assistant";
  content: string;
}

/**
 * Marker, ktorým model označí, KTORÉ konkrétne cviky z priložených zoznamov
 * (tréningový plán + prípadná náhrada) v odpovedi naozaj použil — viď
 * buildSystemPrompt. Nahrádza predošlé zhodovanie mena v texte: slovenčina
 * cviky v odpovedi gramaticky skloňuje ("s bench pressom", "drepy"), takže
 * presná zhoda s nominatívom v knižnici bola nespoľahlivá (nájdené pri reálnom
 * teste — model odpovedal správne, ale appka cvik k odpovedi nepriložila).
 * Model namiesto toho pošle PRESNÉ ID, appka ich len overí voči zoznamu, ktorý
 * sama poslala — nikdy neverí ID, ktoré by si model vymyslel mimo zoznamu.
 */
const EXERCISE_MARKER = /\[CVIKY:\s*([a-zA-Z0-9,\s-]+)\]\s*$/;

/** Vytiahne marker z konca odpovede, vráti čistý text (bez markeru) + skutočne overené ID. */
function extractReferencedExercises(
  rawReply: string,
  knownExercises: Map<string, string>,
): { text: string; exercises: ChatExerciseRef[] } {
  const match = rawReply.match(EXERCISE_MARKER);
  if (!match) return { text: rawReply, exercises: [] };

  const text = rawReply.slice(0, match.index).trimEnd();
  const ids = match[1].split(",").map((s) => s.trim());
  const exercises: ChatExerciseRef[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const name = knownExercises.get(id);
    if (name && !seen.has(id)) {
      exercises.push({ id, name });
      seen.add(id);
    }
  }
  return { text, exercises };
}

/**
 * Odošle správu klienta do AI chatu a vráti odpoveď. Server action volajúci
 * túto funkciu je zodpovedný za: overenie session, založenie/nájdenie
 * ai_conversations riadku, a uloženie oboch správ (user + assistant) do
 * ai_messages — táto funkcia len rozhoduje o obsahu odpovede a loguje usage.
 */
export async function sendAiChatMessage(
  supabase: SupabaseClient,
  params: { trainerId: string; clientId: string; conversationId: string; userText: string; history: ChatMessageRow[] },
): Promise<SendChatResult> {
  const { trainerId, clientId, userText, history } = params;
  // jazyk odpovede = jazyk klienta (cookie fp-locale, zosynchronizovaná s profilom)
  const [locale, t] = await Promise.all([getUserLocale(), getTranslations("ai")]);

  // ---------- 0. KRÍZA (sebapoškodenie/suicidálne myšlienky) ----------
  // Osobitná, najprísnejšia vetva: nikdy nejde cez model ani cez výnimku "výmena
  // cviku". Pevná odpoveď s tiesňovou linkou + okamžité upozornenie trénera (bez
  // citácie správy — je mimoriadne citlivá, tréner sa má ozvať osobne).
  if (isCrisisText(userText)) {
    const { error } = await supabase.rpc("insert_ai_escalation_message", {
      p_client_id: clientId,
      p_body: buildCrisisNoticeForTrainer(),
    });
    if (error) console.error("insert_ai_escalation_message (crisis):", error.message);
    return { status: "escalated", reply: t("crisis") };
  }

  // ---------- 1. zdravotný pre-filter ----------
  const healthTrigger = needsHealthEscalation(userText);
  const swapIntent = hasExerciseSwapIntent(userText);

  // Akútna zdravotná téma BEZ žiadosti o náhradu cviku → hard block, žiadne
  // volanie modelu. So žiadosťou o náhradu → mäkká cesta nižšie (bod 3b).
  if (healthTrigger && !swapIntent) {
    const { error } = await supabase.rpc("insert_ai_escalation_message", {
      p_client_id: clientId,
      p_body: buildEscalationNoticeForTrainer(userText),
    });
    if (error) console.error("insert_ai_escalation_message:", error.message);
    return { status: "escalated", reply: t("healthEscalation") };
  }

  // ---------- 2. AI nakonfigurované? ----------
  // (Denný limit sa rezervuje až tesne PRED volaním modelu, viď nižšie — rezervácia je
  // atomická a započíta sa hneď, takže paralelné požiadavky ju neobídu.)
  if (!isAiConfigured()) {
    return { status: "not_configured", reply: t("notConfigured") };
  }

  // ---------- 3. deterministický kontext + 3c. rezervácia limitu ----------
  // Makrá, tréning, knižnica potravín a náhrady cvikov sa navzájom nepotrebujú —
  // všetko naraz (predtým ~8 dopytov za sebou pred volaním modelu). Potraviny sa
  // pýtajú len pri makro cieli a rezervácia limitu (atomická, nevracia sa) až keď
  // sa makro kontext podaril — reťazené na ňu, nie čakajúce na celú dávku.
  const macro = getMacroContext(supabase, clientId);
  const [{ context, error: ctxError }, training, progressBlock, foods, candidates, slot] = await Promise.all([
    macro,
    // Tréningový plán + história (deterministicky, viď trainingContext.ts) — posiela
    // sa vždy, rovnako ako makrá: klient sa môže na tréning spýtať v ktorejkoľvek správe.
    getTrainingContextBlock(supabase, clientId),
    // Objektívny progres (adherencia + trend váhy, viď progressContext.ts) — bez tohto
    // AI vedela na "ako mi to ide" len opísať štruktúru aktuálneho plánu, nie
    // odpovedať na základe skutočných dát za posledné týždne.
    getProgressContextBlock(clientId),
    // ---------- 3a. reálne potraviny z knižnice, ak má klient makro cieľ (Krok 6) ----------
    // Knižnica má len ~80-100 položiek — pošle sa celá vždy, keď má zmysel (klient
    // môže potrebovať jedlo v ktorejkoľvek správe), nie len pri detegovanej "food" téme.
    macro.then(({ context: ctx }) =>
      ctx?.hasGoal
        ? getFoodCandidates(supabase, trainerId).catch((err: unknown) => {
            console.error("getFoodCandidates:", err instanceof Error ? err.message : err);
            return [];
          })
        : [],
    ),
    // ---------- 3b. reálne cviky z knižnice, ak klient žiada náhradu (Krok 5) ----------
    swapIntent
      ? findExerciseAlternatives(supabase, userText).catch((err: unknown) => {
          console.error("findExerciseAlternatives:", err instanceof Error ? err.message : err);
          return { matched: null, alternatives: [] as ExerciseCandidate[] };
        })
      : null,
    // (feature/security) atomická rezervácia denného limitu tesne pred volaním modelu
    macro.then(({ context: ctx, error }) =>
      error || !ctx
        ? null
        : reserveAiSlot({
            supabase,
            kind: "chat",
            trainerId,
            clientId,
            model: AI_MODEL.CHAT,
            subject: "client",
            subjectLimit: AI_CHAT_DAILY_LIMIT(),
          }),
    ),
  ]);
  if (ctxError || !context || !slot) {
    return { status: "error", reply: t("loadFailed") };
  }
  if (!slot.allowed) {
    return {
      status: "rate_limited",
      reply: t("dailyLimit", { limit: AI_CHAT_DAILY_LIMIT() }),
    };
  }

  // i18n-ignore-start — dáta pre model (interné)
  const contextBlock = context.hasGoal
    ? [
        `Dnešný cieľ klienta: ${context.goal!.caloriesTarget} kcal, ${context.goal!.proteinG} g bielkovín, ${context.goal!.carbsG} g sacharidov, ${context.goal!.fatG} g tukov.`,
        `Doteraz dnes zjedol: ${context.consumedToday.kcal} kcal, ${context.consumedToday.proteinG} g bielkovín, ${context.consumedToday.carbsG} g sacharidov, ${context.consumedToday.fatG} g tukov.`,
        `Zostáva mu dnes: ${context.remainingToday!.kcal} kcal, ${context.remainingToday!.proteinG} g bielkovín, ${context.remainingToday!.carbsG} g sacharidov, ${context.remainingToday!.fatG} g tukov (záporné číslo = cieľ je už prekročený, povedz to narovinu).`,
      ].join("\n")
    : "Klient nemá zatiaľ nastavený nutričný profil/makro cieľ — ak sa pýta na jedlo/makrá, jasne mu povedz, nech sa opýta trénera, a nič si k tomu nedopočítavaj.";

  const timeBlock = context.currentMealSlotLabel
    ? `Aktuálny čas zodpovedá jedlu dňa: ${context.currentMealSlotLabel} (hodina ${context.currentHour}).`
    : `Aktuálna hodina: ${context.currentHour} — mimo bežných časov jedla.`;

  const foodBlock =
    foods.length > 0
      ? `Knižnica potravín (vyber VÝHRADNE z tohto zoznamu, uveď aj gramáž):\n${formatFoodCandidates(foods)}`
      : "";

  let exerciseBlock = "";
  if (candidates) {
    const { matched, alternatives } = candidates;
    const nameOf = (c: ExerciseCandidate) => c.nameSk?.trim() || c.name;
    if (matched && alternatives.length > 0) {
      exerciseBlock =
        `Klient pravdepodobne myslí cvik "${nameOf(matched)}" (svalová partia: ${matched.muscleGroup}). ` +
        `Skutočné cviky rovnakej partie z knižnice — vyber 2-3 najvhodnejšie, NIKDY nenavrhuj cvik mimo tohto zoznamu:\n` +
        alternatives.map((a) => `- ${nameOf(a)}`).join("\n");
    } else if (matched) {
      exerciseBlock = `Klient pravdepodobne myslí cvik "${nameOf(matched)}", ale appka nenašla iné cviky rovnakej partie — priznaj to a odporuč spýtať sa trénera na konkrétnu alternatívu.`;
    } else {
      exerciseBlock =
        "Klient žiada o náhradu cviku, ale appka si nie je istá, ktorý cvik myslí — opýtaj sa ho, ktorý presne cvik chce nahradiť, nič nehádaj.";
    }
  }

  // i18n-ignore-end
  // Cviky, ktoré appka vie overiť a k odpovedi priložiť ako klikateľný detail
  // (marker [CVIKY: ...], viď extractReferencedExercises vyššie) — plán vždy,
  // náhrada len keď appka reálne našla kandidátov.
  const knownExercises = new Map<string, string>(training.exercises.map((e) => [e.id, e.name]));
  if (candidates) {
    const nameOf = (c: ExerciseCandidate) => c.nameSk?.trim() || c.name;
    if (candidates.matched) knownExercises.set(candidates.matched.id, nameOf(candidates.matched));
    for (const a of candidates.alternatives) knownExercises.set(a.id, nameOf(a));
  }
  const exerciseIdIndexBlock =
    knownExercises.size > 0
      ? `Cviky s ID (len pre marker [CVIKY: ...] na konci odpovede — tento zoznam sa klientovi nikdy nezobrazuje):\n${[...knownExercises].map(([id, name]) => `${id} :: ${name}`).join("\n")}`
      : "";

  const anthropic = getAnthropicClient();
  const recent = history.slice(-HISTORY_WINDOW);
  const softEscalation = healthTrigger && swapIntent;

  try {
    const response = await anthropic.messages.create({
      model: AI_MODEL.CHAT,
      max_tokens: MAX_REPLY_TOKENS,
      system: [
        buildSystemPrompt(softEscalation, locale),
        contextBlock,
        timeBlock,
        training.block,
        progressBlock,
        foodBlock,
        exerciseBlock,
        exerciseIdIndexBlock,
      ]
        .filter(Boolean)
        .join("\n\n"),
      messages: [...recent.map((m) => ({ role: m.role, content: m.content })), { role: "user" as const, content: userText }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    const rawReply = textBlock && textBlock.type === "text" ? textBlock.text : t("noReply");
    const { text: cleanedReply, exercises: referencedExercises } = extractReferencedExercises(rawReply, knownExercises);
    const reply = stripMarkdown(cleanedReply);

    // Zápis spotreby a mäkké FYI trénerovi až po odoslaní odpovede klientovi (after) —
    // odpoveď AI na ne nemusí čakať.
    const usage = response.usage;
    after(async () => {
      await logAiUsage({
        trainerId,
        clientId,
        kind: "chat",
        model: AI_MODEL.CHAT,
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        reservationId: slot.reservationId,
      });

      // mäkké FYI trénerovi — bežná výmena cviku kvôli nepohodliu, nie alarm (viď healthFilter.ts)
      if (softEscalation) {
        const { error } = await supabase.rpc("insert_ai_escalation_message", {
          p_client_id: clientId,
          p_body: buildSoftExerciseNoticeForTrainer(userText),
        });
        if (error) console.error("insert_ai_escalation_message (soft):", error.message);
      }
    });

    return {
      status: "ok",
      reply,
      escalated: softEscalation,
      exercises: referencedExercises.length > 0 ? referencedExercises : undefined,
    };
  } catch (err) {
    console.error("sendAiChatMessage (Claude call):", err instanceof Error ? err.message : err);
    return { status: "error", reply: t("failed") };
  }
}
