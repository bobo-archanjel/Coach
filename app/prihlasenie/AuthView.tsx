"use client";

import { startTransition, useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogoMark } from "../components/LogoMark";
import { PasswordRequirements } from "../components/PasswordRequirements";
import { useLoadingMessage } from "../components/useLoadingMessage";
import { TurnstileScript, useTurnstile } from "../components/Turnstile";
import { createClient } from "@/lib/supabase/client";
import { checkPassword } from "@/lib/passwordStrength";
import { loginAction, registerAction, type LoginState, type RegisterState } from "./actions";
import styles from "./auth.module.css";

const initialLoginState: LoginState = { error: null, redirectTo: null };
const initialRegisterState: RegisterState = { error: null, redirectTo: null, needsConfirm: false };

/** Honeypot — skryté pole, ktoré človek nikdy nevyplní, primitívny bot áno
 * (rovnaký princíp ako waitlist/index.html). Mimo viditeľnej plochy AJ mimo
 * tab poradia, nie len `display:none` — niektoré boty CSS `display` rešpektujú. */
function Honeypot() {
  return (
    <input
      type="text"
      name="hp"
      tabIndex={-1}
      autoComplete="off"
      aria-hidden="true"
      style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
    />
  );
}

// "Zapamätať si ma" — pre-fill e-mailu pri ďalšej návšteve (feature/navod, "pre-fill
// what you can"). Zámerne len e-mail, nie heslo — appka si heslá nikdy neukladá.
const REMEMBER_EMAIL_KEY = "fitpilot_remembered_email";

const ErrorIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <circle cx="7" cy="7" r="6" stroke="var(--error)" strokeWidth="1.4" />
    <path d="M7 4v3.5M7 9.6v.1" stroke="var(--error)" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18">
    <path
      fill="#4285F4"
      d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84c-.21 1.13-.84 2.08-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62Z"
    />
    <path
      fill="#34A853"
      d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.36 0-4.36-1.59-5.08-3.73H.9v2.33C2.37 15.98 5.44 18 9 18Z"
    />
    <path
      fill="#FBBC05"
      d="M3.92 10.69A5.4 5.4 0 0 1 3.64 9c0-.59.1-1.16.28-1.69V4.98H.9A8.95 8.95 0 0 0 0 9c0 1.45.35 2.82.9 4.02l3.02-2.33Z"
    />
    <path
      fill="#EA4335"
      d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0 5.44 0 2.37 2.02.9 4.98l3.02 2.33C4.64 5.17 6.64 3.58 9 3.58Z"
    />
  </svg>
);

const CheckIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M3 9.5l3.4 3.4L15 4.5" stroke="var(--iron-red)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const SuccessIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M3 8.5l3 3 7-7" stroke="#a9d3b8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const EyeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M1.5 9S4.5 3.5 9 3.5 16.5 9 16.5 9 13.5 14.5 9 14.5 1.5 9 1.5 9Z" stroke="currentColor" strokeWidth="1.4" />
    <circle cx="9" cy="9" r="2.2" stroke="currentColor" strokeWidth="1.4" />
  </svg>
);

function validate(form: HTMLFormElement, fieldNames: string[]) {
  const invalid: Record<string, boolean> = {};
  let hasInvalid = false;
  for (const name of fieldNames) {
    const el = form.elements.namedItem(name) as HTMLInputElement | null;
    if (!el) continue;
    const ok = el.checkValidity();
    invalid[name] = !ok;
    if (!ok) hasInvalid = true;
  }
  return { invalid, hasInvalid };
}

/**
 * Prihlásenie / registrácia / zabudnuté heslo na /prihlasenie (dizajn v6, koreň s témou
 * v layout.tsx — téma sa prepína na landing page); po prihlásení vždy /portal alebo /dashboard.
 */
export function AuthView() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [activeTab, setActiveTab] = useState<"login" | "register">("login");

  // Gmail prihlásenie (feature/login) — presmerovanie na providera, návrat ide
  // cez app/auth/callback/route.ts (server si vymení `code` za session). `role` sa
  // posiela len z registrácie (podľa zvoleného tabu Tréner/Klient) — pri prihlásení
  // existujúceho účtu žiadnu rolu nepotrebujeme, tá je už v `profiles`.
  const [oauthPending, setOauthPending] = useState<"google" | null>(null);
  async function handleOAuth(provider: "google", role?: "trainer" | "client") {
    setOauthPending(provider);
    const redirectTo = new URL("/auth/callback", window.location.origin);
    if (role) redirectTo.searchParams.set("role", role);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: redirectTo.toString() },
    });
    if (error) setOauthPending(null);
  }

  useEffect(() => {
    const hash = window.location.hash;
    if (hash === "#register" || hash === "#register-trener") setActiveTab("register");
    if (hash === "#register-trener") setRegisterRole("trainer");
  }, []);

  const [oauthError, setOauthError] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("oauth_error")) {
      setOauthError(true);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  // ---- login form state ----
  // Prihlásenie ide cez Server Action (./actions.ts, feature/optimalizacia —
  // security audit): predtým volalo supabase.auth.signInWithPassword priamo z
  // prehliadača, náš server o pokuse vôbec nevedel (nedal sa rate-limitovať ani
  // počítať na lockout). Server teraz rozhoduje o výsledku aj presmerovaní.
  const loginFormRef = useRef<HTMLFormElement>(null);
  const loginTurnstile = useTurnstile();
  const [loginInvalid, setLoginInvalid] = useState<Record<string, boolean>>({});
  const [loginShowPassword, setLoginShowPassword] = useState(false);
  const [loginCanSubmit, setLoginCanSubmit] = useState(false);
  const [loginState, loginFormAction, loginPending] = useActionState(loginAction, initialLoginState);
  const loginStatus: "idle" | "loading" | "success" = loginPending
    ? "loading"
    : loginState.redirectTo
      ? "success"
      : "idle";
  const loginError = loginState.error;
  // Token je jednorazový — po neúspechu treba nový na ďalší pokus.
  useEffect(() => {
    if (loginError) loginTurnstile.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loginError]);
  const loginLoadingText = useLoadingMessage(loginStatus === "loading", [
    "Prihlasujem…",
    "Overujem údaje…",
    "Už to bude…",
  ]);

  // Pre-fill e-mailu z predošlého prihlásenia so zaškrtnutým "Zapamätať si ma".
  // Priamo cez DOM (nie React `defaultValue` state) — defaultValue sa po mounte
  // znova neaplikuje, takže neskoršie načítanie z localStorage by sa nezobrazilo.
  useEffect(() => {
    const form = loginFormRef.current;
    if (!form) return;
    try {
      const saved = window.localStorage.getItem(REMEMBER_EMAIL_KEY);
      if (saved) {
        (form.elements.namedItem("email") as HTMLInputElement).value = saved;
        (form.elements.namedItem("remember") as HTMLInputElement).checked = true;
      }
    } catch {
      // localStorage nedostupný (privátne okno a pod.) — jednoducho bez pre-fillu.
    }
    updateLoginCanSubmit();
  }, []);

  function updateLoginCanSubmit() {
    setLoginCanSubmit(loginFormRef.current?.checkValidity() ?? false);
  }

  // Presmerovanie po úspechu — server už rozhodol kam (podľa role), tu len navigujeme.
  // Bez router.refresh(): loginAction nastavil session cookies, čím Next sám zahodil
  // router cache — push už načíta cieľ s novou session. Refresh navyše vykreslil
  // celý dashboard/portál zo servera ešte druhýkrát hneď po prihlásení.
  const loginTarget = loginState.redirectTo ?? null;
  useEffect(() => {
    if (!loginTarget) return;
    router.push(loginTarget);
  }, [loginTarget, router]);

  function handleLoginSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    // Forgiving formatting — orežeme medzery pred/za e-mailom (bežné pri copy-paste).
    const emailEl = form.elements.namedItem("email") as HTMLInputElement;
    emailEl.value = emailEl.value.trim();
    const { invalid, hasInvalid } = validate(form, ["email", "password"]);
    setLoginInvalid(invalid);
    if (hasInvalid) return;

    const remember = (form.elements.namedItem("remember") as HTMLInputElement).checked;
    try {
      if (remember) window.localStorage.setItem(REMEMBER_EMAIL_KEY, emailEl.value);
      else window.localStorage.removeItem(REMEMBER_EMAIL_KEY);
    } catch {
      // localStorage nedostupný — prihlásenie samotné tým nie je ovplyvnené.
    }

    const fd = new FormData(form);
    fd.set("turnstile_token", loginTurnstile.getToken());
    startTransition(() => loginFormAction(fd));
  }

  // ---- zabudnuté heslo ----
  const [forgotOpen, setForgotOpen] = useState(false);
  const forgotFormRef = useRef<HTMLFormElement>(null);
  const [forgotInvalid, setForgotInvalid] = useState(false);
  const [forgotStatus, setForgotStatus] = useState<"idle" | "loading" | "success">("idle");
  const [forgotError, setForgotError] = useState<string | null>(null);
  const forgotLoadingText = useLoadingMessage(forgotStatus === "loading", ["Odosielam…", "Ešte chvíľku…"]);

  async function handleForgotSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setForgotError(null);
    const form = e.currentTarget;
    const emailEl = form.elements.namedItem("email") as HTMLInputElement;
    emailEl.value = emailEl.value.trim();
    if (!emailEl.checkValidity()) {
      setForgotInvalid(true);
      return;
    }
    setForgotInvalid(false);
    setForgotStatus("loading");
    const { error } = await supabase.auth.resetPasswordForEmail(emailEl.value, {
      redirectTo: `${window.location.origin}/prihlasenie/nove-heslo`,
    });
    // Supabase úmyselne nehlási, či e-mail v systéme existuje (ochrana pred
    // enumeráciou účtov) — správa je preto vždy rovnaká, aj pri chybe siete
    // necháme používateľa skúsiť znova cez formError, ale neprezrádzame existenciu.
    if (error) {
      setForgotStatus("idle");
      setForgotError("Odoslanie zlyhalo. Skús to o chvíľu znova.");
      return;
    }
    setForgotStatus("success");
  }

  // ---- register form state ----
  // Registrácia ide cez Server Action (./actions.ts, feature/security) — predtým
  // volala supabase.auth.signUp priamo z prehliadača, server o pokuse vôbec
  // nevedel (rovnaký dôvod ako pri prihlásení — Turnstile/honeypot sa dajú overiť
  // len na serveri). Klientská pred-validácia (natívna HTML5 validita + sila
  // hesla) ostáva — zachytí chyby OKAMŽITE, bez čakania na round-trip.
  const registerFormRef = useRef<HTMLFormElement>(null);
  const registerTurnstile = useTurnstile();
  const [registerInvalid, setRegisterInvalid] = useState<Record<string, boolean>>({});
  const [registerShowPassword, setRegisterShowPassword] = useState(false);
  const [registerClientError, setRegisterClientError] = useState<string | null>(null);
  const [registerState, registerFormAction, registerActionPending] = useActionState(
    registerAction,
    initialRegisterState,
  );
  const registerStatus: "idle" | "loading" | "success" = registerActionPending
    ? "loading"
    : registerState.redirectTo || registerState.needsConfirm
      ? "success"
      : "idle";
  const registerError = registerClientError ?? registerState.error;
  const registerNeedsConfirm = registerState.needsConfirm;
  useEffect(() => {
    if (registerError) registerTurnstile.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerError]);
  // "/portal"/"/dashboard" zo servera — po prihlásení existuje len nový dizajn.
  const registerTarget = registerState.redirectTo ?? null;
  useEffect(() => {
    if (!registerTarget) return;
    router.push(registerTarget);
  }, [registerTarget, router]);
  // Živý ukazovateľ sily hesla (feature/optimalizacia, security audit) — kontext
  // (meno/e-mail) sa reálne vyhodnocuje až pri submite (handleRegisterSubmit má
  // finálne hodnoty všetkých polí), tu len dĺžka/rozmanitosť pre rýchlu spätnú väzbu.
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerPasswordIssues, setRegisterPasswordIssues] = useState<string[]>([]);
  const [registerCanSubmit, setRegisterCanSubmit] = useState(false);
  // Rola sa volí explicitne (tréner vs. klient). Klient sa registruje VŽDY
  // rovnako — bez pozývacieho kódu (feature/registracia-update): po registrácii
  // dostane vlastný kód, ktorý ukáže trénerovi. Tréner ho zadá v "Pridať klienta".
  // predvolene klient — klientov sa registruje viac než trénerov; tréner príde z landingu
  // cez #register-trener (cenník, „Začať skúšobné obdobie“) s predvoleným trénerom
  const [registerRole, setRegisterRole] = useState<"trainer" | "client">("client");
  const isClientSignup = registerRole === "client";
  const registerLoadingText = useLoadingMessage(registerStatus === "loading", [
    "Vytváram účet…",
    "Nastavujem profil…",
    "Už to bude…",
  ]);

  // Tlačidlo ostáva disabled, kým nie je vyplnené a platné VŠETKO (natívna HTML5
  // validita + vlastná kontrola hesla) — "don't let users submit until everything
  // is filled out correctly". Kontext (meno/e-mail proti heslu) sa aj tak
  // naplno overuje až pri submite, tu ide o rýchlu priebežnú spätnú väzbu.
  function updateRegisterCanSubmit() {
    const form = registerFormRef.current;
    if (!form) return setRegisterCanSubmit(false);
    const password = (form.elements.namedItem("password") as HTMLInputElement).value;
    setRegisterCanSubmit(form.checkValidity() && checkPassword(password).ok);
  }

  function handleRegisterSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setRegisterClientError(null);
    const form = e.currentTarget;
    // Forgiving formatting — orežeme medzery pred/za menom a e-mailom.
    const nameEl = form.elements.namedItem("name") as HTMLInputElement;
    const emailEl = form.elements.namedItem("email") as HTMLInputElement;
    nameEl.value = nameEl.value.trim();
    emailEl.value = emailEl.value.trim();
    const { invalid, hasInvalid } = validate(form, ["name", "email", "password", "terms"]);
    setRegisterInvalid(invalid);
    if (hasInvalid) return;

    const name = nameEl.value;
    const email = emailEl.value;
    const password = (form.elements.namedItem("password") as HTMLInputElement).value;

    // Kontrola sily hesla (feature/optimalizacia, security audit) — okamžitá
    // spätná väzba bez čakania na server; rovnaká kontrola beží aj v
    // registerAction (obísť klienta priamym volaním akcie by inak stačilo).
    const emailLocalPart = email.split("@")[0] ?? "";
    const pwCheck = checkPassword(password, [name, emailLocalPart]);
    if (!pwCheck.ok) {
      setRegisterPasswordIssues(pwCheck.issues);
      setRegisterInvalid({ ...invalid, password: true });
      return;
    }
    setRegisterPasswordIssues([]);

    const fd = new FormData(form);
    fd.set("role", registerRole);
    fd.set("turnstile_token", registerTurnstile.getToken());
    startTransition(() => registerFormAction(fd));
  }

  function clearFieldError(
    e: React.ChangeEvent<HTMLInputElement>,
    invalidMap: Record<string, boolean>,
    setInvalidMap: (v: Record<string, boolean>) => void
  ) {
    const name = e.currentTarget.name;
    if (!invalidMap[name]) return;
    if (e.currentTarget.checkValidity()) {
      setInvalidMap({ ...invalidMap, [name]: false });
    }
  }

  /**
   * Opak `clearFieldError` — nastaví chybu HNEĎ, keď človek pole opustí neplatné
   * (nielen keď skúsi odoslať). Kritické pri disabled submit tlačidle: bez tohto
   * nikdy neuvidí PREČO nejde ďalej, lebo disabled tlačidlo sa nedá kliknúť a
   * handleSubmit (kde bola pôvodne jediná validácia) sa tak vôbec nespustí.
   */
  function validateFieldOnBlur(
    e: React.FocusEvent<HTMLInputElement>,
    invalidMap: Record<string, boolean>,
    setInvalidMap: (v: Record<string, boolean>) => void
  ) {
    const el = e.currentTarget;
    if (!el.value) return; // prázdne nedotknuté pole nehlásiť ako chybu hneď pri fokuse preč
    const ok = el.checkValidity();
    if (ok === !invalidMap[el.name]) return;
    setInvalidMap({ ...invalidMap, [el.name]: !ok });
  }

  return (
    <div className={styles.shell}>
      <TurnstileScript />
      <aside className={styles.brandPanel}>
        <div className={styles.plateField} aria-hidden="true" />
        <div>
          <Link className={styles.brand} href="/">
            <LogoMark className={styles.logoMark} />
            FitPilot
          </Link>
          <p className={styles.brandTagline}>Tréning. Výživa. Komunikácia. Rast.</p>
        </div>

        <div className={styles.brandMid}>
          <h1>
            Tvoji klienti.
            <br />
            Tvoj systém.
          </h1>
          <div className="bar-rule red">
            <span className="plate" />
            <span className="bar" />
          </div>
          <ul className={styles.valueList}>
            <li>
              <CheckIcon />
              Tréningy, makrá aj AI chat na jednom mieste, po slovensky.
            </li>
            <li>
              <CheckIcon />
              AI vždy len navrhuje — posledné slovo má tréner.
            </li>
            <li>
              <CheckIcon />
              14 dní zadarmo, bez viazanosti.
            </li>
          </ul>
        </div>

        <p className={styles.brandFoot}>
          Potrebuješ pomoc? <a href="mailto:podpora@myfitpilot.sk">podpora@myfitpilot.sk</a>
        </p>
      </aside>

      <main className={styles.formPanel}>
        <div className={styles.authCard}>
          <div className={styles.tabs} role="tablist" aria-label="Prihlásenie alebo registrácia">
            <button
              type="button"
              className={styles.tabBtn}
              role="tab"
              aria-selected={activeTab === "login"}
              aria-controls="panel-login"
              onClick={() => setActiveTab("login")}
            >
              Prihlásenie
            </button>
            <button
              type="button"
              className={styles.tabBtn}
              role="tab"
              aria-selected={activeTab === "register"}
              aria-controls="panel-register"
              onClick={() => {
                setActiveTab("register");
                setForgotOpen(false);
              }}
            >
              Registrácia
            </button>
          </div>

          {activeTab === "login" && !forgotOpen && (
            <section id="panel-login" role="tabpanel" aria-labelledby="tab-login">
              <div className={styles.authHead}>
                <h2>Vitaj späť</h2>
                <p>Prihlás sa do svojho konta.</p>
              </div>

              <div className={styles.oauthRow}>
                <button
                  type="button"
                  className={styles.oauthBtn}
                  disabled={oauthPending !== null}
                  onClick={() => handleOAuth("google")}
                >
                  {oauthPending === "google" ? <span className={styles.spinner} aria-hidden="true" /> : <GoogleIcon />}
                  Pokračovať s Google
                </button>
              </div>
              <div className={styles.divider}>
                <span>alebo</span>
              </div>

              {oauthError && (
                <div className={`${styles.formStatus} ${styles.error}`} role="alert" style={{ marginBottom: 16 }}>
                  <ErrorIcon />
                  Prihlásenie zlyhalo. Skús to prosím znova.
                </div>
              )}

              <form ref={loginFormRef} noValidate onSubmit={handleLoginSubmit} onInput={updateLoginCanSubmit}>
                <Honeypot />
                <div className={styles.field}>
                  <label htmlFor="login-email">E-mail</label>
                  <input
                    id="login-email"
                    name="email"
                    type="email"
                    placeholder="tvoj@email.sk"
                    autoComplete="email"
                    required
                    aria-invalid={loginInvalid.email}
                    data-valid={loginInvalid.email === false || undefined}
                    onChange={(e) => clearFieldError(e, loginInvalid, setLoginInvalid)}
                    onBlur={(e) => validateFieldOnBlur(e, loginInvalid, setLoginInvalid)}
                  />
                  {loginInvalid.email && (
                    <span className={styles.fieldError}>
                      <ErrorIcon />
                      Zadaj platnú e-mailovú adresu.
                    </span>
                  )}
                </div>

                <div className={`${styles.field} ${styles.hasToggle}`}>
                  <label htmlFor="login-password">Heslo</label>
                  <div className={styles.inputWrap}>
                    <input
                      id="login-password"
                      name="password"
                      type={loginShowPassword ? "text" : "password"}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      required
                      minLength={8}
                      aria-invalid={loginInvalid.password}
                      onChange={(e) => clearFieldError(e, loginInvalid, setLoginInvalid)}
                      onBlur={(e) => validateFieldOnBlur(e, loginInvalid, setLoginInvalid)}
                    />
                    <button
                      type="button"
                      className={styles.toggleVisibility}
                      aria-label={loginShowPassword ? "Skryť heslo" : "Zobraziť heslo"}
                      onClick={() => setLoginShowPassword((v) => !v)}
                    >
                      <EyeIcon />
                    </button>
                  </div>
                  {loginInvalid.password && (
                    <span className={styles.fieldError}>
                      <ErrorIcon />
                      Heslo musí mať aspoň 8 znakov.
                    </span>
                  )}
                </div>

                <div className={styles.rowBetween}>
                  <label className={styles.checkboxRow} style={{ fontSize: 13 }}>
                    <input type="checkbox" name="remember" />
                    Zapamätať si ma
                  </label>
                  <button type="button" className={styles.link} onClick={() => setForgotOpen(true)}>
                    Zabudnuté heslo?
                  </button>
                </div>

                <div ref={loginTurnstile.containerRef} className={styles.turnstile} />

                <button
                  type="submit"
                  className={`${styles.btnSubmit} ${loginStatus === "success" ? styles.success : ""}`}
                  disabled={loginStatus === "loading" || !loginCanSubmit}
                >
                  {loginStatus === "loading" && <span className={styles.spinner} aria-hidden="true" />}
                  <span>{loginStatus === "loading" ? (loginLoadingText ?? "Prihlasujem…") : "Prihlásiť sa"}</span>
                </button>

                {loginStatus === "success" && (
                  <div className={styles.formStatus} role="status">
                    <SuccessIcon />
                    Prihlásenie prebehlo úspešne. Presmerúvam…
                  </div>
                )}
                {loginError && (
                  <div className={`${styles.formStatus} ${styles.error}`} role="alert">
                    <ErrorIcon />
                    {loginError}
                  </div>
                )}
              </form>

              <p className={styles.switchLine}>
                Nemáš ešte účet?{" "}
                <button type="button" className={styles.link} onClick={() => setActiveTab("register")}>
                  Vytvoriť účet
                </button>
              </p>
            </section>
          )}

          {activeTab === "login" && forgotOpen && (
            <section id="panel-forgot" role="tabpanel" aria-labelledby="tab-login">
              <div className={styles.authHead}>
                <h2>Zabudnuté heslo</h2>
                <p>Zadaj e-mail, pošleme ti naň odkaz na nastavenie nového hesla.</p>
              </div>

              <form ref={forgotFormRef} noValidate onSubmit={handleForgotSubmit}>
                <div className={styles.field}>
                  <label htmlFor="forgot-email">E-mail</label>
                  <input
                    id="forgot-email"
                    name="email"
                    type="email"
                    placeholder="tvoj@email.sk"
                    autoComplete="email"
                    required
                    aria-invalid={forgotInvalid}
                    onChange={(e) => forgotInvalid && e.currentTarget.checkValidity() && setForgotInvalid(false)}
                  />
                  {forgotInvalid && (
                    <span className={styles.fieldError}>
                      <ErrorIcon />
                      Zadaj platnú e-mailovú adresu.
                    </span>
                  )}
                </div>

                <button
                  type="submit"
                  className={`${styles.btnSubmit} ${forgotStatus === "success" ? styles.success : ""}`}
                  disabled={forgotStatus === "loading"}
                >
                  {forgotStatus === "loading" && <span className={styles.spinner} aria-hidden="true" />}
                  <span>{forgotStatus === "loading" ? (forgotLoadingText ?? "Odosielam…") : "Poslať odkaz na reset"}</span>
                </button>

                {forgotStatus === "success" && (
                  <div className={styles.formStatus} role="status">
                    <SuccessIcon />
                    Ak účet s týmto e-mailom existuje, poslali sme naň odkaz na reset hesla.
                  </div>
                )}
                {forgotError && (
                  <div className={`${styles.formStatus} ${styles.error}`} role="alert">
                    <ErrorIcon />
                    {forgotError}
                  </div>
                )}
              </form>

              <p className={styles.switchLine}>
                <button type="button" className={styles.link} onClick={() => setForgotOpen(false)}>
                  ← Späť na prihlásenie
                </button>
              </p>
            </section>
          )}

          {activeTab === "register" && (
            <section id="panel-register" role="tabpanel" aria-labelledby="tab-register">
              <div className={styles.tabs} role="group" aria-label="Registrujem sa ako">
                <button
                  type="button"
                  className={styles.tabBtn}
                  aria-pressed={isClientSignup}
                  onClick={() => setRegisterRole("client")}
                >
                  Som klient
                </button>
                <button
                  type="button"
                  className={styles.tabBtn}
                  aria-pressed={!isClientSignup}
                  onClick={() => setRegisterRole("trainer")}
                >
                  Som tréner
                </button>
              </div>

              <div className={styles.authHead}>
                {isClientSignup ? (
                  <>
                    <h2>
                      Vytvor si
                      <br />
                      účet
                    </h2>
                    <p>
                      Trénuj sám alebo s trénerom. Po registrácii dostaneš vlastný kód — stačí ho poslať trénerovi a on
                      ťa pridá.
                    </p>
                  </>
                ) : (
                  <>
                    <h2>
                      Začni skúšobné
                      <br />
                      obdobie
                    </h2>
                    <p>14 dní zadarmo pre trénerov, bez viazanosti a bez karty.</p>
                  </>
                )}
              </div>

              <div className={styles.oauthRow}>
                <button
                  type="button"
                  className={styles.oauthBtn}
                  disabled={oauthPending !== null}
                  onClick={() => handleOAuth("google", registerRole)}
                >
                  {oauthPending === "google" ? <span className={styles.spinner} aria-hidden="true" /> : <GoogleIcon />}
                  Pokračovať s Google
                </button>
              </div>
              <div className={styles.divider}>
                <span>alebo</span>
              </div>

              <form ref={registerFormRef} noValidate onSubmit={handleRegisterSubmit} onInput={updateRegisterCanSubmit}>
                <Honeypot />
                <div className={styles.field}>
                  <label htmlFor="reg-name">Meno a priezvisko</label>
                  <input
                    id="reg-name"
                    name="name"
                    type="text"
                    placeholder="Martina Kováčová"
                    autoComplete="name"
                    required
                    aria-invalid={registerInvalid.name}
                    onChange={(e) => clearFieldError(e, registerInvalid, setRegisterInvalid)}
                    onBlur={(e) => validateFieldOnBlur(e, registerInvalid, setRegisterInvalid)}
                  />
                  {registerInvalid.name && (
                    <span className={styles.fieldError}>
                      <ErrorIcon />
                      Zadaj svoje meno.
                    </span>
                  )}
                </div>

                <div className={styles.field}>
                  <label htmlFor="reg-email">E-mail</label>
                  <input
                    id="reg-email"
                    name="email"
                    type="email"
                    placeholder="tvoj@email.sk"
                    autoComplete="email"
                    required
                    aria-invalid={registerInvalid.email}
                    onChange={(e) => clearFieldError(e, registerInvalid, setRegisterInvalid)}
                    onBlur={(e) => validateFieldOnBlur(e, registerInvalid, setRegisterInvalid)}
                  />
                  {registerInvalid.email && (
                    <span className={styles.fieldError}>
                      <ErrorIcon />
                      Zadaj platnú e-mailovú adresu.
                    </span>
                  )}
                </div>

                <div className={`${styles.field} ${styles.hasToggle}`}>
                  <label htmlFor="reg-password">Heslo</label>
                  <div className={styles.inputWrap}>
                    <input
                      id="reg-password"
                      name="password"
                      type={registerShowPassword ? "text" : "password"}
                      placeholder="min. 8 znakov"
                      autoComplete="new-password"
                      required
                      minLength={8}
                      aria-invalid={registerInvalid.password}
                      onChange={(e) => {
                        clearFieldError(e, registerInvalid, setRegisterInvalid);
                        setRegisterPassword(e.currentTarget.value);
                        if (registerPasswordIssues.length > 0) setRegisterPasswordIssues([]);
                      }}
                    />
                    <button
                      type="button"
                      className={styles.toggleVisibility}
                      aria-label={registerShowPassword ? "Skryť heslo" : "Zobraziť heslo"}
                      onClick={() => setRegisterShowPassword((v) => !v)}
                    >
                      <EyeIcon />
                    </button>
                  </div>
                  {registerPassword ? (
                    <PasswordRequirements password={registerPassword} />
                  ) : (
                    <span className={styles.fieldHint}>Aspoň 8 znakov, kombinuj písmená aj čísla.</span>
                  )}
                  {registerInvalid.password && (
                    <span className={styles.fieldError}>
                      <ErrorIcon />
                      {registerPasswordIssues[0] ?? "Heslo musí mať aspoň 8 znakov."}
                    </span>
                  )}
                </div>

                <div className={styles.field} style={{ marginBottom: 16 }}>
                  <label className={styles.checkboxRow}>
                    <input
                      type="checkbox"
                      name="terms"
                      required
                      onChange={(e) => clearFieldError(e, registerInvalid, setRegisterInvalid)}
                    />
                    Súhlasím s{" "}
                    <a href="/obchodne-podmienky" target="_blank" rel="noopener noreferrer" className={styles.link}>
                      obchodnými podmienkami
                    </a>{" "}
                    a{" "}
                    <a href="/ochrana-sukromia" target="_blank" rel="noopener noreferrer" className={styles.link}>
                      ochranou súkromia
                    </a>
                    .
                  </label>
                  {registerInvalid.terms && (
                    <span className={styles.fieldError} style={{ marginLeft: 27 }}>
                      <ErrorIcon />
                      Na registráciu je potrebný súhlas s podmienkami.
                    </span>
                  )}
                </div>

                <div ref={registerTurnstile.containerRef} className={styles.turnstile} />

                <button
                  type="submit"
                  className={`${styles.btnSubmit} ${registerStatus === "success" ? styles.success : ""}`}
                  disabled={registerStatus === "loading" || !registerCanSubmit}
                >
                  {registerStatus === "loading" && <span className={styles.spinner} aria-hidden="true" />}
                  <span>
                    {registerStatus === "loading"
                      ? (registerLoadingText ?? "Vytváram účet…")
                      : isClientSignup
                        ? "Vytvoriť účet"
                        : "Začať skúšobné obdobie"}
                  </span>
                </button>

                {registerStatus === "success" && !registerNeedsConfirm && (
                  <div className={styles.formStatus} role="status">
                    <SuccessIcon />
                    Účet vytvorený. Presmerúvam…
                  </div>
                )}
                {registerStatus === "success" && registerNeedsConfirm && (
                  <div className={styles.formStatus} role="status">
                    <SuccessIcon />
                    Účet vytvorený. Skontroluj si e-mail a potvrď registráciu, potom sa môžeš prihlásiť.
                  </div>
                )}
                {registerError && (
                  <div className={`${styles.formStatus} ${styles.error}`} role="alert">
                    <ErrorIcon />
                    {registerError}
                  </div>
                )}
              </form>

              <p className={styles.switchLine}>
                Už máš účet?{" "}
                <button type="button" className={styles.link} onClick={() => setActiveTab("login")}>
                  Prihlásiť sa
                </button>
              </p>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
