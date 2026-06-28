import {
  bigint,
  float,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Service names enum ───────────────────────────────────────────────────────
export const SERVICE_NAMES = [
  "WordPress",
  "SuiteCRM",
  "Mautic",
  "Matomo",
  "Vaultwarden",
  "MariaDB",
] as const;
export type ServiceName = (typeof SERVICE_NAMES)[number];

// ─── Health checks ────────────────────────────────────────────────────────────
export const healthChecks = mysqlTable("health_checks", {
  id: int("id").autoincrement().primaryKey(),
  service: varchar("service", { length: 64 }).notNull(),
  status: mysqlEnum("status", ["healthy", "warning", "down"]).notNull(),
  uptime: varchar("uptime", { length: 64 }),
  cpuPercent: float("cpu_percent"),
  memUsageMb: float("mem_usage_mb"),
  memLimitMb: float("mem_limit_mb"),
  memPercent: float("mem_percent"),
  netRxMb: float("net_rx_mb"),
  netTxMb: float("net_tx_mb"),
  rawJson: text("raw_json"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type HealthCheck = typeof healthChecks.$inferSelect;

// ─── Stats readings (time-series for charts) ──────────────────────────────────
export const statsReadings = mysqlTable("stats_readings", {
  id: int("id").autoincrement().primaryKey(),
  service: varchar("service", { length: 64 }).notNull(),
  cpuPercent: float("cpu_percent").notNull().default(0),
  memUsageMb: float("mem_usage_mb").notNull().default(0),
  memPercent: float("mem_percent").notNull().default(0),
  netRxMb: float("net_rx_mb").notNull().default(0),
  netTxMb: float("net_tx_mb").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type StatsReading = typeof statsReadings.$inferSelect;

// ─── Log snapshots ────────────────────────────────────────────────────────────
export const logSnapshots = mysqlTable("log_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  service: varchar("service", { length: 64 }).notNull(),
  lines: text("lines").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type LogSnapshot = typeof logSnapshots.$inferSelect;

// ─── Audit events ─────────────────────────────────────────────────────────────
export const auditEvents = mysqlTable("audit_events", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id"),
  userName: varchar("user_name", { length: 128 }),
  action: varchar("action", { length: 64 }).notNull(),
  service: varchar("service", { length: 64 }).notNull(),
  detail: text("detail"),
  outcome: mysqlEnum("outcome", ["success", "failure"]).notNull().default("success"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AuditEvent = typeof auditEvents.$inferSelect;

// ─── Alert state (persisted so transitions survive restarts) ───────────────────
export const alertState = mysqlTable("alert_state", {
  id: int("id").autoincrement().primaryKey(),
  service: varchar("service", { length: 64 }).notNull().unique(),
  lastStatus: mysqlEnum("last_status", ["healthy", "warning", "down"]).notNull().default("healthy"),
  lastAlertAt: timestamp("last_alert_at"),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type AlertState = typeof alertState.$inferSelect;

// ─── Vault deliveries (KONG credential bundles) ───────────────────────────────
export const vaultDeliveries = mysqlTable("vault_deliveries", {
  id: int("id").autoincrement().primaryKey(),
  runId: varchar("run_id", { length: 64 }).notNull().unique(),
  status: mysqlEnum("status", ["pending", "ready", "downloaded", "expired"]).notNull().default("pending"),
  servicesProvisioned: text("services_provisioned"), // JSON array of service names
  credentialData: text("credential_data"),           // AES-256 encrypted JSON blob
  downloadToken: varchar("download_token", { length: 128 }).unique(),
  tokenExpiresAt: timestamp("token_expires_at"),
  downloadedAt: timestamp("downloaded_at"),
  deliveryEmail: varchar("delivery_email", { length: 320 }),
  rawOutput: text("raw_output"),                     // full KONG terminal output
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
export type VaultDelivery = typeof vaultDeliveries.$inferSelect;
export type InsertVaultDelivery = typeof vaultDeliveries.$inferInsert;

// ─── Founder profile (set during onboarding, used by Atlas) ──────────────────
export const founderProfile = mysqlTable("founder_profile", {
  id: int("id").autoincrement().primaryKey(),
  businessName: varchar("business_name", { length: 256 }),
  industry: varchar("industry", { length: 256 }),
  targetMarket: varchar("target_market", { length: 512 }),
  deliveryEmail: varchar("delivery_email", { length: 320 }),
  monthlyRevenueGoal: varchar("monthly_revenue_goal", { length: 128 }),
  businessType: varchar("business_type", { length: 64 }),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
export type FounderProfile = typeof founderProfile.$inferSelect;

// ─── Business Builder OS — Build Spec + Interview + Generated Assets ────────────

/**
 * Stores the founder's answers to the 12-question interview (Prompt 0).
 * One row per session — latest row is the active build spec source.
 */
export const businessInterviewAnswers = mysqlTable("business_interview_answers", {
  id: int("id").autoincrement().primaryKey(),
  // 12 interview question answers stored as JSON
  answers: text("answers").notNull(), // JSON: { q1: string, q2: string, ... q12: string }
  buildSpec: text("build_spec"),      // JSON: generated Build Spec from Prompt 0
  status: mysqlEnum("status", ["in_progress", "complete"]).notNull().default("in_progress"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
export type BusinessInterviewAnswers = typeof businessInterviewAnswers.$inferSelect;
export type InsertBusinessInterviewAnswers = typeof businessInterviewAnswers.$inferInsert;

/**
 * Stores the output of each of the 30 Business Builder prompts.
 * One row per prompt per run — allows resuming and re-running individual prompts.
 */
export const generatedAssets = mysqlTable("generated_assets", {
  id: int("id").autoincrement().primaryKey(),
  runId: varchar("run_id", { length: 64 }).notNull(),         // groups all 30 prompts in one run
  promptId: varchar("prompt_id", { length: 64 }).notNull(),   // e.g. "prompt_1_concepts"
  promptTitle: varchar("prompt_title", { length: 256 }).notNull(),
  category: varchar("category", { length: 64 }).notNull(),    // model | validation | copy | automation | etc.
  content: text("content").notNull(),                         // LLM output (markdown)
  status: mysqlEnum("status", ["pending", "running", "complete", "error"]).notNull().default("pending"),
  deployedTo: varchar("deployed_to", { length: 128 }),        // e.g. "mautic" | "wordpress" | "suitecrm"
  deployedAt: timestamp("deployed_at"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
export type GeneratedAsset = typeof generatedAssets.$inferSelect;
export type InsertGeneratedAsset = typeof generatedAssets.$inferInsert;

/**
 * Tracks Business Builder runs (one run = all 30 prompts executed together).
 */
export const businessBuilderRuns = mysqlTable("business_builder_runs", {
  id: int("id").autoincrement().primaryKey(),
  runId: varchar("run_id", { length: 64 }).notNull().unique(),
  interviewId: int("interview_id"),                           // FK to businessInterviewAnswers
  status: mysqlEnum("status", ["pending", "running", "complete", "error"]).notNull().default("pending"),
  promptsTotal: int("prompts_total").notNull().default(30),
  promptsComplete: int("prompts_complete").notNull().default(0),
  currentPrompt: varchar("current_prompt", { length: 64 }),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
export type BusinessBuilderRun = typeof businessBuilderRuns.$inferSelect;
export type InsertBusinessBuilderRun = typeof businessBuilderRuns.$inferInsert;

// ─── Stripe: customer + subscription tracking ─────────────────────────────────
export const stripeCustomers = mysqlTable("stripe_customers", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  stripeCustomerId: varchar("stripe_customer_id", { length: 64 }).notNull().unique(),
  stripeSubscriptionId: varchar("stripe_subscription_id", { length: 64 }),
  subscriptionStatus: varchar("subscription_status", { length: 32 }), // active | canceled | past_due | trialing
  currentPeriodEnd: timestamp("current_period_end"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
export type StripeCustomer = typeof stripeCustomers.$inferSelect;
export type InsertStripeCustomer = typeof stripeCustomers.$inferInsert;

// Idempotency guard — prevents double-processing webhook events
export const stripeEvents = mysqlTable("stripe_events", {
  id: int("id").autoincrement().primaryKey(),
  stripeEventId: varchar("stripe_event_id", { length: 64 }).notNull().unique(),
  eventType: varchar("event_type", { length: 64 }).notNull(),
  processedAt: timestamp("processed_at").defaultNow().notNull(),
});
export type StripeEvent = typeof stripeEvents.$inferSelect;
