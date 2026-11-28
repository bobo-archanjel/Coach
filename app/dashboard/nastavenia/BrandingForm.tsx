"use client";

// Nastavenia → „Moja značka“ (branding, tarifa Business): formulár, živý náhľad hlavičky portálu
// klienta, odkaz pozvánky a tlačidlo „Pozrieť ako klient“. Zobrazenie len pre UX — všetky
// kontroly (tarifa, veľkosť, typ obrázka) robí znovu server action (brandingActions.ts).

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { AppLink as Link } from "@/app/components/AppLink";
import { ACCENT_PRESETS, DEFAULT_ACCENT, deriveBrandTheme, normalizeHex } from "@/lib/branding/colors";
import { pickIconBackground } from "@/lib/branding/palette";
import { shortBrandName } from "@/lib/branding/manifest";
import { BRAND_NAME_MAX, MAX_UPLOAD_BYTES, WELCOME_TEXT_MAX, charLength } from "@/lib/branding/validation";
import { brandStyle } from "@/lib/branding/theme";
import { saveBrandingAction, regenerateInviteLinkAction, suggestPaletteAction, type BrandingState } from "./brandingActions";
import styles from "./branding.module.css";
import brand from "@/app/components/branding.module.css";
import pa from "@/app/components/planActions.module.css";
import { LogoMark } from "@/app/components/LogoMark";
import { BrandAppPreview } from "@/app/components/BrandAppPreview";

export interface BrandingInitial {
  brandName: string;
  welcomeText: string;
  accent: string | null;
  logoUrl: string | null;
  /** logo pre tmavé pozadie (voliteľné) */
  logoDarkUrl: string | null;
  /** vygenerovaná ikona appky (apple 180) — null, kým tréner neuloží logo */
  iconUrl: string | null;
  /** cesta pozvánky (/pozvanka/<odkaz>) alebo null pred prvým uložením */
  invitePath: string | null;
}

const initialState: BrandingState = { error: null, saved: false, palette: [] };
const ACCEPT = "image/png,image/jpeg,image/webp";

export function BrandingForm({ initial }: { initial: BrandingInitial }) {
  const t = useTranslations("branding");
  const [state, formAction, pending] = useActionState(saveBrandingAction, initialState);
  const [name, setName] = useState(initial.brandName);
  const [welcome, setWelcome] = useState(initial.welcomeText);
  const [accent, setAccent] = useState<string | null>(initial.accent);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoDarkPreview, setLogoDarkPreview] = useState<string | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [removeLogoDark, setRemoveLogoDark] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  // „Farby z tvojho loga“ — návrhy akcentu zo servera (po výbere súboru alebo po uložení)
  const [palette, setPalette] = useState<string[]>([]);
  const logoRef = useRef<HTMLInputElement>(null);
  const logoDarkRef = useRef<HTMLInputElement>(null);

  const theme = useMemo(() => deriveBrandTheme(accent), [accent]);
  const shownLogo = removeLogo ? null : (logoPreview ?? initial.logoUrl);
  const shownLogoDark = removeLogoDark ? null : (logoDarkPreview ?? initial.logoDarkUrl);
  // po uložení nového loga prišli farby priamo zo servera; inak platia tie z výberu súboru
  const suggested = (state.palette && state.palette.length > 0 ? state.palette : palette).filter((c) => normalizeHex(c));

  // uvoľnenie object URL pri zmene/odchode
  useEffect(() => () => { if (logoPreview) URL.revokeObjectURL(logoPreview); }, [logoPreview]);
  useEffect(() => () => { if (logoDarkPreview) URL.revokeObjectURL(logoDarkPreview); }, [logoDarkPreview]);

  function onPick(kind: "logo" | "logoDark", input: HTMLInputElement) {
    const file = input.files?.[0];
    setFileError(null);
    if (!file) return;
    // predbežná kontrola len pre UX (server kontroluje znova a podľa obsahu, nie podľa typu z prehliadača)
    if (file.size > MAX_UPLOAD_BYTES) {
      setFileError(t("errors.tooLarge"));
      input.value = "";
      return;
    }
    if (!ACCEPT.split(",").includes(file.type)) {
      setFileError(t("errors.badType"));
      input.value = "";
      return;
    }
    const url = URL.createObjectURL(file);
    if (kind === "logo") {
      setLogoPreview(url);
      setRemoveLogo(false);
      setPalette([]);
      // farby z loga: server obrázok overí a vráti 3–5 návrhov akcentu (nič sa neukladá)
      const fd = new FormData();
      fd.set("logo", file);
      suggestPaletteAction(fd)
        .then((res) => {
          if (res.error) setFileError(res.error);
          else setPalette(res.palette);
        })
        .catch(() => undefined);
    } else if (kind === "logoDark") {
      setLogoDarkPreview(url);
      setRemoveLogoDark(false);
    }
  }

  function clearFile(kind: "logo" | "logoDark") {
    if (kind === "logo") {
      if (logoRef.current) logoRef.current.value = "";
      setLogoPreview(null);
      setRemoveLogo(true);
      setPalette([]);
    } else if (kind === "logoDark") {
      if (logoDarkRef.current) logoDarkRef.current.value = "";
      setLogoDarkPreview(null);
      setRemoveLogoDark(true);
    }
  }

  const displayName = name.trim() || "FitPilot";
  const hexShown = accent ?? DEFAULT_ACCENT;
  // ikona na ploche: nová ikona vznikne pri uložení; do tej doby sa ukáže logo na pozadí ako ho skladá generátor
  const iconBackground = pickIconBackground(accent, null);
  const logoChanged = logoPreview !== null || removeLogo || accent !== initial.accent;

  return (
    <div className={styles.layout}>
      <form action={formAction} className={styles.form} data-testid="branding-form">
        <div className={styles.field}>
          <label className={styles.label} htmlFor="brand_name">{t("brandName")}</label>
          <input
            id="brand_name"
            name="brand_name"
            className={styles.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("brandNamePlaceholder")}
            maxLength={BRAND_NAME_MAX}
            autoComplete="off"
          />
          <p className={styles.hint}>{t("brandNameHint", { max: BRAND_NAME_MAX })}</p>
        </div>

        <div className={styles.field}>
          <span className={styles.label}>{t("logo")}</span>
          <div className={styles.fileRow}>
            {shownLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shownLogo} alt="" className={styles.fileThumb} />
            ) : (
              <span className={`${styles.fileThumb} ${styles.thumbEmpty}`} aria-hidden="true">
                <LogoMark className={brand.brandLogo} />
              </span>
            )}
            <input
              ref={logoRef}
              id="logo"
              name="logo"
              type="file"
              accept={ACCEPT}
              className={styles.fileInput}
              onChange={(e) => onPick("logo", e.currentTarget)}
            />
            <label htmlFor="logo" className={`${pa.action} ${pa.small} ${pa.inline}`}>
              {shownLogo ? t("change") : t("choose")}
            </label>
            {shownLogo && (
              <button type="button" className={styles.linkBtn} onClick={() => clearFile("logo")}>
                {t("remove")}
              </button>
            )}
          </div>
          {removeLogo && <input type="hidden" name="remove_logo" value="1" />}
          <p className={styles.hint}>{t("logoHint")}</p>
        </div>

        <div className={styles.field}>
          <span className={styles.label}>{t("logoDark")}</span>
          <div className={styles.fileRow}>
            {shownLogoDark ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shownLogoDark} alt="" className={`${styles.fileThumb} ${styles.thumbDark}`} />
            ) : (
              <span className={`${styles.fileThumb} ${styles.thumbEmpty} ${styles.thumbDark}`} aria-hidden="true">
                {t("noFile")}
              </span>
            )}
            <input
              ref={logoDarkRef}
              id="logo_dark"
              name="logo_dark"
              type="file"
              accept={ACCEPT}
              className={styles.fileInput}
              onChange={(e) => onPick("logoDark", e.currentTarget)}
            />
            <label htmlFor="logo_dark" className={`${pa.action} ${pa.small} ${pa.inline}`}>
              {shownLogoDark ? t("change") : t("choose")}
            </label>
            {shownLogoDark && (
              <button type="button" className={styles.linkBtn} onClick={() => clearFile("logoDark")}>
                {t("remove")}
              </button>
            )}
          </div>
          {removeLogoDark && <input type="hidden" name="remove_logo_dark" value="1" />}
          <p className={styles.hint}>{t("logoDarkHint")}</p>
        </div>

        <div className={styles.field}>
          <span className={styles.label}>{t("accent")}</span>
          <div className={styles.colorRow}>
            {ACCENT_PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                className={`${styles.swatch} ${normalizeHex(hexShown) === c ? styles.swatchOn : ""}`}
                style={{ background: c }}
                aria-label={c}
                aria-pressed={normalizeHex(hexShown) === c}
                onClick={() => setAccent(c)}
              />
            ))}
            <input
              type="color"
              className={styles.picker}
              value={hexShown}
              aria-label={t("accentPicker")}
              onChange={(e) => setAccent(normalizeHex(e.target.value))}
            />
            <span className={styles.hex}>{hexShown.toUpperCase()}</span>
            {accent && (
              <button type="button" className={styles.linkBtn} onClick={() => setAccent(null)}>
                {t("accentReset")}
              </button>
            )}
          </div>
          {suggested.length > 0 && (
            <div className={styles.paletteBox} data-testid="branding-palette">
              <span className={styles.paletteTitle}>{t("paletteTitle")}</span>
              <div className={styles.colorRow}>
                {suggested.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`${styles.swatch} ${normalizeHex(hexShown) === c ? styles.swatchOn : ""}`}
                    style={{ background: c }}
                    aria-label={t("paletteUse", { color: c.toUpperCase() })}
                    aria-pressed={normalizeHex(hexShown) === c}
                    onClick={() => setAccent(c)}
                  />
                ))}
              </div>
            </div>
          )}
          <input type="hidden" name="accent" value={accent ?? ""} />
          <p className={styles.hint}>{t("accentHint")}</p>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="welcome_text">{t("welcome")}</label>
          <textarea
            id="welcome_text"
            name="welcome_text"
            className={styles.textarea}
            value={welcome}
            onChange={(e) => setWelcome(e.target.value)}
            placeholder={t("welcomePlaceholder")}
            maxLength={WELCOME_TEXT_MAX}
          />
          <div className={styles.hintRow}>
            <p className={styles.hint}>{t("welcomeHint", { max: WELCOME_TEXT_MAX })}</p>
            <span className={styles.count}>{charLength(welcome)} / {WELCOME_TEXT_MAX}</span>
          </div>
        </div>

        <div className={styles.actions}>
          <button type="submit" className={`${pa.action} ${pa.small} ${pa.inline}`} disabled={pending} data-testid="branding-save">
            {pending ? t("saving") : t("save")}
          </button>
          {state.saved && !state.error && <span className={styles.ok} role="status">{t("saved")}</span>}
          {(state.error || fileError) && <span className={styles.err} role="alert">{fileError ?? state.error}</span>}
        </div>
      </form>

      <div className={styles.previewCol}>
        <span className={styles.previewLabel}>{t("previewTitle")}</span>
        <div className={`${styles.phone} ${theme ? brand.branded : ""}`} style={brandStyle(theme)} data-testid="branding-preview" aria-label={t("previewApp")}>
          <div className={styles.phoneTop}>
            <span className={styles.phoneBrand}>
              {shownLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={shownLogo} alt="" className={brand.brandLogo} />
              ) : (
                <LogoMark className={brand.brandLogo} />
              )}
              <span className={styles.phoneName}>{displayName}</span>
            </span>
            <span className={styles.phoneAvatar} aria-hidden="true">J</span>
          </div>
          <div className={styles.phoneBody}>
            <p className={styles.phoneHello}>{t("previewGreeting")}</p>
            <span className={styles.phoneBtn}>{t("previewButton")}</span>
            <span className={styles.phoneLink}>{t("previewLink")}</span>
          </div>
          <div className={styles.phoneFoot}>{t("poweredBy")}</div>
        </div>
        <span className={styles.previewLabel}>{t("appPreviewTitle")}</span>
        <BrandAppPreview
          shortName={shortBrandName(displayName)}
          name={displayName}
          iconUrl={logoChanged ? null : initial.iconUrl}
          logoUrl={shownLogo}
          background={iconBackground}
          accent={theme?.light.accent ?? DEFAULT_ACCENT}
          onAccent={theme?.light.on ?? "#ffffff"}
          labels={{ home: t("appPreviewHome"), splash: t("appPreviewSplash"), placeholder: t("appPreviewNote") }}
        />
        <Link
          href="/dashboard/nastavenia/nahlad"
          className={`${pa.action} ${pa.small} ${pa.inline} ${styles.previewLinkBtn}`}
          data-testid="branding-preview-link"
        >
          {t("previewAsClient")}
        </Link>
      </div>

      <InviteLink path={initial.invitePath} />
    </div>
  );
}

function InviteLink({ path }: { path: string | null }) {
  const t = useTranslations("branding.invite");
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  useEffect(() => setOrigin(window.location.origin), []);

  async function copy() {
    if (!path) return;
    try {
      await navigator.clipboard.writeText(`${origin}${path}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // schránka nedostupná — odkaz je v poli, dá sa skopírovať ručne
    }
  }

  return (
    <div className={`${styles.field} ${styles.wide}`} data-testid="branding-invite">
      <span className={styles.label}>{t("title")}</span>
      <p className={styles.hint}>{t("hint")}</p>
      {path ? (
        <div className={styles.inviteBox}>
          <input
            className={`${styles.input} ${styles.inviteUrl}`}
            readOnly
            value={`${origin}${path}`}
            aria-label={t("title")}
            onFocus={(e) => e.currentTarget.select()}
          />
          <button type="button" className={`${pa.action} ${pa.small} ${pa.inline}`} onClick={copy}>
            {copied ? t("copied") : t("copy")}
          </button>
          <button
            type="button"
            className={styles.linkBtn}
            disabled={pending}
            title={t("regenerateHint")}
            onClick={() =>
              startTransition(async () => {
                const res = await regenerateInviteLinkAction();
                setError(res.error);
              })
            }
          >
            {pending ? t("regenerating") : t("regenerate")}
          </button>
        </div>
      ) : (
        <p className={styles.hint}>{t("saveFirst")}</p>
      )}
      {error && <span className={styles.err} role="alert">{error}</span>}
    </div>
  );
}
