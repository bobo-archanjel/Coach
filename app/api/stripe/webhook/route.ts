// FitPilot — Stripe webhook (feature/Stripe). Jediné miesto, kde sa udeľuje/odoberá prístup.
// Podpis sa overuje nad SUROVÝM telom (req.text(), nie req.json()), inak by sa nezhodoval.
// Middleware sa na /api/stripe nevzťahuje (matcher len /dashboard a /portal), CSP sa týka
// len prehliadača — Stripe volá server-to-server. Beží v Node (potrebuje crypto + service role).

import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/billing/stripe";
import { createBillingStore, createEventLog } from "@/lib/billing/store";
import { processStripeEvent } from "@/lib/billing/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret || !process.env.STRIPE_SECRET_KEY?.trim()) {
    console.error("stripe webhook: chýba STRIPE_WEBHOOK_SECRET alebo STRIPE_SECRET_KEY");
    return NextResponse.json({ error: "not_configured" }, { status: 500 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "missing_signature" }, { status: 400 });

  const payload = await req.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, secret);
  } catch {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  try {
    const result = await processStripeEvent(event, {
      store: createBillingStore(),
      log: createEventLog(),
      retrieveSubscription: (id) => stripe.subscriptions.retrieve(id),
    });
    // „busy“ = ten istý event práve spracúva iný request → 409, Stripe to skúsi znova
    if (result.outcome === "busy") return NextResponse.json({ received: false, busy: true }, { status: 409 });
    return NextResponse.json({ received: true, outcome: result.outcome });
  } catch (err) {
    // chyba pri spracovaní → 500, Stripe doručí udalosť znova (event je uvoľnený pre retry)
    console.error("stripe webhook:", event.type, err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }
}
