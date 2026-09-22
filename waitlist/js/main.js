// FitPilot — Waitlist landing page. Vanilla JS (žiadny build krok, žiadny framework),
// súbor sa nahráva na statický hosting presne tak, ako je.

document.documentElement.classList.add("js"); // viď css/style.css — no-js fallback

// ---------------------------------------------------------------- Supabase klient
// Anon kľúč je verejný by design (rovnaký princíp ako v hlavnej appke,
// lib/supabase/client.ts) — bezpečnosť dát nezávisí od jeho utajenia, ale od RLS
// politiky (supabase/migrations/0038_waitlist.sql): anon smie len INSERT, nikdy SELECT.
const SUPABASE_URL = "https://egpnjtmxproprtwgcwbg.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVncG5qdG14cHJvcHJ0d2djd2JnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc4NDgwNDcsImV4cCI6MjEwMzQyNDA0N30.Ye9u9z1TMjjZNjlNYTW1b-ZtZrKvbNUuoP0nKZogdz8";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------------------------------------------------------------- GSAP scroll reveal
// Zámerne NEAPLIKOVANÉ na hero (H1/CTA) — pozri komentár v index.html a v css/style.css.
// Skúsenosť z appky: JS-viazaná animácia na prvej viditeľnej veci škodí LCP.
gsap.registerPlugin(ScrollTrigger);

document.querySelectorAll("[data-reveal]").forEach((el) => {
  ScrollTrigger.create({
    trigger: el,
    start: "top 88%",
    once: true,
    onEnter: () => {
      // malé odstupňovanie v rámci tej istej sekcie (karty), nie naprieč celou stránkou
      const delay = Number(el.dataset.revealDelay || 0);
      setTimeout(() => el.classList.add("is-revealed"), delay);
    },
  });
});

// ---------------------------------------------------------------- FAQ accordion
document.querySelectorAll("[data-faq-item]").forEach((item) => {
  const btn = item.querySelector("[data-faq-toggle]");
  const panel = item.querySelector("[data-faq-panel]");
  btn.addEventListener("click", () => {
    const isOpen = item.getAttribute("data-open") === "true";
    item.setAttribute("data-open", String(!isOpen));
    btn.setAttribute("aria-expanded", String(!isOpen));
    panel.style.maxHeight = isOpen ? null : panel.scrollHeight + "px";
  });
});

// ---------------------------------------------------------------- Waitlist formulár
const form = document.getElementById("waitlist-form");
const formStatus = document.getElementById("waitlist-status");
const submitBtn = document.getElementById("waitlist-submit");

// MAX_* — rovnaké obranné limity dĺžky ako v hlavnej appke (lib/ai/promptSafety.ts
// vzor: nikdy neveriť dĺžke vstupu zo servera, orezať aj na klientovi aj na serveri).
const MAX_NAME_LEN = 120;
const MAX_NOTE_LEN = 500;

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  formStatus.textContent = "";
  formStatus.className = "text-sm mt-3";

  const fullName = form.full_name.value.trim().slice(0, MAX_NAME_LEN);
  const email = form.email.value.trim().toLowerCase();
  const role = form.role.value;
  const note = form.note.value.trim().slice(0, MAX_NOTE_LEN);
  const consent = form.consent.checked;

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

  submitBtn.disabled = true;
  submitBtn.textContent = "Zapisujem…";

  const { error } = await supabaseClient.from("waitlist_signups").insert({
    full_name: fullName,
    email,
    role,
    note: note || null,
    consent_at: new Date().toISOString(),
  });

  submitBtn.disabled = false;
  submitBtn.textContent = "Zapísať sa";

  if (error) {
    // 23505 = unique_violation (email už na zozname) — priateľská správa, nie chyba.
    // Rovnaký princíp ako lib/dbError.ts v appke: nikdy neposielať surovú DB chybu do UI.
    if (error.code === "23505") {
      form.classList.add("hidden");
      formStatus.classList.remove("text-[var(--iron-red)]");
      formStatus.innerHTML =
        '<span class="text-2xl">✓</span><br/>Tento e-mail už na zozname je — ozveme sa, len čo appku spustíme.';
      formStatus.classList.add("text-lg", "font-semibold");
      return;
    }
    formStatus.textContent = "Zápis sa nepodaril. Skús to prosím o chvíľu znova.";
    formStatus.classList.add("text-[var(--iron-red)]");
    return;
  }

  form.classList.add("hidden");
  formStatus.classList.remove("text-[var(--iron-red)]");
  formStatus.classList.add("text-lg", "font-semibold");
  formStatus.innerHTML =
    '<span class="text-2xl">✓</span><br/>Si na zozname! Potvrdenie posielame na tvoj e-mail, ozveme sa hneď, ako appku spustíme.';
});
