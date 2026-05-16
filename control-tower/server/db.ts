import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import type { InsertUser } from "../drizzle/schema";
import {
  auditEvents,
  healthChecks,
  logSnapshots,
  statsReadings,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ────────────────────────────────────────────────────────────────────
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  type TextField = (typeof textFields)[number];
  const assignNullable = (field: TextField) => {
    const value = user[field];
    if (value === undefined) return;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  };
  textFields.forEach(assignNullable);
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── Health checks ────────────────────────────────────────────────────────────
export async function insertHealthCheck(data: {
  service: string;
  status: "healthy" | "warning" | "down";
  uptime?: string;
  cpuPercent?: number;
  memUsageMb?: number;
  memLimitMb?: number;
  memPercent?: number;
  netRxMb?: number;
  netTxMb?: number;
  rawJson?: string;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(healthChecks).values(data);
}

export async function getLatestHealthChecks() {
  const db = await getDb();
  if (!db) return [];
  // Get the most recent check per service
  return db
    .select()
    .from(healthChecks)
    .orderBy(desc(healthChecks.createdAt))
    .limit(100);
}

export async function getHealthChecksByService(
  service: string,
  from?: Date,
  to?: Date
) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(healthChecks.service, service)];
  if (from) conditions.push(gte(healthChecks.createdAt, from));
  if (to) conditions.push(lte(healthChecks.createdAt, to));
  return db
    .select()
    .from(healthChecks)
    .where(and(...conditions))
    .orderBy(desc(healthChecks.createdAt))
    .limit(500);
}

// ─── Stats readings ───────────────────────────────────────────────────────────
export async function insertStatsReading(data: {
  service: string;
  cpuPercent: number;
  memUsageMb: number;
  memPercent: number;
  netRxMb: number;
  netTxMb: number;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(statsReadings).values(data);
}

export async function getStatsHistory(
  service: string,
  from?: Date,
  to?: Date,
  limit = 60
) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(statsReadings.service, service)];
  if (from) conditions.push(gte(statsReadings.createdAt, from));
  if (to) conditions.push(lte(statsReadings.createdAt, to));
  return db
    .select()
    .from(statsReadings)
    .where(and(...conditions))
    .orderBy(desc(statsReadings.createdAt))
    .limit(limit);
}

// ─── Log snapshots ────────────────────────────────────────────────────────────
export async function insertLogSnapshot(data: {
  service: string;
  lines: string;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(logSnapshots).values(data);
}

export async function getLogSnapshots(service: string, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(logSnapshots)
    .where(eq(logSnapshots.service, service))
    .orderBy(desc(logSnapshots.createdAt))
    .limit(limit);
}

// ─── Audit events ─────────────────────────────────────────────────────────────
export async function insertAuditEvent(data: {
  userId?: number;
  userName?: string;
  action: string;
  service: string;
  detail?: string;
  outcome?: "success" | "failure";
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(auditEvents).values({
    ...data,
    outcome: data.outcome ?? "success",
  });
}

export async function getAuditEvents(
  service?: string,
  from?: Date,
  to?: Date,
  limit = 100
) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (service) conditions.push(eq(auditEvents.service, service));
  if (from) conditions.push(gte(auditEvents.createdAt, from));
  if (to) conditions.push(lte(auditEvents.createdAt, to));
  const query = db
    .select()
    .from(auditEvents)
    .orderBy(desc(auditEvents.createdAt))
    .limit(limit);
  if (conditions.length > 0) {
    return query.where(and(...conditions));
  }
  return query;
}

// ─── Export helpers ───────────────────────────────────────────────────────────
export async function getExportData(
  type: "health" | "stats" | "logs" | "audit",
  service?: string,
  from?: Date,
  to?: Date
) {
  const db = await getDb();
  if (!db) return [];

  const buildConditions = (serviceCol: any, dateCol: any) => {
    const c = [];
    if (service) c.push(eq(serviceCol, service));
    if (from) c.push(gte(dateCol, from));
    if (to) c.push(lte(dateCol, to));
    return c;
  };

  if (type === "health") {
    const conds = buildConditions(healthChecks.service, healthChecks.createdAt);
    const q = db.select().from(healthChecks).orderBy(desc(healthChecks.createdAt)).limit(1000);
    return conds.length > 0 ? q.where(and(...conds)) : q;
  }
  if (type === "stats") {
    const conds = buildConditions(statsReadings.service, statsReadings.createdAt);
    const q = db.select().from(statsReadings).orderBy(desc(statsReadings.createdAt)).limit(1000);
    return conds.length > 0 ? q.where(and(...conds)) : q;
  }
  if (type === "logs") {
    const conds = buildConditions(logSnapshots.service, logSnapshots.createdAt);
    const q = db.select().from(logSnapshots).orderBy(desc(logSnapshots.createdAt)).limit(200);
    return conds.length > 0 ? q.where(and(...conds)) : q;
  }
  if (type === "audit") {
    const conds = buildConditions(auditEvents.service, auditEvents.createdAt);
    const q = db.select().from(auditEvents).orderBy(desc(auditEvents.createdAt)).limit(1000);
    return conds.length > 0 ? q.where(and(...conds)) : q;
  }
  return [];
}
