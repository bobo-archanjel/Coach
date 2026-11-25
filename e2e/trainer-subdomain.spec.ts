// i18n-ignore-file: testy subdomén trénerov — čisté testy bez siete a bez DB (vymyslené handly a hosty)
import { test, expect } from "@playwright/test";
import { buildTrainerPublicUrl, parseTrainerHost, trainerHandleFromHost, trainerSubdomainBase } from "../lib/publicPage/subdomain";
import { trainerPublicUrl } from "../lib/site";
import { buildPageJsonLd, buildPageMetadata } from "../lib/publicPage/seo";

const BASE = "myfitpilot.sk";

test.describe("subdomény trénerov: host → handle", () => {
  test("platný handle zo subdomény (aj veľké písmená, port, bodka na konci)", () => {
    expect(trainerHandleFromHost("fitsmajom.myfitpilot.sk", BASE)).toBe("fitsmajom");
    expect(trainerHandleFromHost("FitSMajom.MyFitPilot.sk", BASE)).toBe("fitsmajom");
    expect(trainerHandleFromHost("maja-fit.myfitpilot.sk:443", BASE)).toBe("maja-fit");
    expect(trainerHandleFromHost("fitsmajom.myfitpilot.sk.", BASE)).toBe("fitsmajom");
  });

  test("dev: localhost so portom", () => {
    expect(trainerHandleFromHost("fitsmajom.localhost:3000", "localhost")).toBe("fitsmajom");
    expect(parseTrainerHost("localhost:3000", "localhost")).toEqual({ kind: "other" });
    expect(parseTrainerHost("www.localhost:3000", "localhost")).toEqual({ kind: "www" });
  });

  test("www a hlavná doména nie sú tréner", () => {
    expect(parseTrainerHost("www.myfitpilot.sk", BASE)).toEqual({ kind: "www" });
    expect(trainerHandleFromHost("www.myfitpilot.sk", BASE)).toBeNull();
    expect(parseTrainerHost("myfitpilot.sk", BASE)).toEqual({ kind: "other" });
  });

  test("rezervované slová a zlý tvar sú neplatné", () => {
    for (const h of ["admin", "api", "portal", "prihlasenie", "fitpilot-maja", "ab", "-maja", "maja-", "ma--ja", "ma_ja", "x".repeat(31)]) {
      expect(parseTrainerHost(`${h}.myfitpilot.sk`, BASE), h).toEqual({ kind: "invalid" });
      expect(trainerHandleFromHost(`${h}.myfitpilot.sk`, BASE), h).toBeNull();
    }
  });

  test("viacúrovňová subdoména je neplatná", () => {
    expect(parseTrainerHost("a.b.myfitpilot.sk", BASE)).toEqual({ kind: "invalid" });
    expect(parseTrainerHost("maja.www.myfitpilot.sk", BASE)).toEqual({ kind: "invalid" });
    expect(parseTrainerHost(".myfitpilot.sk", BASE)).toEqual({ kind: "invalid" });
  });

  test("cudzí host, chýbajúci host a vypnutá funkcia → žiadny tréner", () => {
    for (const h of ["fitsmajom.example.com", "fitsmajom.myfitpilot.sk.evil.com", "evilmyfitpilot.sk", "coach-abc.vercel.app", "", null, undefined]) {
      expect(trainerHandleFromHost(h, BASE), String(h)).toBeNull();
    }
    expect(parseTrainerHost("fitsmajom.example.com", BASE)).toEqual({ kind: "other" });
    expect(trainerHandleFromHost("fitsmajom.myfitpilot.sk", null)).toBeNull();
    expect(parseTrainerHost("fitsmajom.myfitpilot.sk", null)).toEqual({ kind: "other" });
  });
});

test.describe("subdomény trénerov: zapnutie a adresy", () => {
  test("základ z env; v dev predvolene localhost, inak vypnuté", () => {
    expect(trainerSubdomainBase({ TRAINER_SUBDOMAIN_BASE: " MyFitPilot.sk " })).toBe("myfitpilot.sk");
    expect(trainerSubdomainBase({})).toBeNull();
    expect(trainerSubdomainBase({ NODE_ENV: "production" })).toBeNull();
    expect(trainerSubdomainBase({ NODE_ENV: "development" })).toBe("localhost");
    expect(trainerSubdomainBase({ NODE_ENV: "production", TRAINER_SUBDOMAIN_BASE: "a b" })).toBeNull();
  });

  test("trainerPublicUrl: zapnuté = subdoména, vypnuté = /t/<handle>", () => {
    expect(trainerPublicUrl("fitsmajom", { TRAINER_SUBDOMAIN_BASE: BASE })).toBe("https://fitsmajom.myfitpilot.sk/");
    expect(trainerPublicUrl("fitsmajom", {})).toBe("https://www.myfitpilot.sk/t/fitsmajom");
    expect(buildTrainerPublicUrl("maja", null, "https://x.sk/")).toBe("https://x.sk/t/maja");
    expect(buildTrainerPublicUrl("maja", "localhost", "https://x.sk")).toBe("http://maja.localhost:3000/");
  });

  test("SEO: canonical a JSON-LD podľa pageUrl, og:image ostáva absolútny na hlavnej doméne", () => {
    const page = { handle: "fitsmajom", displayName: "Fit s Majou", headline: "", bio: "Bio" };
    const opts = { site: "https://www.myfitpilot.sk", locale: "sk_SK", descriptionFallback: "x", siteName: "FitPilot" };
    const off = buildPageMetadata(page, opts);
    expect(off.alternates.canonical).toBe("https://www.myfitpilot.sk/t/fitsmajom");
    const on = buildPageMetadata(page, { ...opts, pageUrl: "https://fitsmajom.myfitpilot.sk/" });
    expect(on.alternates.canonical).toBe("https://fitsmajom.myfitpilot.sk/");
    expect(on.openGraph.url).toBe("https://fitsmajom.myfitpilot.sk/");
    expect(on.openGraph.images[0].url).toBe("https://www.myfitpilot.sk/t/fitsmajom/og");
    const ld = buildPageJsonLd({ ...page, location: "", photoUrl: null, logoUrl: null, socials: {} }, opts.site, "https://fitsmajom.myfitpilot.sk/");
    expect(ld.url).toBe("https://fitsmajom.myfitpilot.sk/");
  });
});
