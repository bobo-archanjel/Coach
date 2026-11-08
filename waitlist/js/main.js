// FitPilot — Waitlist landing page. Vanilla JS (žiadny build krok, žiadny framework),
// súbor sa nahráva na statický hosting presne tak, ako je.
//
// DÔLEŽITÉ: každá sekcia nižšie (reveal, FAQ, formulár) je zámerne v samostatnom
// try/guard bloku. Skôr táto stránka závisela na 3 externých CDN skriptoch
// (GSAP, ScrollTrigger, Supabase) bez ochrany — keby čo i len jeden z nich
// zlyhal (blokovač reklám, výpadok CDN, veľmi pomalé pripojenie), celý súbor
// spadol na prvom riadku a nefungovalo vôbec nič, vrátane vecí, ktoré s daným
// skriptom nemali nič spoločné (FAQ accordion nepotrebuje Supabase, formulár
// nepotrebuje GSAP). Teraz zlyhanie jedného kúska nezhodí zvyšok stránky.

document.documentElement.classList.add("js"); // viď css/style.css — no-js fallback

// ---------------------------------------------------------------- reveal na scroll
// GSAP ScrollTrigger je len ozdoba (plynulý fade+slide) — keď z akéhokoľvek
// dôvodu chýba (CDN blok, výpadok), spadneme na natívny IntersectionObserver
// (rovnaký vizuálny výsledok, len bez GSAP plynulosti), a ak by chýbal aj ten
// (veľmi starý prehliadač), obsah sa jednoducho ukáže hneď — nikdy nesmie
// zostať trvalo pri opacity:0 len preto, že externý skript nedorazil.
(function setupReveal() {
  const items = document.querySelectorAll("[data-reveal]");
  if (!items.length) return;

  function revealNow(el) {
    const delay = Number(el.dataset.revealDelay || 0);
    setTimeout(() => el.classList.add("is-revealed"), delay);
  }

  if (window.gsap && window.ScrollTrigger) {
    try {
      gsap.registerPlugin(ScrollTrigger);
      items.forEach((el) => {
        ScrollTrigger.create({ trigger: el, start: "top 88%", once: true, onEnter: () => revealNow(el) });
      });
      return;
    } catch (err) {
      console.error("GSAP reveal zlyhal, prepínam na IntersectionObserver:", err);
    }
  }

  if (window.IntersectionObserver) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            revealNow(entry.target);
            io.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -12% 0px" },
    );
    items.forEach((el) => io.observe(el));
  } else {
    items.forEach((el) => el.classList.add("is-revealed"));
  }
})();

// ---------------------------------------------------------------- FAQ accordion
// Čisto natívne DOM API, žiadna závislosť na externom skripte.
document.querySelectorAll("[data-faq-item]").forEach((item) => {
  const btn = item.querySelector("[data-faq-toggle]");
  const panel = item.querySelector("[data-faq-panel]");
  if (!btn || !panel) return;
  btn.addEventListener("click", () => {
    const isOpen = item.getAttribute("data-open") === "true";
    item.setAttribute("data-open", String(!isOpen));
    btn.setAttribute("aria-expanded", String(!isOpen));
    panel.style.maxHeight = isOpen ? null : panel.scrollHeight + "px";
  });
});

// ---------------------------------------------------------------- Waitlist formulár
// feature/wishlist (antispam) — zápis už nejde priamo do Supabase z prehliadača
// (anon kľúč je verejný, dal sa obísť formulár úplne a spamovať skriptom rovno
// na REST API). Ide cez edge function submit-waitlist, ktorá overí CAPTCHA
// (Cloudflare Turnstile), honeypot a limit zápisov z jednej IP — pozri
// supabase/functions/submit-waitlist/index.ts a migráciu 0040.
(function setupForm() {
  const form = document.getElementById("waitlist-form");
  const formStatus = document.getElementById("waitlist-status");
  const submitBtn = document.getElementById("waitlist-submit");
  if (!form || !formStatus || !submitBtn) return;

  const SUPABASE_URL = "https://egpnjtmxproprtwgcwbg.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVncG5qdG14cHJvcHJ0d2djd2JnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc4NDgwNDcsImV4cCI6MjEwMzQyNDA0N30.Ye9u9z1TMjjZNjlNYTW1b-ZtZrKvbNUuoP0nKZogdz8";
  const SUBMIT_URL = `${SUPABASE_URL}/functions/v1/submit-waitlist`;

  const MAX_NAME_LEN = 120;
  const MAX_NOTE_LEN = 500;

  const ERROR_MESSAGES = {
    invalid: "Skontroluj prosím meno, e-mail a rolu.",
    captcha_missing: "Over prosím, že nie si robot (zaškrtávacie políčko vyššie).",
    captcha_failed: "Overenie sa nepodarilo. Skús to prosím znova.",
    rate_limited: "Príliš veľa pokusov z tejto siete. Skús to prosím o niečo neskôr.",
    server: "Zápis sa nepodaril. Skús to prosím o chvíľu znova.",
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    formStatus.textContent = "";
    formStatus.className = "text-sm mt-3";

    const fullName = form.full_name.value.trim().slice(0, MAX_NAME_LEN);
    const email = form.email.value.trim().toLowerCase();
    const role = form.role.value;
    const note = form.note.value.trim().slice(0, MAX_NOTE_LEN);
    const consent = form.consent.checked;
    // Honeypot — skryté pole (css/style.css .hp-field), človek ho nikdy nevyplní.
    const hp = form.website ? form.website.value : "";

    if (!fullName || !email || !role) {
      formStatus.textContent = "Vyplň prosím meno, e-mail aj rolu.";
      formStatus.classList.add("text-[var(--iron-red)]");
      return;
    }
    if (!consent) {
      formStatus.textContent = "Na zápis potrebujeme tvoj súhlas so spracovaním e-mailu.";
      formStatus.classList.add("text-[var(--iron-red)]");
      return;
    }

    // window.turnstile je globál z Cloudflare Turnstile skriptu (index.html <head>).
    const turnstileToken = window.turnstile ? window.turnstile.getResponse() : "";
    if (!turnstileToken) {
      formStatus.textContent = ERROR_MESSAGES.captcha_missing;
      formStatus.classList.add("text-[var(--iron-red)]");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Zapisujem…";

    let result;
    try {
      const res = await fetch(SUBMIT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ full_name: fullName, email, role, note, turnstile_token: turnstileToken, hp }),
      });
      result = await res.json();
    } catch (err) {
      console.error("Zápis na waitlist zlyhal (sieť):", err);
      result = { ok: false, code: "server" };
    }

    submitBtn.disabled = false;
    submitBtn.textContent = "Zapísať sa";
    if (window.turnstile) window.turnstile.reset(); // token je jednorazový, treba nový na ďalší pokus

    if (!result.ok) {
      if (result.code === "duplicate") {
        form.classList.add("hidden");
        formStatus.classList.remove("text-[var(--iron-red)]");
        formStatus.innerHTML =
          '<span class="text-2xl">✓</span><br/>Tento e-mail už na zozname je — ozveme sa, len čo appku spustíme.';
        formStatus.classList.add("text-lg", "font-semibold");
        return;
      }
      formStatus.textContent = ERROR_MESSAGES[result.code] || ERROR_MESSAGES.server;
      formStatus.classList.add("text-[var(--iron-red)]");
      return;
    }

    form.classList.add("hidden");
    formStatus.classList.remove("text-[var(--iron-red)]");
    formStatus.classList.add("text-lg", "font-semibold");
    formStatus.innerHTML =
      '<span class="text-2xl">✓</span><br/>Si na zozname! Potvrdenie posielame na tvoj e-mail, ozveme sa hneď, ako appku spustíme.';
  });
})();
