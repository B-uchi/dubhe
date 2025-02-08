import { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { dubheStoreEvents, dubheStoreSchemas } from "./schema";
import { desc, eq } from "drizzle-orm";
import { QueryAdapter } from "./common";

export function createQueryAdapter(database: PostgresJsDatabase): QueryAdapter {
  return {
    async getEvents(name: string) {
      return database
        .select()
        .from(dubheStoreEvents)
        .where(eq(dubheStoreEvents.name, name))
        .orderBy(desc(dubheStoreEvents.id))
        .execute();
    },
    async getSchemas(name: string) {
      const results = await database
        .select()
        .from(dubheStoreSchemas)
        .where(eq(dubheStoreSchemas.name, name))
        .orderBy(desc(dubheStoreSchemas.id))
        .execute();

      return results.map(result => ({
        ...result,
        key1: result.key1 ?? undefined,
        key2: result.key2 ?? undefined,
      }));
    },
  };
}