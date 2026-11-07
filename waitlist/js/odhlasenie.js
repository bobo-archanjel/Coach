// FitPilot — odhlásenie z čakacej listiny (feature/wishlist). Táto stránka len
// vykresľuje UI a volá waitlist-unsubscribe edge funkciu cez fetch() — funkcia
// samotná musí byť čisté JSON API (Supabase edge funkcie nesmú priamo vracať
// vykresliteľné HTML, viď komentár v supabase/functions/waitlist-unsubscribe/index.ts).
(function () {
  const SUPABASE_URL = "https://egpnjtmxproprtwgcwbg.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVncG5qdG14cHJvcHJ0d2djd2JnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc4NDgwNDcsImV4cCI6MjEwMzQyNDA0N30.Ye9u9z1TMjjZNjlNYTW1b-ZtZrKvbNUuoP0nKZogdz8";
  const FN_URL = `${SUPABASE_URL}/functions/v1/waitlist-unsubscribe`;
  const AUTH_HEADERS = { Authorization: `Bearer ${SUPABASE_ANON_KEY}`, apikey: SUPABASE_ANON_KEY };

  const states = {
    loading: document.getElementById("state-loading"),
    confirm: document.getElementById("state-confirm"),
    done: document.getElementById("state-done"),
    invalid: document.getElementById("state-invalid"),
  };
  function show(name) {
    for (const key in states) states[key].classList.toggle("hidden", key !== name);
  }

  const token = new URLSearchParams(window.location.search).get("token") || "";
  if (!token) {
    show("invalid");
    return;
  }

  fetch(`${FN_URL}?token=${encodeURIComponent(token)}`, { headers: AUTH_HEADERS })
    .then((res) => res.json())
    .then((result) => {
      if (!result.ok) return show("invalid");
      const greeting = document.getElementById("confirm-greeting");
      if (result.first_name) greeting.textContent = `Ahoj ${result.first_name}, `;
      show("confirm");
    })
    .catch(() => show("invalid"));

  const confirmBtn = document.getElementById("confirm-btn");
  const confirmError = document.getElementById("confirm-error");
  confirmBtn.addEventListener("click", async () => {
    confirmBtn.disabled = true;
    confirmBtn.textContent = "Odhlasujem…";
    confirmError.classList.add("hidden");
    try {
      const res = await fetch(FN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...AUTH_HEADERS },
        body: JSON.stringify({ token }),
      });
      const result = await res.json();
      if (!result.ok) throw new Error(result.code || "server");
      show("done");
    } catch {
      confirmBtn.disabled = false;
      confirmBtn.textContent = "Áno, odhlásiť ma";
      confirmError.textContent = "Niečo sa pokazilo. Skús to prosím znova o chvíľu.";
      confirmError.classList.remove("hidden");
    }
  });
})();
