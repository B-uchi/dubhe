// packages/sui-indexer/src/postgres/apiRoutes.ts
import { Middleware } from "koa";
import Router from "@koa/router";
import compose from "koa-compose";
import { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { createBenchmark } from "@latticexyz/common";
import { compress } from "../koa-middleware/compress";
import { dubheStoreEvents, dubheStoreSchemas } from "./schema";
import { desc, eq } from "drizzle-orm";

export function apiRoutes(
  database: PostgresJsDatabase,
): Middleware {
  const router = new Router();

  router.get("/api/events/:name", compress(), async (ctx) => {
    const benchmark = createBenchmark("postgres:events");
    try {
      const name = ctx.params.name;
      const events = await database
        .select()
        .from(dubheStoreEvents)
        .where(eq(dubheStoreEvents.name, name))
        .orderBy(desc(dubheStoreEvents.id))
        .execute();

      benchmark("query events");
      ctx.body = events;
    } catch (e) {
      ctx.status = 500;
      ctx.body = e;
      console.error(e);
    }
  });

  router.get("/api/schemas/:name", compress(), async (ctx) => {
    const benchmark = createBenchmark("postgres:schemas");
    try {
      const name = ctx.params.name;
      const schemas = await database
        .select()
        .from(dubheStoreSchemas)
        .where(eq(dubheStoreSchemas.name, name))
        .orderBy(desc(dubheStoreSchemas.id))
        .execute();

      benchmark("query schemas");
      ctx.body = schemas;
    } catch (e) {
      ctx.status = 500;
      ctx.body = e;
      console.error(e);
    }
  });

  return compose([router.routes(), router.allowedMethods()]) as Middleware;
}