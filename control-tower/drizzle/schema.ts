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
