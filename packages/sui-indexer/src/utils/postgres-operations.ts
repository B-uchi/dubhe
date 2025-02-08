import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { dubheStoreSchemas, dubheStoreTransactions } from '../postgres/schema';
import { eq, sql } from 'drizzle-orm';
import { OperationType } from './tables';

export const setupPostgresDatabase = async (database: PostgresJsDatabase) => {
  await database.execute(sql`
    CREATE TABLE IF NOT EXISTS __dubheStoreTransactions (
      id SERIAL PRIMARY KEY,
      checkpoint TEXT NOT NULL,
      digest TEXT NOT NULL,
      cursor TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS __dubheStoreSchemas (
      id SERIAL PRIMARY KEY,
      last_update_checkpoint TEXT NOT NULL,
      last_update_digest TEXT NOT NULL,
      name TEXT NOT NULL,
      key1 TEXT,
      key2 TEXT,
      value JSONB NOT NULL,
      is_removed BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS __dubheStoreEvents (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      value JSONB NOT NULL,
      checkpoint TEXT NOT NULL,
      digest TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
};

export const clearPostgresDatabase = async (database: PostgresJsDatabase) => {
  await database.execute(sql`
    DROP TABLE IF EXISTS __dubheStoreTransactions;
    DROP TABLE IF EXISTS __dubheStoreSchemas;
    DROP TABLE IF EXISTS __dubheStoreEvents;
  `);
};

export const insertTxPostgres = async (
  database: PostgresJsDatabase,
  checkpoint: string,
  digest: string,
  cursor: string,
  timestamp: string
) => {
  await database.insert(dubheStoreTransactions).values({
    checkpoint,
    digest,
    cursor,
    created_at: new Date(parseInt(timestamp))
  });
};

export async function syncToPostgres(
  database: PostgresJsDatabase,
  checkpoint: string,
  digest: string,
  timestamp: string,
  eventData: any,
  operation: OperationType
) {
  const { name, key1, key2, value } = eventData;

  if (operation === OperationType.Set) {
    await database
      .insert(dubheStoreSchemas)
      .values({
        last_update_checkpoint: checkpoint,
        last_update_digest: digest,
        name,
        key1,
        key2,
        value,
        is_removed: false,
        created_at: new Date(parseInt(timestamp)),
        updated_at: new Date(parseInt(timestamp)),
      })
      .onConflictDoUpdate({
        target: [dubheStoreSchemas.name, dubheStoreSchemas.key1, dubheStoreSchemas.key2],
        set: {
          value,
          last_update_checkpoint: checkpoint,
          last_update_digest: digest,
          is_removed: false,
          updated_at: new Date(parseInt(timestamp)),
        },
      });
  } else {
    await database
      .update(dubheStoreSchemas)
      .set({
        is_removed: true,
        updated_at: new Date(parseInt(timestamp)),
      })
      .where(eq(dubheStoreSchemas.name, name));
  }
}