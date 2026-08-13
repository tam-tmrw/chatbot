import {
  mysqlTable,
  varchar,
  text,
  timestamp,
  mysqlEnum,
  json,
  int,
} from "drizzle-orm/mysql-core";

export const sessions = mysqlTable("sessions", {
  id: varchar("id", { length: 36 }).primaryKey(),
  channel: mysqlEnum("channel", ["web", "messenger"]).notNull(),
  channelUserId: varchar("channel_user_id", { length: 191 }).notNull(),
  stage: varchar("stage", { length: 64 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const messages = mysqlTable("messages", {
  id: int("id").primaryKey().autoincrement(),
  sessionId: varchar("session_id", { length: 36 })
    .notNull()
    .references(() => sessions.id),
  role: mysqlEnum("role", ["user", "assistant", "system"]).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const leads = mysqlTable("leads", {
  id: int("id").primaryKey().autoincrement(),
  sessionId: varchar("session_id", { length: 36 })
    .notNull()
    .references(() => sessions.id),
  phone: varchar("phone", { length: 20 }).notNull(),
  summary: text("summary"),
  meta: json("meta"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
