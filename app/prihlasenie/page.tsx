"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogoMark } from "../components/LogoMark";
import { createClient } from "@/lib/supabase/client";
import styles from "./auth.module.css";

const ErrorIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <circle cx="7" cy="7" r="6" stroke="var(--error)" strokeWidth="1.4" />
    <path d="M7 4v3.5M7 9.6v.1" stroke="var(--error)" strokeWidth="1.4" strokeLinecap="round" />
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

const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className={open ? styles.chevronOpen : undefined}>
    <path d="M4 5.5l3 3 3-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
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

export default function AuthPage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [activeTab, setActiveTab] = useState<"login" | "register">("login");

  useEffect(() => {
    if (window.location.hash === "#register") setActiveTab("register");
  }, []);

  // ---- login form state ----
  const loginFormRef = useRef<HTMLFormElement>(null);
  const [loginInvalid, setLoginInvalid] = useState<Record<string, boolean>>({});
  const [loginShowPassword, setLoginShowPassword] = useState(false);
  const [loginStatus, setLoginStatus] = useState<"idle" | "loading" | "success">("idle");
  const [loginError, setLoginError] = useState<string | null>(null);

  async function handleLoginSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoginError(null);
    const form = e.currentTarget;
    const { invalid, hasInvalid } = validate(form, ["email", "password"]);
    setLoginInvalid(invalid);
    if (hasInvalid) return;

    setLoginStatus("loading");
    const email = (form.elements.namedItem("email") as HTMLInputElement).value;
    const password = (form.elements.namedItem("password") as HTMLInputElement).value;

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoginStatus("idle");
      setLoginError(
        error.message === "Invalid login credentials"
          ? "Nesprávny e-mail alebo heslo."
          : error.message
      );
      return;
    }
    setLoginStatus("success");
    router.push("/dashboard");
    router.refresh();
  }

  // ---- register form state ----
  const registerFormRef = useRef<HTMLFormElement>(null);
  const [registerInvalid, setRegisterInvalid] = useState<Record<string, boolean>>({});
  const [registerShowPassword, setRegisterShowPassword] = useState(false);
  const [registerStatus, setRegisterStatus] = useState<"idle" | "loading" | "success">("idle");
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registerNeedsConfirm, setRegisterNeedsConfirm] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  async function handleRegisterSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setRegisterError(null);
    const form = e.currentTarget;
    const { invalid, hasInvalid } = validate(form, ["name", "email", "password", "terms"]);
    setRegisterInvalid(invalid);
    if (hasInvalid) return;

    setRegisterStatus("loading");
    const name = (form.elements.namedItem("name") as HTMLInputElement).value;
    const email = (form.elements.namedItem("email") as HTMLInputElement).value;
    const password = (form.elements.namedItem("password") as HTMLInputElement).value;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name, role: "trainer" } },
    });
    if (error) {
      setRegisterStatus("idle");
      setRegisterError(
        error.message === "User already registered" ? "Tento e-mail už je zaregistrovaný." : error.message
      );
      return;
    }

    setRegisterStatus("success");
    if (data.session) {
      // Potvrdenie e-mailu je v projekte vypnuté — session je aktívna hneď.
      router.push("/dashboard");
      router.refresh();
    } else {
      // Predvolené nastavenie Supabase: treba potvrdiť e-mail skôr, než vznikne session.
      setRegisterNeedsConfirm(true);
    }
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

  return (
    <div className={styles.shell}>
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
          Potrebuješ pomoc? <a href="mailto:podpora@fitpilot.sk">podpora@fitpilot.sk</a>
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
              onClick={() => setActiveTab("register")}
            >
              Registrácia
            </button>
          </div>

          {activeTab === "login" && (
            <section id="panel-login" role="tabpanel" aria-labelledby="tab-login">
              <div className={styles.authHead}>
                <h2>Vitaj späť</h2>
                <p>Prihlás sa do svojho trénerského konta.</p>
              </div>

              <form ref={loginFormRef} noValidate onSubmit={handleLoginSubmit}>
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
                  <a href="#" className={styles.link}>
                    Zabudnuté heslo?
                  </a>
                </div>

                <button type="submit" className={`${styles.btnSubmit} ${loginStatus === "success" ? styles.success : ""}`} disabled={loginStatus === "loading"}>
                  {loginStatus === "loading" && <span className={styles.spinner} aria-hidden="true" />}
                  <span>{loginStatus === "loading" ? "Prihlasujem…" : "Prihlásiť sa"}</span>
                </button>

                {loginStatus === "success" && (
                  <div className={styles.formStatus} role="status">
                    <SuccessIcon />
                    Prihlásenie prebehlo úspešne. Presmerúvam na dashboard…
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

          {activeTab === "register" && (
            <section id="panel-register" role="tabpanel" aria-labelledby="tab-register">
              <div className={styles.authHead}>
                <h2>
                  Začni skúšobné
                  <br />
                  obdobie
                </h2>
                <p>14 dní zadarmo pre trénerov, bez viazanosti a bez karty.</p>
              </div>

              <form ref={registerFormRef} noValidate onSubmit={handleRegisterSubmit}>
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
                      onChange={(e) => clearFieldError(e, registerInvalid, setRegisterInvalid)}
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
                  <span className={styles.fieldHint}>Aspoň 8 znakov, odporúčame kombináciu písmen a čísel.</span>
                  {registerInvalid.password && (
                    <span className={styles.fieldError}>
                      <ErrorIcon />
                      Heslo musí mať aspoň 8 znakov.
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
                    Súhlasím so <a href="#" className={styles.link}>zmluvnými podmienkami</a> a{" "}
                    <a href="#" className={styles.link}>ochranou súkromia</a>.
                  </label>
                  {registerInvalid.terms && (
                    <span className={styles.fieldError} style={{ marginLeft: 27 }}>
                      <ErrorIcon />
                      Na registráciu je potrebný súhlas s podmienkami.
                    </span>
                  )}
                </div>

                <button type="submit" className={`${styles.btnSubmit} ${registerStatus === "success" ? styles.success : ""}`} disabled={registerStatus === "loading"}>
                  {registerStatus === "loading" && <span className={styles.spinner} aria-hidden="true" />}
                  <span>{registerStatus === "loading" ? "Vytváram účet…" : "Začať skúšobné obdobie"}</span>
                </button>

                {registerStatus === "success" && !registerNeedsConfirm && (
                  <div className={styles.formStatus} role="status">
                    <SuccessIcon />
                    Účet vytvorený. Presmerúvam na nastavenie profilu…
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

              <div className={styles.dividerRow}>alebo</div>

              <button
                type="button"
                className={styles.inviteToggle}
                aria-expanded={inviteOpen}
                aria-controls="invite-panel"
                onClick={() => setInviteOpen((v) => !v)}
              >
                <span>Som klient a mám pozývací kód</span>
                <ChevronIcon open={inviteOpen} />
              </button>
              {inviteOpen && (
                <div className={styles.invitePanel} id="invite-panel">
                  <p>Kód nájdeš v pozvánke od svojho trénera. Klientske účty sa nezakladajú samostatne.</p>
                  <div className={styles.field} style={{ marginBottom: 12 }}>
                    <label htmlFor="invite-code">Pozývací kód</label>
                    <input id="invite-code" name="invite" type="text" placeholder="napr. MK-7Q2X" autoComplete="off" />
                  </div>
                  <button type="button" className={styles.btnSubmit} style={{ background: "var(--ink-4)" }}>
                    Overiť kód
                  </button>
                </div>
              )}

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
