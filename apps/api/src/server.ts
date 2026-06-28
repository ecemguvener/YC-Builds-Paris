import { loadConfig } from "./config.js";
import { connectDatabase } from "./db.js";
import { buildApp } from "./app.js";

const config = loadConfig();
const database = await connectDatabase(config);
const app = await buildApp(config, database.collections);

const close = async () => {
  await app.close();
  await database.client.close();
};

const shutdown = () =>
  void close()
    .catch((error) => {
      console.error("shutdown error:", error instanceof Error ? error.message : String(error));
    })
    .then(() => process.exit(0));

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await app.listen({ port: config.API_PORT, host: "0.0.0.0" });
