import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createTranslator } from "next-intl";
import { MESSAGES, sk } from "../messages/index";
import { LOCALES, localeFromAcceptLanguage } from "../lib/i18n/locales";
import { localizeSystemMessage } from "../lib/i18n/systemMessages";
import skSystem from "../messages/sk/system.json";
import {
  buildCrisisNoticeForTrainer,
  buildEscalationNoticeForTrainer,
  buildSoftExerciseNoticeForTrainer,
} from "../lib/ai/healthFilter";

/**
 * Úplnosť prekladu (feature/cestina) — čisté testy bez servera:
 *  - čeština má presne tie isté kľúče ako slovenčina a žiadny prázdny text,
 *  - každá správa sa dá sformátovať (ICU: parametre, plurály, rich tagy) v oboch jazykoch,
 *  - v app/ a lib/ neostal neprekladaný slovenský text (scripts/i18n-check.mjs),
 *  - systémové správy zo SQL a AI upozornenia sa po česky preložia, po slovensky ostanú.
 */

const ROOT = path.resolve(__dirname, "..");

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out.set(full, value);
    else for (const [k, v] of flatten(value, full)) out.set(k, v);
  }
  return out;
}

/**
 * Ukážkové hodnoty pre ICU správu: plurály/čísla dostanú číslo, select text, rich tagy funkciu,
 * ostatné parametre text. Malý rekurzívny prechod ICU syntaxou (vetvy plurálu sú zase správy).
 */
function sampleValues(message: string): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  let i = 0;
  const readUntil = (stops: string) => {
    const start = i;
    while (i < message.length && !stops.includes(message[i])) i++;
    return message.slice(start, i).trim();
  };
  function parseMessage(): void {
    while (i < message.length) {
      const c = message[i];
      if (c === "}") return;
      if (c === "{") {
        i++;
        parseArgument();
      } else if (c === "<") {
        const tag = /^<\/?(\w+)>/.exec(message.slice(i));
        if (tag && !tag[0].startsWith("</")) values[tag[1]] = (chunks: string) => `[${chunks}]`;
        i += tag ? tag[0].length : 1;
      } else i++;
    }
  }
  function parseArgument(): void {
    const name = readUntil(",}");
    if (message[i] === "}") {
      i++;
      if (!(name in values)) values[name] = "X";
      return;
    }
    i++; // ,
    const type = readUntil(",}");
    values[name] = type === "select" ? "other" : type === "date" || type === "time" ? new Date(0) : 3;
    if (message[i] === "}") {
      i++;
      return;
    }
    i++; // ,
    // vetvy: selector {správa} …
    while (i < message.length) {
      readUntil("{}");
      if (message[i] === "}") {
        i++;
        return;
      }
      i++; // {
      parseMessage();
      i++; // }
    }
  }
  parseMessage();
  return values;
}

const skFlat = flatten(sk as unknown as Tree);

test.describe("preklad — úplnosť", () => {
  test("cs má presne tie isté kľúče ako sk", () => {
    const csFlat = flatten(MESSAGES.cs as unknown as Tree);
    const missing = [...skFlat.keys()].filter((k) => !csFlat.has(k));
    const extra = [...csFlat.keys()].filter((k) => !skFlat.has(k));
    expect(missing, "chýba v cs").toEqual([]);
    expect(extra, "navyše v cs").toEqual([]);
  });

  test("žiadny prázdny text", () => {
    for (const locale of LOCALES) {
      const empty = [...flatten(MESSAGES[locale] as unknown as Tree)].filter(([, v]) => !v.trim()).map(([k]) => k);
      expect(empty, locale).toEqual([]);
    }
  });

  test("každá správa sa sformátuje (ICU) v oboch jazykoch", () => {
    for (const locale of LOCALES) {
      const errors: string[] = [];
      const t = createTranslator({
        locale,
        messages: MESSAGES[locale],
        timeZone: "Europe/Bratislava",
        onError: (e) => errors.push(e.message),
        getMessageFallback: ({ key }) => `!!${key}`,
      });
      const markup = t.markup as unknown as (key: string, values: Record<string, unknown>) => string;
      const flat = flatten(MESSAGES[locale] as unknown as Tree);
      for (const [key, message] of flat) {
        // parametre sa berú zo slovenskej aj českej verzie (musia sa zhodovať)
        const values = { ...sampleValues(skFlat.get(key) ?? ""), ...sampleValues(message) };
        const out = markup(key, values);
        expect(out.startsWith("!!"), `${locale}:${key} → ${errors.at(-1) ?? ""}`).toBe(false);
      }
      expect(errors, locale).toEqual([]);
    }
  });

  test("parametre v cs sedia so sk (rovnaké názvy premenných a tagov)", () => {
    const csFlat = flatten(MESSAGES.cs as unknown as Tree);
    for (const [key, skMessage] of skFlat) {
      const skKeys = Object.keys(sampleValues(skMessage)).sort();
      const csKeys = Object.keys(sampleValues(csFlat.get(key) ?? "")).sort();
      expect(csKeys, key).toEqual(skKeys);
    }
  });

  test("v app/ a lib/ neostal neprekladaný text (scripts/i18n-check.mjs)", () => {
    let output = "";
    let failed = false;
    try {
      output = execFileSync("node", [path.join(ROOT, "scripts/i18n-check.mjs")], { cwd: ROOT, encoding: "utf8" });
    } catch (e) {
      failed = true;
      output = String((e as { stdout?: string }).stdout ?? e);
    }
    expect(failed, output).toBe(false);
  });
});

test.describe("jazyk z hlavičky Accept-Language", () => {
  test("čeština, len ak ju prehliadač uprednostňuje pred slovenčinou", () => {
    expect(localeFromAcceptLanguage(null)).toBe("sk");
    expect(localeFromAcceptLanguage("en-US,en;q=0.9")).toBe("sk");
    expect(localeFromAcceptLanguage("cs-CZ,cs;q=0.9,en;q=0.8")).toBe("cs");
    expect(localeFromAcceptLanguage("sk;q=0.9,cs;q=0.8")).toBe("sk");
    expect(localeFromAcceptLanguage("en;q=1,cs;q=0.7,sk;q=0.5")).toBe("cs");
    expect(localeFromAcceptLanguage("sk-SK")).toBe("sk");
  });
});

test.describe("systémové správy v chate", () => {
  const migrations = fs
    .readdirSync(path.join(ROOT, "supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .map((f) => fs.readFileSync(path.join(ROOT, "supabase/migrations", f), "utf8"))
    .join("\n");

  test("slovenské šablóny presne sedia s textami v SQL migráciách", () => {
    const fixed = [
      "removedByTrainer",
      "deletionRequested",
      "deletionCancelled",
      "cooperationPaused",
      "cooperationResumed",
    ] as const;
    for (const key of fixed) expect(migrations, key).toContain(`'${skSystem[key]}'`);
    expect(migrations).toContain(`'${skSystem.addedAsClient.replace("{name}", "")}'`);
    expect(migrations).toContain(`'${skSystem.trainerFallback}')`);
  });

  test("po česky sa preložia SQL správy aj AI upozornenia, po slovensky ostanú", () => {
    const bodies = [
      skSystem.removedByTrainer,
      skSystem.deletionRequested,
      skSystem.deletionCancelled,
      skSystem.cooperationPaused,
      skSystem.cooperationResumed,
      skSystem.addedAsClient.replace("{name}", "Mária Trénerka"),
      skSystem.addedAsClient.replace("{name}", skSystem.trainerFallback),
      buildEscalationNoticeForTrainer("bolí ma koleno pri drepe"),
      buildCrisisNoticeForTrainer(),
      buildSoftExerciseNoticeForTrainer("bolí ma rameno, aký iný cvik namiesto tlakov?"),
    ];
    for (const body of bodies) {
      expect(localizeSystemMessage(body, "sk")).toBe(body);
      const cs = localizeSystemMessage(body, "cs");
      expect(cs, body).not.toBe(body);
      expect(cs).not.toMatch(/ťa |pokiaľ|spolupráca|odporúčame/);
    }
    expect(localizeSystemMessage(bodies[5], "cs")).toBe(
      "Mária Trénerka tě přidal/a jako svého klienta. Pokud si to nepřeješ, propojení zrušíš v Profilu.",
    );
    expect(localizeSystemMessage(bodies[6], "cs")).toMatch(/^Trenér tě přidal/);
    // citácia správy klienta ostane doslovne (aj prefix, ktorý kontroluje SQL 0036/0046)
    const health = localizeSystemMessage(bodies[7], "cs");
    expect(health).toMatch(/^⚠️ AI asistent upozorňuje: /);
    expect(health).toContain("„bolí ma koleno pri drepe“");
    expect(localizeSystemMessage(bodies[9], "cs")).toMatch(/^ℹ️ AI Kouč: /);
  });

  test("neznámy text ostane bez zmeny", () => {
    expect(localizeSystemMessage("Nová správa, ktorú appka nepozná.", "cs")).toBe("Nová správa, ktorú appka nepozná.");
  });
});
