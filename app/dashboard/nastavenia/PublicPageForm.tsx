"use client";

// Nastavenia → „Verejná stránka“ (Business): adresa, zverejnenie, texty, služby, referencie, odkazy
// a galéria. Zobrazenie a pohodlie — všetky pravidlá (session, Business, validácia, limity, obrázky)
// znova overuje server (publicPageActions.ts).

import { useActionState, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { AppLink as Link } from "@/app/components/AppLink";
import { charLength } from "@/lib/branding/validation";
import { LIMITS } from "@/lib/publicPage/profile";
import { buildTrainerPublicUrl } from "@/lib/publicPage/subdomain";
import { HANDLE_MAX, normalizeHandle } from "@/lib/publicPage/handle";
import { SOCIAL_KINDS, type SocialKind } from "@/lib/publicPage/socials";
import {
  checkHandleAction,
  removeGalleryPhotoAction,
  savePublicPageAction,
  uploadGalleryPhotoAction,
  type HandleCheckState,
  type PublicPageState,
} from "./publicPageActions";
import b from "./branding.module.css";
import p from "./publicPage.module.css";
import pa from "@/app/components/planActions.module.css";

export interface PublicPageInitial {
  handle: string;
  published: boolean;
  headline: string;
  bio: string;
  location: string;
  online: boolean;
  specializations: string[];
  socials: Partial<Record<SocialKind, string>>;
  services: { name: string; description: string; priceText: string }[];
  testimonials: { author: string; body: string }[];
  gallery: { id: string; url: string }[];
  /** adresa stránky sa už uložila (stránka existuje v DB) */
  saved: boolean;
}

const initialState: PublicPageState = { error: null, saved: false };

/** Zmenší veľkú fotku v prehliadači (max. 1600 px, JPEG) — telefónna fotka má niekoľko MB, server berie ≤ 1 MB. */
async function shrinkPhoto(file: File): Promise<File> {
  if (file.size <= 700_000 || !/^image\/(png|jpeg|webp)$/.test(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.82));
    return blob && blob.size < file.size ? new File([blob], "photo.jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

export function PublicPageForm({ initial, host, siteOrigin, subdomainBase, businessReady }: { initial: PublicPageInitial; host: string; siteOrigin: string; subdomainBase: string | null; businessReady: boolean }) {
  const t = useTranslations("publicPage.settings");
  const [state, formAction, pending] = useActionState(savePublicPageAction, initialState);
  const [handle, setHandle] = useState(initial.handle);
  const [published, setPublished] = useState(initial.published);
  const [headline, setHeadline] = useState(initial.headline);
  const [bio, setBio] = useState(initial.bio);
  const [location, setLocation] = useState(initial.location);
  const [online, setOnline] = useState(initial.online);
  const [specs, setSpecs] = useState(initial.specializations.join(", "));
  const [socials, setSocials] = useState<Partial<Record<SocialKind, string>>>(initial.socials);
  const [services, setServices] = useState(initial.services);
  const [testimonials, setTestimonials] = useState(initial.testimonials);
  const [check, setCheck] = useState<HandleCheckState | null>(null);
  const [checking, startCheck] = useTransition();

  const savedHandle = state.saved ? state.handle : initial.saved ? initial.handle : null;
  const live = published && !!savedHandle && (state.saved || initial.saved);

  const payload = JSON.stringify({
    handle,
    published,
    headline,
    bio,
    location,
    online,
    specializations: specs,
    socials,
    services,
    testimonials,
  });

  function runCheck() {
    startCheck(async () => setCheck(await checkHandleAction(handle)));
  }

  return (
    <div data-testid="public-page-form">
      <div className={p.statusBar}>
        <span className={`${p.state} ${live ? p.stateLive : p.stateDraft}`} data-testid="public-page-state">
          {live ? t("stateLive") : t("stateDraft")}
        </span>
        <span className={b.hint}>
          {subdomainBase ? `${savedHandle ?? "…"}.${subdomainBase}` : `${host}/t/${savedHandle ?? "…"}`}
        </span>
        <span className={p.statusLinks}>
          {live && savedHandle && (
            <a href={buildTrainerPublicUrl(savedHandle, subdomainBase, siteOrigin)} target="_blank" rel="noopener noreferrer" className={`${pa.action} ${pa.small} ${pa.inline}`} data-testid="public-page-view">
              {t("view")}
            </a>
          )}
          {(state.saved || initial.saved) && (
            <Link href="/dashboard/nastavenia/stranka-nahlad" className={`${pa.action} ${pa.small} ${pa.inline}`} data-testid="public-page-preview">
              {t("preview")}
            </Link>
          )}
          <Link href="/dashboard/zaujemcovia" className={`${pa.action} ${pa.small} ${pa.inline}`}>
            {t("leadsLink")}
          </Link>
        </span>
      </div>

      <form action={formAction} className={b.form}>
        <input type="hidden" name="payload" value={payload} />

        <div className={b.field}>
          <label className={b.label} htmlFor="pp-handle">
            {t("handle")}
          </label>
          <div className={p.handleRow}>
            <div className={p.handleBox}>
              <span className={p.handlePrefix}>{t("handlePrefix")}</span>
              <input
                id="pp-handle"
                className={p.handleInput}
                value={handle}
                maxLength={HANDLE_MAX}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder={t("handlePlaceholder")}
                onChange={(e) => {
                  setHandle(normalizeHandle(e.target.value));
                  setCheck(null);
                }}
                onBlur={() => {
                  if (handle && handle !== savedHandle) runCheck();
                }}
              />
            </div>
            <button type="button" className={`${pa.action} ${pa.small} ${pa.inline}`} onClick={runCheck} disabled={checking || !handle}>
              {checking ? t("handleChecking") : t("handleCheck")}
            </button>
          </div>
          <p className={b.hint}>{t("handleHint")}</p>
          {check && (
            <span className={`${p.check} ${check.status === "free" || check.status === "own" ? p.checkFree : p.checkBad}`} role="status" data-testid="handle-check">
              {check.error ?? (check.status === "free" ? t("handleFree") : check.status === "own" ? t("handleOwn") : check.status === "taken" ? t("handleTaken") : "")}
            </span>
          )}
        </div>

        <label className={p.checkRow}>
          <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} data-testid="public-page-publish" />
          <span>
            <strong>{t("publish")}</strong>
            <br />
            <span className={b.hint}>{t("publishHint")}</span>
          </span>
        </label>

        <div className={b.field}>
          <label className={b.label} htmlFor="pp-headline">
            {t("headline")}
          </label>
          <input id="pp-headline" className={b.input} value={headline} maxLength={LIMITS.headline} placeholder={t("headlinePlaceholder")} onChange={(e) => setHeadline(e.target.value)} />
          <p className={b.hint}>{t("headlineHint", { max: LIMITS.headline })}</p>
        </div>

        <div className={b.field}>
          <label className={b.label} htmlFor="pp-bio">
            {t("bio")}
          </label>
          <textarea id="pp-bio" className={b.textarea} rows={7} value={bio} maxLength={LIMITS.bio} placeholder={t("bioPlaceholder")} onChange={(e) => setBio(e.target.value)} />
          <div className={b.hintRow}>
            <p className={b.hint}>{t("bioHint", { max: LIMITS.bio })}</p>
            <span className={b.count}>
              {charLength(bio)} / {LIMITS.bio}
            </span>
          </div>
        </div>

        <div className={p.grid2}>
          <div className={b.field}>
            <label className={b.label} htmlFor="pp-location">
              {t("location")}
            </label>
            <input id="pp-location" className={b.input} value={location} maxLength={LIMITS.location} placeholder={t("locationPlaceholder")} onChange={(e) => setLocation(e.target.value)} />
            <label className={p.checkRow}>
              <input type="checkbox" checked={online} onChange={(e) => setOnline(e.target.checked)} />
              {t("online")}
            </label>
          </div>
          <div className={b.field}>
            <label className={b.label} htmlFor="pp-specs">
              {t("specializations")}
            </label>
            <input id="pp-specs" className={b.input} value={specs} placeholder={t("specializationsPlaceholder")} onChange={(e) => setSpecs(e.target.value)} />
            <p className={b.hint}>{t("specializationsHint", { max: LIMITS.specializations })}</p>
          </div>
        </div>

        <div className={p.group} role="group" aria-labelledby="pp-g-services">
          <h4 id="pp-g-services" className={p.groupTitle}>{t("servicesTitle")}</h4>
          <p className={b.hint}>{t("servicesHint", { max: LIMITS.services })}</p>
          {services.map((s, i) => (
            <div key={i} className={p.item}>
              <div className={p.itemHead}>
                <span className={p.itemNum}>{i + 1}</span>
                <button type="button" className={p.itemRemove} aria-label={t("removeService", { n: i + 1 })} onClick={() => setServices(services.filter((_, j) => j !== i))}>
                  <CloseIcon />
                </button>
              </div>
              <div className={p.grid2}>
                <div className={b.field}>
                  <label className={b.label} htmlFor={`pp-sn-${i}`}>
                    {t("serviceName")}
                  </label>
                  <input
                    id={`pp-sn-${i}`}
                    className={b.input}
                    value={s.name}
                    maxLength={LIMITS.serviceName}
                    placeholder={t("serviceNamePlaceholder")}
                    onChange={(e) => setServices(services.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                  />
                </div>
                <div className={b.field}>
                  <label className={b.label} htmlFor={`pp-sp-${i}`}>
                    {t("servicePrice")}
                  </label>
                  <input
                    id={`pp-sp-${i}`}
                    className={b.input}
                    value={s.priceText}
                    maxLength={LIMITS.servicePrice}
                    placeholder={t("servicePricePlaceholder")}
                    onChange={(e) => setServices(services.map((x, j) => (j === i ? { ...x, priceText: e.target.value } : x)))}
                  />
                </div>
              </div>
              <div className={b.field}>
                <label className={b.label} htmlFor={`pp-sd-${i}`}>
                  {t("serviceDesc")}
                </label>
                <textarea
                  id={`pp-sd-${i}`}
                  className={b.textarea}
                  rows={3}
                  value={s.description}
                  maxLength={LIMITS.serviceDesc}
                  onChange={(e) => setServices(services.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))}
                />
              </div>
            </div>
          ))}
          {services.length < LIMITS.services && (
            <button type="button" className={`${pa.action} ${pa.small} ${pa.inline} ${p.addBtn}`} onClick={() => setServices([...services, { name: "", description: "", priceText: "" }])}>
              {t("addService")}
            </button>
          )}
        </div>

        <div className={p.group} role="group" aria-labelledby="pp-g-testimonials">
          <h4 id="pp-g-testimonials" className={p.groupTitle}>{t("testimonialsTitle")}</h4>
          <p className={b.hint}>{t("testimonialsHint", { max: LIMITS.testimonials })}</p>
          {testimonials.map((r, i) => (
            <div key={i} className={p.item}>
              <div className={p.itemHead}>
                <span className={p.itemNum}>{i + 1}</span>
                <button type="button" className={p.itemRemove} aria-label={t("removeTestimonial", { n: i + 1 })} onClick={() => setTestimonials(testimonials.filter((_, j) => j !== i))}>
                  <CloseIcon />
                </button>
              </div>
              <div className={b.field}>
                <label className={b.label} htmlFor={`pp-ta-${i}`}>
                  {t("testimonialAuthor")}
                </label>
                <input
                  id={`pp-ta-${i}`}
                  className={b.input}
                  value={r.author}
                  maxLength={LIMITS.testimonialAuthor}
                  placeholder={t("testimonialAuthorPlaceholder")}
                  onChange={(e) => setTestimonials(testimonials.map((x, j) => (j === i ? { ...x, author: e.target.value } : x)))}
                />
              </div>
              <div className={b.field}>
                <label className={b.label} htmlFor={`pp-tb-${i}`}>
                  {t("testimonialBody")}
                </label>
                <textarea
                  id={`pp-tb-${i}`}
                  className={b.textarea}
                  rows={3}
                  value={r.body}
                  maxLength={LIMITS.testimonialBody}
                  onChange={(e) => setTestimonials(testimonials.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)))}
                />
              </div>
            </div>
          ))}
          {testimonials.length < LIMITS.testimonials && (
            <button type="button" className={`${pa.action} ${pa.small} ${pa.inline} ${p.addBtn}`} onClick={() => setTestimonials([...testimonials, { author: "", body: "" }])}>
              {t("addTestimonial")}
            </button>
          )}
        </div>

        <div className={p.group} role="group" aria-labelledby="pp-g-socials">
          <h4 id="pp-g-socials" className={p.groupTitle}>{t("socials")}</h4>
          <p className={b.hint}>{t("socialsHint")}</p>
          <div className={p.grid2}>
            {SOCIAL_KINDS.map((k) => (
              <div key={k} className={b.field}>
                <label className={b.label} htmlFor={`pp-so-${k}`}>
                  {k === "web" ? "Web" : k.charAt(0).toUpperCase() + k.slice(1)}
                </label>
                <input
                  id={`pp-so-${k}`}
                  className={b.input}
                  type="url"
                  inputMode="url"
                  autoCapitalize="none"
                  value={socials[k] ?? ""}
                  maxLength={200}
                  placeholder="https://"
                  onChange={(e) => setSocials({ ...socials, [k]: e.target.value })}
                />
              </div>
            ))}
          </div>
        </div>

        <p className={b.hint}>{t("needBranding")}</p>

        <div className={b.actions}>
          <button type="submit" className={`${pa.action} ${pa.small} ${pa.inline}`} disabled={pending || !businessReady} data-testid="public-page-save">
            {pending ? t("saving") : t("save")}
          </button>
          {state.saved && !state.error && (
            <span className={b.ok} role="status">
              {t("saved")}
            </span>
          )}
          {state.error && (
            <span className={b.err} role="alert">
              {state.error}
            </span>
          )}
        </div>
      </form>

      <GalleryManager gallery={initial.gallery} />
    </div>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function GalleryManager({ gallery }: { gallery: { id: string; url: string }[] }) {
  const t = useTranslations("publicPage.settings");
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const full = gallery.length >= LIMITS.gallery;

  function onPick(file: File | undefined) {
    if (!file) return;
    startTransition(async () => {
      const small = await shrinkPhoto(file);
      const fd = new FormData();
      fd.set("photo", small);
      const res = await uploadGalleryPhotoAction(fd);
      setError(res.error);
      if (input.current) input.current.value = "";
    });
  }

  return (
    <div className={p.group} data-testid="public-gallery">
      <h4 className={p.groupTitle}>{t("galleryTitle")}</h4>
      <p className={b.hint}>{t("galleryHint", { max: LIMITS.gallery })}</p>
      {gallery.length > 0 && (
        <ul className={p.gallery}>
          {gallery.map((g, i) => (
            <li key={g.id} className={p.thumb}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={g.url} alt="" loading="lazy" />
              <button
                type="button"
                className={p.thumbRemove}
                aria-label={t("galleryRemove", { n: i + 1 })}
                disabled={busy}
                onClick={() =>
                  startTransition(async () => {
                    const res = await removeGalleryPhotoAction(g.id);
                    setError(res.error);
                  })
                }
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className={b.actions}>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className={b.fileInput} id="pp-gallery-file" onChange={(e) => onPick(e.target.files?.[0])} disabled={busy || full} />
        <label htmlFor="pp-gallery-file" className={`${pa.action} ${pa.small} ${pa.inline}`} aria-disabled={busy || full}>
          {busy ? t("galleryUploading") : full ? t("galleryFull") : t("galleryAdd")}
        </label>
        {error && (
          <span className={b.err} role="alert">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
