"use client";

// Nastavenia → „Komunikácia s klientmi“ (všetky tarify): uvítacia správa v chate s náhľadom
// a pozvánka e-mailom so zostatkom limitu. Zobrazenie len pre UX — všetky kontroly (session, rola,
// read-only, limity, validáciu) robí znovu server (commsActions.ts, DB reserve_mail_send).

import { useActionState, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { charLength } from "@/lib/branding/validation";
import { WELCOME_MESSAGE_MAX, renderWelcomeMessage } from "@/lib/mail/welcome";
import { RECIPIENT_NAME_MAX } from "@/lib/mail/sanitize";
import { saveWelcomeMessageAction, sendInviteEmailAction, type InviteEmailState, type WelcomeState } from "./commsActions";
import b from "./branding.module.css";
import c from "./comms.module.css";
import pa from "@/app/components/planActions.module.css";

export interface CommsInitial {
  welcomeBody: string;
  welcomeEnabled: boolean;
  /** SMTP je nastavené na serveri (len áno/nie, nikdy hodnoty) */
  mailConfigured: boolean;
  /** zostávajúce pozvánky teraz (null = nedostupné) */
  invitesLeft: number | null;
  /** tarifa so značkou: pozvánka bude s tvojím logom a farbou */
  business: boolean;
}

const welcomeInitial: WelcomeState = { error: null, saved: false };
const inviteInitial: InviteEmailState = { error: null, sent: false, remaining: null };

export function ClientCommsCard({ initial }: { initial: CommsInitial }) {
  return (
    <div data-testid="client-comms">
      <WelcomeEditor body={initial.welcomeBody} enabled={initial.welcomeEnabled} />
      <InviteEmail mailConfigured={initial.mailConfigured} invitesLeft={initial.invitesLeft} business={initial.business} />
    </div>
  );
}

function WelcomeEditor({ body, enabled }: { body: string; enabled: boolean }) {
  const t = useTranslations("branding.comms.welcome");
  const [state, formAction, pending] = useActionState(saveWelcomeMessageAction, welcomeInitial);
  const [text, setText] = useState(body);
  const [on, setOn] = useState(enabled);
  const sampleName = t("sampleName");
  const preview = useMemo(() => renderWelcomeMessage(text, sampleName), [text, sampleName]);

  return (
    <form action={formAction} className={c.block} data-testid="welcome-form">
      <div className={b.field}>
        <label className={c.blockTitle} htmlFor="welcome_message">
          {t("title")}
        </label>
        <p className={b.hint}>{t("hint")}</p>
        <textarea
          id="welcome_message"
          name="welcome_message"
          className={b.textarea}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("placeholder")}
          maxLength={WELCOME_MESSAGE_MAX}
          rows={5}
        />
        <span className={`${b.count}`}>
          {charLength(text)} / {WELCOME_MESSAGE_MAX}
        </span>
      </div>
      <label className={c.checkRow}>
        <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} />
        {t("enabled")}
      </label>
      <input type="hidden" name="enabled" value={on ? "1" : "0"} />
      <div className={b.field}>
        <span className={b.label}>{t("previewTitle")}</span>
        <div className={c.chatPreview} aria-label={t("previewTitle")} data-testid="welcome-preview">
          {preview ? <div className={c.bubble}>{preview}</div> : <span className={c.bubbleEmpty}>{t("previewEmpty")}</span>}
        </div>
        <p className={b.hint}>{t("previewHint")}</p>
      </div>
      <div className={b.actions}>
        <button type="submit" className={`${pa.action} ${pa.small} ${pa.inline}`} disabled={pending} data-testid="welcome-save">
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
  );
}

function InviteEmail({ mailConfigured, invitesLeft, business }: { mailConfigured: boolean; invitesLeft: number | null; business: boolean }) {
  const t = useTranslations("branding.comms.invite");
  const [state, formAction, pending] = useActionState(sendInviteEmailAction, inviteInitial);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  // po odoslaní sa formulár vyčistí (aby sa ten istý e-mail nedal omylom poslať dvakrát)
  const [lastSent, setLastSent] = useState<InviteEmailState | null>(null);
  if (state.sent && state !== lastSent) {
    setLastSent(state);
    setEmail("");
    setName("");
  }
  const left = state.remaining ?? invitesLeft;

  return (
    <form action={formAction} className={c.block} data-testid="invite-email-form">
      <div className={b.field}>
        <h4 className={c.blockTitle}>{t("title")}</h4>
        <p className={b.hint}>{business ? t("hintBranded") : t("hintDefault")}</p>
      </div>
      {!mailConfigured && (
        <p className={b.err} role="status" data-testid="mail-not-configured">
          {t("notConfigured")}
        </p>
      )}
      <div className={c.inviteRow}>
        <div className={b.field}>
          <label className={b.label} htmlFor="invite_email">
            {t("email")}
          </label>
          <input
            id="invite_email"
            name="email"
            type="email"
            autoComplete="off"
            className={b.input}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("emailPlaceholder")}
            maxLength={254}
            required
            disabled={!mailConfigured}
          />
        </div>
        <div className={b.field}>
          <label className={b.label} htmlFor="invite_name">
            {t("name")}
          </label>
          <input
            id="invite_name"
            name="name"
            type="text"
            autoComplete="off"
            className={b.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("namePlaceholder")}
            maxLength={RECIPIENT_NAME_MAX}
            disabled={!mailConfigured}
          />
        </div>
      </div>
      <div className={b.actions}>
        <button type="submit" className={`${pa.action} ${pa.small} ${pa.inline}`} disabled={pending || !mailConfigured || left === 0} data-testid="invite-email-send">
          {pending ? t("sending") : t("send")}
        </button>
        {left !== null && mailConfigured && (
          <span className={c.statusNote} data-testid="invite-quota">
            {t("remaining", { count: left })}
          </span>
        )}
        {state.sent && !state.error && (
          <span className={b.ok} role="status">
            {t("sent")}
          </span>
        )}
        {state.error && (
          <span className={b.err} role="alert">
            {state.error}
          </span>
        )}
      </div>
      <p className={b.hint}>{t("limitsNote")}</p>
    </form>
  );
}
