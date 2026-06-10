/**
 * Stripe router — payment links, subscriptions, customer management, webhooks
 * All procedures are publicProcedure (Founder Edition: no auth gates)
 */
import Stripe from "stripe";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { publicProcedure, router } from "../_core/trpc";
import { stripeCustomers, stripeEvents } from "../../drizzle/schema";
import { getDb } from "../db";

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return new Stripe(key, { apiVersion: "2026-05-27.dahlia" });
}

export const stripeRouter = router({
  // ── Dashboard metrics ─────────────────────────────────────────────────────
  getDashboard: publicProcedure.query(async () => {
    const stripe = getStripe();
    const [balance, charges, customers, subscriptions] = await Promise.all([
      stripe.balance.retrieve(),
      stripe.charges.list({ limit: 10 }),
      stripe.customers.list({ limit: 5 }),
      stripe.subscriptions.list({ limit: 10, status: "all" }),
    ]);

    const available = balance.available.reduce((sum, b) => sum + b.amount, 0);
    const pending = balance.pending.reduce((sum, b) => sum + b.amount, 0);

    const activeSubscriptions = subscriptions.data.filter(
      (s) => s.status === "active" || s.status === "trialing"
    ).length;

    const mrr = subscriptions.data
      .filter((s) => s.status === "active" || s.status === "trialing")
      .reduce((sum, s) => {
        const item = s.items.data[0];
        if (!item?.price) return sum;
        const amount = item.price.unit_amount ?? 0;
        const interval = item.price.recurring?.interval;
        const intervalCount = item.price.recurring?.interval_count ?? 1;
        if (interval === "month") return sum + amount / intervalCount;
        if (interval === "year") return sum + amount / (12 * intervalCount);
        return sum;
      }, 0);

    return {
      balance: {
        available: available / 100,
        pending: pending / 100,
        currency: balance.available[0]?.currency?.toUpperCase() ?? "USD",
      },
      mrr: mrr / 100,
      activeSubscriptions,
      recentCharges: charges.data.map((c) => ({
        id: c.id,
        amount: c.amount / 100,
        currency: c.currency.toUpperCase(),
        status: c.status,
        description: c.description,
        email: c.billing_details?.email ?? null,
        createdAt: new Date(c.created * 1000).toISOString(),
        receiptUrl: c.receipt_url,
      })),
      recentCustomers: customers.data.map((c) => ({
        id: c.id,
        email: c.email,
        name: c.name,
        createdAt: new Date(c.created * 1000).toISOString(),
      })),
    };
  }),

  // ── List all subscriptions ────────────────────────────────────────────────
  listSubscriptions: publicProcedure
    .input(z.object({ status: z.string().optional() }))
    .query(async ({ input }) => {
      const stripe = getStripe();
      const params: Stripe.SubscriptionListParams = { limit: 50 };
      if (input.status && input.status !== "all") {
        params.status = input.status as Stripe.SubscriptionListParams.Status;
      }
      const subs = await stripe.subscriptions.list(params);
      return subs.data.map((s) => ({
        id: s.id,
        status: s.status,
        customerId: s.customer as string,
        currentPeriodEnd: new Date((s as any).current_period_end * 1000).toISOString(),
        cancelAtPeriodEnd: s.cancel_at_period_end,
        items: s.items.data.map((item) => ({
          id: item.id,
          priceId: item.price.id,
          amount: (item.price.unit_amount ?? 0) / 100,
          currency: item.price.currency.toUpperCase(),
          interval: item.price.recurring?.interval ?? "one_time",
        })),
      }));
    }),

  // ── Create a payment link (one-time or subscription) ─────────────────────
  createPaymentLink: publicProcedure
    .input(
      z.object({
        name: z.string().min(1),
        amount: z.number().positive(), // in dollars
        currency: z.string().default("usd"),
        mode: z.enum(["payment", "subscription"]).default("payment"),
        interval: z.enum(["month", "year"]).optional(),
        quantity: z.number().default(1),
      })
    )
    .mutation(async ({ input }) => {
      const stripe = getStripe();

      // Create product
      const product = await stripe.products.create({ name: input.name });

      // Create price
      const priceData: Stripe.PriceCreateParams = {
        product: product.id,
        unit_amount: Math.round(input.amount * 100),
        currency: input.currency,
      };
      if (input.mode === "subscription" && input.interval) {
        priceData.recurring = { interval: input.interval };
      }
      const price = await stripe.prices.create(priceData);

      // Create payment link
      const link = await stripe.paymentLinks.create({
        line_items: [{ price: price.id, quantity: input.quantity }],
        allow_promotion_codes: true,
      });

      return { url: link.url, id: link.id, priceId: price.id, productId: product.id };
    }),

  // ── List payment links ────────────────────────────────────────────────────
  listPaymentLinks: publicProcedure.query(async () => {
    const stripe = getStripe();
    const links = await stripe.paymentLinks.list({ limit: 20 });
    return links.data.map((l) => ({
      id: l.id,
      url: l.url,
      active: l.active,
    }));
  }),

  // ── Create checkout session ───────────────────────────────────────────────
  createCheckoutSession: publicProcedure
    .input(
      z.object({
        priceId: z.string(),
        email: z.string().email().optional(),
        mode: z.enum(["payment", "subscription"]).default("payment"),
        origin: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const stripe = getStripe();
      const session = await stripe.checkout.sessions.create({
        mode: input.mode,
        line_items: [{ price: input.priceId, quantity: 1 }],
        customer_email: input.email,
        allow_promotion_codes: true,
        success_url: `${input.origin}/payments?session_id={CHECKOUT_SESSION_ID}&success=1`,
        cancel_url: `${input.origin}/payments?canceled=1`,
        metadata: {
          source: "launchops_control_tower",
        },
      });
      return { url: session.url!, sessionId: session.id };
    }),

  // ── Cancel subscription ───────────────────────────────────────────────────
  cancelSubscription: publicProcedure
    .input(z.object({ subscriptionId: z.string(), immediately: z.boolean().default(false) }))
    .mutation(async ({ input }) => {
      const stripe = getStripe();
      if (input.immediately) {
        await stripe.subscriptions.cancel(input.subscriptionId);
      } else {
        await stripe.subscriptions.update(input.subscriptionId, {
          cancel_at_period_end: true,
        });
      }
      // Sync to local DB
      const db = await getDb();
      if (db) {
        await db
          .update(stripeCustomers)
          .set({ subscriptionStatus: input.immediately ? "canceled" : "cancel_at_period_end" })
          .where(eq(stripeCustomers.stripeSubscriptionId, input.subscriptionId));
      }
      return { success: true };
    }),

  // ── List products + prices ────────────────────────────────────────────────
  listProducts: publicProcedure.query(async () => {
    const stripe = getStripe();
    const [products, prices] = await Promise.all([
      stripe.products.list({ active: true, limit: 50 }),
      stripe.prices.list({ active: true, limit: 100 }),
    ]);
    return products.data.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      prices: prices.data
        .filter((pr) => pr.product === p.id)
        .map((pr) => ({
          id: pr.id,
          amount: (pr.unit_amount ?? 0) / 100,
          currency: pr.currency.toUpperCase(),
          interval: pr.recurring?.interval ?? "one_time",
        })),
    }));
  }),

  // ── List local customers from DB ──────────────────────────────────────────
  listLocalCustomers: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(stripeCustomers).orderBy(stripeCustomers.createdAt);
  }),
});
