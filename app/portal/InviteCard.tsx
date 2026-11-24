"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { claimInviteAction, dismissInviteAction } from "./inviteActions";
import styles from "./portal.module.css";

/* Karta „<značka trénera> ťa pozýva“ (pozvánka cez odkaz, 0077). Spárovanie nastane až po
   kliknutí na „Pripojiť sa“ — žiadne automatické spárovanie bez súhlasu klienta. */
export function InviteCard({ brandName }: { brandName: string | null }) {
  const t = useTranslations("branding.invitePairing");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (hidden) return null;

  function join() {
    setError(null);
    startTransition(async () => {
      const result = await claimInviteAction();
      if (result.ok) {
        setHidden(true);
        router.refresh();
        return;
      }
      setError(result.message);
      // definitívna chyba (iný tréner, neplatná pozvánka…) → cookie je zmazané, karta už nemá zmysel
      if (result.code !== "rate_limited" && result.code !== "failed" && result.code !== "not_signed_in") {
        router.refresh();
      }
    });
  }

  function decline() {
    setHidden(true);
    startTransition(async () => {
      await dismissInviteAction();
      router.refresh();
    });
  }

  return (
    <section className={styles.inviteCard} role="region" aria-label={t("title")} data-testid="invite-card">
      <p className={styles.inviteCardTitle}>
        {brandName ? t("heading", { brand: brandName }) : t("headingNoName")}
      </p>
      <p className={styles.inviteCardText}>{t("text")}</p>
      {error && (
        <p className={styles.inviteCardError} role="alert">
          {error}
        </p>
      )}
      <div className={styles.inviteCardActions}>
        <button type="button" className="btn btn-primary" onClick={join} disabled={pending} data-testid="invite-join">
          {pending ? t("joining") : t("join")}
        </button>
        <button type="button" className="btn btn-ghost" onClick={decline} disabled={pending} data-testid="invite-decline">
          {t("decline")}
        </button>
      </div>
    </section>
  );
}
