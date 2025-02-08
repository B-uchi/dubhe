import { pgTable, serial, text, boolean, timestamp, jsonb } from 'drizzle-orm/pg-core';

export const dubheStoreTransactions = pgTable('__dubheStoreTransactions', {
  id: serial('id').primaryKey(),
  checkpoint: text('checkpoint').notNull(),
  digest: text('digest').notNull(),
  cursor: text('cursor').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull()
});

export const dubheStoreSchemas = pgTable('__dubheStoreSchemas', {
  id: serial('id').primaryKey(),
  last_update_checkpoint: text('last_update_checkpoint').notNull(),
  last_update_digest: text('last_update_digest').notNull(),
  name: text('name').notNull(),
  key1: text('key1'),
  key2: text('key2'),
  value: jsonb('value').notNull(),
  is_removed: boolean('is_removed').default(false).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

export const dubheStoreEvents = pgTable('__dubheStoreEvents', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  value: jsonb('value').notNull(),
  checkpoint: text('checkpoint').notNull(),
  digest: text('digest').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull()
});