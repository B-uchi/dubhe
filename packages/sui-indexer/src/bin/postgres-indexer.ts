#!/usr/bin/env node
import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import Koa from "koa";
import cors from "@koa/cors";
import { createKoaMiddleware } from "trpc-koa-adapter";
import { createQueryAdapter } from "../postgres/createQueryAdapter";
import { healthcheck } from "../koa-middleware/healthcheck";
import { helloWorld } from "../koa-middleware/helloWorld";
import { apiRoutes } from "../postgres/apiRoutes";
import { sentry } from "../koa-middleware/sentry";
import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import {
  clearPostgresDatabase,
  setupPostgresDatabase,
  insertTxPostgres,
  syncToPostgres,
} from "../utils/postgres-operations";
import { dubheStoreEvents, dubheStoreTransactions } from "../postgres/schema";
import { desc } from "drizzle-orm";
import { createAppRouter } from "../postgres/createAppRouter";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { getSchemaId } from "../utils/read-history";
import { loadConfig, DubheConfig, parseData } from "@0xobelisk/sui-common";
import { fetchAllEvents, fetchTransactionBlocks } from "../utils/graphql-query";
import { OperationType } from "../utils/tables";

const argv = await yargs(hideBin(process.argv))
  .option("network", {
    type: "string",
    choices: ["mainnet", "testnet", "localnet"],
    default: "localnet",
    desc: "Node network (mainnet/testnet/localnet)",
  })
  .option("config-path", {
    type: "string",
    default: "dubhe.config.ts",
    desc: "Configuration file path",
  })
  .option("force-regenesis", {
    type: "boolean",
    default: false,
    desc: "Force regenesis",
  })
  .option("schema-id", {
    type: "string",
    description: "Schema ID to filter transactions",
    // demandOption: true,
  })
  .option("host", {
    type: "string",
    description: "Host to listen on",
    default: "0.0.0.0",
  })
  .option("port", {
    type: "number",
    description: "Port to listen on",
    default: 3001,
  })
  .option("sync-limit", {
    type: "number",
    description: "Number of transactions to sync per time",
    default: 50,
  })
  .option("default-page-size", {
    type: "number",
    description: "Default page size for pagination",
    default: 10,
  })
  .option("pagination-limit", {
    type: "number",
    description: "Maximum pagination limit",
    default: 100,
  })
  .option("sentry-dsn", {
    type: "string",
    description: "Sentry DSN for error tracking",
  })
  .help("help")
  .alias("help", "h").argv;

const publicClient = new SuiClient({
  url: getFullnodeUrl(argv.network as any),
});

const graphqlEndpoint =
  argv.network === "mainnet"
    ? "https://sui-mainnet.mystenlabs.com/graphql"
    : "https://sui-testnet.mystenlabs.com/graphql";

console.log("database: ", process.env.DATABASE_URL)
const database = drizzle(postgres(process.env.DATABASE_URL!));
if (argv.forceRegenesis) {
  await clearPostgresDatabase(database);
}
await setupPostgresDatabase(database);

async function getLastTxRecord(db: any) {
  const txRecord = await db
    .select()
    .from(dubheStoreTransactions)
    .orderBy(desc(dubheStoreTransactions.id))
    .limit(1)
    .execute();
  return txRecord.length === 0
    ? { cursor: undefined, checkpoint: undefined }
    : { cursor: txRecord[0].cursor, checkpoint: txRecord[0].checkpoint };
}

const app = new Koa();
const server = createServer(app.callback());
const wss = new WebSocketServer({ server });
const subscriptions = new Map<WebSocket, string[]>();

if (argv.sentryDsn) {
  app.use(sentry(argv.sentryDsn));
}

app.use(cors());
app.use(healthcheck({ isReady: () => true }));
app.use(helloWorld());
app.use(apiRoutes(database));

app.use(
  createKoaMiddleware({
    prefix: "/trpc",
    router: createAppRouter(),
    createContext: async () => ({
      queryAdapter: createQueryAdapter(database),
    }),
  })
);

wss.on("connection", (ws) => {
  subscriptions.set(ws, []);

  ws.on("message", (message) => {
    try {
      const { type, event } = JSON.parse(message.toString());
      const events = subscriptions.get(ws) || [];

      if (type === "subscribe" && !events.includes(event)) {
        events.push(event);
        subscriptions.set(ws, events);
      } else if (type === "unsubscribe") {
        subscriptions.set(
          ws,
          events.filter((e) => e !== event)
        );
      }
    } catch (error) {
      console.error("WebSocket message error:", error);
    }
  });

  ws.on("close", () => {
    subscriptions.delete(ws);
  });
});

server.listen(argv.port, argv.host, () => {
  console.log(`postgres indexer frontend exposed on port ${argv.port}
  - HTTP:   http://${argv.host}:${argv.port}
  - WS:     ws://${argv.host}:${argv.port}
  - GraphQL:   http://${argv.host}:${argv.port}/graphql`);
});

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let schemaId = argv.schemaId;
if (!schemaId) {
  try {
    const config: DubheConfig = (await loadConfig(
      argv.configPath
    )) as DubheConfig;
    schemaId = await getSchemaId(config.name, argv.network);
  } catch (error) {
    console.error("Error loading config:", error);
    process.exit(1);
  }
}

while (true) {
  await delay(2000);
  const lastTxRecord = await getLastTxRecord(database);
  let txs;

  if (argv.network === "mainnet" || argv.network === "testnet") {
    try {
      const graphqlResponse = await fetchTransactionBlocks({
        graphqlEndpoint,
        changedObject: schemaId,
        first: argv.syncLimit,
        afterCheckpoint: lastTxRecord.checkpoint
          ? parseInt(lastTxRecord.checkpoint)
          : undefined,
      });

      txs = await Promise.all(
        graphqlResponse.transactionBlocks.edges.map(async (edge) => {
          const allEvents = await fetchAllEvents({
            graphqlEndpoint,
            transactionDigest: edge.node.digest,
          });
          return {
            cursor: edge.cursor,
            digest: edge.node.digest,
            checkpoint: edge.node.effects.checkpoint.sequenceNumber.toString(),
            timestampMs: new Date(edge.node.effects.timestamp)
              .getTime()
              .toString(),
            events: allEvents.map((event) => ({
              parsedJson: event.contents.json,
            })),
          };
        })
      );
    } catch (error) {
      console.error("Error fetching GraphQL data:", error);
      await delay(5000);
      continue;
    }
  } else {
    const response = await publicClient.queryTransactionBlocks({
      filter: { ChangedObject: schemaId },
      order: "ascending",
      cursor: lastTxRecord.cursor,
      limit: argv.syncLimit,
      options: { showEvents: true },
    });

    txs = response.data.map((tx) => ({
      ...tx,
      cursor: tx.digest,
    }));
  }

  for (const tx of txs) {
    await insertTxPostgres(
      database,
      tx.checkpoint?.toString() as string,
      tx.digest,
      tx.cursor,
      tx.timestampMs?.toString() as string
    );

    if (tx.events) {
      for (const event of tx.events) {
        console.log("EventData: ", JSON.stringify(event.parsedJson, null, 2));

        // @ts-ignore
        const name: string = event.parsedJson["name"];
        if (name.endsWith("_event")) {
          await database.insert(dubheStoreEvents).values(
            parseData({
              checkpoint: tx.checkpoint?.toString() as string,
              digest: tx.digest,
              created_at: tx.timestampMs?.toString() as string,
              name: name,
              // @ts-ignore
              value: event.parsedJson["value"],
            })
          );

          wss.clients.forEach((client) => {
            if (
              client.readyState === client.OPEN &&
              subscriptions.get(client)?.includes(name)
            ) {
              client.send(
                JSON.stringify(
                  parseData({
                    name: name,
                    // @ts-ignore
                    value: event.parsedJson["value"],
                  })
                )
              );
            }
          });

          await syncToPostgres(
            database,
            tx.checkpoint?.toString() as string,
            tx.digest,
            tx.timestampMs?.toString() as string,
            event.parsedJson,
            OperationType.Set
          );
        } else {
          await syncToPostgres(
            database,
            tx.checkpoint?.toString() as string,
            tx.digest,
            tx.timestampMs?.toString() as string,
            event.parsedJson,
            OperationType.Remove
          );

          wss.clients.forEach((client) => {
            if (
              client.readyState === client.OPEN &&
              subscriptions.get(client)?.includes(name)
            ) {
              client.send(
                JSON.stringify({
                  // @ts-ignore
                  ...event.parsedJson,
                  value: null,
                })
              );
            }
          });
        }
      }
    }
  }
}
