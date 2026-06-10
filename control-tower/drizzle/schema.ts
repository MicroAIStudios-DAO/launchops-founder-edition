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
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
export type FounderProfile = typeof founderProfile.$inferSelect;

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
