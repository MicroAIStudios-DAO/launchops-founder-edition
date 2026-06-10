import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // ── Stripe webhook — MUST be registered before express.json() ───────────────
  // Stripe requires the raw body buffer for signature verification.
  app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    const sig = req.headers["stripe-signature"] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    // If no secret configured, just ack (dev mode)
    if (!webhookSecret) {
      res.json({ received: true, note: "no webhook secret configured" });
      return;
    }

    let event: import("stripe").Stripe.Event;
    try {
      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2026-05-27.dahlia" });
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err: any) {
      console.error("[Stripe Webhook] Signature verification failed:", err.message);
      res.status(400).json({ error: `Webhook Error: ${err.message}` });
      return;
    }

    // Idempotency: skip already-processed events
    try {
      const { getDb } = await import("../db");
      const { stripeEvents, stripeCustomers } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const db = await getDb();
      if (db) {
        const existing = await db.select().from(stripeEvents).where(eq(stripeEvents.stripeEventId, event.id)).limit(1);
        if (existing.length > 0) {
          res.json({ received: true, note: "already processed" });
          return;
        }
        // Record event
        await db.insert(stripeEvents).values({ stripeEventId: event.id, eventType: event.type });

        // Handle specific events
        if (event.type === "checkout.session.completed") {
          const session = event.data.object as import("stripe").Stripe.Checkout.Session;
          if (session.customer && session.customer_email) {
            await db.insert(stripeCustomers).values({
              email: session.customer_email,
              stripeCustomerId: session.customer as string,
              stripeSubscriptionId: session.subscription as string | null,
              subscriptionStatus: session.subscription ? "active" : null,
            }).onDuplicateKeyUpdate({
              set: {
                stripeSubscriptionId: session.subscription as string | null,
                subscriptionStatus: session.subscription ? "active" : null,
              },
            });
          }
        } else if (event.type === "customer.subscription.updated") {
          const sub = event.data.object as import("stripe").Stripe.Subscription;
          await db.update(stripeCustomers)
            .set({
              subscriptionStatus: sub.status,
              currentPeriodEnd: new Date((sub as any).current_period_end * 1000),
            })
            .where(eq(stripeCustomers.stripeSubscriptionId, sub.id));
        } else if (event.type === "customer.subscription.deleted") {
          const sub = event.data.object as import("stripe").Stripe.Subscription;
          await db.update(stripeCustomers)
            .set({ subscriptionStatus: "canceled" })
            .where(eq(stripeCustomers.stripeSubscriptionId, sub.id));
        }
      }
    } catch (dbErr: any) {
      console.error("[Stripe Webhook] DB error:", dbErr.message);
    }

    res.json({ received: true });
  });
  // ── End Stripe webhook ────────────────────────────────────────────────────────

  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);

  // ── Pipeline Run Monitor: SSE streaming endpoint ────────────────────────────
  // Allowed commands whitelist — prevents arbitrary shell execution
  const ALLOWED_COMMANDS: Record<string, string[]> = {
    health:      ["health"],
    status:      ["status"],
    kong:        ["kong"],
    launch:      ["launch"],
    "stage:auth":       ["stage", "auth"],
    "stage:formation":  ["stage", "formation"],
    "stage:infrastructure": ["stage", "infrastructure"],
    "stage:legal":      ["stage", "legal"],
    "stage:funding":    ["stage", "funding"],
    "stage:deploy":     ["stage", "deploy"],
    security:    ["security"],
    documentary: ["documentary"],
  };

  app.get("/api/pipeline/run", (req, res) => {
    const cmd = (req.query.cmd as string) || "health";
    const args = ALLOWED_COMMANDS[cmd];
    if (!args) {
      res.status(400).json({ error: "Unknown command" });
      return;
    }

    // SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const send = (type: string, data: string) => {
      res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    send("start", `[LaunchOps] Running: launchops.py ${args.join(" ")}`);

    // Resolve the launchops-founder-edition directory
    const projectRoot = process.env.LAUNCHOPS_PATH ||
      path.resolve(process.cwd(), "../../launchops-founder-edition");

    // Prefer venv python, fall back to system python3
    const venvPython = path.join(projectRoot, "venv", "bin", "python3");
    const pythonBin = fs.existsSync(venvPython) ? venvPython : "python3";
    const scriptPath = path.join(projectRoot, "launchops.py");

    if (!fs.existsSync(scriptPath)) {
      send("error", `[LaunchOps] launchops.py not found at ${scriptPath}`);
      send("done", "[LaunchOps] Process exited with code 1");
      res.end();
      return;
    }

    const child = spawn(pythonBin, [scriptPath, ...args], {
      cwd: projectRoot,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.on("data", (chunk: Buffer) => {
      chunk.toString().split("\n").forEach((line) => {
        if (line.trim()) send("line", line);
      });
    });

    child.stderr.on("data", (chunk: Buffer) => {
      chunk.toString().split("\n").forEach((line) => {
        if (line.trim()) send("line", `[stderr] ${line}`);
      });
    });

    child.on("close", (code) => {
      send("done", `[LaunchOps] Process exited with code ${code ?? 0}`);
      res.end();
    });

    child.on("error", (err) => {
      send("error", `[LaunchOps] Failed to start process: ${err.message}`);
      send("done", "[LaunchOps] Process exited with code 1");
      res.end();
    });

    // Clean up if client disconnects
    req.on("close", () => {
      child.kill("SIGTERM");
    });
  });
  // ── End Pipeline Run Monitor ─────────────────────────────────────────────────
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
